import { adherenceChip, githubChip, trendChip } from "../grounding";

describe("adherenceChip (A)", () => {
  test("ko / en", () => {
    const s = { completedDays: 5, windowDays: 7, streak: 3, activeRoutines: 2 };
    expect(adherenceChip(s, true)).toBe("최근 5/7일 · 연속 3일");
    expect(adherenceChip(s, false)).toBe("5/7 days · 3-day streak");
  });
});

describe("githubChip (B)", () => {
  test("ko / en", () => {
    const summary = { commits: 24, activeDays: 5, repos: ["a/b"] };
    expect(githubChip(summary, true)).toBe("이번 주 24커밋");
    expect(githubChip(summary, false)).toBe("24 commits this week");
  });
});

describe("trendChip (B)", () => {
  test("up with pct", () => {
    expect(trendChip({ delta: 120000, pct: 0.12, direction: "up" }, true)).toBe("지출 ↑12%");
    expect(trendChip({ delta: 80000, pct: 0.08, direction: "down" }, false)).toBe("Spending ↓8%");
  });
  test("flat → null", () => {
    expect(trendChip({ delta: 0, pct: 0, direction: "flat" }, true)).toBeNull();
  });
  test("no baseline → no pct number", () => {
    expect(trendChip({ delta: 50000, pct: null, direction: "up" }, false)).toBe("Spending ↑");
  });
});
