import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { getSupabaseClient } from "../supabase/client";
import type { CaptureResult } from "../wiki/capture";
import type { KeptExchangePreparation } from "./prepare-kept-exchange";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatSessionToken } from "./session-types";

type Registry = Pick<ReturnType<typeof createChatSessionRegistry>, "isCurrent" | "subscribe">;
const EMPTY_RECEIPTS: readonly KeepReceipt[] = Object.freeze([]);
export type KeepReason = "manual" | "autosave";
export type KeepAiReuseRequirement = Extract<KeptExchangePreparation, { status: "prepared" }>["aiReuse"];
export interface KeepPair {
  readonly exchangeId: string;
  readonly promptTurnId: string;
  readonly replyTurnId: string;
}
export interface KeepReceipt extends KeepPair {
  /** A requirement for D4/H, never evidence that a durable hold has been applied. */
  readonly aiReuse: KeepAiReuseRequirement;
  readonly operationId: string;
  readonly reason: KeepReason;
  readonly state: "saving" | "present" | "checking" | "missing" | "unknown" | "failed";
  readonly sourceId?: string;
  readonly storagePending?: boolean;
  readonly deduped?: CaptureResult["deduped"];
  readonly deletedAfterSave: boolean;
  /** Retained even after a missing source is manually saved again. Never a consent grant. */
  readonly autosaveTombstone: true;
}
export type KeepSettlement =
  | { readonly state: "present"; readonly sourceId: string; readonly storagePending: boolean; readonly deduped: CaptureResult["deduped"] }
  | { readonly state: "unknown" | "failed" };

/** Metadata only. A view unsubscribes on detach; the owning session alone disposes.
 * Future deletion-event consumers must requery only known source IDs; events are not deletion proof.
 * D4 must fence issued capture writes separately; these receipts are not its ledger. */
