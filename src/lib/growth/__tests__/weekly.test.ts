import { buildWeeklyGrowth } from "../weekly";

const NOW = new Date(2026, 5, 20); // 2026-06-20, window cutoff = 2026-06-13

function day(offsetBack: number): string {
  const d = new Date(2026, 5, 20 - offsetBack);
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("buildWeeklyGrowth", () => {
  test("picks the most-grown star as topStar (before vs after across the cutoff)", () => {
    const g = buildWeeklyGrowth({
      history: [
        { star_id: "possible", level: 1, recorded_at: "2026-06-01T00:00:00.000Z" }, // before week
        { star_id: "possible", level: 3, recorded_at: "2026-06-18T00:00:00.000Z" }, // this week
        { star_id: "now", level: 1, recorded_at: "2026-06-02T00:00:00.000Z" },
        { star_id: "now", level: 2, recorded_at: "2026-06-19T00:00:00.000Z" },
      ],
      completions: [],
      recordsCount: 18,
      milestonesDoneThisWeek: 1,
      now: NOW,
    });
    expect(g.hasPriorWeek).toBe(true);
    expect(g.topStar?.id).toBe("possible");
    expect(g.topStar?.before).toBe(1);
    expect(g.topStar?.after).toBe(3);
    expect(g.topStar?.delta).toBe(2);
    expect(g.stars).toHaveLength(7);
    expect(g.metrics.records).toBe(18);
    expect(g.metrics.milestoneDelta).toBe(1);
  });

  test("first week (no observations before the cutoff) → no comparison, topStar null", () => {
    const g = buildWeeklyGrowth({
      history: [{ star_id: "now", level: 2, recorded_at: "2026-06-18T00:00:00.000Z" }],
      completions: [],
      recordsCount: 3,
      milestonesDoneThisWeek: 0,
      now: NOW,
    });
    expect(g.hasPriorWeek).toBe(false);
    expect(g.topStar).toBeNull();
  });

  test("completion metrics: distinct days → rate, consecutive → streak", () => {
    const g = buildWeeklyGrowth({
      history: [{ star_id: "now", level: 1, recorded_at: "2026-06-01T00:00:00.000Z" }],
      completions: [{ completed_on: day(0) }, { completed_on: day(1) }, { completed_on: day(2) }],
      recordsCount: 0,
      milestonesDoneThisWeek: 0,
      now: NOW,
    });
    expect(g.metrics.completionRate).toBe(43); // round(3/7*100)
    expect(g.metrics.streak).toBe(3);
  });

  test("levels clamp to 1..5", () => {
    const g = buildWeeklyGrowth({
      history: [
        { star_id: "values", level: 0, recorded_at: "2026-06-01T00:00:00.000Z" },
        { star_id: "values", level: 9, recorded_at: "2026-06-18T00:00:00.000Z" },
      ],
      completions: [],
      recordsCount: 0,
      milestonesDoneThisWeek: 0,
      now: NOW,
    });
    const v = g.stars.find((s) => s.id === "values");
    expect(v?.before).toBe(1);
    expect(v?.after).toBe(5);
  });
});
