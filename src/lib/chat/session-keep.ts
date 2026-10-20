import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { abortError } from "../async/abort";
import { classifyInputAnyLocale } from "../safety/classifier";
import { publishCrisisNotice } from "../safety/crisis-notice";
import { captureFromMarkdown } from "../wiki/capture";
import { CHAT_KEEP_TAG, composeExchangeBody, exchangeMarkdown, exchangeTopic, isKeepable } from "./keep-exchange";
import { createKeepReceipts, type KeepPair, type KeepReceipt, type KeepReason } from "./keep-receipts";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatSessionSnapshot, ChatSessionToken, SessionTurn } from "./session-types";

type Registry = ReturnType<typeof createChatSessionRegistry>;
export interface KeepExchangeSnapshot extends KeepPair {
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
}
export type KeepAuthorization =
  | { readonly reason: "manual"; readonly retryUnknown?: true }
  | { readonly reason: "autosave"; readonly ticket: ChatAutosaveTicket };
export type KeepResult = { readonly status: "settled"; readonly receipt: KeepReceipt }
  | { readonly status: "rejected"; readonly reason: string };

const tokenOf = (s: ChatSessionToken): ChatSessionToken => Object.freeze({ ownerId: s.ownerId, ownerEpoch: s.ownerEpoch,
  contentGeneration: s.contentGeneration, sessionId: s.sessionId, sessionGeneration: s.sessionGeneration });
const sameSession = (a: ChatSessionToken, b: ChatSessionToken) => a.ownerId === b.ownerId && a.ownerEpoch === b.ownerEpoch
  && a.contentGeneration === b.contentGeneration && a.sessionId === b.sessionId && a.sessionGeneration === b.sessionGeneration;
const meaningful = (turn: SessionTurn) => !turn.synthetic && !turn.crisisNotice && !turn.consentError && !turn.retryText
  && turn.safetyZone !== "red" && !!turn.text.trim();
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
    || prompt.sequence >= reply.sequence || !presentation.speaker.trim()) return null;
  return Object.freeze({ session: tokenOf(session), exchangeId, promptTurnId: prompt.id, replyTurnId: reply.id,
    prompt: Object.freeze({ ...prompt }), reply: Object.freeze({ ...reply }),
    speaker: presentation.speaker, locale: presentation.locale, minor: presentation.minor });
}

/** Dormant session owner. H must not wire this before the gateway/D4 contracts land.
 * capture's transport is unchanged here. D4 will register/issue/settle each actual
 * mutation; abort or a settled UI Promise is never proof that a server write stopped. */
export function createChatSessionKeep(registry: Registry, sourceSession: ChatSessionToken,
  options: { timeoutMs?: number; readTimeoutMs?: number } = {}) {
  const session = tokenOf(sourceSession), owner = captureAccountOwnerLease(session.ownerId);
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_keep_timeout");
  const receipts = createKeepReceipts(registry, session, options.readTimeoutMs);
  const completions = new Set<(receipt: KeepReceipt) => void>();
  let disposed = false;
  let flight: { pair: KeepPair; promise: Promise<KeepResult>; abort: () => void } | null = null;
  let stopAccount = () => {}, stopSession = () => {};
  const current = () => !disposed && owner?.epoch === session.ownerEpoch && owner.isCurrent() && registry.isCurrent(session);
  function dispose() {
    if (disposed) return;
    disposed = true; flight?.abort(); stopAccount(); stopSession(); receipts.dispose(); completions.clear();
  }
  const reconcile = () => { if (!current()) dispose(); };
  stopAccount = subscribeAccountTransition(reconcile);
  stopSession = registry.subscribe(reconcile);
  reconcile();
  const rejected = (reason: string): KeepResult => ({ status: "rejected", reason });

  return {
    receipts,
    subscribeCompletion(listener: (receipt: KeepReceipt) => void) {
      if (disposed) return () => {};
      completions.add(listener); return () => { completions.delete(listener); };
    },
    keepExchange(input: KeepExchangeSnapshot, authorization: KeepAuthorization): Promise<KeepResult> {
      if (!current() || !sameSession(input.session, session)) return Promise.resolve(rejected("stale"));
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
      const active = { pair: { exchangeId: checked.exchangeId, promptTurnId: checked.promptTurnId, replyTurnId: checked.replyTurnId },
        promise, abort: () => controller.abort() };
      flight = active;
      const work = registry.claimWork(session, "keep", "capture", () => { dispose(); return true; });
      if (!work) { flight = null; resolve(rejected("busy")); return promise; }
      let finished = false, captureStarted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const canEffect = () => current() && !controller.signal.aborted && consentCurrent();
      const assertCurrent = () => { if (!canEffect()) throw abortError(); };
      const finish = (result: KeepResult) => {
        if (finished) return;
        finished = true;
        if (timer !== undefined) clearTimeout(timer);
        if (result.status === "settled" && canEffect()) for (const listener of [...completions]) {
          if (!canEffect()) break;
          try { listener(result.receipt); } catch { /* The write outcome cannot become a retry on observer failure. */ }
        }
        resolve(current() ? result : rejected("stale"));
      };
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
        return promise;
      }
      timer = setTimeout(() => { fail(); controller.abort(); }, timeoutMs);
      void (async () => {
        const lease = beginAccountSessionLease(session.ownerId, controller.signal);
        try {
          assertCurrent();
          await lease.authenticate();
          assertCurrent(); lease.assertCurrent();
          const body = composeExchangeBody({ prompt: checked.prompt.text, reply: checked.reply.text, speaker: checked.speaker }, checked.locale);
          // composeExchangeBody clips each side to KEEP_MAX_CHARS, not a whole-conversation cache.
          const safety = classifyInputAnyLocale(body, checked.locale, { minor: checked.minor !== false });
          assertCurrent();
          if (safety.zone === "red") {
            publishCrisisNotice(owner, safety.crisisRouting?.hotline ?? (checked.locale === "ko"
              ? checked.minor !== false ? "KR_1388" : "KR_109" : "GLOBAL_988"));
          }
          assertCurrent(); lease.assertCurrent();
          captureStarted = true;
          const result = await captureFromMarkdown({ userId: session.ownerId, signal: controller.signal,
            rawMd: exchangeMarkdown(exchangeTopic(checked.prompt.text, checked.reply.text), body),
            kindOverride: "self_knowledge", userTags: [CHAT_KEEP_TAG] });
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
        }
      })();
      return promise;
    },
    dispose,
  };
}
