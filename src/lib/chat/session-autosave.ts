import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { fetchPrivacyPrefs } from "../supabase/privacy";
import { chatAutosaveAllowed } from "./autosave";
import type { createChatSessionController } from "./session-controller";
import type { ChatCompletionEvent } from "./session-deps";
import { snapshotKeepExchange, type ChatAutosaveTicket, type createChatSessionKeep, type KeepExchangeSnapshot } from "./session-keep";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatSessionToken } from "./session-types";

type Registry = ReturnType<typeof createChatSessionRegistry>;
type CompletionSource = Pick<ReturnType<typeof createChatSessionController>, "subscribeCompletion">;
type Keep = Pick<ReturnType<typeof createChatSessionKeep>, "keepExchange">;
type Presentation = Pick<KeepExchangeSnapshot, "speaker" | "locale" | "minor">;
const sameSession = (a: ChatSessionToken, b: ChatSessionToken) => a.ownerId === b.ownerId && a.ownerEpoch === b.ownerEpoch
  && a.contentGeneration === b.contentGeneration && a.sessionId === b.sessionId && a.sessionGeneration === b.sessionGeneration;

/** Dormant F adapter, created once alongside a session's controller/keep owner.
 * H must retain it across view detach and inject the shared ledger-backed keep.
 * The shipping, mount-scoped autosave-session.ts remains unchanged.
 * No backlog, body store, capture writer or screen subscription lives here. */
export function createChatSessionAutosave(registry: Registry, sourceSession: ChatSessionToken,
  controller: CompletionSource, keep: Keep, presentation: Presentation) {
  const session: ChatSessionToken = Object.freeze({ ownerId: sourceSession.ownerId, ownerEpoch: sourceSession.ownerEpoch,
    contentGeneration: sourceSession.contentGeneration, sessionId: sourceSession.sessionId, sessionGeneration: sourceSession.sessionGeneration });
  const display = Object.freeze({ ...presentation });
  const owner = captureAccountOwnerLease(session.ownerId);
  let stopped = false, enabled = false, revision = 0;
  let firstAllowedSequence = Number.POSITIVE_INFINITY;
  let hydration: Promise<void> | null = null;
  const attempted = new Set<string>();
  const pending = new Map<string, { controller: AbortController; phase: "consent" | "keep"; retained: boolean; done: boolean }>();
  let stopPrivacy = () => {}, stopAccount = () => {}, stopSession = () => {}, stopCompletion = () => {};
  const current = () => !stopped && owner?.epoch === session.ownerEpoch && owner.isCurrent() && registry.isCurrent(session);
  function releaseListeners() {
    if (stopped && pending.size === 0) { stopPrivacy(); stopAccount(); }
  }
  function abortPending() { for (const item of pending.values()) item.controller.abort(); }
  function setConsent(next: boolean) {
    if (!next) abortPending();
    if (stopped || next === enabled) return;
    revision += 1;
    firstAllowedSequence = next ? registry.getNextSequence(session) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    enabled = next;
  }
  function stopAcceptingForWipe() {
    if (stopped) return;
    stopped = true; enabled = false; revision += 1; firstAllowedSequence = Number.POSITIVE_INFINITY;
    attempted.clear(); stopSession(); stopCompletion();
    // The keep owner's retirement decides whether an issued mutation must drain.
    // Do not abort its consent signal merely because the session was retired.
    for (const item of pending.values()) if (item.phase === "consent") item.controller.abort();
    // OFF/owner hold must still abort an issued auto write during that drain.
    releaseListeners();
  }
  function reconcile() { if (!current()) stopAcceptingForWipe(); }
  async function complete(event: ChatCompletionEvent): Promise<void> {
    if (!current() || !sameSession(event.session, session)
      || event.operation.stage !== "answered" || !["reply", "red"].includes(event.operation.outcome ?? "")) return;
    const exchangeId = event.operation.exchangeId;
    if (attempted.has(exchangeId)) return;
    // Remember the event even when OFF, unknown, rejected or failed. No replays.
    attempted.add(exchangeId);
    if (!enabled) return;
    const snapshot = registry.getSessionSnapshot(session);
    const input = snapshot && snapshotKeepExchange(snapshot, exchangeId, display);
    if (!input || input.promptTurnId !== event.operation.promptTurnId || input.replyTurnId !== event.operation.responseTurnId
      || input.prompt.sequence < firstAllowedSequence) return;
    const item = { controller: new AbortController(), phase: "consent" as "consent" | "keep", retained: false, done: false };
    pending.set(exchangeId, item);
    const release = () => { if (item.done && !item.retained) { pending.delete(exchangeId); releaseListeners(); } };
    const observed = revision;
    const ticket: ChatAutosaveTicket = Object.freeze({ session, exchangeId, promptTurnId: input.promptTurnId,
      replyTurnId: input.replyTurnId, revision: observed, signal: item.controller.signal,
      isCurrent: () => current() && enabled && revision === observed && !item.controller.signal.aborted
        && input.prompt.sequence >= firstAllowedSequence,
      retainUntilSettled: () => {
        item.retained = true;
        return () => { item.retained = false; release(); };
      } });
    try {
      const prefs = await fetchPrivacyPrefs(session.ownerId);
      if (!ticket.isCurrent()) return;
      if (!chatAutosaveAllowed(prefs.chat_autosave)) { setConsent(false); return; }
      item.phase = "keep";
      await keep.keepExchange(input, { reason: "autosave", ticket });
    } catch { /* Failed reads/writes are not a backlog or a manual receipt update. */ }
    finally { item.done = true; release(); }
  }
  stopPrivacy = subscribePrivacyChanges(change => {
    if (change.ownerId !== session.ownerId || !owner?.isCurrent()) return;
    if (typeof change.prefs.chat_autosave === "boolean") setConsent(change.prefs.chat_autosave);
  });
  stopAccount = subscribeAccountTransition(() => {
    if (!owner?.isCurrent()) { abortPending(); stopAcceptingForWipe(); }
  });
  stopSession = registry.subscribe(reconcile);
  stopCompletion = controller.subscribeCompletion(event => { void complete(event); });
  reconcile();
  return {
    /** Explicit, idempotent start; reattach never hydrates or scans turns. */
    hydrate(): Promise<void> {
      if (hydration) return hydration;
      if (!current()) return Promise.resolve();
      const prior = currentPrivacyChange(session.ownerId), observed = revision;
      hydration = (async () => {
        try {
          const prefs = await fetchPrivacyPrefs(session.ownerId);
          if (!current() || revision !== observed || currentPrivacyChange(session.ownerId) !== prior) return;
          setConsent(prior?.prefs.chat_autosave !== false && chatAutosaveAllowed(prefs.chat_autosave));
        } catch { /* Unknown stays disabled; only an explicit later grant enables it. */ }
      })();
      return hydration;
    },
    /** Before a separate explicit manual keep. Never promotes an aborted auto. */
    cancelPendingConsent(exchangeId: string): boolean {
      const item = pending.get(exchangeId);
      if (!item || item.phase !== "consent") return false;
      item.controller.abort(); return true;
    },
    stopAcceptingForWipe,
    /** Owner cleanup, never view detach. Repeated cleanup preserves wipe drain. */
    dispose() { if (!stopped) { abortPending(); stopAcceptingForWipe(); } },
  };
}
