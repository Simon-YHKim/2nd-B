import { isQaPolarisAutoEligible, polarisProgress } from "../polaris-progress";
import type { RoleCard } from "../role-cards";

const card = (status: RoleCard["status"], domains = ["work"]): RoleCard => ({
  id: "builder", label: "Builder", summary: "Builds", strengths: [], advice: "",
  evidence: { domains, constructs: ["openness"] }, claimStrength: 2,
  evidenceRefs: ["record:11111111-1111-4111-8111-111111111111"], status,
} as RoleCard);

describe("Polaris category collection", () => {
  it("shows all six slots for a new account without claiming any progress", () => {
    const result = polarisProgress([]);
    expect(result.slots).toHaveLength(6);
    expect(result.slots.every((slot) => slot.state === "empty")).toBe(true);
    expect(result.filled).toBe(0);
    expect(result.firstApproved).toBe(false);
  });
  it("drafts do not unlock achievements or fill a category", () => {
    expect(polarisProgress([card("proposed")]).slots.find((slot) => slot.category === "work")?.state).toBe("proposed");
    expect(polarisProgress([card("proposed")]).filled).toBe(0);
  });
  it("counts distinct approved categories and never counts profile", () => {
    const result = polarisProgress([card("ratified", ["work", "now", "profile"]), card("ratified")]);
    expect(result.filled).toBe(2);
    expect(result.firstApproved).toBe(true);
    expect(result.complete).toBe(false);
  });
});

describe("QA-only automatic draft", () => {
  const eligible = { dev: true, email: "qa.ai.b18807@example.com", userId: "qa", sessionUserId: "qa", tier: "brain", hasCards: false, hasEvidence: true, attempted: false };
  it("allows only the authenticated, funded QA account's first eligible attempt", () => {
    expect(isQaPolarisAutoEligible(eligible)).toBe(true);
    for (const override of [{ dev:false },{ email:"other@example.com" },{ sessionUserId:"other" },{ tier:"free" },{ hasCards:true },{ hasEvidence:false },{ attempted:true }]) {
      expect(isQaPolarisAutoEligible({ ...eligible, ...override })).toBe(false);
    }
  });
});