export function createKeepReceipts(registry: Registry, sourceSession: ChatSessionToken, timeoutMs = 10_000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_keep_read_timeout");
  const session: ChatSessionToken = Object.freeze({ ownerId: sourceSession.ownerId, ownerEpoch: sourceSession.ownerEpoch,
    contentGeneration: sourceSession.contentGeneration, sessionId: sourceSession.sessionId, sessionGeneration: sourceSession.sessionGeneration });
  const owner = captureAccountOwnerLease(session.ownerId);
  const rows = new Map<string, KeepReceipt>();
  const listeners = new Set<() => void>();
  let snapshot: readonly KeepReceipt[] = EMPTY_RECEIPTS;
  let disposed = false, generation = 0;
  let cancelRead: (() => void) | null = null;
  let stopAccount = () => {}, stopSession = () => {};
  const current = () => !disposed && owner?.epoch === session.ownerEpoch && owner.isCurrent() && registry.isCurrent(session);
  function publish() {
    snapshot = Object.freeze([...rows.values()]);
    for (const listener of [...listeners]) {
      if (disposed) break;
      try { listener(); } catch { /* Observers cannot interrupt receipt cleanup. */ }
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; generation += 1;
    cancelRead?.(); cancelRead = null;
    stopAccount(); stopSession(); rows.clear(); snapshot = EMPTY_RECEIPTS;
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Continue clearing other observers. */ }
    }
    listeners.clear();
  }
  const reconcile = () => { if (!current()) dispose(); };
  stopAccount = subscribeAccountTransition(reconcile);
  stopSession = registry.subscribe(reconcile);
  reconcile();

  function permission(pair: KeepPair, reason: KeepReason, retryUnknown = false): string | null {
    if (!current()) return "stale";
    const prior = rows.get(pair.exchangeId);
    if (!prior) return null;
    if (prior.promptTurnId !== pair.promptTurnId || prior.replyTurnId !== pair.replyTurnId) return "pair-changed";
    if (reason === "autosave" && prior.autosaveTombstone) return "autosave-blocked";
    if (prior.state === "checking" || (prior.state === "unknown" && prior.sourceId)) return "check-required";
    if (prior.state === "unknown" && !retryUnknown) return "retry-required";
    if (prior.state === "missing" || prior.state === "failed" || (prior.state === "unknown" && retryUnknown)) return null;
    return prior.state === "saving" ? "busy" : "already-saved";
  }

  return {
    getSnapshot: () => current() ? snapshot : EMPTY_RECEIPTS,
    get: (exchangeId: string) => current() ? rows.get(exchangeId) ?? null : null,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    permission,
    begin(pair: KeepPair & { readonly aiReuse: KeepAiReuseRequirement }, operationId: string, reason: KeepReason, retryUnknown = false): KeepReceipt | null {
      if (permission(pair, reason, retryUnknown) || !operationId || !pair.exchangeId || !pair.promptTurnId || !pair.replyTurnId) return null;
      const aiReuse: KeepAiReuseRequirement = pair.aiReuse.state === "hold-required"
        ? Object.freeze({ state: "hold-required", evidence: Object.freeze(pair.aiReuse.evidence.map(item =>
          Object.freeze({ kind: item.kind, turnId: item.turnId }))) })
        : Object.freeze({ state: "unconfirmed" });
      const receipt: KeepReceipt = Object.freeze({ exchangeId: pair.exchangeId, promptTurnId: pair.promptTurnId,
        replyTurnId: pair.replyTurnId, aiReuse, operationId, reason, state: "saving",
        deletedAfterSave: rows.get(pair.exchangeId)?.deletedAfterSave ?? false, autosaveTombstone: true });
      rows.set(pair.exchangeId, receipt); publish();
      return current() && rows.get(pair.exchangeId) === receipt ? receipt : null;
    },
    settle(exchangeId: string, operationId: string, result: KeepSettlement): KeepReceipt | null {
      const prior = rows.get(exchangeId);
      if (!current() || !prior || prior.operationId !== operationId || prior.state !== "saving") return null;
      if (result.state === "present" && !result.sourceId) return null;
      const receipt = Object.freeze({ ...prior, ...result });
      rows.set(exchangeId, receipt); publish();
      return current() && rows.get(exchangeId) === receipt ? receipt : null;
    },
    /** Focus/attach or explicit status check; no body or wiki-page query. */
    check(): Promise<void> {
      if (!current()) return Promise.resolve();
      cancelRead?.();
      const observed = ++generation;
      const candidates = [...rows.values()].filter(row => row.sourceId && row.state !== "saving");
      if (!candidates.length) return Promise.resolve();
      const ids = [...new Set(candidates.map(row => row.sourceId!))];
      const controller = new AbortController();
      let resolve!: () => void;
      const promise = new Promise<void>(done => { resolve = done; });
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer !== undefined) clearTimeout(timer);
        controller.abort();
        if (cancelRead === finish) cancelRead = null;
        resolve();
      };
      cancelRead = finish;
      const apply = (surviving: ReadonlySet<string> | null) => {
        if (!finished && current() && observed === generation) {
          for (const row of candidates) {
            const latest = rows.get(row.exchangeId);
            if (latest?.operationId !== row.operationId || latest.sourceId !== row.sourceId || latest.state !== "checking") continue;
            const state = surviving === null ? "unknown" : surviving.has(row.sourceId!) ? "present" : "missing";
            rows.set(row.exchangeId, Object.freeze({ ...latest, state,
              deletedAfterSave: latest.deletedAfterSave || state === "missing" }));
          }
          publish();
        }
        finish();
      };
      for (const row of candidates) rows.set(row.exchangeId, Object.freeze({ ...row, state: "checking" }));
      publish();
      if (!current() || finished || observed !== generation) { finish(); return promise; }
      timer = setTimeout(() => apply(null), timeoutMs);
      void (async () => {
        try {
          if (!current() || finished || observed !== generation) return;
          // Same owner + known-ID scope as findSurvivingSourceIds, with cancellation
          // and strict response validation: null/malformed is not proof of deletion.
          const { data, error } = await getSupabaseClient().from("sources").select("id")
            .eq("user_id", session.ownerId).in("id", ids).abortSignal(controller.signal);
          if (!current() || finished || observed !== generation) return;
          if (error || !Array.isArray(data) || data.some(row => !row || typeof row.id !== "string" || !ids.includes(row.id))) {
            apply(null); return;
          }
          apply(new Set(data.map(row => row.id as string)));
        } catch { apply(null); }
        finally { finish(); }
      })();
      return promise;
    },
    dispose,
  };
}
