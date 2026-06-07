import { patternLinkStyle } from "../pattern-link";

describe("patternLinkStyle", () => {
  test("proximity 1 (closest) → max width / opacity / saturation", () => {
    const s = patternLinkStyle(1);
    expect(s.strokeWidth).toBeCloseTo(5);
    expect(s.opacity).toBeCloseTo(1);
    expect(s.saturation).toBeCloseTo(1);
  });

  test("proximity 0 (far) → min width / opacity / saturation", () => {
    const s = patternLinkStyle(0);
    expect(s.strokeWidth).toBeCloseTo(2);
    expect(s.opacity).toBeCloseTo(0.3);
    expect(s.saturation).toBeCloseTo(0.5);
  });

  test("closer is thicker + brighter + more saturated (monotonic)", () => {
    const near = patternLinkStyle(0.8);
    const far = patternLinkStyle(0.2);
    expect(near.strokeWidth).toBeGreaterThan(far.strokeWidth);
    expect(near.opacity).toBeGreaterThan(far.opacity);
    expect(near.saturation).toBeGreaterThan(far.saturation);
  });

  test("clamps out-of-range and non-finite proximity to [0,1]", () => {
    expect(patternLinkStyle(5).strokeWidth).toBeCloseTo(5);
    expect(patternLinkStyle(-2).strokeWidth).toBeCloseTo(2);
    expect(patternLinkStyle(NaN).strokeWidth).toBeCloseTo(2);
  });

  test("respects custom bounds", () => {
    expect(patternLinkStyle(1, { maxWidth: 6 }).strokeWidth).toBeCloseTo(6);
  });
});
