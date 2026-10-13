// [다시 시도] under a chat reply that failed (Z40). One rule for when it is offered, read by both
// the turn list (whether to draw the button) and the handler (whether a press does anything), so
// a button that is drawn is a button that works.

export interface RetryTurn {
  role: "user" | "secondb";
  text: string;
  /** On the line that says the reply failed: the message it was for. */
  retryText?: string;
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
