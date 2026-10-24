import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { abortError } from "../async/abort";
import { classifyInputAnyLocale } from "../safety/classifier";
import { publishCrisisNotice } from "../safety/crisis-notice";
import { captureFromMarkdown, type CaptureMutationObserver } from "../wiki/capture";
import type { ContentMutationTicket, createContentWipeLedger } from "../account/content-wipe";
import { CHAT_KEEP_TAG, composeExchangeBody, exchangeMarkdown, exchangeTopic, findPromptIndex, isKeepable } from "./keep-exchange";
import { createKeepReceipts, type KeepAiReuseRequirement, type KeepPair, type KeepReceipt, type KeepReason } from "./keep-receipts";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatRetirementReason, ChatSessionSnapshot, ChatSessionToken, SessionTurn } from "./session-types";

type Registry = ReturnType<typeof createChatSessionRegistry>;
export interface KeepExchangeSnapshot extends KeepPair {
  readonly aiReuse: KeepAiReuseRequirement;
  readonly session: ChatSessionToken;
  readonly prompt: SessionTurn;
  readonly reply: SessionTurn;
  readonly speaker: string;
  readonly locale: "en" | "ko";
  readonly minor: boolean | null;
}
/** F supplies a revision-bound consent capability; manual approval never creates one. */
export interface ChatAutosaveTicket extends KeepPair {
  readonly session: ChatSessionToken;
  readonly revision: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  /** F keeps withdrawal listening until real I/O settles, even if the public
   * result has already returned stale on wipe. Only the owning auto flight retains. */
  retainUntilSettled?(): () => void;
}
export type KeepAuthorization =
  | { readonly reason: "manual"; readonly retryUnknown?: true }
  | { readonly reason: "autosave"; readonly ticket: ChatAutosaveTicket };
/** A settled capture can still need a source recheck. It is not a saved notice. */
export type KeepResult = { readonly status: "settled"; readonly receipt: KeepReceipt }
  | { readonly status: "rejected"; readonly reason: string };

/** Operation-result notice only. checking has no completion notice, including
 * after a later recheck; views read those changes from receipts.subscribe.
 * Only present is success. D1 can report unknown/failed; ledger-backed H only
 * emits present and leaves failure details in KeepResult/the receipt snapshot. */
export type KeepCompletionReceipt = KeepReceipt & { readonly state: "present" | "unknown" | "failed" };
function isCompletionReceipt(receipt: KeepReceipt): receipt is KeepCompletionReceipt {
  return receipt.state === "present" || receipt.state === "unknown" || receipt.state === "failed";
}

const tokenOf = (s: ChatSessionToken): ChatSessionToken => Object.freeze({ ownerId: s.ownerId, ownerEpoch: s.ownerEpoch,
  contentGeneration: s.contentGeneration, sessionId: s.sessionId, sessionGeneration: s.sessionGeneration });
const sameSession = (a: ChatSessionToken, b: ChatSessionToken) => a.ownerId === b.ownerId && a.ownerEpoch === b.ownerEpoch
  && a.contentGeneration === b.contentGeneration && a.sessionId === b.sessionId && a.sessionGeneration === b.sessionGeneration;
const meaningful = (turn: SessionTurn) => !turn.synthetic && !turn.consentError && !turn.retryText && !!turn.text.trim();
const sameTurn = (a: SessionTurn | undefined, b: SessionTurn) => a?.id === b.id && a.exchangeId === b.exchangeId
  && a.sequence === b.sequence && a.role === b.role && a.text === b.text && a.synthetic === b.synthetic
  && a.crisisNotice === b.crisisNotice && a.consentError === b.consentError && a.retryText === b.retryText && a.safetyZone === b.safetyZone;

