// The focus timer advances by the time that really passed, not by one second per tick.
//
// A screen that adds a second each time its 1-second interval fires stops when the app goes to
// the background, because the interval stops firing there: fifteen minutes later the timer still
// showed 12:51 (Z109). The engine (./pomodoro) always took the elapsed time as an argument; this
// is the caller measuring it.
import { focusJustCompleted, tick, type PomodoroState } from "./pomodoro";

/**
 * One reading of both clocks. The wall clock keeps going while the app is suspended, but it moves
 * when the device clock is changed. The monotonic clock cannot be changed, but it may stand still
 * while the device sleeps. Each is the measure where the other fails.
 */
export interface FocusClockReading {
  wall: number;
  mono: number;
}

export function readFocusClock(): FocusClockReading {
  const wall = Date.now();
  const mono = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : wall;
  return { wall, mono };
}

/**
 * How long after the end a step may find it and still announce it. Later than this the app was
 * away when the session ended, and the person is now looking at the finished timer.
 */
export const FOCUS_END_GRACE_MS = 2000;

export interface FocusAdvance {
  next: PomodoroState;
  /** A focus phase ran to its end in this step. */
  completed: boolean;
  /** How long before this step the phase ended, when `completed`. 0 otherwise. */
  lateByMs: number;
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/**
 * Advance `prev` by the time between two readings.
 *
 * `continuous` says the app ran without a trip to the background between them. Then the monotonic
 * clock is the measure, so a device clock set forward does not end the session early and one set
 * back does not stretch it. After a trip to the background only the wall clock knows how long it was.
 */
export function advanceByClock(prev: PomodoroState, since: FocusClockReading, at: FocusClockReading, continuous: boolean): FocusAdvance {
  const elapsed = Math.max(0, finite(continuous ? at.mono - since.mono : at.wall - since.wall));
  const next = tick(prev, elapsed);
  const completed = next !== prev && focusJustCompleted(prev, next);
  return { next, completed, lateByMs: completed ? Math.max(0, elapsed - prev.remainingMs) : 0 };
}

/** Whether the step that found the end announces it (true), or the end was while the app was away (false). */
export function announcesEnd(lateByMs: number): boolean {
  return lateByMs <= FOCUS_END_GRACE_MS;
}
