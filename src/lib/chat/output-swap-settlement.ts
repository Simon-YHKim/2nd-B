// T40 dormant. No screen callback, content persistence, or background queue.
import { abortError } from "../async/abort";
import type { AccountOwnerLease } from "../auth/account-epoch";
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { getEnv } from "../env";
import { rpcJsonWithCapturedSession } from "../supabase/captured-session-client";
import { kstDateToday } from "./limits";
import { canUseSwapUsage, isRefundCount, swapCandidateKey,
  type SwapCandidate, type SwapSettlement, type SwapUsage, type SwapUsageCursor } from "./output-swap-state";

const SETTLEMENT_MS = 8_000;
const SERIALIZATION_RETRIES = 2;
const NULL_RETRIES = 1;
const MAX_CALLS = 1 + SERIALIZATION_RETRIES + NULL_RETRIES;
const RETRY_MS = 250;

type PublishedSettlement = SwapSettlement | Readonly<{ status: "stale" }>;

async function serializationFailure(error: { context: Response }): Promise<boolean> {
  if (error.context.status !== 500) return false;
  try {
    const body: unknown = await error.context.json();
    return !!body && typeof body === "object" && "code" in body && body.code === "40001";
  } catch { return false; }
}

async function readUsage(candidate: SwapCandidate, accessToken: string, signal: AbortSignal) {
  const env = getEnv();
  const query = `select=count,ad_bonus&user_id=eq.${encodeURIComponent(candidate.ticket.ownerId)}&day=eq.${encodeURIComponent(candidate.ticket.day)}`;
  const response = await globalThis.fetch(`${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/chat_usage?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY }, signal,
  });
  if (!response.ok) throw new Error("swap_usage_unavailable");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("swap_usage_invalid");
  if (rows.length === 0) return { used: 0, adBonus: 0 };
  const row: unknown = rows[0];
  if (!row || typeof row !== "object" || !("count" in row) || !("ad_bonus" in row)
    || !isRefundCount(row.count) || !isRefundCount(row.ad_bonus)) throw new Error("swap_usage_invalid");
  return { used: row.count, adBonus: row.ad_bonus };
}

/** One owner-bound manager per live pair. It may outlive the selected answer.
 * A confirmed refund survives expiry/owner changes internally.
 * start() returns an owner-gated deadline snapshot; read() can show a later RPC.
 * Repeated starts share work, but each returned promise rechecks publication.
 * B1 must invalidate usage on sends/ad updates/other reads before consuming it. */
export function createSwapSettlement(owner: AccountOwnerLease) {
  const ownerId = owner.ownerId, ownerEpoch = owner.epoch;
  const isCurrent = owner.isCurrent.bind(owner);
  const jobs = new Map<string, { state: SwapSettlement; done: Promise<SwapSettlement> }>();
  let sequence = 0;
  let usage: SwapUsage | null = null;
  const cursor = (): SwapUsageCursor => ({ ownerId, ownerEpoch, day: kstDateToday(), sequence });
  const canPublish = (candidate: SwapCandidate): boolean => {
    const current = cursor();
    return isCurrent() && candidate.ticket.ownerId === current.ownerId && candidate.ticket.ownerEpoch === current.ownerEpoch;
  };
  const publish = (state: SwapSettlement): PublishedSettlement => canPublish(state.candidate) ? state : { status: "stale" };

  function start(candidate: SwapCandidate): Promise<PublishedSettlement> {
    const key = swapCandidateKey(candidate);
    const existing = jobs.get(key);
    if (existing) return existing.done.then(publish);
    const deadline = Date.now() + SETTLEMENT_MS;
    const initial: SwapSettlement = { candidate, status: "pending", calls: 0 };
    const job = { state: initial, done: Promise.resolve(initial) };
    jobs.set(key, job);
    let active = true;
    let session: ReturnType<typeof beginAccountSessionLease> | undefined;
    const controller = new AbortController();
    const ownerCurrent = () => isCurrent() && candidate.ticket.ownerId === ownerId && candidate.ticket.ownerEpoch === ownerEpoch;
    const fence = () => {
      if (!active || Date.now() >= deadline || !ownerCurrent()) throw abortError();
    };
    const stoppedStatus = () => !ownerCurrent() ? "stale" as const : Date.now() >= deadline ? "expired" as const : "unresolved" as const;
    const stoppedState = (): SwapSettlement => job.state.status === "confirmed" ? job.state : { ...job.state, status: stoppedStatus() };
    const run = async (): Promise<SwapSettlement> => {
      try {
        fence();
        session = beginAccountSessionLease(ownerId, controller.signal);
        if (session.epoch !== ownerEpoch) throw abortError();
        const authenticated = await session.authenticate();
        fence();
        // One token for the whole job; a retry never borrows a new login.
        const token = authenticated.accessToken;
        let serializationRetries = 0, nullRetries = 0;
        let refundedCount: number | undefined;
        while (job.state.calls < MAX_CALLS) {
          fence();
          authenticated.assertCurrent();
          job.state = { ...job.state, calls: job.state.calls + 1 };
          let result;
          try {
            result = await rpcJsonWithCapturedSession("refund_chat_turn_after_output_swap", { p_audit_id: candidate.auditId }, token, controller.signal);
          } catch { fence(); break; }
          // Record the issued mutation before any publication fence, even if late.
          if (!result.error && isRefundCount(result.data)) {
            refundedCount = result.data;
            job.state = { ...job.state, status: "confirmed", refundedCount };
            break;
          }
          fence();
          let retry = false;
          if (result.error) retry = await serializationFailure(result.error) && serializationRetries++ < SERIALIZATION_RETRIES;
          else if (result.data === null) retry = nullRetries++ < NULL_RETRIES;
          fence();
          if (!retry || job.state.calls >= MAX_CALLS) break;
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve(); };
            const timer = setTimeout(finish, RETRY_MS);
            controller.signal.addEventListener("abort", finish, { once: true });
          });
        }
        fence();
        // NULL means unresolved even when a read succeeds (including duplicates).
        if (refundedCount === undefined) job.state = { ...job.state, status: "unresolved" };
        const readCursor: SwapUsageCursor = { ownerId, ownerEpoch, day: candidate.ticket.day, sequence: ++sequence };
        let detail;
        try {
          fence();
          authenticated.assertCurrent();
          detail = await readUsage(candidate, token, controller.signal);
        } catch {
          fence();
          if (refundedCount !== undefined) detail = { used: refundedCount };
        }
        fence();
        if (detail) {
          const value: SwapUsage = { ...readCursor, ...detail, deadline };
          if (canUseSwapUsage(value, cursor(), ownerCurrent(), Date.now())) usage = value;
        }
        return job.state;
      } catch {
        // A request may have committed. Never synthesize used - 1 or retry it indefinitely.
        return stoppedState();
      } finally { session?.release(); }
    };
    let timer: ReturnType<typeof setTimeout>;
    const expiry = new Promise<SwapSettlement>(resolve => {
      timer = setTimeout(() => {
        active = false;
        controller.abort();
        resolve(stoppedState());
      }, SETTLEMENT_MS);
    });
    job.done = Promise.race([run(), expiry]).then(state => {
      // A timer snapshot must not overwrite a confirmation received in this race.
      if (job.state.status !== "confirmed") job.state = state;
      return job.state;
    }).finally(() => { active = false; clearTimeout(timer); controller.abort(); session?.release(); });
    return job.done.then(publish);
  }

  return {
    start,
    read: (): readonly SwapSettlement[] => [...jobs.values()].map(job => job.state).filter(state => canPublish(state.candidate)),
    invalidateUsage: (): void => { sequence++; usage = null; },
    readUsage: (): SwapUsage | null => usage && canUseSwapUsage(usage, cursor(), isCurrent(), Date.now()) ? usage : null,
  };
}
