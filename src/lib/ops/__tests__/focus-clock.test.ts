import { advanceByClock, readFocusClock, startFocusRun, type FocusClockReading } from "../focus-clock";
import { createPomodoro, pause, start, type PomodoroState } from "../pomodoro";

const MINUTE = 60_000;
const running = (minutes = 15) => start(createPomodoro({ focusMinutes: minutes }));
const T0: FocusClockReading = { wall: 1_760_000_000_000, mono: 50_000 };
/** A later reading: both clocks moved by `ms`, unless the wall clock was also changed by `wallExtra`. */
const after = (ms: number, wallExtra = 0): FocusClockReading => ({ wall: T0.wall + ms + wallExtra, mono: T0.mono + ms });

describe("the focus timer advances by measured time, not by counted ticks (Z109)", () => {
  test("a second that passed takes a second off", () => {
    const { next, completed } = advanceByClock(running(), T0, after(1000), true);
    expect(next.remainingMs).toBe(15 * MINUTE - 1000);
    expect(completed).toBe(false);
  });

  test("thirteen minutes away come off in one step", () => {
    // The phone check: started at 17:12, sent to the back at 17:14, still showing 12:51 at 17:29.
    // The monotonic clock stood still while the device slept; only the wall clock knows.
    const back: FocusClockReading = { wall: T0.wall + 13 * MINUTE, mono: T0.mono + 4000 };
    const { next, completed } = advanceByClock(running(), T0, back, false);
    expect(next.remainingMs).toBe(2 * MINUTE);
    expect(next.running).toBe(true);
    expect(completed).toBe(false);
  });

  test("the end exactly on the tick completes, one millisecond before does not", () => {
    expect(advanceByClock(running(), T0, after(15 * MINUTE), true).completed).toBe(true);
    expect(advanceByClock(running(), T0, after(15 * MINUTE - 1), true).completed).toBe(false);
    const late = advanceByClock(running(), T0, { wall: T0.wall + 18 * MINUTE, mono: T0.mono }, false);
    expect(late.completed).toBe(true);
    expect(late.next.completedFocusSessions).toBe(1);
  });

  // While the app is in front the monotonic clock is the measure: the device clock can be set
  // forward or back without ending the session early or stretching it.
  test("a device clock set an hour forward or back while the app is in front does not move the timer", () => {
    const forward = advanceByClock(running(), T0, after(1000, 60 * MINUTE), true);
    expect(forward.completed).toBe(false);
    expect(forward.next.remainingMs).toBe(15 * MINUTE - 1000);
    expect(advanceByClock(running(), T0, after(1000, -60 * MINUTE), true).next.remainingMs).toBe(15 * MINUTE - 1000);
  });

  test("a paused or idle timer does not move, whatever the clocks say", () => {
    const paused = pause(advanceByClock(running(), T0, after(MINUTE), true).next);
    expect(advanceByClock(paused, T0, after(60 * MINUTE), true).next).toBe(paused);
    expect(advanceByClock(paused, T0, after(60 * MINUTE), false).next).toBe(paused);
    const idle = createPomodoro();
    expect(advanceByClock(idle, T0, after(60 * MINUTE), false).next).toBe(idle);
  });

  test("a clock that went backwards, or is not a number, adds nothing", () => {
    const prev = running();
    expect(advanceByClock(prev, T0, { wall: T0.wall - 5 * MINUTE, mono: T0.mono }, false).next).toBe(prev);
    expect(advanceByClock(prev, T0, { wall: Number.NaN, mono: T0.mono }, false).next).toBe(prev);
    expect(advanceByClock(prev, T0, { wall: T0.wall, mono: Number.NaN }, true).next).toBe(prev);
    expect(advanceByClock(prev, T0, { wall: T0.wall, mono: T0.mono - 1000 }, true).next).toBe(prev);
    expect(advanceByClock(prev, T0, T0, true).next).toBe(prev);
  });

  test("a reading carries both clocks", () => {
    const reading = readFocusClock();
    expect(Number.isFinite(reading.wall)).toBe(true);
    expect(Number.isFinite(reading.mono)).toBe(true);
    expect(Math.abs(reading.wall - Date.now())).toBeLessThan(5000);
  });
});

/** A run with clocks the test moves by hand, and a host that records what the run told it. */
function harness(minutes = 15, inFront = true) {
  let now: FocusClockReading = { ...T0 };
  let owner = true;
  const advanced: PomodoroState[] = [];
  const completed: PomodoroState[] = [];
  const run = startFocusRun(running(minutes), inFront, {
    read: () => now,
    owns: () => owner,
    onAdvance: (next) => advanced.push(next),
    onComplete: (finished) => completed.push(finished),
  });
  return {
    run,
    advanced,
    completed,
    /** Both clocks move: the app (or at least its JS) is running. */
    pass: (ms: number) => {
      now = { wall: now.wall + ms, mono: now.mono + ms };
    },
    /** Only the wall clock moves: the device slept, or its clock was changed. */
    wallOnly: (ms: number) => {
      now = { wall: now.wall + ms, mono: now.mono };
    },
    setOwner: (value: boolean) => {
      owner = value;
    },
    remaining: () => advanced[advanced.length - 1]?.remainingMs,
  };
}

