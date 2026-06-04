import { depthStyleForTier } from "@/lib/graph/depth-style";

describe("depthStyleForTier", () => {
  it("tier 1 (Soul Core) is full strength: { saturate: 1, opacity: 1 }", () => {
    expect(depthStyleForTier(1)).toEqual({ saturate: 1, opacity: 1 });
  });

  it("saturate strictly decreases as tier increases", () => {
    const s1 = depthStyleForTier(1).saturate;
    const s2 = depthStyleForTier(2).saturate;
    const s3 = depthStyleForTier(3).saturate;
    const s4 = depthStyleForTier(4).saturate;
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBeGreaterThan(s3);
    expect(s3).toBeGreaterThan(s4);
  });

  it("opacity strictly decreases as tier increases", () => {
    const o1 = depthStyleForTier(1).opacity;
    const o2 = depthStyleForTier(2).opacity;
    const o3 = depthStyleForTier(3).opacity;
    const o4 = depthStyleForTier(4).opacity;
    expect(o1).toBeGreaterThan(o2);
    expect(o2).toBeGreaterThan(o3);
    expect(o3).toBeGreaterThan(o4);
  });

  it("opacity never drops below 0.84 (opacity 과잉 금지)", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      expect(depthStyleForTier(tier).opacity).toBeGreaterThanOrEqual(0.84);
    }
  });

  it("saturate stays in a sane (0, 1] range", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const { saturate } = depthStyleForTier(tier);
      expect(saturate).toBeGreaterThan(0);
      expect(saturate).toBeLessThanOrEqual(1);
    }
  });
});
