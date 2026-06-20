import { monthDelta, prevMonthKey } from "../trend";

describe("prevMonthKey", () => {
  test("within a year and across the year boundary", () => {
    expect(prevMonthKey("2026-06")).toBe("2026-05");
    expect(prevMonthKey("2026-01")).toBe("2025-12");
  });
});

describe("monthDelta", () => {
  test("up / down / flat with pct", () => {
    expect(monthDelta(1120000, 1000000)).toEqual({ delta: 120000, pct: 0.12, direction: "up" });
    expect(monthDelta(920000, 1000000)).toEqual({ delta: -80000, pct: -0.08, direction: "down" });
    expect(monthDelta(500000, 500000)).toEqual({ delta: 0, pct: 0, direction: "flat" });
  });
  test("no previous baseline → pct null", () => {
    expect(monthDelta(50000, 0)).toEqual({ delta: 50000, pct: null, direction: "up" });
  });
});
