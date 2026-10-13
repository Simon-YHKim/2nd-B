// The focus timer advances by the time that really passed, not by one second per tick.
//
// A screen that adds a second each time its 1-second interval fires stops when the app goes to
// the background, because the interval stops firing there: fifteen minutes later the timer still
// showed 12:51, and the end alert that was sent from inside that tick never came (Z109). The
// engine (./pomodoro) always took the elapsed time as an argument; this is the caller measuring it.
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

/** While the app ran without a break, a wall clock further than this from the monotonic one was changed. */
export const CLOCK_JUMP_MS = 2000;

export interface FocusAdvance {
  next: PomodoroState;
  /** A focus phase ran to its end in this step. */
  completed: boolean;
  /** The device clock was changed during this step: an alert scheduled for a wall-clock time is now wrong. */
  clockJumped: boolean;
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
  const wall = finite(at.wall - since.wall);
  const mono = finite(at.mono - since.mono);
  const next = tick(prev, Math.max(0, continuous ? mono : wall));
  return {
    next,
    completed: next !== prev && focusJustCompleted(prev, next),
    clockJumped: continuous && Math.abs(wall - mono) > CLOCK_JUMP_MS,
  };
}
