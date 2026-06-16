import { detectTierShift, type TierObservation } from "../tier-history";

function obs(star_id: TierObservation["star_id"], level: TierObservation["level"], recorded_at: string): TierObservation {
  return { star_id, level, recorded_at };
}

describe("detectTierShift", () => {
  test("no shift for a single observation or unchanged tier", () => {
    expect(detectTierShift([obs("now", 3, "2026-06-01T00:00:00Z")])).toEqual([]);
    expect(
      detectTierShift([obs("now", 3, "2026-06-01T00:00:00Z"), obs("now", 3, "2026-06-02T00:00:00Z")]),
    ).toEqual([]);
  });

  test("detects an upward shift (latest vs prior)", () => {
    const shifts = detectTierShift([
      obs("now", 3, "2026-06-01T00:00:00Z"),
      obs("now", 4, "2026-06-05T00:00:00Z"),
    ]);
    expect(shifts).toEqual([{ starId: "now", from: 3, to: 4, direction: "up" }]);
  });

  test("detects a downward shift and ignores order of input", () => {
    const shifts = detectTierShift([
      obs("relational", 2, "2026-06-09T00:00:00Z"),
      obs("relational", 4, "2026-06-01T00:00:00Z"),
    ]);
    expect(shifts).toEqual([{ starId: "relational", from: 4, to: 2, direction: "down" }]);
  });

  test("compares only the two most recent observations per star", () => {
    const shifts = detectTierShift([
      obs("now", 1, "2026-06-01T00:00:00Z"),
      obs("now", 5, "2026-06-02T00:00:00Z"),
      obs("now", 5, "2026-06-03T00:00:00Z"), // latest == prior -> no shift
    ]);
    expect(shifts).toEqual([]);
  });

  test("reports shifts across multiple stars independently", () => {
    const shifts = detectTierShift([
      obs("now", 2, "2026-06-01T00:00:00Z"),
      obs("now", 3, "2026-06-02T00:00:00Z"),
      obs("values", 4, "2026-06-01T00:00:00Z"),
      obs("values", 2, "2026-06-02T00:00:00Z"),
    ]);
    expect(shifts).toHaveLength(2);
    expect(shifts).toContainEqual({ starId: "now", from: 2, to: 3, direction: "up" });
    expect(shifts).toContainEqual({ starId: "values", from: 4, to: 2, direction: "down" });
  });
});
