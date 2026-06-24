// Momentary SecondB facial reactions to user actions — save → smile, error →
// concern — layered on top of each screen's base mood. Any code path can fire a
// reaction; every mounted SecondbHead briefly overrides its expression, then
// reverts to its base mood. Pure pub/sub (no provider, no new dependency),
// mirroring lib/tasks/store so it works from anywhere, including non-React code.

export type ExpressionMood = "positive" | "neutral" | "negative";
type Listener = (mood: ExpressionMood, durationMs: number) => void;

const listeners = new Set<Listener>();

/** Default time a reaction is held before the face reverts to its base mood. */
export const REACTION_MS = 1500;

/** Briefly show `mood` on every mounted SecondB head, then revert to base mood. */
export function reactExpression(mood: ExpressionMood, durationMs: number = REACTION_MS): void {
  for (const l of listeners) l(mood, durationMs);
}

/** Subscribe a head to reactions. Returns an unsubscribe function. */
export function subscribeExpression(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
