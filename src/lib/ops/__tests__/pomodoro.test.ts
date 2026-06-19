// Pure Pomodoro state machine (Wave 1, daily_focus). No Supabase, no native, no
// Date — the test feeds elapsed ms in directly, the same way the UI's setInterval
// does, so the cadence is fully deterministic.

import {
  createPomodoro,
  focusJustCompleted,
  pause,
  phaseJustChanged,
  reset,
  skipPhase,
  start,
  tick,
} from "../pomodoro";

const MIN = 60_000;

describe("createPomodoro", () => {
  test("starts idle with default config and no remaining time", () => {
    const s = createPomodoro();
    expect(s.phase).toBe("idle");
    expect(s.running).toBe(false);
    expect(s.remainingMs).toBe(0);
    expect(s.completedFocusSessions).toBe(0);
    expect(s.config).toEqual({
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      sessionsBeforeLongBreak: 4,
    });
  });

  test("merges config overrides onto the defaults", () => {
    const s = createPomodoro({ focusMinutes: 1, breakMinutes: 2 });
    expect(s.config.focusMinutes).toBe(1);
    expect(s.config.breakMinutes).toBe(2);
    expect(s.config.longBreakMinutes).toBe(15);
  });
});

describe("start / pause / reset", () => {
  test("start from idle loads a running focus phase", () => {
    const s = start(createPomodoro({ focusMinutes: 25 }));
    expect(s.phase).toBe("focus");
    expect(s.running).toBe(true);
    expect(s.remainingMs).toBe(25 * MIN);
  });

  test("pause freezes the clock but keeps the remaining time", () => {
    const running = tick(start(createPomodoro({ focusMinutes: 25 })), 5 * MIN);
    const paused = pause(running);
    expect(paused.running).toBe(false);
    expect(paused.remainingMs).toBe(running.remainingMs);
    // A paused timer ignores tick.
    expect(tick(paused, 1000)).toBe(paused);
  });

  test("start after pause resumes the same remaining time (no reload)", () => {
    const paused = pause(tick(start(createPomodoro({ focusMinutes: 25 })), 5 * MIN));
    const resumed = start(paused);
    expect(resumed.running).toBe(true);
    expect(resumed.remainingMs).toBe(paused.remainingMs);
    expect(resumed.phase).toBe("focus");
  });

  test("reset returns a clean idle timer keeping the config", () => {
    const dirty = tick(start(createPomodoro({ focusMinutes: 7 })), 60_000);
    const fresh = reset(dirty);
    expect(fresh.phase).toBe("idle");
    expect(fresh.running).toBe(false);
    expect(fresh.completedFocusSessions).toBe(0);
    expect(fresh.config.focusMinutes).toBe(7);
  });
});

describe("tick to zero — focus -> break -> focus cadence", () => {
  test("a focus phase reaching 0 transitions to a short break and counts the session", () => {
    const s = start(createPomodoro({ focusMinutes: 25, breakMinutes: 5 }));
    const done = tick(s, 25 * MIN);
    expect(done.phase).toBe("break");
    expect(done.completedFocusSessions).toBe(1);
    expect(done.remainingMs).toBe(5 * MIN);
    expect(done.running).toBe(true);
  });

  test("a break reaching 0 returns to a fresh focus phase without counting", () => {
    const afterFocus = tick(start(createPomodoro({ focusMinutes: 25, breakMinutes: 5 })), 25 * MIN);
    const afterBreak = tick(afterFocus, 5 * MIN);
    expect(afterBreak.phase).toBe("focus");
    expect(afterBreak.completedFocusSessions).toBe(1); // unchanged by the break
    expect(afterBreak.remainingMs).toBe(25 * MIN);
  });

  test("overshooting a phase does not cascade past one boundary", () => {
    const s = start(createPomodoro({ focusMinutes: 25, breakMinutes: 5 }));
    const done = tick(s, 25 * MIN + 9_000);
    expect(done.phase).toBe("break");
    expect(done.remainingMs).toBe(5 * MIN); // remainder dropped, fresh break
  });

  test("an idle or non-positive tick is a no-op", () => {
    const idle = createPomodoro();
    expect(tick(idle, 1000)).toBe(idle);
    const running = start(createPomodoro());
    expect(tick(running, 0)).toBe(running);
    expect(tick(running, -5)).toBe(running);
  });
});

