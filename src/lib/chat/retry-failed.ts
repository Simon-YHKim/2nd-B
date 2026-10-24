// [다시 시도] under a chat reply that failed (Z40). One rule for when it is offered, read by both
// the turn list (whether to draw the button) and the handler (whether a press does anything), so
// a button that is drawn is a button that works.
import type { AccountOwnerLease } from "../auth/account-epoch";
import type { LiveChatTurn } from "./conversation-turn";
import { nextTurnAction } from "./turn-result-state";

export interface RetryTurn {
  role: "user" | "secondb";
  text: string;
  /** On the line that says the reply failed: the message it was for. */
  retryText?: string;
  pairId?: string;
}

/**
 * The message the failed reply at `i` can be sent again for, or null.
 *
 * Only the last turn of the conversation, and only when the turn before it is that same message:
 * together they are the pair a retry replaces. Anything else (the conversation moved on, the line
 * follows an answer, the line carries no message) is not a retry.
 */
export function retryableMessage(turns: readonly RetryTurn[], i: number): string | null {
  const failed = turns[i];
  const asked = turns[i - 1];
  if (i !== turns.length - 1 || !failed?.retryText) return null;
  if (asked?.role !== "user" || asked.text !== failed.retryText) return null;
  return failed.retryText;
}

/** The existing button and its handler read the same authoritative pair state.
 * A settled failure can reuse its reservation at the daily cap. Unknown issuance
 * cannot charge again; it does not lock an unrelated new send. */
export function canRetryFailedTurn(turns: readonly RetryTurn[], i: number, live: LiveChatTurn | null, underLimit: boolean): boolean {
  const message = retryableMessage(turns, i);
  if (message === null || !live) return false;
  try {
    const state = live.read();
    if (state.message !== message || turns[i]?.pairId !== state.owner.pairId
      || turns[i - 1]?.pairId !== state.owner.pairId) return false;
    const action = nextTurnAction(state);
    return action === "first" || action === "reask" || (action === "charge" && underLimit);
  } catch { return false; } // An old account lease cannot offer or start a retry.
}

/** One synchronous lock for sends AND retries, including before React renders.
 * A stale finally cannot release a later account/conversation's request. */
export function createChatSendLock() {
  type Request = { owner: AccountOwnerLease; conversationId: number };
  let current: Request | null = null;
  return {
    acquire(owner: AccountOwnerLease, conversationId: number): Request | null {
      if (!owner.isCurrent()) return null;
      if (current?.owner.isCurrent() && current.conversationId === conversationId) return null;
      current = { owner, conversationId };
      return current;
    },
    release(request: Request): boolean {
      if (current !== request) return false;
      current = null;
      return true;
    },
    busy: (): boolean => current !== null && current.owner.isCurrent(),
  };
}
