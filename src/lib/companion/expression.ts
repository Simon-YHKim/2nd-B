// Momentary SecondB facial reactions to user actions — save → happy, delete →
// sad, proposal → smug — layered on top of each screen's base mood. Any code
// path can fire a reaction; every mounted SecondbHead briefly overrides its
// expression, then reverts to its base mood. Pure pub/sub (no provider, no new
// dependency), mirroring lib/tasks/store so it works from anywhere, including
// non-React code.
//
// Two layers (the renderer resolves: reaction ?? hold ?? idle ?? base mood):
//   reactExpression(expr) — a beat-long flash; duration defaults per expression
//                           (sad lingers, a wink is quick — see faces.ts).
//   holdExpression(expr)  — sticky while something is in flight (AI 응답 대기);
//                           returns a release fn. The newest hold shows;
//                           releasing restores the previous one.
//
// The full 13-expression vocabulary + face geometry lives in ./faces (pure,
// unit-tested); this module is only the wire.

import { REACTION_HOLD_MS, type Expression } from "./faces";

export type { Expression } from "./faces";
/** @deprecated back-compat alias — the vocabulary is wider than 3 moods now. */
export type ExpressionMood = Expression;

type Listener = (expr: Expression, durationMs: number) => void;
type HoldListener = (expr: Expression | null) => void;

const listeners = new Set<Listener>();
const holdListeners = new Set<HoldListener>();

/** Default time a reaction is held before the face reverts to its base mood. */
export const REACTION_MS = 1500;

/** Briefly show `expr` on every mounted SecondB head, then revert to base mood. */
export function reactExpression(expr: Expression, durationMs?: number): void {
  const dur = durationMs ?? REACTION_HOLD_MS[expr] ?? REACTION_MS;
  for (const l of listeners) l(expr, dur);
}

/** Subscribe a head to reactions. Returns an unsubscribe function. */
export function subscribeExpression(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Sticky holds (AI 응답 대기 등 진행 중 상태) ───────────────────────────────

interface Hold {
  id: number;
  expr: Expression;
}
let holdSeq = 0;
const holdStack: Hold[] = [];

/** The expression currently held open, if any (the newest hold wins). */
export function currentHold(): Expression | null {
  return holdStack.length > 0 ? holdStack[holdStack.length - 1].expr : null;
}

function notifyHold(): void {
  const cur = currentHold();
  for (const l of holdListeners) l(cur);
}

/**
 * Hold `expr` on every mounted head until the returned release fn runs.
 * Holds nest: the newest shows; releasing it restores the previous one.
 * Releasing twice is a no-op, so a `finally { release(); }` is always safe.
 */
export function holdExpression(expr: Expression): () => void {
  const hold: Hold = { id: ++holdSeq, expr };
  holdStack.push(hold);
  notifyHold();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = holdStack.findIndex((h) => h.id === hold.id);
    if (i !== -1) holdStack.splice(i, 1);
    notifyHold();
  };
}

/** Subscribe a head to hold changes (called with the current top or null). */
export function subscribeHold(listener: HoldListener): () => void {
  holdListeners.add(listener);
  return () => holdListeners.delete(listener);
}
