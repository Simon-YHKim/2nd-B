// T39 A2-I: dormant live entry. Screens keep sendChatMessage until B1.
import { abortError } from "../async/abort";
import type { AccountOwnerLease } from "../auth/account-epoch";
import { tLocale } from "../i18n/text";
import { callLlm, classifyLiveChatTextForCrisis, LlmChatTurnError, LlmConsentError, selectChatTurnRoute } from "../llm/boundary";
import type { CrisisObserver } from "../llm/types";
import { assembleChatSystemPrompt, loadChatContext, type SendMessageInput, type SendMessageOk, type SendMessageBlocked } from "./conversation";
import { CHAT_DAILY_LIMIT, checkChatLimit, kstDateToday } from "./limits";
import { bumpChatUsageForTurn, bumpChatUsageIfUnderCap, ChatLimitExceededError, readChatUsageDetail } from "./usage";
import type { ChatTurnUsage } from "./turn-reservation";
import { beginTurnAttempt, canPrepareTurn, createTurnResultState, endTurnWait, finishTurnFailure,
  markTurnDispatched, nextTurnAction, receiveTurnAdmission, receiveTurnCrisis, receiveTurnReceipt,
  retireTurnRetry, selectTurnResult, startTurnReservation, turnHistoryValue,
  type TurnResultState, type TurnTicket } from "./turn-result-state";

export type LiveChatTurnResult =
  | { status: "selected"; result: SendMessageOk }
  | { status: "blocked"; result: SendMessageBlocked }
  | { status: "ignored" };

export interface LiveChatTurn {
  read(): TurnResultState<SendMessageOk>;
  historyValue(): SendMessageOk | null;
  /** B2-only explicit wait release. Does not cancel the observed Promise. */
  endWait(ticket: TurnTicket): void;
  /** A new send retires retry rights, but an issued original may still win. */
  retireRetry(): void;
}

interface TurnRuntime {
  state: TurnResultState<SendMessageOk>;
  assertOwner: () => void;
  notify: CrisisObserver;
  onReceipt?: (receipt: ChatTurnUsage) => void;
  adBonus: number;
}
const runtimes = new WeakMap<LiveChatTurn, TurnRuntime>();

/** Capture identity and observers once; no model call, timer or storage. */
export function createLiveChatTurn(input: {
  owner: AccountOwnerLease; conversationId: string; pairId: string; message: string;
  onCrisisDetected: CrisisObserver; onReceipt?: (receipt: ChatTurnUsage) => void;
}): LiveChatTurn {
  const { ownerId, epoch } = input.owner;
  const isCurrent = input.owner.isCurrent.bind(input.owner);
  const assertOwner = () => { if (!isCurrent()) throw abortError(); };
  assertOwner();
  const runtime: TurnRuntime = {
    state: createTurnResultState({ ownerId, ownerEpoch: epoch, conversationId: input.conversationId, pairId: input.pairId }, input.message),
    assertOwner, notify: input.onCrisisDetected, onReceipt: input.onReceipt, adBonus: 0,
  };
  const turn: LiveChatTurn = Object.freeze({
    read: () => { assertOwner(); return runtime.state; },
    historyValue: () => { assertOwner(); return turnHistoryValue(runtime.state); },
    endWait: (ticket: TurnTicket) => { assertOwner(); runtime.state = endTurnWait(runtime.state, ticket); },
    retireRetry: () => { assertOwner(); runtime.state = retireTurnRetry(runtime.state); },
  });
  runtimes.set(turn, runtime);
  return turn;
}

