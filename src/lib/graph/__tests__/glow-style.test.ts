import { cosmic } from "@/lib/theme/tokens";

import { glowForTier } from "../glow-style";

describe("glowForTier", () => {
  test("uses the cosmic signal-blue token for every tier", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      expect(glowForTier(tier).color).toBe(cosmic.signalBlue);
    }
  });

  test("tier 1 has a stronger bloom than tier 4", () => {
    const tier1 = glowForTier(1);
    const tier4 = glowForTier(4);
    expect(tier1.radius).toBeGreaterThan(tier4.radius);
    expect(tier1.opacity).toBeGreaterThan(tier4.opacity);
    expect(tier1.haloScale).toBeGreaterThan(tier4.haloScale);
  });

  test("matches the endpoint glow values", () => {
    expect(glowForTier(1)).toEqual({
      color: cosmic.signalBlue,
      radius: 28,
      opacity: 0.7,
      haloScale: 1.9,
    });
    expect(glowForTier(4)).toEqual({
      color: cosmic.signalBlue,
      radius: 9,
      opacity: 0.3,
      haloScale: 1.3,
    });
  });

  test("attenuates linearly across depth tiers", () => {
    expect(glowForTier(2).radius).toBeCloseTo(28 - 19 / 3);
    expect(glowForTier(3).radius).toBeCloseTo(28 - 38 / 3);
    expect(glowForTier(2).opacity).toBeCloseTo(0.7 - 0.4 / 3);
    expect(glowForTier(3).haloScale).toBeCloseTo(1.9 - 1.2 / 3);
  });

  test("is deterministic", () => {
    expect(glowForTier(3)).toEqual(glowForTier(3));
  });
});
