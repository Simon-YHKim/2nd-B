import { isProposalClean, isPresentableProposal, applyRatify, type SelfModelProposal } from "../proposal";

function baseProposal(over: Partial<SelfModelProposal> = {}): SelfModelProposal {
  return {
    target: { kind: "star", star: "now" },
    before: "Openness estimate: medium",
    after: "Openness estimate: high",
    rationale: "Your recent entries show more curiosity and new-experience seeking.",
    citations: ["rec_123", "rec_456"],
    targetLevel: 4,
    ...over,
  };
}

describe("self-model propose -> ratify contract", () => {
  test("a well-formed, clean, changing proposal is presentable", () => {
    expect(isPresentableProposal(baseProposal())).toBe(true);
  });

  test("a no-op proposal (before == after) is not presentable", () => {
    expect(isPresentableProposal(baseProposal({ before: "same", after: "same" }))).toBe(false);
  });

  test("an empty after, or empty rationale, is not presentable", () => {
    expect(isPresentableProposal(baseProposal({ after: "   " }))).toBe(false);
    expect(isPresentableProposal(baseProposal({ rationale: "" }))).toBe(false);
  });

  test("a proposal with forbidden clinical wording is rejected (C-vocabulary gate)", () => {
    expect(isProposalClean(baseProposal({ rationale: "This reads like a diagnosis." }))).toBe(false);
    expect(isPresentableProposal(baseProposal({ after: "You should seek therapy" }))).toBe(false);
  });

  test("ratification is the only path to L5; decline leaves the level unchanged", () => {
    expect(applyRatify(3, "ratify").resultingLevel).toBe(5);
    expect(applyRatify(3, "decline").resultingLevel).toBe(3);
    expect(applyRatify(1, "ratify").resultingLevel).toBe(5);
  });
});
