// The focus timer advances by the time that really passed, not by one second per tick.
//
// A screen that adds a second each time its 1-second interval fires stops when the app goes to
// the background, because the interval stops firing there: fifteen minutes later the timer still
// showed 12:51, and the end alert that was sent from inside that tick never came (Z109). The
// engine (./pomodoro) always took the elapsed time as an argument; this is the caller measuring it.
import { focusJustCompleted, tick, type PomodoroState } from "./pomodoro";

/**
 * How late a tick may find the end and still be the one to ring it. The end alert is handed to the
 * OS when the timer starts; a tick that arrives later than this (the app was in the background)
 * finds an alert that has already rung and must not ring it again.
 */
export const FOCUS_END_GRACE_MS = 2000;

export interface FocusAdvance {
  next: PomodoroState;
  /** A focus phase ran to its end in this step. */
  completed: boolean;
  /** How long ago the phase ended, when `completed`. 0 otherwise. */
  lateByMs: number;
}

/** Advance `prev` by the wall-clock time between `since` and `at`. A clock that went backwards adds nothing. */
export function advanceByClock(prev: PomodoroState, since: number, at: number): FocusAdvance {
  const elapsed = Number.isFinite(at - since) ? Math.max(0, at - since) : 0;
  const next = tick(prev, elapsed);
  const completed = next !== prev && focusJustCompleted(prev, next);
  return { next, completed, lateByMs: completed ? Math.max(0, elapsed - prev.remainingMs) : 0 };
}

/** Whether the tick that found the end should ring the alert itself (true) or the OS already has (false). */
export function ringsOnTime(lateByMs: number): boolean {
  return lateByMs <= FOCUS_END_GRACE_MS;
}
