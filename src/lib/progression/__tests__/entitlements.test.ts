import {
  checkUsage,
  canUsePremium,
  tierAtLeast,
  FREE_LIMIT,
} from "../entitlements";

describe("tierAtLeast", () => {
  it("orders free < soma < cortex < brain", () => {
    expect(tierAtLeast("brain", "cortex")).toBe(true);
    expect(tierAtLeast("soma", "cortex")).toBe(false);
    expect(tierAtLeast("free", "free")).toBe(true);
  });
});

describe("checkUsage - journal (free limit 2, unlimited at soma)", () => {
  it("allows the first two uses on free, then blocks", () => {
    expect(checkUsage("journal", "free", 0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(checkUsage("journal", "free", 1)).toMatchObject({ allowed: true, remaining: 1 });
    const blocked = checkUsage("journal", "free", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("limit_reached");
    expect(blocked.upgradeTo).toBe("soma");
  });

  it("is unlimited from Soma upward", () => {
    expect(checkUsage("journal", "soma", 99)).toMatchObject({ allowed: true, unlimited: true });
    expect(checkUsage("journal", "brain", 500)).toMatchObject({ allowed: true, unlimited: true });
  });
});

describe("checkUsage - self_context (free limit 2, unlimited at cortex)", () => {
  it("stays limited on free and on soma", () => {
    expect(checkUsage("self_context", "free", 2).allowed).toBe(false);
    const somaBlocked = checkUsage("self_context", "soma", 2);
    expect(somaBlocked.allowed).toBe(false);
    expect(somaBlocked.upgradeTo).toBe("cortex");
  });

  it("is unlimited from Cortex upward", () => {
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
