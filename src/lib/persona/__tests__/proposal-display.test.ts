import { formatProposalForDisplay } from "../proposal-display";
import type { SelfModelProposal } from "../proposal";

function proposal(over: Partial<SelfModelProposal> = {}): SelfModelProposal {
  return {
    target: { kind: "star", star: "now" },
    before: "openness 50",
    after: "openness 70",
    rationale: "recent entries show more curiosity",
    citations: ["rec_1", "rec_2"],
    targetLevel: 4,
    ...over,
  };
}

describe("formatProposalForDisplay", () => {
  test("KO output carries the before/after, rationale, and L5 note", () => {
    const d = formatProposalForDisplay(proposal(), "ko");
    expect(d.title).toBe("자기 모델 변경 제안");
    expect(d.before).toBe("openness 50");
    expect(d.after).toBe("openness 70");
    expect(d.rationale).toContain("curiosity");
    expect(d.ratifyNote).toContain("L5");
    expect(d.ratifyLabel).toBe("승인");
    expect(d.citationCount).toBe(2);
  });

  test("EN output is localized", () => {
    const d = formatProposalForDisplay(proposal(), "en");
    expect(d.title).toBe("Proposed change to your self-model");
    expect(d.ratifyLabel).toBe("Ratify");
    expect(d.declineLabel).toBe("Not now");
    expect(d.ratifyNote).toContain("L5");
  });

  test("target label reflects the proposal target kind", () => {
    expect(formatProposalForDisplay(proposal({ target: { kind: "star", star: "relational" } }), "en").targetLabel).toContain("relational");
    expect(formatProposalForDisplay(proposal({ target: { kind: "soulCore" } }), "ko").targetLabel).toBe("소울 코어");
    expect(formatProposalForDisplay(proposal({ target: { kind: "northStar" } }), "en").targetLabel).toContain("north star");
  });
});
