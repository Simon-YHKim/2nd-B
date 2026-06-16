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

export function deriveStarLevels(card: PersonaCard): Record<StarId, LadderLevel> {
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

  // star2 "회상": a narrative signal exists once observed pattern kinds surface
  // (build.ts writes them as `top_*` keys on patterns).
  const recall: LadderLevel = Object.keys(card.patterns).some((k) => k.startsWith("top_"))
    ? 2
    : 1;

  // stars 3 (보여지는 나 / peer), 4 (리듬 / ESM), 6 (될 수 있는 나) have no shipped
  // scoring engine yet, so they stay dim until their elicitation path lands.
  return { now, recall, seen: 1, rhythm: 1, relational, possible: 1, values };
}

export function soulCoreBrightnessFor(card: PersonaCard): number {
  return soulCoreBrightness(deriveStarLevels(card));
}
