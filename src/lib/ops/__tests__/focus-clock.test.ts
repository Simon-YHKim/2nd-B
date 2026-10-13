import { advanceByClock, CLOCK_JUMP_MS, readFocusClock, type FocusClockReading } from "../focus-clock";
import { createPomodoro, pause, start } from "../pomodoro";

const MINUTE = 60_000;
const running = (minutes = 15) => start(createPomodoro({ focusMinutes: minutes }));
const T0: FocusClockReading = { wall: 1_760_000_000_000, mono: 50_000 };
/** A later reading: both clocks moved by `ms`, unless told otherwise. */
const after = (ms: number, wallExtra = 0): FocusClockReading => ({ wall: T0.wall + ms + wallExtra, mono: T0.mono + ms });

describe("the focus timer advances by measured time, not by counted ticks (Z109)", () => {
  test("a second that passed takes a second off", () => {
    const { next, completed, clockJumped } = advanceByClock(running(), T0, after(1000), true);
    expect(next.remainingMs).toBe(15 * MINUTE - 1000);
    expect(completed).toBe(false);
    expect(clockJumped).toBe(false);
  });

  test("thirteen minutes in the background come off in one step", () => {
    // The phone check: started at 17:12, sent to the back at 17:14, still showing 12:51 at 17:29.
    // The monotonic clock stood still while the device slept; only the wall clock knows.
    const back: FocusClockReading = { wall: T0.wall + 13 * MINUTE, mono: T0.mono + 4000 };
    const { next, completed, clockJumped } = advanceByClock(running(), T0, back, false);
    expect(next.remainingMs).toBe(2 * MINUTE);
    expect(next.running).toBe(true);
    expect(completed).toBe(false);
    // A trip to the background is not a changed clock.
    expect(clockJumped).toBe(false);
  });

  test("coming back after the end completes the session", () => {
    const back: FocusClockReading = { wall: T0.wall + 18 * MINUTE, mono: T0.mono + 4000 };
    const { next, completed } = advanceByClock(running(), T0, back, false);
    expect(completed).toBe(true);
    expect(next.completedFocusSessions).toBe(1);
  });

  test("the end exactly on the tick completes", () => {
    expect(advanceByClock(running(), T0, after(15 * MINUTE), true).completed).toBe(true);
    expect(advanceByClock(running(), T0, after(15 * MINUTE - 1), true).completed).toBe(false);
  });

  // While the app runs without a break the monotonic clock is the measure: the device clock can be
  // set forward or back without ending the session early or stretching it.
  test("a device clock set an hour forward while the app is in front does not end the session", () => {
    const { next, completed, clockJumped } = advanceByClock(running(), T0, after(1000, 60 * MINUTE), true);
    expect(completed).toBe(false);
    expect(next.remainingMs).toBe(15 * MINUTE - 1000);
    expect(clockJumped).toBe(true);
  });

  test("a device clock set an hour back while the app is in front does not stop the session", () => {
    const { next, clockJumped } = advanceByClock(running(), T0, after(1000, -60 * MINUTE), true);
    expect(next.remainingMs).toBe(15 * MINUTE - 1000);
    expect(clockJumped).toBe(true);
  });

  test("the two clocks may drift a little without that counting as a change", () => {
    expect(advanceByClock(running(), T0, after(1000, CLOCK_JUMP_MS), true).clockJumped).toBe(false);
    expect(advanceByClock(running(), T0, after(1000, CLOCK_JUMP_MS + 1), true).clockJumped).toBe(true);
    expect(advanceByClock(running(), T0, after(1000, -CLOCK_JUMP_MS - 1), true).clockJumped).toBe(true);
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
