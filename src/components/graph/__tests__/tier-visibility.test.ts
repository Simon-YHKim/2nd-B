import { scaleBucket, tierVisibility } from "../tier-visibility";

describe("scaleBucket", () => {
  test("far / mid / close thresholds (§5)", () => {
    expect(scaleBucket(0.5)).toBe(0);
    expect(scaleBucket(0.64)).toBe(0);
    expect(scaleBucket(0.65)).toBe(1);
    expect(scaleBucket(1.0)).toBe(1);
    expect(scaleBucket(1.09)).toBe(1);
    expect(scaleBucket(1.1)).toBe(2);
    expect(scaleBucket(2.5)).toBe(2);
  });
});

describe("tierVisibility", () => {
  test("far out: center + districts only", () => {
    expect(tierVisibility(0.5)).toEqual({ tier1: true, tier2: true, tier3: false, tier4: false });
  });

  test("mid (default 1.0): adds persona outposts, no fragments", () => {
    expect(tierVisibility(1.0)).toEqual({ tier1: true, tier2: true, tier3: true, tier4: false });
  });

  test("close in: everything including fragments", () => {
    expect(tierVisibility(1.5)).toEqual({ tier1: true, tier2: true, tier3: true, tier4: true });
  });

  test("tier1 and tier2 are always visible", () => {
    for (const s of [0.1, 0.65, 1.0, 1.1, 3.0]) {
      const v = tierVisibility(s);
      expect(v.tier1).toBe(true);
      expect(v.tier2).toBe(true);
    }
  });
});
