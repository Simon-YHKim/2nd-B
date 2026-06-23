import { starOpacity, soulCoreOpacity } from "../constellation-brightness";
import type { LadderLevel } from "../brightness";

const LEVELS: LadderLevel[] = [1, 2, 3, 4, 5];

describe("constellation-brightness", () => {
  describe("starOpacity", () => {
    it("floors L1 at 0.3 and reaches full 1.0 at L5", () => {
      expect(starOpacity(1)).toBeCloseTo(0.3);
      expect(starOpacity(5)).toBeCloseTo(1.0);
    });

    it("follows the canon 40/60/80 fractions between floor and full", () => {
      expect(starOpacity(2)).toBeCloseTo(0.4);
      expect(starOpacity(3)).toBeCloseTo(0.6);
      expect(starOpacity(4)).toBeCloseTo(0.8);
    });

    it("is monotonic non-decreasing across the ladder", () => {
      const o = LEVELS.map(starOpacity);
      for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThanOrEqual(o[i - 1]);
    });

    it("never renders a star invisible (it is also a tap target)", () => {
      for (const l of LEVELS) expect(starOpacity(l)).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe("soulCoreOpacity", () => {
    it("floors at 0.6 when empty and tops at 1.0 at full breadth", () => {
      expect(soulCoreOpacity(0)).toBeCloseTo(0.6);
      expect(soulCoreOpacity(1)).toBeCloseTo(1.0);
    });

    it("is monotonic in aggregate brightness", () => {
      expect(soulCoreOpacity(0.5)).toBeGreaterThan(soulCoreOpacity(0.2));
      expect(soulCoreOpacity(0.2)).toBeGreaterThan(soulCoreOpacity(0));
    });

    it("clamps out-of-range or NaN input to the [0.6, 1.0] band", () => {
      expect(soulCoreOpacity(2)).toBeCloseTo(1.0);
      expect(soulCoreOpacity(-1)).toBeCloseTo(0.6);
      expect(soulCoreOpacity(Number.NaN)).toBeCloseTo(0.6);
    });

    it("never dips below its 0.6 floor, so the hero is always clearly present (tier-1)", () => {
      for (const b of [0, 0.2, 0.31, 0.5, 1]) {
        expect(soulCoreOpacity(b)).toBeGreaterThanOrEqual(0.6);
      }
      // At full breadth the Soul Core matches a fully-lit star in opacity; its
      // tier-1 dominance is then carried by SIZE (not modulated here).
      expect(soulCoreOpacity(1)).toBe(starOpacity(5));
    });
  });
});