describe("long-break cadence (every Nth focus session)", () => {
  test("the 4th completed focus session earns the long break", () => {
    let s = createPomodoro({ focusMinutes: 1, breakMinutes: 5, longBreakMinutes: 15, sessionsBeforeLongBreak: 4 });
    s = start(s);
    const breaks: number[] = [];
    // Run 4 full focus->break->(resume focus) cycles.
    for (let i = 0; i < 4; i++) {
      s = tick(s, 1 * MIN); // focus -> break
      breaks.push(s.remainingMs);
      s = tick(s, s.remainingMs); // break -> next focus
    }
    expect(s.completedFocusSessions).toBe(4);
    // sessions 1-3 = short (5 min), session 4 = long (15 min).
    expect(breaks).toEqual([5 * MIN, 5 * MIN, 5 * MIN, 15 * MIN]);
  });

  test("sessionsBeforeLongBreak <= 0 disables the long break", () => {
    let s = start(createPomodoro({ focusMinutes: 1, breakMinutes: 5, longBreakMinutes: 15, sessionsBeforeLongBreak: 0 }));
    s = tick(s, 1 * MIN);
    expect(s.remainingMs).toBe(5 * MIN);
  });
});

describe("skipPhase", () => {
  test("skipping a focus phase counts the session and moves to a break", () => {
    const s = start(createPomodoro({ focusMinutes: 25, breakMinutes: 5 }));
    const skipped = skipPhase(s);
    expect(skipped.phase).toBe("break");
    expect(skipped.completedFocusSessions).toBe(1);
    expect(skipped.remainingMs).toBe(5 * MIN);
  });

  test("skipping a break returns to focus without counting", () => {
    const inBreak = tick(start(createPomodoro({ focusMinutes: 25 })), 25 * MIN);
    const skipped = skipPhase(inBreak);
    expect(skipped.phase).toBe("focus");
    expect(skipped.completedFocusSessions).toBe(1);
  });

  test("skip is a no-op while idle", () => {
    const idle = createPomodoro();
    expect(skipPhase(idle)).toBe(idle);
  });
});

describe("focusJustCompleted / phaseJustChanged detectors", () => {
  test("focusJustCompleted is true only on the focus->break boundary", () => {
    const before = start(createPomodoro({ focusMinutes: 25, breakMinutes: 5 }));
    const after = tick(before, 25 * MIN);
    expect(focusJustCompleted(before, after)).toBe(true);
    // mid-focus tick: no completion.
    const mid = tick(before, 1000);
    expect(focusJustCompleted(before, mid)).toBe(false);
    // break->focus: a phase change, but NOT a focus completion.
    const backToFocus = tick(after, 5 * MIN);
    expect(focusJustCompleted(after, backToFocus)).toBe(false);
  });

  test("phaseJustChanged fires on both boundaries, not on a mid-phase tick", () => {
    const focus = start(createPomodoro({ focusMinutes: 25, breakMinutes: 5 }));
    const toBreak = tick(focus, 25 * MIN);
    const toFocus = tick(toBreak, 5 * MIN);
    expect(phaseJustChanged(focus, toBreak)).toBe(true);
    expect(phaseJustChanged(toBreak, toFocus)).toBe(true);
    expect(phaseJustChanged(focus, tick(focus, 1000))).toBe(false);
  });

  test("a skipped focus also reads as focusJustCompleted (deterministic tick of daily_focus)", () => {
    const before = start(createPomodoro());
    const after = skipPhase(before);
    expect(focusJustCompleted(before, after)).toBe(true);
  });
});
