// Derive per-star L1-L5 levels from an existing PersonaCard, then the Soul Core
// (북극성) brightness. v1 maps the signals the card already carries onto the
// seven self-understanding stars; a star whose engine is not shipped yet stays
// at L1 (no data gathered). Pure + deterministic - the INSTRUMENT layer decides
// every level, never an LLM. This bridges the canon (stars.ts) to real user
// data so the constellation home + persona card can render brightness from one
// source of truth.

import { ladderLevel, type LadderLevel } from "./brightness";
import type { PersonaCard } from "./build";
import { soulCoreBrightness, type StarId } from "./stars";

// star4 "리듬 / ESM": momentary-state coverage. More ESM check-ins => a higher
// tier (mirrors the journal-observation thresholds). esmCount 0 => dim L1.
export function rhythmStarLevel(esmCount: number): LadderLevel {
  if (esmCount <= 0) return 1;
  if (esmCount >= 15) return 4;
  if (esmCount >= 5) return 3;
  return 2;
}

export function deriveStarLevels(
  card: PersonaCard,
  rhythmObservationCount = 0,
  // F8: standing user-ratified tiers (propose->ratify, the only durable path to L5).
  // Each star is lifted to max(deterministic, ratified) so a rebuild never regresses
  // a ratification. Defaults to none, so every existing caller is unchanged.
  standingRatified: Partial<Record<StarId, LadderLevel>> = {},
  // 회상(star2)의 **진짜** 등급. 인터뷰 커버리지에서 나온다
  // (`persona/narrative-star.ts` -> `interview/narrative-level.ts`).
  // null 이면 인터뷰 기록이 없다는 뜻이라 아래의 기존 신호로 떨어진다.
  narrativeLevel: LadderLevel | null = null,
): Record<StarId, LadderLevel> {
  // star1 "지금의 나": trait-state confidence (BFI questionnaire vs journal
  // heuristic) mapped through the value ladder. v1 confidence is uniform across
  // traits, so the openness slot is representative of the card.
  const tc = card.traitConfidence?.openness;
  const now: LadderLevel = tc ? ladderLevel({ confidence: tc }) : 1;

  // star5 "관계의 나": a completed ECR-S attachment result is a validated
  // instrument, so it sits at ladder L4 like a finished questionnaire.
  const relational: LadderLevel = card.attachment ? 4 : 1;

  // star7 "가치의 나": breadth of value frameworks the user has engaged (SDT /
  // VIA via the life audit). More engaged frameworks => a higher tier.
  const values: LadderLevel =
    card.values.length >= 3 ? 3 : card.values.length >= 1 ? 2 : 1;

  // star2 "회상": 인터뷰가 실제로 판 (시기 x 층) 칸에서 나온다.
  //
  // ⚠ 2026-08-24 이전에는 `card.patterns` 에 `top_*` 키가 있는지로 정했다. 그 키는
  // 저널 패턴 추출에서 나오는 것이라 **인터뷰와 아무 상관이 없었다** -- 회상 별이
  // 회상을 재고 있지 않았다는 뜻이다. 정작 그걸 재려고 만든 `narrativeStarLevel` 은
  // 호출부가 0건이었고, 이유는 커버리지가 저장되지 않았기 때문이다(0143 이 고침).
  //
  // 옛 신호를 **완전히 버리지는 않는다**: 인터뷰를 한 적이 없으면(null) 저널 쪽
  // 신호로 떨어진다. 없는 것을 L1 로 단정하지 않는 것이 이 사다리의 규율이다.
  const recall: LadderLevel =
    narrativeLevel ??
    (Object.keys(card.patterns).some((k) => k.startsWith("top_")) ? 2 : 1);

  // star4 "리듬 / ESM": momentary-state coverage from ESM check-ins (count passed
  // by the caller). stars 3 (보여지는 나 / peer) + 6 (될 수 있는 나) have no shipped
  // engine yet, so they stay dim until their elicitation path lands.
  const rhythm: LadderLevel = rhythmStarLevel(rhythmObservationCount);
  const base: Record<StarId, LadderLevel> = { now, recall, seen: 1, rhythm, relational, possible: 1, values };
  // F8: lift each star to its standing ratified tier when higher. A user-ratified
  // star (L5) must survive a deterministic rebuild; without this the rebuild wrote a
  // lower level back to star_tier_history, dropping the ratified brightness AND
  // firing a phantom "down" nudge.
  for (const s of Object.keys(base) as StarId[]) {
    const r = standingRatified[s];
    if (r !== undefined && r > base[s]) base[s] = r;
  }
  return base;
}

export function soulCoreBrightnessFor(
  card: PersonaCard,
  rhythmObservationCount = 0,
  standingRatified: Partial<Record<StarId, LadderLevel>> = {},
): number {
  return soulCoreBrightness(deriveStarLevels(card, rhythmObservationCount, standingRatified));
}
