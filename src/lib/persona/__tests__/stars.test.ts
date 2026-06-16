import type { LadderLevel } from "../brightness";
import {
  SELF_UNDERSTANDING_STARS,
  STAR_COUNT,
  soulCoreBrightness,
  type StarId,
} from "../stars";

// Helper: assign the same ladder level to every star, properly typed (no `any`).
function allStarsAt(level: LadderLevel): Partial<Record<StarId, LadderLevel>> {
  return Object.fromEntries(
    SELF_UNDERSTANDING_STARS.map((s) => [s.id, level]),
  ) as Partial<Record<StarId, LadderLevel>>;
}

describe("seven self-understanding stars", () => {
  test("registry has exactly seven stars with unique ids and indices 1-7", () => {
    expect(SELF_UNDERSTANDING_STARS).toHaveLength(STAR_COUNT);
    expect(STAR_COUNT).toBe(7);
    const ids = SELF_UNDERSTANDING_STARS.map((s) => s.id);
    expect(new Set(ids).size).toBe(7);
    const indices = SELF_UNDERSTANDING_STARS.map((s) => s.index).sort((a, b) => a - b);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("stars 6 and 7 match the canon (Possible Selves, Values & strivings)", () => {
    const six = SELF_UNDERSTANDING_STARS.find((s) => s.index === 6)!;
    const seven = SELF_UNDERSTANDING_STARS.find((s) => s.index === 7)!;
    expect(six.id).toBe("possible");
    expect(six.construct).toMatch(/Possible Selves/);
    expect(seven.id).toBe("values");
    expect(seven.construct).toMatch(/SDT/);
  });

  test("the other-view star stays scoped as postponed / adult-only (D4)", () => {
    const seen = SELF_UNDERSTANDING_STARS.find((s) => s.id === "seen")!;
    expect(seen.status).toBe("absent");
    expect(seen.engine).toMatch(/postponed|adult/i);
  });

  test("soul core brightness is the aggregate of star levels (mean + all-lit bonus)", () => {
    expect(soulCoreBrightness({})).toBeCloseTo(0.2); // all default to L1
    expect(soulCoreBrightness(allStarsAt(1))).toBeCloseTo(0.2);
    expect(soulCoreBrightness(allStarsAt(5))).toBeCloseTo(1.0);
    expect(soulCoreBrightness(allStarsAt(2))).toBeCloseTo(0.45); // 0.4 + 0.05 all-lit bonus
  });

  test("breadth (all stars lit) outshines a single deep spike", () => {
    const oneBright = soulCoreBrightness({ now: 5 }); // the other six default to L1
    const allLitLow = soulCoreBrightness(allStarsAt(2));
    expect(allLitLow).toBeGreaterThan(oneBright);
  });
});
