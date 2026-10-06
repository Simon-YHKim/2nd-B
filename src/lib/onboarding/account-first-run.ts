// First-run marks that belong to the ACCOUNT, not the device (Q-261004-40 = A,
// migration 0219). Two marks live on the signed-in user's own users row:
//   onboarding_completed_at  the welcome carousel was finished
//   ttfv_seen_at             the first-day review (/ttfv) showed content
// The welcome and the first-day review are once per account: a new browser, a
// private window or a reinstall must not show them to an existing account again
// (QA-LEGACY W-12).
//
// The server value wins whenever it can be read. When it cannot (the column is
// missing because 0219 is not applied yet, the RPC is missing, the network
// failed, or the row is not there), the status is "device" and the callers use
// the device value they have always used (state.ts / ttfv-gate.ts). A failed
// read is never mistaken for "this account has not finished": that would put an
// existing account back into the welcome on every network blip.
//
// Writes go through two owner-only RPCs (mark_onboarding_completed /
// mark_ttfv_seen). The server keeps the FIRST value, and each RPC returns both
// stored marks, which this store adopts. A mark made in this session is also
// kept in memory, so a late read that started before the write cannot undo it.
// A mark the server has not stored yet is sent again when a screen asks for the
// answer again (a re-entry, or a new sign-in), a bounded number of times.
//
// An answer belongs to one signed-in stretch of its owner: when the published
// owner changes (sign-out included), the answer is dropped, so signing back in
// reads the server again instead of trusting what it said before.

import { useEffect, useSyncExternalStore } from "react";

import { withTimeout } from "../async/with-timeout";
import { onAccountOwnerChange } from "../auth/account-epoch";
import { getSupabaseClient } from "../supabase/client";

export type AccountFirstRunStatus = "idle" | "loading" | "server" | "device";

export interface AccountFirstRunMarks {
  onboardingCompletedAt: string | null;
  ttfvSeenAt: string | null;
}

export interface AccountFirstRunSnapshot extends AccountFirstRunMarks {
  /** The account this snapshot describes. A different owner's snapshot is never used. */
  userId: string | null;
  status: AccountFirstRunStatus;
  /**
   * The server answer (a read, or a mark RPC's stored values) that last
   * confirmed these marks, counted by accountFirstRunConfirmations(). 0 = not
   * confirmed: not a server answer, or this session marked something since.
   */
  confirmedSeq: number;
}

export const ACCOUNT_FIRST_RUN_TIMEOUT_MS = 8_000;
/** How many times one unstored mark is sent again in one app run. */
export const ACCOUNT_FIRST_RUN_MAX_RESENDS = 3;

type MarkRpc = "mark_onboarding_completed" | "mark_ttfv_seen";

const MARK_FIELD: Record<MarkRpc, keyof AccountFirstRunMarks> = {
  mark_onboarding_completed: "onboardingCompletedAt",
  mark_ttfv_seen: "ttfvSeenAt",
};

const EMPTY: AccountFirstRunMarks = { onboardingCompletedAt: null, ttfvSeenAt: null };
const INITIAL: AccountFirstRunSnapshot = { userId: null, status: "idle", confirmedSeq: 0, ...EMPTY };

let snapshot: AccountFirstRunSnapshot = INITIAL;
let generation = 0;
let confirmations = 0;
/** The generation a revalidating read belongs to; -1 when none is in flight. */
let revalidating = -1;
let stopOwnerWatch: (() => void) | null = null;
const listeners = new Set<() => void>();
/** Marks this session wrote (or tried to write), per owner. */
const sessionMarks = new Map<string, AccountFirstRunMarks>();
/** Marks this session wrote that no server answer has shown stored yet, per owner. */
const unconfirmed = new Map<string, Set<MarkRpc>>();
/** `${owner}:${rpc}` sends in flight, and how often each was sent again. */
const sending = new Set<string>();
const resends = new Map<string, number>();

function warn(operation: string, error: unknown): void {
  if (typeof console !== "undefined") console.warn(`[first-run] ${operation} failed`, error);
}

function publish(next: AccountFirstRunSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function accountFirstRunSnapshot(): AccountFirstRunSnapshot {
  return snapshot;
}

export function subscribeAccountFirstRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The count of server answers so far. A screen keeps the value it mounted with. */
export function accountFirstRunConfirmations(): number {
  return confirmations;
}

/** Has the server confirmed this owner's answer after `since` (an accountFirstRunConfirmations() value)? */
export function accountFirstRunConfirmedSince(
  ownerId: string,
  current: AccountFirstRunSnapshot,
  since: number,
): boolean {
  return current.userId === ownerId && current.status === "server" && current.confirmedSeq > since;
}

/**
 * Drop the answer when the published owner changes away from it (A -> null on
 * sign-out, A -> B on a switch). A read still in flight for A is fenced by the
 * generation, so it cannot land after A signs back in.
 */
function watchOwner(): void {
  if (stopOwnerWatch) return;
  stopOwnerWatch = onAccountOwnerChange(({ owner }) => {
    if (snapshot.userId === null || snapshot.userId === owner) return;
    generation += 1;
    publish(INITIAL);
  });
}

function timestampOrNull(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  throw new Error(`First-run ${field} is not a timestamp`);
}

/** Both fields must be present: a response without them is not an answer. */
export function parseAccountFirstRunMarks(row: unknown): AccountFirstRunMarks {
  if (!row || typeof row !== "object") throw new Error("First-run marks were not returned");
  const record = row as Record<string, unknown>;
  for (const field of ["onboarding_completed_at", "ttfv_seen_at"]) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      throw new Error(`First-run ${field} was not returned`);
    }
  }
  return {
    onboardingCompletedAt: timestampOrNull(record.onboarding_completed_at, "onboarding_completed_at"),
    ttfvSeenAt: timestampOrNull(record.ttfv_seen_at, "ttfv_seen_at"),
  };
}

