// Display model for the ratify bottom-sheet (memo §3f), following the repo's
// buildCenterCards / buildSelfPortrait idiom: a PURE function returns the
// localized strings the RN sheet renders thinly (logic/presentation split).
// Inline-locale; lexicon-safe (self-understanding / growth voice, never clinical).

import type { SelfModelProposal } from "./proposal";

export interface ProposalDisplay {
  title: string;
  targetLabel: string;
  beforeLabel: string;
  afterLabel: string;
  before: string;
  after: string;
  rationale: string;
  /** "ratifying moves this to actionable (L5)". */
  ratifyNote: string;
  ratifyLabel: string;
  declineLabel: string;
  citationCount: number;
}

export function formatProposalForDisplay(p: SelfModelProposal, locale: "en" | "ko"): ProposalDisplay {
  const ko = locale === "ko";
  let targetLabel: string;
  if (p.target.kind === "star") targetLabel = ko ? `별: ${p.target.star}` : `star: ${p.target.star}`;
  else if (p.target.kind === "soulCore") targetLabel = ko ? "소울 코어" : "Soul Core";
  else targetLabel = ko ? "북극성 (철학)" : "north star (philosophy)";

  return {
    title: ko ? "자기 모델 변경 제안" : "Proposed change to your self-model",
    targetLabel,
    beforeLabel: ko ? "지금" : "Now",
    afterLabel: ko ? "제안" : "Proposed",
    before: p.before,
    after: p.after,
    rationale: p.rationale,
    ratifyNote: ko
      ? "승인하면 이 항목이 실행가능(L5)으로 올라가요."
      : "Ratifying moves this to actionable (L5).",
    ratifyLabel: ko ? "승인" : "Ratify",
    declineLabel: ko ? "아니요" : "Not now",
    citationCount: p.citations.length,
  };
}