/** Resolve identities at admission, never a remembered render index. No body persistence. */
export function snapshotKeepExchange(
  session: ChatSessionSnapshot, exchangeId: string,
  presentation: Pick<KeepExchangeSnapshot, "speaker" | "locale" | "minor">,
): KeepExchangeSnapshot | null {
  const pair = session.turns.filter(turn => turn.exchangeId === exchangeId);
  if (pair.length !== 2) return null;
  const [prompt, reply] = pair;
  if (prompt.role !== "user" || !meaningful(prompt) || !isKeepable(reply) || !meaningful(reply)
    || prompt.sequence >= reply.sequence || !presentation.speaker.trim()
    || findPromptIndex(session.turns, session.turns.indexOf(reply)) !== session.turns.indexOf(prompt)) return null;
  // Keep the full turns' verdicts, even if formatting clips away the relevant text.
  // D4/H must carry this requirement to a durable hold before any AI reuse.
  const evidence = pair.filter(turn => turn.safetyZone === "red")
    .map(turn => Object.freeze({ kind: "turn-zone-red" as const, turnId: turn.id }));
  const aiReuse: KeepAiReuseRequirement = evidence.length
    ? Object.freeze({ state: "hold-required", evidence: Object.freeze(evidence) })
    : Object.freeze({ state: "unconfirmed" });
  return Object.freeze({ session: tokenOf(session), exchangeId, promptTurnId: prompt.id, replyTurnId: reply.id,
    prompt: Object.freeze({ ...prompt }), reply: Object.freeze({ ...reply }), aiReuse,
    speaker: presentation.speaker, locale: presentation.locale, minor: presentation.minor });
}

/** Dormant session owner. H must supply the registry's shared ledger before wiring.
 * Omission retains D1 compatibility, not a content-wipe guarantee.
 * Receipts own D2 invalidation; keep work is keyed by replyTurnId, as in prepareKeptExchange.
 * F must abort ticket.signal on consent revocation; isCurrent() alone cannot stop an issued capture. */
