import { advanceByClock, FOCUS_END_GRACE_MS, ringsOnTime } from "../focus-clock";
import { createPomodoro, pause, start } from "../pomodoro";

const MINUTE = 60_000;
const running = (minutes = 15) => start(createPomodoro({ focusMinutes: minutes }));
const T0 = 1_760_000_000_000;

describe("the focus timer advances by measured time, not by counted ticks (Z109)", () => {
  test("a second that passed takes a second off", () => {
    const prev = running();
    const { next, completed, lateByMs } = advanceByClock(prev, T0, T0 + 1000);
    expect(next.remainingMs).toBe(15 * MINUTE - 1000);
    expect(completed).toBe(false);
    expect(lateByMs).toBe(0);
  });

  test("thirteen minutes in the background come off in one step", () => {
    // The phone check: started at 17:12, sent to the back at 17:14, still showing 12:51 at 17:29.
    const { next, completed } = advanceByClock(running(), T0, T0 + 13 * MINUTE);
    expect(next.remainingMs).toBe(2 * MINUTE);
    expect(next.running).toBe(true);
    expect(completed).toBe(false);
  });

  test("coming back after the end completes the session and says how late that is", () => {
    const { next, completed, lateByMs } = advanceByClock(running(), T0, T0 + 18 * MINUTE);
    expect(completed).toBe(true);
    expect(next.completedFocusSessions).toBe(1);
    expect(lateByMs).toBe(3 * MINUTE);
    // The OS rang the alert three minutes ago; the screen must not ring it again.
    expect(ringsOnTime(lateByMs)).toBe(false);
  });

  test("an end found by the running screen is on time, up to the grace", () => {
    const almost = advanceByClock(running(), T0, T0 + 15 * MINUTE - 400).next;
    const found = advanceByClock(almost, T0, T0 + 1000);
    expect(found.completed).toBe(true);
    expect(found.lateByMs).toBe(600);
    expect(ringsOnTime(found.lateByMs)).toBe(true);
    expect(ringsOnTime(0)).toBe(true);
    expect(ringsOnTime(FOCUS_END_GRACE_MS)).toBe(true);
    expect(ringsOnTime(FOCUS_END_GRACE_MS + 1)).toBe(false);
  });

  test("the end exactly on the tick completes with nothing late", () => {
    const { completed, lateByMs } = advanceByClock(running(), T0, T0 + 15 * MINUTE);
    expect(completed).toBe(true);
    expect(lateByMs).toBe(0);
  });

  test("a paused or idle timer does not move, whatever the clock says", () => {
    const paused = pause(advanceByClock(running(), T0, T0 + MINUTE).next);
    const later = advanceByClock(paused, T0, T0 + 60 * MINUTE);
    expect(later.next).toBe(paused);
    expect(later.completed).toBe(false);
    const idle = createPomodoro();
    expect(advanceByClock(idle, T0, T0 + 60 * MINUTE).next).toBe(idle);
  });

  test("a clock that went backwards, or is not a number, adds nothing", () => {
    const prev = running();
    expect(advanceByClock(prev, T0, T0 - 5 * MINUTE).next).toBe(prev);
    expect(advanceByClock(prev, T0, Number.NaN).next).toBe(prev);
    expect(advanceByClock(prev, Number.NaN, T0).next).toBe(prev);
    expect(advanceByClock(prev, T0, T0).next).toBe(prev);
  });
});
