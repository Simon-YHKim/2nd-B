import { traitConfidenceFor } from "../build";
import { baseLevelFor, ladderLevel, brightnessFraction } from "../brightness";

describe("value-ladder brightness (L1-L5)", () => {
  test("base level maps the three TraitConfidence sources to the ladder", () => {
    expect(baseLevelFor(traitConfidenceFor("bfi", 1))).toBe(4); // validated instrument
    expect(baseLevelFor(traitConfidenceFor("heuristic", 0))).toBe(1); // default
    expect(baseLevelFor(traitConfidenceFor("heuristic", 3))).toBe(2); // 1-4 obs (low)
    expect(baseLevelFor(traitConfidenceFor("heuristic", 8))).toBe(3); // 5-14 obs (medium)
    expect(baseLevelFor(traitConfidenceFor("heuristic", 20))).toBe(4); // >=15 obs (high)
  });

  test("cross-source agreement lifts one tier, capped at 5", () => {
    // medium (L3) + cross-source -> L4
    expect(
      ladderLevel({ confidence: traitConfidenceFor("heuristic", 8), crossSourceAgreement: true }),
    ).toBe(4);
    // validated instrument (L4) + cross-source -> capped at L5
    expect(
      ladderLevel({ confidence: traitConfidenceFor("bfi", 1), crossSourceAgreement: true }),
    ).toBe(5);
    // no cross-source -> stays at base
    expect(ladderLevel({ confidence: traitConfidenceFor("heuristic", 8) })).toBe(3);
  });

  test("ratification is the only path to L5", () => {
    // a default (L1) axis jumps straight to L5 once the user ratifies
    expect(ladderLevel({ confidence: traitConfidenceFor("heuristic", 0), ratified: true })).toBe(5);
    // without ratify or cross-source a default axis stays L1
    expect(ladderLevel({ confidence: traitConfidenceFor("heuristic", 0) })).toBe(1);
  });

  test("brightness fraction matches the canon 20/40/60/80/100 percent", () => {
    expect(brightnessFraction(1)).toBeCloseTo(0.2);
    expect(brightnessFraction(2)).toBeCloseTo(0.4);
    expect(brightnessFraction(3)).toBeCloseTo(0.6);
    expect(brightnessFraction(4)).toBeCloseTo(0.8);
    expect(brightnessFraction(5)).toBeCloseTo(1.0);
  });
});