export function createChatSessionKeep(registry: Registry, sourceSession: ChatSessionToken,
  options: { timeoutMs?: number; readTimeoutMs?: number; ledger?: ReturnType<typeof createContentWipeLedger> } = {}) {
  if (options.ledger && !registry.usesContentBoundary(options.ledger)) throw new Error("keep_content_boundary_mismatch");
  const session = tokenOf(sourceSession), owner = captureAccountOwnerLease(session.ownerId);
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_keep_timeout");
  const receipts = createKeepReceipts(registry, session, options.readTimeoutMs);
  const completions = new Set<(receipt: KeepCompletionReceipt) => void>();
  let disposed = false;
  let flight: { pair: KeepPair; promise: Promise<KeepResult>; retire: (reason: ChatRetirementReason) => boolean } | null = null;
  let stopAccount = () => {}, stopSession = () => {};
  const current = () => !disposed && owner?.epoch === session.ownerEpoch && owner.isCurrent() && registry.isCurrent(session);
  function retire(reason: ChatRetirementReason): boolean {
    disposed = true;
    const acknowledged = flight?.retire(reason) ?? true;
    // Keep the account listener until the original promise settles: hold/ABA
    // must still abort a transport retained by an earlier content wipe.
    if (!flight) stopAccount();
    stopSession(); receipts.dispose(); completions.clear();
    return acknowledged;
  }
  // Repeated generic cleanup must not undo a wipe's phase-aware drain. Account
  // and consent cancellation have their own listeners and still abort immediately.
  const dispose = () => { if (!disposed) retire("disposed"); };
  const reconcile = () => {
    if (!owner?.isCurrent()) retire("account");
    else if (!current() && !disposed) dispose();
  };
  stopAccount = subscribeAccountTransition(reconcile);
  stopSession = registry.subscribe(reconcile);
  reconcile();
  const rejected = (reason: string): KeepResult => ({ status: "rejected", reason });

  return {
    receipts,
    subscribeCompletion(listener: (receipt: KeepCompletionReceipt) => void) {
      if (disposed) return () => {};
      completions.add(listener); return () => { completions.delete(listener); };
    },
    keepExchange(input: KeepExchangeSnapshot, authorization: KeepAuthorization): Promise<KeepResult> {
      if (!current() || !sameSession(input.session, session)) return Promise.resolve(rejected("stale"));
      if (options.ledger && owner) {
        const content = options.ledger.inspect(owner);
        if (content.phase !== "open" || content.generation !== session.contentGeneration || content.integrityBlocked
          || content.tickets.some(t => t.outcome === "unknown")) return Promise.resolve(rejected("content-blocked"));
      }
      const live = registry.getSessionSnapshot(session);
      const checked = live && snapshotKeepExchange(live, input.exchangeId, input);
      if (!checked || input.promptTurnId !== checked.promptTurnId || input.replyTurnId !== checked.replyTurnId
        || !sameTurn(checked.prompt, input.prompt) || !sameTurn(checked.reply, input.reply)) return Promise.resolve(rejected("pair-changed"));
      const reason: KeepReason = authorization.reason;
      const ticket = authorization.reason === "autosave" ? authorization.ticket : null;
      const consentCurrent = ticket ? ticket.isCurrent.bind(ticket) : () => true;
      const consentSignal = ticket?.signal;
      if (ticket && (!sameSession(ticket.session, session) || ticket.exchangeId !== checked.exchangeId
        || ticket.promptTurnId !== checked.promptTurnId || ticket.replyTurnId !== checked.replyTurnId
        || !Number.isSafeInteger(ticket.revision) || ticket.revision < 0 || consentSignal?.aborted || !consentCurrent())) {
        return Promise.resolve(rejected("consent-stale"));
      }
      if (flight) {
        // Do not attach the joiner's cancellation signal or change the original authority.
        if (flight.pair.exchangeId === checked.exchangeId && flight.pair.promptTurnId === checked.promptTurnId
          && flight.pair.replyTurnId === checked.replyTurnId) return flight.promise;
        return Promise.resolve(rejected("busy"));
      }
      const retryUnknown = authorization.reason === "manual" && authorization.retryUnknown === true;
      const denied = receipts.permission(checked, reason, retryUnknown);
      if (denied) return Promise.resolve(rejected(denied));
      const controller = new AbortController();
      let resolve!: (result: KeepResult) => void;
      const promise = new Promise<KeepResult>(done => { resolve = done; });
      const pending = new Set<ContentMutationTicket>();
      let finishRetired = () => {};
      const active = { pair: { exchangeId: checked.exchangeId, promptTurnId: checked.promptTurnId, replyTurnId: checked.replyTurnId },
        promise, retire: (why: ChatRetirementReason) => {
          const draining = pending.size > 0;
          if (why !== "content-wipe" || !draining || !owner?.isCurrent()) controller.abort();
          finishRetired();
          // ACK confirms the fence, not settlement. The shared ledger alone
          // permits deletion once all issued mutations have confirmed outcomes.
          return true;
        } };
      flight = active;
      const work = registry.claimWork(session, "keep", checked.replyTurnId, retire);
      if (!work) { flight = null; resolve(rejected("busy")); return promise; }
      const releaseConsent = ticket?.retainUntilSettled?.();
      let finished = false, captureStarted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const canEffect = () => current() && !controller.signal.aborted && consentCurrent()
        && (!options.ledger || !!owner && options.ledger.read(owner).phase === "open"
          && options.ledger.read(owner).generation === session.contentGeneration);
      const assertCurrent = () => { if (!canEffect()) throw abortError(); };
      const finish = (result: KeepResult) => {
        if (finished) return;
        finished = true;
        if (timer !== undefined) clearTimeout(timer);
        if (result.status === "settled" && isCompletionReceipt(result.receipt)
          && (!options.ledger || result.receipt.state === "present") && canEffect()) for (const listener of [...completions]) {
          if (!canEffect()) break;
          try { listener(result.receipt); } catch { /* The write outcome cannot become a retry on observer failure. */ }
        }
        resolve(current() ? result : rejected("stale"));
      };
      finishRetired = () => finish(rejected("stale"));
      const ledger = options.ledger;
      const mutationObserver: Omit<CaptureMutationObserver, "session"> | undefined = ledger && owner ? {
        owner, generation: session.contentGeneration, operationId: work.operationId, assertCurrent,
        ledger: {
          read: ledger.read,
          acquireMutation: ledger.acquireMutation,
          issueMutation(account, mutation, dispatch, gate) {
            return ledger.issueMutation(account, mutation, () => {
              pending.add(mutation); // Before dispatch can synchronously retire the session.
              return dispatch();
            }, gate);
          },
          settleMutation(mutation, proof) {
            // No current-session check: a late fact belongs to its original ticket.
            const settled = ledger.settleMutation(mutation, proof);
            if (settled && proof.outcome !== "unknown") pending.delete(mutation);
            return settled;
          },
        },
      } : undefined;
      const fail = () => {
        if (finished) return;
        const receipt = receipts.settle(checked.exchangeId, work.operationId, { state: captureStarted ? "unknown" : "failed" });
        finish(receipt ? { status: "settled", receipt } : rejected("stale"));
      };
      controller.signal.addEventListener("abort", fail, { once: true });
      const cancelConsent = () => controller.abort();
      consentSignal?.addEventListener("abort", cancelConsent, { once: true });
      const began = receipts.begin(checked, work.operationId, reason, retryUnknown);
      if (!began || !canEffect()) {
        fail(); controller.abort();
        controller.signal.removeEventListener("abort", fail); consentSignal?.removeEventListener("abort", cancelConsent);
        registry.settleWork(work); if (flight === active) flight = null;
        releaseConsent?.();
        return promise;
      }
      timer = setTimeout(() => { fail(); controller.abort(); }, timeoutMs);
      void (async () => {
        const lease = beginAccountSessionLease(session.ownerId, controller.signal);
        try {
          assertCurrent();
          const body = composeExchangeBody({ prompt: checked.prompt.text, reply: checked.reply.text, speaker: checked.speaker }, checked.locale);
          // composeExchangeBody clips each side to KEEP_MAX_CHARS, not a whole-conversation cache.
          const safety = classifyInputAnyLocale(body, checked.locale, { minor: checked.minor !== false });
          assertCurrent();
          if (safety.zone === "red" && !(reason === "autosave" && checked.reply.crisisNotice)) {
            publishCrisisNotice(owner, safety.crisisRouting?.hotline ?? (checked.locale === "ko"
              ? checked.minor !== false ? "KR_1388" : "KR_109" : "GLOBAL_988"));
          }
          // Guidance only needs the current owner, so authentication cannot delay it.
          assertCurrent();
          const authenticated = await lease.authenticate();
          assertCurrent(); lease.assertCurrent();
          captureStarted = true;
          const result = await captureFromMarkdown({ userId: session.ownerId, signal: mutationObserver ? authenticated.signal : controller.signal,
            rawMd: exchangeMarkdown(exchangeTopic(checked.prompt.text, checked.reply.text), body),
            kindOverride: "self_knowledge", userTags: [CHAT_KEEP_TAG],
            ...(mutationObserver ? { mutationObserver: { ...mutationObserver, session: authenticated } } : {}) });
          assertCurrent(); lease.assertCurrent();
          if (finished) return;
          if (!result.source?.id || result.source.user_id !== session.ownerId) throw new Error("invalid_keep_source");
          const receipt = receipts.settle(checked.exchangeId, work.operationId, { state: "present", sourceId: result.source.id,
            deduped: result.deduped, storagePending: result.storagePending || result.source.frontmatter?._storage_pending === true });
          assertCurrent();
          finish(receipt ? { status: "settled", receipt } : rejected("stale"));
        } catch { fail(); }
        finally {
          if (timer !== undefined) clearTimeout(timer);
          controller.signal.removeEventListener("abort", fail); consentSignal?.removeEventListener("abort", cancelConsent);
          lease.release(); registry.settleWork(work);
          if (flight === active) flight = null;
          if (disposed) stopAccount();
          releaseConsent?.();
        }
      })();
      return promise;
    },
    dispose,
  };
}
