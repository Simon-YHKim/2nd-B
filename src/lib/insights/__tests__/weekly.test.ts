import { summarizeWeeklyInsights, type InsightRecordRow } from "../weekly";

const NOW = new Date("2026-06-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("summarizeWeeklyInsights", () => {
  test("counts this-week vs last-week and computes a positive delta", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1) }, // this week
      { created_at: daysAgo(2) }, // this week
      { created_at: daysAgo(6) }, // this week (boundary inside)
      { created_at: daysAgo(8) }, // last week
      { created_at: daysAgo(13) }, // last week
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(3);
    expect(out.lastWeek).toBe(2);
    expect(out.deltaPct).toBe(50);
    expect(out.direction).toBe("up");
    expect(out.isFirstWeek).toBe(false);
  });

  test("flags first week when there is no prior-week data", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1) },
      { created_at: daysAgo(3) },
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(2);
    expect(out.lastWeek).toBe(0);
    expect(out.deltaPct).toBe(0); // no division-by-zero
    expect(out.isFirstWeek).toBe(true);
  });

  test("reports a downward direction and negative delta", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(2) }, // this week: 1
      { created_at: daysAgo(8) }, // last week: 2
      { created_at: daysAgo(10) },
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(1);
    expect(out.lastWeek).toBe(2);
    expect(out.deltaPct).toBe(-50);
    expect(out.direction).toBe("down");
    expect(out.isFirstWeek).toBe(false);
  });

  test("ignores rows with unparseable timestamps and out-of-window rows", () => {
    const rows: InsightRecordRow[] = [
      { created_at: "not-a-date" },
      { created_at: daysAgo(1) }, // this week
      { created_at: daysAgo(30) }, // far outside both windows
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(1);
    expect(out.lastWeek).toBe(0);
  });
});
