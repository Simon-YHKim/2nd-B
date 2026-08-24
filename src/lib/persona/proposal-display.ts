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
  mirrorNote: string;
  citationCount: number;
}

export function formatProposalForDisplay(p: SelfModelProposal, locale: "en" | "ko"): ProposalDisplay {
  const ko = locale === "ko";
  let targetLabel: string;
  if (p.target.kind === "star") targetLabel = ko ? `별: ${p.target.star}` : `star: ${p.target.star}`;
  // 시기 별(2026-08-25 L5 경로). 이 분기가 없으면 아래 폴백이 "북극성 (철학)"
  // 으로 오라벨해 사용자가 엉뚱한 것을 승인하는 줄 알게 된다.
  else if (p.target.kind === "sevenStar") targetLabel = ko ? `별: ${p.target.star}` : `star: ${p.target.star}`;
  else if (p.target.kind === "soulCore") targetLabel = ko ? "북극성" : "North Star";
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
    // 세션 01 실증(저항 존중): 분석을 밀어냈을 때 "거울은 거울이지 본인이
    // 아니다" 라고 받아준 것이 신뢰를 만들었다. 제안 시트가 같은 자세를 갖는다.
    mirrorNote: ko
      ? "이 제안은 거울이지 당신이 아니에요. 어디가 빗나갔는지 알려주셔도 됩니다."
      : "This proposal is a mirror, not you. Feel free to say where it misses.",
    citationCount: p.citations.length,
  };
}
