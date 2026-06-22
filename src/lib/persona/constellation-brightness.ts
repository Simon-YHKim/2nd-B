// Render-channel mapping for the deep-space home constellation: turn the value
// ladder (L1-L5 per star, plus the aggregate Soul Core brightness from
// loadStarLevels) into the OPACITY each node draws at, so the sky visibly
// brightens as the user gathers self-data.
//
// Why opacity only: the Soul Core's tier-1 dominance is carried by SIZE in
// ConstellationHome (북극성 r=12 vs star r<=7) and is intentionally left
// untouched, so modulating brightness here can never let a small lit star rival
// the hero. This module is pure + LLM-free; the levels come from the existing
// no-Gemini loadStarLevels path.

import { brightnessFraction, type LadderLevel } from "./brightness";

// A star's dimmest rendered opacity (L1 = "not gathered yet"). Floored well
// above 0 because the stars are also the home's tap targets - an unlit star is a
// dim nav node, never an invisible one.
const STAR_OPACITY_FLOOR = 0.3;

// The Soul Core never drops below this, so the hero stays present and inviting
// for a brand-new (all-L1) user; it then climbs to 1.0 as breadth fills in.
const SOUL_CORE_OPACITY_FLOOR = 0.6;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Render opacity (0.3-1.0) for one self-understanding star at the given ladder
 *  level. Monotonic in level: L1 floors at 0.3, L5 reaches full 1.0. */
export function starOpacity(level: LadderLevel): number {
  return Math.min(1, Math.max(STAR_OPACITY_FLOOR, brightnessFraction(level)));
}

/** Render opacity (0.6-1.0) for the 북극성 Soul Core from its aggregate
 *  brightness (0-1, as returned by loadStarLevels). Floored at 0.6 so the hero
 *  stays dominant when empty; dominance over stars is carried by SIZE, not this. */
export function soulCoreOpacity(brightness: number): number {
  return SOUL_CORE_OPACITY_FLOOR + (1 - SOUL_CORE_OPACITY_FLOOR) * clamp01(brightness);
}
