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
    expect(formatProposalForDisplay(proposal({ target: { kind: "soulCore" } }), "ko").targetLabel).toBe("북극성");
    expect(formatProposalForDisplay(proposal({ target: { kind: "northStar" } }), "en").targetLabel).toContain("north star");
  });

  // 설계 대화 발주 a(2026-10-07): 시트는 원시 id 대신 별 이름을 보인다. 이름을 못 찾을 때만 id.
  test("the sheet names the star instead of showing its raw id", () => {
    const names = (kind: "star" | "sevenStar", id: string) => (kind === "sevenStar" && id === "twenties" ? "20대" : kind === "star" && id === "relational" ? "관계의 나" : null);
    expect(formatProposalForDisplay(proposal({ target: { kind: "sevenStar", star: "twenties" } }), "ko", names).targetLabel).toBe("별: 20대");
    expect(formatProposalForDisplay(proposal({ target: { kind: "star", star: "relational" } }), "ko", names).targetLabel).toBe("별: 관계의 나");
    expect(formatProposalForDisplay(proposal({ target: { kind: "sevenStar", star: "school" } }), "ko", names).targetLabel).toBe("별: school");
  });
});
