// Tier depth-feeling (v10 pass). Tiers further from the Soul Core read as
// "deeper" / farther away: slightly desaturated and slightly more transparent.
//
// Scale-depth is ALREADY handled by tierSize (88/44/35/28 in NavGraph), so this
// module adds ONLY saturation + opacity falloff — no extra shrink. Applied to
// the tesseract ART layer only; labels, hit targets, and the existing animated
// spawn/fade opacity stay full-strength.
//
// Values are tunable. Constraints:
//   - tier1 = { saturate: 1, opacity: 1 } (Soul Core never dimmed/desaturated)
//   - saturate AND opacity strictly DECREASE as tier increases (monotone)
//   - opacity floor stays >= 0.84 ("opacity 과잉 금지" — depth should read as
//     atmosphere, not as a faded-out node)
//
// Pure, synchronous, no i18n / lexicon surface.

export interface DepthStyle {
  /** CSS `filter: saturate(x)` multiplier (web-only in NavGraph; native ignores). */
  saturate: number;
  /** Multiplier folded into the ART-layer opacity (both web + native). */
  opacity: number;
}

const DEPTH_BY_TIER: Record<1 | 2 | 3 | 4, DepthStyle> = {
  1: { saturate: 1.0, opacity: 1.0 },
  2: { saturate: 0.92, opacity: 0.97 },
  3: { saturate: 0.82, opacity: 0.9 },
  4: { saturate: 0.74, opacity: 0.84 },
};

/**
 * Depth style (saturate + opacity) for a graph tier. tier1 is the Soul Core and
 * is always full (1.0 / 1.0). Deeper tiers desaturate + fade toward the floor.
 */
export function depthStyleForTier(tier: 1 | 2 | 3 | 4): DepthStyle {
  return DEPTH_BY_TIER[tier];
}
