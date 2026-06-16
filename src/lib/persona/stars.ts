// The seven self-understanding stars (lenses) - the evidence axes whose
// aggregate brightness IS the Soul Core (북극성) readout. Canon: CONTEXT.md
// "The 7 self-understanding stars". Stars are evidence axes; the 5 Pattern
// Cores are domain lenses (a separate concept). Roles / Action / Knowledge are
// NOT stars - they are the north-star goal-tree. "지금의 나" is star 1 (a tool);
// the Soul Core is the AGGREGATE of all seven, not itself a star.

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
