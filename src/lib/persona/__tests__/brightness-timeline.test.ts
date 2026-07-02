import { buildBrightnessTimeline, buildRatificationLog, TIMELINE_WEEKS } from "../brightness-timeline";
import type { TierObservation } from "../tier-history";

const NOW = new Date("2026-07-02T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const OBS: TierObservation[] = [
  { star_id: "now", level: 2, recorded_at: daysAgo(50) },
  { star_id: "now", level: 3, recorded_at: daysAgo(20), evidence_citations: ["record:a", "record:b"], evidence_origin: "ratify" },
  { star_id: "relational", level: 1, recorded_at: daysAgo(10) },
  { star_id: "relational", level: 2, recorded_at: daysAgo(2), evidence_citations: ["record:c"], evidence_origin: "ratify" },
];

describe("brightness timeline (P3c)", () => {
  test("eight 7-day windows, oldest first", () => {
    const t = buildBrightnessTimeline(OBS, NOW);
    expect(t.weekStarts).toHaveLength(TIMELINE_WEEKS);
    expect([...t.weekStarts]).toEqual([...t.weekStarts].sort());
  });

  test("carry-forward levels; null before the first observation", () => {
    const t = buildBrightnessTimeline(OBS, NOW);
    const nowStar = t.stars.find((s) => s.starId === "now")!;
    // 50 days ago is before the 8-week horizon start minus nothing… the first
    // window end is 49 days before now, so the L2 observation (50d) is already
    // carried into the very first window.
    expect(nowStar.levels[0]).toBe(2);
    expect(nowStar.levels[TIMELINE_WEEKS - 1]).toBe(3);
    const rel = t.stars.find((s) => s.starId === "relational")!;
    expect(rel.levels[0]).toBeNull(); // first observation only 10 days ago
    expect(rel.levels[TIMELINE_WEEKS - 1]).toBe(2);
  });

  test("polaris aggregate averages only known stars, 0-1", () => {
    const t = buildBrightnessTimeline(OBS, NOW);
    // First window: only `now` known at L2 -> (2-1)/4 = 0.25
    expect(t.polaris[0]).toBeCloseTo(0.25);
    // Last window: now L3 (0.5) + relational L2 (0.25) -> 0.375
    expect(t.polaris[TIMELINE_WEEKS - 1]).toBeCloseTo(0.38, 1);
  });

  test("empty history yields empty stars and all-null polaris", () => {
    const t = buildBrightnessTimeline([], NOW);
    expect(t.stars).toHaveLength(0);
    expect(t.polaris.every((p) => p === null)).toBe(true);
    expect(t.honesty).toEqual({ observations: 0, cited: 0, observedStars: 0 });
  });

  test("honesty meter counts observations, cited rows, distinct stars", () => {
    const t = buildBrightnessTimeline(OBS, NOW);
    expect(t.honesty).toEqual({ observations: 4, cited: 2, observedStars: 2 });
  });
});

describe("ratification log (P3d)", () => {
  test("newest first, with per-star level deltas", () => {
    const log = buildRatificationLog(OBS);
    expect(log).toHaveLength(4);
    expect(log[0]).toMatchObject({ starId: "relational", level: 2, prevLevel: 1, origin: "ratify", citedCount: 1 });
    expect(log[3]).toMatchObject({ starId: "now", level: 2, prevLevel: null, citedCount: 0 });
  });

  test("first observation of a star has prevLevel null", () => {
    const log = buildRatificationLog(OBS);
    const firstNow = log.find((e) => e.starId === "now" && e.prevLevel === null);
    expect(firstNow?.level).toBe(2);
  });
});
