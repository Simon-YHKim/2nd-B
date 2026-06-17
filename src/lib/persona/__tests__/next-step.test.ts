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
  // ACTIVATION_PRIORITY = attachment(relational) > bigFive(now) > values > esm(rhythm).
  // Attachment-first matches the onboarding lure + the persona-sim leading
  // indicator (ECR is the cheapest validated instrument -> instant L4).
  it("offers attachment first when all stars are dim (cheapest validated L4)", () => {
    const step = nextActivationStep(levels());
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("relational");
    expect(step!.route).toBe("/attachment");
    expect(step!.key).toBe("attachment");
  });

  it("offers big-five next once attachment (relational) is lit", () => {
    const step = nextActivationStep(levels({ relational: 4 }));
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("now");
    expect(step!.route).toBe("/big-five");
    expect(step!.key).toBe("bigFive");
  });

  it("offers the values audit once attachment + big-five are lit", () => {
    const step = nextActivationStep(levels({ relational: 4, now: 2 }));
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("values");
    expect(step!.route).toBe("/audit");
    expect(step!.key).toBe("values");
  });

  it("offers the rhythm check-in last (retention step, trails the validated instruments)", () => {
    const step = nextActivationStep(levels({ relational: 4, now: 2, values: 2 }));
    expect(step).not.toBeNull();
    expect(step!.star.id).toBe("rhythm");
    expect(step!.route).toBe("/esm");
    expect(step!.key).toBe("esm");
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
});