/** Reads the owner's own users row (users_self_select RLS). Throws on anything but an answer. */
export async function fetchAccountFirstRunMarks(ownerId: string): Promise<AccountFirstRunMarks> {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("onboarding_completed_at, ttfv_seen_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("First-run owner row was not found");
  return parseAccountFirstRunMarks(data);
}

/**
 * A stored mark never goes back to NULL, so the first non-null source wins. The
 * newest server answer comes first: its value is the one the server keeps (first
 * write wins there), and this session's own clock only fills a server NULL.
 */
function merge(...sources: (AccountFirstRunMarks | undefined)[]): AccountFirstRunMarks {
  const pick = (field: keyof AccountFirstRunMarks) =>
    sources.find((source) => source?.[field])?.[field] ?? null;
  return { onboardingCompletedAt: pick("onboardingCompletedAt"), ttfvSeenAt: pick("ttfvSeenAt") };
}

/** `confirmed`: `marks` is a server answer. false: only this session's own mark changed. */
function publishServer(ownerId: string, marks: AccountFirstRunMarks, confirmed: boolean): void {
  const current = snapshot.userId === ownerId && snapshot.status === "server" ? snapshot : undefined;
  publish({
    userId: ownerId,
    status: "server",
    confirmedSeq: confirmed ? ++confirmations : 0,
    ...merge(marks, current, sessionMarks.get(ownerId)),
  });
}

/** A server answer shows which of this session's marks are stored. */
function noteStored(ownerId: string, marks: AccountFirstRunMarks): void {
  const pending = unconfirmed.get(ownerId);
  if (!pending) return;
  for (const rpc of [...pending]) if (marks[MARK_FIELD[rpc]]) pending.delete(rpc);
}

function adoptServer(ownerId: string, marks: AccountFirstRunMarks): void {
  noteStored(ownerId, marks);
  publishServer(ownerId, marks, true);
}

/** Send again the marks this session made that the server has not shown stored. Bounded. */
function resendUnconfirmed(ownerId: string): void {
  for (const rpc of unconfirmed.get(ownerId) ?? []) {
    const key = `${ownerId}:${rpc}`;
    const count = resends.get(key) ?? 0;
    if (sending.has(key) || count >= ACCOUNT_FIRST_RUN_MAX_RESENDS) continue;
    resends.set(key, count + 1);
    void sendAndAdopt(ownerId, rpc);
  }
}

/**
 * Read the owner's marks once per owner and sign-in. Skips while a read is in
 * flight or after the server answered (then only an unstored mark of this
 * session is sent again); a "device" result is retried on the next call, which
 * the hooks make when they mount or their owner/readiness changes.
 */
export async function probeAccountFirstRun(
  ownerId: string,
  read: (ownerId: string) => Promise<AccountFirstRunMarks> = fetchAccountFirstRunMarks,
  timeoutMs = ACCOUNT_FIRST_RUN_TIMEOUT_MS,
): Promise<void> {
  if (!ownerId) return;
  watchOwner();
  if (snapshot.userId === ownerId && (snapshot.status === "loading" || snapshot.status === "server")) {
    if (snapshot.status === "server") resendUnconfirmed(ownerId);
    return;
  }
  const request = ++generation;
  publish({ userId: ownerId, status: "loading", confirmedSeq: 0, ...EMPTY });
  try {
    const marks = await withTimeout(read(ownerId), timeoutMs, "First-run marks");
    if (generation !== request || snapshot.userId !== ownerId) return;
    adoptServer(ownerId, marks);
    // A mark this session made that the server does not have yet (its write
    // failed, or the row did not exist then): send it again.
    resendUnconfirmed(ownerId);
  } catch (error) {
    if (generation !== request || snapshot.userId !== ownerId) return;
    warn("read", error);
    publish({ userId: ownerId, status: "device", confirmedSeq: 0, ...EMPTY });
  }
}

/**
 * Read a server answer again WITHOUT leaving it (the welcome keeps its answer;
 * no loader). The first-day review asks for this before it opens from an answer
 * the server has not confirmed since that screen mounted, so another tab's or
 * device's mark is seen. A failed read keeps the cached answer and counts as
 * confirmed: an unreadable server must not hold the screen forever. Never rejects.
 */
export async function revalidateAccountFirstRun(
  ownerId: string,
  read: (ownerId: string) => Promise<AccountFirstRunMarks> = fetchAccountFirstRunMarks,
  timeoutMs = ACCOUNT_FIRST_RUN_TIMEOUT_MS,
): Promise<void> {
  if (!ownerId || snapshot.userId !== ownerId || snapshot.status !== "server") return;
  if (revalidating === generation) return;
  const request = generation;
  revalidating = request;
  const current = () => generation === request && snapshot.userId === ownerId && snapshot.status === "server";
  try {
    const marks = await withTimeout(read(ownerId), timeoutMs, "First-run marks");
    if (!current()) return;
    adoptServer(ownerId, marks);
    resendUnconfirmed(ownerId);
  } catch (error) {
    if (!current()) return;
    warn("revalidate", error);
    publish({ ...snapshot, confirmedSeq: ++confirmations });
  } finally {
    if (revalidating === request) revalidating = -1;
  }
}

async function sendMark(ownerId: string, rpc: MarkRpc): Promise<AccountFirstRunMarks> {
  const { data, error } = await withTimeout(
    getSupabaseClient().rpc(rpc, { p_user_id: ownerId }),
    ACCOUNT_FIRST_RUN_TIMEOUT_MS,
    "First-run mark",
  );
  if (error) throw error;
  // NULL: the owner row does not exist (profile not created yet).
  if (data === null || data === undefined) throw new Error("First-run owner row was not found");
  return parseAccountFirstRunMarks(data);
}

/** Send one mark and adopt the stored values if this owner is still current. Never rejects. */
function sendAndAdopt(ownerId: string, rpc: MarkRpc): Promise<void> {
  const key = `${ownerId}:${rpc}`;
  if (sending.has(key)) return Promise.resolve();
  sending.add(key);
  return sendMark(ownerId, rpc)
    .then(
      (stored) => {
        noteStored(ownerId, stored);
        if (snapshot.userId === ownerId) publishServer(ownerId, stored, true);
      },
      (error) => warn(rpc, error),
    )
    .finally(() => {
      sending.delete(key);
    });
}

function recordMark(ownerId: string, field: keyof AccountFirstRunMarks, rpc: MarkRpc): Promise<void> {
  if (!ownerId) return Promise.resolve();
  const marks = sessionMarks.get(ownerId) ?? { ...EMPTY };
  if (!marks[field]) {
    marks[field] = new Date().toISOString();
    sessionMarks.set(ownerId, marks);
  }
  const pending = unconfirmed.get(ownerId) ?? new Set<MarkRpc>();
  pending.add(rpc);
  unconfirmed.set(ownerId, pending);
  // Only a server snapshot changes here. "device" keeps answering from the
  // device value the caller just wrote, and a read in flight merges the session
  // mark when it lands. The changed answer is not confirmed until the server
  // answers again (the first-day review waits for that, CDA-01).
  if (snapshot.userId === ownerId && snapshot.status === "server") publishServer(ownerId, snapshot, false);
  return sendAndAdopt(ownerId, rpc);
}

/** The welcome was finished by this owner. Never rejects. */
export function markAccountOnboardingComplete(ownerId: string): Promise<void> {
  return recordMark(ownerId, "onboardingCompletedAt", "mark_onboarding_completed");
}

/** The first-day review showed content to this owner. Never rejects. */
export function markAccountTTFVSeen(ownerId: string): Promise<void> {
  return recordMark(ownerId, "ttfvSeenAt", "mark_ttfv_seen");
}

/**
 * The account's answer for this owner:
 *   null      wait (not ready, other owner, or the read is in flight)
 *   "device"  the server could not answer; use the device value
 *   marks     the server answer (merged with this session's own marks)
 */
export function accountFirstRunAnswer(
  ownerId: string,
  ready: boolean,
  current: AccountFirstRunSnapshot,
): AccountFirstRunMarks | "device" | null {
  if (!ready || current.userId !== ownerId) return null;
  if (current.status === "device") return "device";
  if (current.status !== "server") return null;
  return { onboardingCompletedAt: current.onboardingCompletedAt, ttfvSeenAt: current.ttfvSeenAt };
}

/**
 * Subscribe to the store and read this owner's marks once `ready` (the session
 * is restored, so the read carries the owner's token rather than going out as
 * anon). Signed out (no owner) answers null: the caller uses the device value.
 */
export function useAccountFirstRun(
  ownerId: string | null,
  ready: boolean,
): AccountFirstRunMarks | "device" | null {
  const current = useSyncExternalStore(
    subscribeAccountFirstRun,
    accountFirstRunSnapshot,
    accountFirstRunSnapshot,
  );
  useEffect(() => {
    if (!ownerId || !ready) return;
    void probeAccountFirstRun(ownerId);
  }, [ownerId, ready]);
  return ownerId ? accountFirstRunAnswer(ownerId, ready, current) : null;
}

export function __resetAccountFirstRunForTests(): void {
  stopOwnerWatch?.();
  stopOwnerWatch = null;
  snapshot = INITIAL;
  generation = 0;
  confirmations = 0;
  revalidating = -1;
  listeners.clear();
  sessionMarks.clear();
  unconfirmed.clear();
  sending.clear();
  resends.clear();
}
