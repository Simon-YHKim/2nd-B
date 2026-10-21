import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { getSupabaseClient } from "../supabase/client";
import type { CaptureResult } from "../wiki/capture";
import { subscribeSavedDataChanges } from "../wiki/saved-data-changes";
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
 * Deletion events requery only known source IDs; events are not deletion proof.
 * D4 must fence issued capture writes separately; these receipts are not its ledger. */
export function createKeepReceipts(registry: Registry, sourceSession: ChatSessionToken, timeoutMs = 10_000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_keep_read_timeout");
  const session: ChatSessionToken = Object.freeze({ ownerId: sourceSession.ownerId, ownerEpoch: sourceSession.ownerEpoch,
    contentGeneration: sourceSession.contentGeneration, sessionId: sourceSession.sessionId, sessionGeneration: sourceSession.sessionGeneration });
  const owner = captureAccountOwnerLease(session.ownerId);
  const rows = new Map<string, KeepReceipt>();
  // null means an unknown source target; IDs are matched only once capture settles.
  const savingInvalidations = new Map<string, Set<string> | null>();
  const listeners = new Set<() => void>();
  let snapshot: readonly KeepReceipt[] = EMPTY_RECEIPTS;
  let disposed = false, generation = 0;
  const readGenerations = new Map<string, number>();
  const reads = new Set<{ cancel: () => void; hasCurrentCandidate: () => boolean }>();
  let stopAccount = () => {}, stopSession = () => {}, stopSavedData = () => {};
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
    for (const read of [...reads]) read.cancel();
    readGenerations.clear(); savingInvalidations.clear();
    stopAccount(); stopSession(); stopSavedData(); rows.clear(); snapshot = EMPTY_RECEIPTS;
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Continue clearing other observers. */ }
    }
    listeners.clear();
  }
  const reconcile = () => { if (!current()) dispose(); };
  stopAccount = subscribeAccountTransition(reconcile);
  stopSession = registry.subscribe(reconcile);
  stopSavedData = subscribeSavedDataChanges(session.ownerId, change => {
    if (!current() || change.ownerId !== session.ownerId || change.kind !== "source") return;
    for (const row of rows.values()) {
      if (row.state !== "saving") continue;
      const pending = savingInvalidations.get(row.exchangeId);
      if (pending === null) continue;
      savingInvalidations.set(row.exchangeId, change.ids === undefined ? null
        : new Set([...(pending ?? []), ...change.ids]));
    }
    void check(change.ids);
  });
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

  /** Focus/attach or deletion invalidation; no body or wiki-page query. */
  function check(sourceIds?: readonly string[]): Promise<void> {
    if (!current()) return Promise.resolve();
    const candidates = [...rows.values()].filter(row => row.sourceId && row.state !== "saving"
      && (sourceIds === undefined || sourceIds.includes(row.sourceId)));
    if (!candidates.length) return Promise.resolve();
    const observed = ++generation;
    const ids = [...new Set(candidates.map(row => row.sourceId!))];
    const controller = new AbortController();
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isLatest = (row: KeepReceipt) => {
      const latest = rows.get(row.exchangeId);
      return readGenerations.get(row.exchangeId) === observed
        && latest?.operationId === row.operationId && latest.sourceId === row.sourceId;
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
      reads.delete(read);
      for (const row of candidates) {
        if (readGenerations.get(row.exchangeId) === observed) readGenerations.delete(row.exchangeId);
      }
      resolve();
    };
    const read = { cancel: finish, hasCurrentCandidate: () => candidates.some(isLatest) };
    for (const row of candidates) readGenerations.set(row.exchangeId, observed);
    reads.add(read);
    // A partial invalidation must not cancel the unaffected portion of a focus read.
    for (const pending of [...reads]) if (!pending.hasCurrentCandidate()) pending.cancel();
    const apply = (surviving: ReadonlySet<string> | null) => {
      if (!finished && current()) {
        let changed = false;
        for (const row of candidates) {
          if (!isLatest(row)) continue;
          const latest = rows.get(row.exchangeId)!;
          const state = surviving === null ? row.state === "missing" ? "missing" : "unknown"
            : surviving.has(row.sourceId!) ? "present" : "missing";
          if (latest.state === state) continue;
          rows.set(row.exchangeId, Object.freeze({ ...latest, state,
            deletedAfterSave: latest.deletedAfterSave || state === "missing" }));
          changed = true;
        }
        if (changed) publish();
      }
      finish();
    };
    let changed = false;
    for (const row of candidates) {
      // Confirmed absence remains usable for manual resave until new evidence.
      if (row.state === "missing" || row.state === "checking") continue;
      rows.set(row.exchangeId, Object.freeze({ ...row, state: "checking" }));
      changed = true;
    }
    if (changed) publish();
    if (!current() || finished || !read.hasCurrentCandidate()) { finish(); return promise; }
    timer = setTimeout(() => apply(null), timeoutMs);
    void (async () => {
      try {
        if (!current() || finished || !read.hasCurrentCandidate()) return;
        // Same owner + known-ID scope as findSurvivingSourceIds, with cancellation
        // and strict response validation: null/malformed is not proof of deletion.
        const { data, error } = await getSupabaseClient().from("sources").select("id")
          .eq("user_id", session.ownerId).in("id", ids).abortSignal(controller.signal);
        if (!current() || finished || !read.hasCurrentCandidate()) return;
        if (error || !Array.isArray(data) || data.some(row => !row || typeof row.id !== "string" || !ids.includes(row.id))) {
          apply(null); return;
        }
        apply(new Set(data.map(row => row.id as string)));
      } catch { apply(null); }
      finally { finish(); }
    })();
    return promise;
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
      rows.set(pair.exchangeId, receipt);
      savingInvalidations.delete(pair.exchangeId);
      readGenerations.delete(pair.exchangeId);
      for (const read of [...reads]) if (!read.hasCurrentCandidate()) read.cancel();
      publish();
      return current() && rows.get(pair.exchangeId) === receipt ? receipt : null;
    },
    settle(exchangeId: string, operationId: string, result: KeepSettlement): KeepReceipt | null {
      const prior = rows.get(exchangeId);
      if (!current() || !prior || prior.operationId !== operationId || prior.state !== "saving") return null;
      if (result.state === "present" && !result.sourceId) return null;
      const invalidated = savingInvalidations.get(exchangeId);
      savingInvalidations.delete(exchangeId);
      const receipt = Object.freeze({ ...prior, ...result });
      rows.set(exchangeId, receipt);
      if (result.state === "present" && (invalidated === null || invalidated?.has(result.sourceId))) {
        // check publishes checking before any listener can consume this late present.
        void check([result.sourceId]);
        const checked = rows.get(exchangeId);
        return current() && checked?.operationId === operationId ? checked : null;
      }
      publish();
      return current() && rows.get(exchangeId) === receipt ? receipt : null;
    },
    /** Explicit checks cover all known receipts; events narrow their own target. */
    check: () => check(),
    dispose,
  };
}
