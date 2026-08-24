// ⚠ **이것은 별이 아니다 — 검증층이다.** (2026-08-24 정정)
//
// 파일 이름과 아래 타입 이름이 `stars` 라서 세션마다 오해가 재생산됐다. 홈
// 별자리에 그려지는 일곱은 **`persona/seven-stars.ts`** 다(프로필·영유아기·
// 학창시절·20대·30대 이후·직장·지금). 여기 있는 일곱은 화면에 별로 뜨지 않는다.
//
// ── 그럼 이건 뭔가 ─────────────────────────────────────────────────────
//
// **측정 도구가 붙은 심리 구인들이다.** 셋은 진짜 계기가 있다:
//
//   now         Big Five (BFI-44 / IPIP-NEO-120)
//   relational  애착 (ECR-S)
//   values      가치 프레임워크
//
// 그리고 그 셋이 **propose->ratify 의 근거**다(`ratifiable.ts`). 사용자가
// "그건 아닌데요" 라고 말할 수 있는 앱의 유일한 자리가 이것들 위에 서 있다.
// 그래서 **지우지 않는다.** 지우면 비준 루프가 근거를 잃는다.
//
// ⚠ 반대로 나머지 넷(recall·seen·rhythm·possible)은 2026-08-15 감사에서
// "구인이 아니라 행이 들어왔는가를 쟀다"고 확인된 쪽이다. 새 판단의 근거로
// 인용하지 말 것.
//
// ── 이름이 겹친다 ──────────────────────────────────────────────────────
//
// `now` 가 여기(지금의 나 = 특성 상태)에도 있고 새 별(지금 = 현재의 나를
// 알아가는 자리)에도 있다. **글자가 같고 뜻이 다르다.** 원장
// (`star_tier_history.star_id`)에서 둘을 가르는 것은 `seven:` 접두사다
// (`seven-tier-history.ts`). 그 접두사를 떼면 조용히 틀린다 -- 예외도 안 나고
// 화면도 안 죽는다.
//
// ── 원래 헤더 (역사 기록) ──────────────────────────────────────────────
//
// > The seven self-understanding stars (lenses) - the evidence axes whose
// > aggregate brightness IS the Soul Core (북극성) readout. ... "지금의 나" is
// > star 1 (a tool); the Soul Core is the AGGREGATE of all seven, not itself a star.
//
// 그 서술의 마지막 절(북극성 = 일곱의 집계)은 **더 이상 사실이 아니다.**
// 북극성은 이제 새 별 여섯의 평균이다(`north-star.ts`, 캐논이 목록을 갖는다).

import { type LadderLevel, brightnessFraction } from "./brightness";

export type StarId =
  | "now"
  | "recall"
  | "seen"
  | "rhythm"
  | "relational"
  | "possible"
  | "values";

// Build status of each star's engine, mirroring the memo's grounding table.
export type StarStatus = "shipped" | "partial" | "stub" | "absent";

export interface SelfUnderstandingStar {
  id: StarId;
  index: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  nameKo: string;
  nameEn: string;
  /** The latent construct this lens estimates. */
  construct: string;
  /** Elicitation / scoring engine (source file, or "new" / "360 peer"). */
  engine: string;
  status: StarStatus;
}

export const SELF_UNDERSTANDING_STARS: readonly SelfUnderstandingStar[] = [
  { id: "now", index: 1, nameKo: "지금의 나", nameEn: "Trait state", construct: "Big Five", engine: "persona/bfi.ts", status: "shipped" },
  { id: "recall", index: 2, nameKo: "회상", nameEn: "Narrative origins", construct: "McAdams narrative identity", engine: "interview/probe.ts", status: "shipped" },
  { id: "seen", index: 3, nameKo: "보여지는 나", nameEn: "Other-view", construct: "other-rated Big Five + reputation", engine: "360 peer (postponed / adult-only)", status: "absent" },
  { id: "rhythm", index: 4, nameKo: "리듬", nameEn: "Momentary state", construct: "within-person variability", engine: "esm.tsx", status: "stub" },
  { id: "relational", index: 5, nameKo: "관계의 나", nameEn: "Relational self", construct: "attachment (anxiety / avoidance)", engine: "persona/attachment.ts", status: "shipped" },
  { id: "possible", index: 6, nameKo: "될 수 있는 나", nameEn: "Possible self", construct: "Possible Selves (Markus & Nurius 1986)", engine: "new", status: "absent" },
  { id: "values", index: 7, nameKo: "가치의 나", nameEn: "Values & strivings", construct: "SDT + VIA strengths + personal strivings", engine: "audit sdt:* / via:* tags", status: "partial" },
] as const;

export const STAR_COUNT = 7 as const;

// Aggregate per-star ladder levels into the Soul Core (북극성) brightness as a
// 0-1 fraction. D8: the mean of star brightness plus a small bonus when EVERY
// star is lit (>= L2) - so breadth (all seven known a little) outshines one
// deep spike, matching "모든 별이 켜지면 북극성이 더 밝아진다". The Soul Core is an
// AGGREGATE, not a star. Stars with no data yet count as L1. Deterministic;
// v1 uses equal weights (per-star SOKA self-other weighting is a later refinement).
const ALL_LIT_BONUS = 0.05;

export function soulCoreBrightness(levels: Partial<Record<StarId, LadderLevel>>): number {
  const perStar = SELF_UNDERSTANDING_STARS.map((s) => levels[s.id] ?? 1) as LadderLevel[];
  const mean = perStar.reduce((sum, l) => sum + brightnessFraction(l), 0) / perStar.length;
  const allLit = perStar.every((l) => l >= 2);
  return Math.min(1, mean + (allLit ? ALL_LIT_BONUS : 0));
}
