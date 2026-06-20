import type { LadderLevel } from "../brightness";
import { brightnessVisual, brightnessBand, LADDER_LEVEL_ID } from "../brightness-visual";

describe("brightnessVisual", () => {
  test("opacity follows the canon 20-100%", () => {
    expect(brightnessVisual(1).opacity).toBeCloseTo(0.2);
    expect(brightnessVisual(3).opacity).toBeCloseTo(0.6);
    expect(brightnessVisual(5).opacity).toBeCloseTo(1.0);
  });

  test("glow grows monotonically from dim to bright", () => {
    const scales = ([1, 2, 3, 4, 5] as LadderLevel[]).map((l) => brightnessVisual(l).glowScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThan(scales[i - 1]);
    }
  });

  test("a node reads as lit only at L2 and above", () => {
    expect(brightnessVisual(1).lit).toBe(false);
    expect(brightnessVisual(2).lit).toBe(true);
    expect(brightnessVisual(5).lit).toBe(true);
  });

  test("level ids match the CONTEXT.md ladder and stay text-free", () => {
    expect(LADDER_LEVEL_ID[1]).toBe("raw");
    expect(LADDER_LEVEL_ID[2]).toBe("tagged");
    expect(LADDER_LEVEL_ID[3]).toBe("connected");
    expect(LADDER_LEVEL_ID[4]).toBe("crosschecked");
    expect(LADDER_LEVEL_ID[5]).toBe("actionable");
  });
});

describe("brightnessBand (D-25: qualitative identity brightness, never a raw %)", () => {
  test("buckets an aggregate 0-1 brightness into dim/fair/bright", () => {
    expect(brightnessBand(0.2)).toBe("dim"); // all-L1 default
    expect(brightnessBand(0.39)).toBe("dim");
    expect(brightnessBand(0.4)).toBe("fair");
    expect(brightnessBand(0.45)).toBe("fair"); // all-lit L2
    expect(brightnessBand(0.6)).toBe("bright");
    expect(brightnessBand(1)).toBe("bright"); // all-L5
  });
});