/** Only a selected result authorizes display/history/sound/save/post-processing. */
export async function sendLiveChatMessage(source: SendMessageInput, turn: LiveChatTurn): Promise<LiveChatTurnResult> {
  // T38 H must port the reservation AND fallback under the same captured ticket.
  // Callback-only or partial captured bundles must not opt into this live path.
  if (source.session !== undefined || source.signal !== undefined || source.mutationObserver !== undefined || source.onCrisisDetected !== undefined) {
    throw new Error("chat_live_captured_execution_mismatch");
  }
  const runtime = runtimes.get(turn);
  if (!runtime) throw new Error("chat_live_turn_required");
  const { assertOwner } = runtime;
  assertOwner();
  if (source.userId !== runtime.state.owner.ownerId || source.message !== runtime.state.message) throw new Error("chat_live_pair_mismatch");
  const input = { ...source, history: source.history?.map(line => ({ ...line })) };
  const action = nextTurnAction(runtime.state);
  if (action === "wait" || action === "closed") return { status: "ignored" };
  // No await between checking availability and acquiring this pair's wait.
  runtime.state = beginTurnAttempt(runtime.state, kstDateToday(), selectChatTurnRoute());
  const attempt = runtime.state.attempts.at(-1)!;
  const { ticket } = attempt;
  const route = runtime.state.route!;
  const prepare = () => {
    assertOwner();
    if (!canPrepareTurn(runtime.state, ticket)) throw abortError();
  };
  const notify: CrisisObserver = hotline => {
    assertOwner();
    const alreadyNotified = runtime.state.crisisNotified;
    runtime.state = receiveTurnCrisis(runtime.state, ticket);
    if (!alreadyNotified) {
      try { runtime.notify(hotline); } catch { /* Guidance cannot skip C3. */ }
    }
  };
  const limit = CHAT_DAILY_LIMIT[input.tier];
  const blocked = (used: number, adBonus: number): LiveChatTurnResult => {
    const check = checkChatLimit(input.tier, used, adBonus);
    runtime.state = finishTurnFailure(runtime.state, ticket, "limit");
    return { status: "blocked", result: { status: "blocked", reason: "limit_reached",
      used, limit: check.allowed ? null : check.limit, upgradeTo: check.upgradeTo,
      hint: tLocale(input.locale, "secondb", "serverLimitReached") } };
  };

  try {
    // C9 device route precedes even quota/context. Guidance precedes C3 awaits.
    const cut = await classifyLiveChatTextForCrisis(input.message, input.locale, input.userId, input.minor,
      { assertCurrent: assertOwner, onCrisisDetected: notify });
    assertOwner();
    if (cut) return { status: "ignored" };
    prepare();
    if (action === "charge") {
      const detail = await readChatUsageDetail(input.userId, ticket.day);
      prepare();
      runtime.adBonus = detail.adBonus;
      if (!checkChatLimit(input.tier, detail.used, detail.adBonus).allowed) return blocked(detail.used, detail.adBonus);
    }

    // Reask repeats the shared context loader; it keeps its existing live I/O.
    // A winner while loading prevents this attempt's subsequent bump/dispatch.
    const context = await loadChatContext(input, null);
    prepare();
    if (action === "charge") {
      runtime.state = startTurnReservation(runtime.state, ticket);
      const receipt = route.reservationSupported
        ? await bumpChatUsageForTurn(input.userId, limit, ticket.day)
        : { count: await bumpChatUsageIfUnderCap(input.userId, limit, ticket.day), turnId: null };
      assertOwner();
      const before = runtime.state;
      runtime.state = receiveTurnReceipt(before, ticket, receipt);
      // Publish ID and count together, before failure/sending settlement.
      if (runtime.state !== before) {
        try { runtime.onReceipt?.(receipt); } catch { /* State remains authoritative. */ }
      }
      // Late receipts settle accounting only. An explicit later click sends.
      prepare();
    }
    const system = assembleChatSystemPrompt(input, context);
    prepare();
    const receipt = runtime.state.receipt!;
    const reply = await callLlm<string>({
      userId: input.userId, locale: input.locale, purpose: "secondb_chat", system,
      user: input.message, minor: input.minor, onCrisisDetected: notify,
      chatTurn: {
        route, ...(receipt.turnId ? { turnId: receipt.turnId, intent: attempt.intent } : {}),
        assertCurrent: assertOwner,
        beforeDispatch: () => { prepare(); runtime.state = markTurnDispatched(runtime.state, ticket); },
      },
    });
    assertOwner();
    runtime.state = receiveTurnAdmission(runtime.state, ticket, reply.turnAdmission);
    if (reply.safety.zone === "red") { notify(reply.safety.crisisRouting?.hotline); return { status: "ignored" }; }
    const result: SendMessageOk = { status: "ok", reply, used: receipt.count, limit,
      remaining: checkChatLimit(input.tier, receipt.count, runtime.adBonus).remaining };
    const before = runtime.state.selected;
    runtime.state = selectTurnResult(runtime.state, ticket, result);
    return !before && runtime.state.selected?.attemptId === ticket.attemptId
      ? { status: "selected", result } : { status: "ignored" };
  } catch (error) {
    assertOwner();
    if (error instanceof LlmChatTurnError || error instanceof LlmConsentError) {
      runtime.state = receiveTurnAdmission(runtime.state, ticket, error.turnAdmission);
    }
    const reason = error instanceof ChatLimitExceededError ? "limit" : error instanceof LlmConsentError && error.code === "consent_required" ? "consent" :
      error instanceof LlmChatTurnError && error.code === "purpose_limit_exceeded" ? "limit" :
      error instanceof LlmChatTurnError && (error.code === "reask_ineligible" || error.code === "first_already_registered") ? "ineligible" : undefined;
    runtime.state = finishTurnFailure(runtime.state, ticket, reason);
    if (runtime.state.selected || runtime.state.terminal === "crisis" || runtime.state.retryClosed) return { status: "ignored" };
    if (error instanceof ChatLimitExceededError) {
      const detail = await readChatUsageDetail(input.userId, ticket.day);
      assertOwner();
      const current = turn.read();
      if (current.selected || current.terminal === "crisis") return { status: "ignored" };
      return blocked(detail.used, detail.adBonus);
    }
    throw error;
  }
}
