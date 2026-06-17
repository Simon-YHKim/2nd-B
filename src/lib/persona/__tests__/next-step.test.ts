import type { LadderLevel } from "../brightness";
import { nextActivationStep } from "../next-step";
import type { StarId } from "../stars";

// Helper: start every star dim (L1), then override.
function levels(over: Partial<Record<StarId, LadderLevel>> = {}): Record<StarId, LadderLevel> {
  return {
    now: 1,
    recall: 1,
    seen: 1,
    rhythm: 1,
    relational: 1,
    possible: 1,
    values: 1,
    ...over,
  };
}

describe("nextActivationStep", () => {
  it("offers the lowest-index offerable star first (all dim -> now / big-five)", () => {
    const step = nextActivationStep(levels());
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("now");
    expect(step!.route).toBe("/big-five");
    expect(step!.key).toBe("bigFive");
  });

  it("skips lit stars and offers the next dim offerable one by index (now+rhythm lit -> relational / attachment)", () => {
    // Offerable stars by index: now(1), rhythm(4), relational(5), values(7).
    // With now and rhythm lit, the lowest-index dim offerable star is relational.
    const step = nextActivationStep(levels({ now: 2, rhythm: 2 }));
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("relational");
    expect(step!.route).toBe("/attachment");
    expect(step!.key).toBe("attachment");
  });

  it("returns null when every offerable star is lit (L2+)", () => {
    const step = nextActivationStep(
      levels({ now: 2, relational: 4, rhythm: 3, values: 2 }),
    );
    expect(step).toBeNull();
  });

  it("never offers an unshipped star (seen / possible), even when only they are dim", () => {
    // All offerable stars lit; only seen + possible remain at L1. There is no
    // shipped engine for them, so the helper offers nothing.
    const step = nextActivationStep(
      levels({ now: 2, relational: 2, rhythm: 2, values: 2, seen: 1, possible: 1 }),
    );
    expect(step).toBeNull();
  });

  it("offers rhythm next when only now is lit (rhythm index 4 precedes relational index 5)", () => {
    const step = nextActivationStep(levels({ now: 2 }));
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("rhythm");
    expect(step!.route).toBe("/esm");
    expect(step!.key).toBe("esm");
  });
});
