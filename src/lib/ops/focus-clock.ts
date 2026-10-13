// The focus timer advances by the time that really passed, not by one second per tick.
//
// A screen that adds a second each time its 1-second interval fires stops when the app goes to
// the background, because the interval stops firing there: fifteen minutes later the timer still
// showed 12:51 (Z109). The engine (./pomodoro) always took the elapsed time as an argument; this
// is the caller measuring it.
//
// The run itself lives here and not in the screen's effect, so its order of events (a tick and a
// return to the front back to back, a pause while a tick is queued, a clock change just before the
// app leaves the front) can be run in a test.
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

export interface FocusAdvance {
  next: PomodoroState;
  /** A focus phase ran to its end in this step. */
  completed: boolean;
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/**
 * Advance `prev` by the time between two readings.
 *
 * `inFront` says the app was in front for the whole stretch between them. Then the monotonic
 * clock is the measure, so a device clock set forward does not end the session early and one set
 * back does not stretch it. A stretch that was partly away is measured by the wall clock, the only
 * one that kept going.
 */
export function advanceByClock(prev: PomodoroState, since: FocusClockReading, at: FocusClockReading, inFront: boolean): FocusAdvance {
  const elapsed = Math.max(0, finite(inFront ? at.mono - since.mono : at.wall - since.wall));
  const next = tick(prev, elapsed);
  return { next, completed: next !== prev && focusJustCompleted(prev, next) };
}

/** What a running timer needs from the screen that shows it. */
export interface FocusRunHost {
  /** Both clocks, now. */
  read: () => FocusClockReading;
  /**
   * False once the person paused, reset or replaced the timer. The run stops for good then: a
   * tick that was already queued must not write its older state over what the person just did.
   */
  owns: () => boolean;
  /** The timer moved on and is still running. */
  onAdvance: (next: PomodoroState) => void;
  /** The focus phase ran to its end. Called at most once, with the state just before the end. */
  onComplete: (finished: PomodoroState) => void;
}

export interface FocusRun {
  /** The 1-second tick. */
  step: () => void;
  /** The app moved to the front (true) or away from it (false). */
  appInFront: (inFront: boolean) => void;
  /** The run is over: nothing that was already queued acts after this. */
  close: () => void;
}

/**
 * One stretch of a running timer, from the moment it starts (or resumes) until it finishes, is
 * paused, or its screen goes away.
 *
 * It keeps its own state: each step starts from what the step before it left, never from a
 * render that is one tick old, so the tick and the return to the front can run back to back.
 */
export function startFocusRun(initial: PomodoroState, inFront: boolean, host: FocusRunHost): FocusRun {
  let current = initial;
  let since = host.read();
  let front = inFront;
  // Whether the app was in front for the whole stretch since `since`.
  let unbroken = inFront;
  let closed = false;
  const step = () => {
    if (closed) return;
    if (!host.owns()) {
      closed = true;
      return;
    }
    const at = host.read();
    const { next, completed } = advanceByClock(current, since, at, unbroken);
    since = at;
    // While the app is away every stretch is measured by the wall clock, also when a tick still fires there.
    unbroken = front;
    if (next === current) return;
    const finished = current;
    current = next;
    if (!completed) {
      host.onAdvance(next);
      return;
    }
    closed = true;
    host.onComplete(finished);
  };
  return {
    step,
    appInFront: (next) => {
      if (!next) {
        // Close the stretch spent in front while the monotonic clock still measures it. A device
        // clock changed just before leaving is then not counted as time away. A second "away" in
        // a row (inactive, then background) finds the stretch already marked and measures by the wall clock.
        step();
        front = false;
        unbroken = false;
        return;
      }
      front = true;
      step();
    },
    close: () => {
      closed = true;
    },
  };
}
