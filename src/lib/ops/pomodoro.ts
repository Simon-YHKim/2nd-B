// Pomodoro focus timer — a PURE state machine (Wave 1, daily_focus ops domain).
//
// Deterministic, no AI, no new dependency. This module owns ZERO time: it never
// reads Date.now(), never calls setInterval, never schedules a notification. The
// caller (the UI's setInterval, or a test) measures elapsed time and feeds it in
// via tick(state, elapsedMs). That keeps the cadence (focus -> break -> long
// break every Nth) node-testable and side-effect free, mirroring how the rest of
// ops/ separates pure helpers from the Supabase/native surface.
//
// Completing a FOCUS phase is the "sensor auto-complete" signal: the UI watches
// focusJustCompleted(prev, next) and, on true, deterministically ticks the user's
// daily_focus routine via applyFocusSessionComplete (routines.ts), exactly like a
// logged workout ticks exercise_routine.

export type PomodoroPhase = "idle" | "focus" | "break";

export interface PomodoroConfig {
  /** Length of one focus phase, in minutes (default 25). */
  focusMinutes: number;
  /** Length of a short break, in minutes (default 5). */
  breakMinutes: number;
  /** Length of a long break, in minutes (default 15). */
  longBreakMinutes: number;
  /** Take a long break after this many completed focus sessions (default 4). */
  sessionsBeforeLongBreak: number;
}

export interface PomodoroState {
  /** Frozen config so tick/skip never depend on outside state. */
  config: PomodoroConfig;
  phase: PomodoroPhase;
  /** Milliseconds left in the current phase. 0 in idle. */
  remainingMs: number;
  /** How many focus phases have run to completion this cycle-set. */
  completedFocusSessions: number;
  /** Whether tick() should advance time. start() sets it; pause() clears it. */
  running: boolean;
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
};

const MS_PER_MINUTE = 60_000;

function focusMs(config: PomodoroConfig): number {
  return Math.max(0, Math.round(config.focusMinutes * MS_PER_MINUTE));
}

/**
 * The break length for the focus session that JUST finished. Every Nth completed
 * focus session earns the long break; sessionsBeforeLongBreak <= 0 disables it.
 */
function breakMsAfter(config: PomodoroConfig, completedFocusSessions: number): number {
  const n = config.sessionsBeforeLongBreak;
  const isLong = n > 0 && completedFocusSessions > 0 && completedFocusSessions % n === 0;
  const minutes = isLong ? config.longBreakMinutes : config.breakMinutes;
  return Math.max(0, Math.round(minutes * MS_PER_MINUTE));
}

/** Build a fresh, idle timer. Config overrides merge onto the defaults. */
export function createPomodoro(config: Partial<PomodoroConfig> = {}): PomodoroState {
  const merged: PomodoroConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    config: merged,
    phase: "idle",
    remainingMs: 0,
    completedFocusSessions: 0,
    running: false,
  };
}

/**
 * Begin (or resume) the timer. From idle this loads a fresh focus phase; from a
 * paused focus/break it just resumes the same remaining time. A no-op when the
 * current phase is already at 0 with nothing to run.
 */
export function start(state: PomodoroState): PomodoroState {
  if (state.phase === "idle") {
    return {
      ...state,
      phase: "focus",
      remainingMs: focusMs(state.config),
      running: true,
    };
  }
  return { ...state, running: true };
}

/** Freeze the clock without losing the remaining time. */
export function pause(state: PomodoroState): PomodoroState {
  return { ...state, running: false };
}

/** Back to a clean idle timer, keeping the same config. */
export function reset(state: PomodoroState): PomodoroState {
  return createPomodoro(state.config);
}

/**
 * Advance the timer by elapsedMs. Pure: the caller measures real time. When a
 * running phase crosses 0 it transitions:
 *   focus -> break   (increments completedFocusSessions; long break every Nth)
 *   break -> focus   (running, ready for the next session)
 * A non-running timer, an idle timer, or a non-positive elapsed is returned
 * unchanged. Only one boundary is crossed per tick (UI ticks ~1s, phases are
 * minutes), so the remainder after a crossing is dropped rather than cascaded —
 * this keeps the transition unambiguous for focusJustCompleted().
 */
export function tick(state: PomodoroState, elapsedMs: number): PomodoroState {
  if (!state.running || state.phase === "idle" || elapsedMs <= 0) return state;

  const remainingMs = state.remainingMs - elapsedMs;
  if (remainingMs > 0) {
    return { ...state, remainingMs };
  }

  if (state.phase === "focus") {
    const completedFocusSessions = state.completedFocusSessions + 1;
    return {
      ...state,
      phase: "break",
      completedFocusSessions,
      remainingMs: breakMsAfter(state.config, completedFocusSessions),
      running: true,
    };
  }

  // break -> next focus session.
  return {
    ...state,
    phase: "focus",
    remainingMs: focusMs(state.config),
    running: true,
  };
}

/**
 * Manually end the current phase, applying the SAME cadence as a natural
 * timeout (focus -> break increments the count; break -> focus). Idle is
 * untouched. Skipping a focus phase counts as a completed focus session, so the
 * focusJustCompleted detector fires for a skip too.
 */
export function skipPhase(state: PomodoroState): PomodoroState {
  if (state.phase === "idle") return state;
  if (state.phase === "focus") {
    const completedFocusSessions = state.completedFocusSessions + 1;
    return {
      ...state,
      phase: "break",
      completedFocusSessions,
      remainingMs: breakMsAfter(state.config, completedFocusSessions),
      running: state.running,
    };
  }
  return {
    ...state,
    phase: "focus",
    remainingMs: focusMs(state.config),
    running: state.running,
  };
}

/**
 * True exactly on the transition where a focus phase completed — i.e. the
 * completed-session counter went up. This is the deterministic "sensor fired"
 * signal the UI uses to tick daily_focus and ring the phase-end alarm.
 */
export function focusJustCompleted(prev: PomodoroState, next: PomodoroState): boolean {
  return next.completedFocusSessions > prev.completedFocusSessions;
}

/** True on any phase boundary (focus->break or break->focus). Drives the alarm. */
export function phaseJustChanged(prev: PomodoroState, next: PomodoroState): boolean {
  return prev.phase !== next.phase;
}
