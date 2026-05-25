import { computeStreak } from "../streak";

const now = new Date("2026-05-25T12:00:00Z"); // 2026-05-25 21:00 KST

function kstDay(y: number, m: number, d: number, hourUtc = 0): string {
  return new Date(Date.UTC(y, m - 1, d, hourUtc)).toISOString();
}

describe("computeStreak", () => {
  test("empty input returns zero streak", () => {
    const r = computeStreak([], now);
    expect(r).toEqual({ current: 0, lastCaptureDay: null, capturedToday: false });
  });

  test("single entry today = streak 1 + capturedToday", () => {
    const r = computeStreak([kstDay(2026, 5, 25, 5)], now);
    expect(r.current).toBe(1);
    expect(r.capturedToday).toBe(true);
    expect(r.lastCaptureDay).toBe("2026-05-25");
  });

  test("three consecutive days ending today = streak 3", () => {
    const r = computeStreak(
      [
        kstDay(2026, 5, 23, 10),
        kstDay(2026, 5, 24, 10),
        kstDay(2026, 5, 25, 10),
      ],
      now,
    );
    expect(r.current).toBe(3);
    expect(r.capturedToday).toBe(true);
  });

  test("three consecutive days ending yesterday = streak 3 + not captured today", () => {
    const r = computeStreak(
      [
        kstDay(2026, 5, 22, 10),
        kstDay(2026, 5, 23, 10),
        kstDay(2026, 5, 24, 10),
      ],
      now,
    );
    expect(r.current).toBe(3);
    expect(r.capturedToday).toBe(false);
    expect(r.lastCaptureDay).toBe("2026-05-24");
  });

  test("gap breaks the streak — only the recent run counts", () => {
    const r = computeStreak(
      [
        kstDay(2026, 5, 20, 10),
        kstDay(2026, 5, 21, 10),
        // gap on 22, 23
        kstDay(2026, 5, 24, 10),
        kstDay(2026, 5, 25, 10),
      ],
      now,
    );
    expect(r.current).toBe(2);
  });

  test("only old entries (>1 day old) = streak 0", () => {
    const r = computeStreak([kstDay(2026, 5, 20, 10)], now);
    expect(r.current).toBe(0);
    // lastCaptureDay only fills when the streak is non-empty
    expect(r.lastCaptureDay).toBeNull();
  });

  test("multiple captures same day count as one streak day", () => {
    const r = computeStreak(
      [
        kstDay(2026, 5, 25, 1),
        kstDay(2026, 5, 25, 5),
        kstDay(2026, 5, 25, 10),
      ],
      now,
    );
    expect(r.current).toBe(1);
  });
});