describe("one run of the focus timer (Z109)", () => {
  test("each tick takes off the time since the tick before it", () => {
    const h = harness();
    h.pass(1000);
    h.run.step();
    h.pass(1000);
    h.run.step();
    expect(h.advanced).toHaveLength(2);
    expect(h.remaining()).toBe(15 * MINUTE - 2000);
    expect(h.completed).toHaveLength(0);
  });

  test("twelve minutes away come off when the app returns, and the tick right after adds nothing", () => {
    const h = harness();
    h.pass(2 * MINUTE);
    h.run.step();
    h.run.appInFront(false);
    h.wallOnly(12 * MINUTE);
    h.run.appInFront(true);
    expect(h.remaining()).toBe(MINUTE);
    // The 1-second tick fires in the same moment, before React has rendered anything.
    h.run.step();
    expect(h.remaining()).toBe(MINUTE);
    expect(h.advanced).toHaveLength(2);
    expect(h.completed).toHaveLength(0);
  });

  test("coming back after the end reports it, once, with the state just before the end", () => {
    const h = harness();
    h.pass(2 * MINUTE);
    h.run.step();
    h.run.appInFront(false);
    h.wallOnly(18 * MINUTE);
    h.run.appInFront(true);
    expect(h.completed).toHaveLength(1);
    expect(h.completed[0]?.remainingMs).toBe(13 * MINUTE);
    expect(h.completed[0]?.config.focusMinutes).toBe(15);
    h.pass(1000);
    h.run.step();
    h.run.appInFront(false);
    h.run.appInFront(true);
    expect(h.completed).toHaveLength(1);
    // The finishing step is not also reported as an ordinary advance.
    expect(h.advanced).toHaveLength(1);
  });

  // The end is reported whenever it is found. How late that is does not matter: a JS stall while
  // the screen is in front and a tick that fires late while the app is away both still announce it.
  test("an end found late by a tick in front is still reported", () => {
    const h = harness();
    h.pass(15 * MINUTE - 1000);
    h.run.step();
    h.pass(4000);
    h.run.step();
    expect(h.completed).toHaveLength(1);
    expect(h.completed[0]?.remainingMs).toBe(1000);
  });

  test("an end found by a tick that still fires while the app is away is reported", () => {
    const h = harness();
    h.pass(MINUTE);
    h.run.step();
    h.run.appInFront(false);
    h.pass(14 * MINUTE + 2000);
    h.run.step();
    expect(h.completed).toHaveLength(1);
  });

  // The person pressed pause or reset. A tick that was already queued must not put its older,
  // running state back, and must not finish the session either.
  test("a tick that was queued when the person paused does nothing, then or later", () => {
    const h = harness();
    h.pass(1000);
    h.run.step();
    h.setOwner(false);
    h.pass(1000);
    h.run.step();
    expect(h.advanced).toHaveLength(1);
    // The run is over for good: it does not wake up if the mark happens to match again.
    h.setOwner(true);
    h.pass(1000);
    h.run.step();
    h.run.appInFront(false);
    h.run.appInFront(true);
    expect(h.advanced).toHaveLength(1);
    expect(h.completed).toHaveLength(0);
  });

  test("a tick queued at the very end does not finish a session the person just paused", () => {
    const h = harness();
    h.pass(15 * MINUTE - 500);
    h.run.step();
    h.setOwner(false);
    h.pass(1000);
    h.run.step();
    expect(h.completed).toHaveLength(0);
    expect(h.advanced).toHaveLength(1);
  });

  test("nothing queued acts after the screen let go of the run", () => {
    const h = harness();
    h.pass(1000);
    h.run.close();
    h.run.step();
    h.run.appInFront(false);
    h.wallOnly(20 * MINUTE);
    h.run.appInFront(true);
    expect(h.advanced).toHaveLength(0);
    expect(h.completed).toHaveLength(0);
  });

  test("a device clock changed in front just before leaving is not counted as time away", () => {
    const h = harness();
    h.pass(500);
    // The device clock is set an hour forward while the app is in front, and the app leaves the
    // front before the next tick.
    h.wallOnly(60 * MINUTE);
    h.run.appInFront(false);
    expect(h.remaining()).toBe(15 * MINUTE - 500);
    h.wallOnly(5 * MINUTE);
    h.run.appInFront(true);
    expect(h.remaining()).toBe(10 * MINUTE - 500);
    expect(h.completed).toHaveLength(0);
  });

  test("a device clock changed in front does not move a run that stays in front", () => {
    const h = harness();
    h.wallOnly(60 * MINUTE);
    h.pass(1000);
    h.run.step();
    h.wallOnly(-90 * MINUTE);
    h.pass(1000);
    h.run.step();
    expect(h.remaining()).toBe(15 * MINUTE - 2000);
    expect(h.completed).toHaveLength(0);
  });

  test("a tick that still fires while away does not hand the next stretch to the monotonic clock", () => {
    const h = harness();
    h.run.appInFront(false);
    h.pass(1000);
    h.run.step();
    expect(h.remaining()).toBe(15 * MINUTE - 1000);
    // Then the app is suspended: the monotonic clock stands still for six minutes.
    h.wallOnly(6 * MINUTE);
    h.run.appInFront(true);
    expect(h.remaining()).toBe(9 * MINUTE - 1000);
  });

  test("moving between two states that are both away is one leave", () => {
    const h = harness();
    h.pass(1000);
    h.run.appInFront(false);
    expect(h.advanced).toHaveLength(1);
    h.run.appInFront(false);
    expect(h.advanced).toHaveLength(1);
    h.wallOnly(MINUTE);
    h.run.appInFront(true);
    h.run.appInFront(true);
    expect(h.advanced).toHaveLength(2);
    expect(h.remaining()).toBe(14 * MINUTE - 1000);
  });

  test("a run that starts while the app is away measures by the wall clock until it returns", () => {
    const h = harness(15, false);
    h.wallOnly(3 * MINUTE);
    h.run.appInFront(true);
    expect(h.remaining()).toBe(12 * MINUTE);
    h.wallOnly(60 * MINUTE);
    h.pass(1000);
    h.run.step();
    expect(h.remaining()).toBe(12 * MINUTE - 1000);
  });
});
