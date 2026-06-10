import {
  checkUsage,
  canUsePremium,
  tierAtLeast,
  resolveTier,
  FREE_LIMIT,
} from "../entitlements";

describe("tierAtLeast", () => {
  it("orders free < soma < cortex < brain", () => {
    expect(tierAtLeast("brain", "cortex")).toBe(true);
    expect(tierAtLeast("soma", "cortex")).toBe(false);
    expect(tierAtLeast("free", "free")).toBe(true);
  });
});

// EXPO_PUBLIC_FORCE_TIER chokepoint (cycle-3 test gap #4). Every gate keying
// off progression.tier flows through resolveTier — "off" MUST mean the real
// per-user tier (a silent inversion would open or close the paywall for
// every user in a release build).
describe("resolveTier (QA paywall override)", () => {
  it("'off' honours the real per-user tier", () => {
    expect(resolveTier("off", "free")).toBe("free");
    expect(resolveTier("off", "brain")).toBe("brain");
  });

  it("a forced tier masks the real tier in BOTH directions", () => {
    // Upgrade mask (testing-phase bypass)…
    expect(resolveTier("brain", "free")).toBe("brain");
    // …and downgrade mask (pinning a paywall boundary to test it).
    expect(resolveTier("free", "brain")).toBe("free");
    expect(resolveTier("soma", "cortex")).toBe("soma");
  });
});

// D-09 M2 (2026-06-07): the local core is permanently unlimited on Free.
// journal / note / self_context carry no cap at any tier.
describe("checkUsage - journal (D-09 M2: free-unlimited local core)", () => {
  it("is unlimited on free at any count", () => {
    expect(checkUsage("journal", "free", 0)).toMatchObject({ allowed: true, unlimited: true });
    expect(checkUsage("journal", "free", 500)).toMatchObject({ allowed: true, unlimited: true });
  });

  it("stays unlimited on every paid tier", () => {
    expect(checkUsage("journal", "soma", 99)).toMatchObject({ allowed: true, unlimited: true });
    expect(checkUsage("journal", "brain", 500)).toMatchObject({ allowed: true, unlimited: true });
  });
});

describe("checkUsage - self_context (D-09 M2: free-unlimited local core)", () => {
  it("is unlimited on free and every tier", () => {
    expect(checkUsage("self_context", "free", 2)).toMatchObject({ allowed: true, unlimited: true });
    expect(checkUsage("self_context", "cortex", 50)).toMatchObject({ unlimited: true });
    expect(checkUsage("self_context", "brain", 50)).toMatchObject({ unlimited: true });
  });
});

describe("checkUsage - non-limited feature", () => {
  it("treats the audit as always unlimited", () => {
    expect(FREE_LIMIT.audit).toBeUndefined();
    expect(checkUsage("audit", "free", 999)).toMatchObject({ allowed: true, unlimited: true });
  });
});

describe("canUsePremium", () => {
  it("gates advisor and planner behind Brain", () => {
    expect(canUsePremium("advisor", "free")).toBe(false);
    expect(canUsePremium("advisor", "cortex")).toBe(false);
    expect(canUsePremium("advisor", "brain")).toBe(true);
    expect(canUsePremium("planner", "brain")).toBe(true);
  });
});
