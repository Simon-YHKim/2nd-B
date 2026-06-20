// Presentation mapping: a value-ladder level (L1-L5) -> deterministic visual
// props for rendering a star / node in the constellation home + persona card.
// Stays text-free (no user-facing strings) for i18n safety - the localized
// label lives in locale files keyed by levelId, mirroring the CONTEXT.md ladder
// (L1 raw / L2 tagged / L3 connected / L4 crosschecked / L5 actionable).

import { type LadderLevel, brightnessFraction } from "./brightness";

export const LADDER_LEVEL_ID: Record<LadderLevel, string> = {
  1: "raw",
  2: "tagged",
  3: "connected",
  4: "crosschecked",
  5: "actionable",
};

export interface BrightnessVisual {
  /** 0.2 .. 1.0 fill + glow opacity (canon 20-100%). */
  opacity: number;
  /** Relative glow radius multiplier, dim (L1) to bright (L5). */
  glowScale: number;
  /** Stable level id for i18n label lookup / analytics. */
  levelId: string;
  /** Whether the node reads as "lit" (>= L2), matching the Soul Core all-lit rule. */
  lit: boolean;
}

export function brightnessVisual(level: LadderLevel): BrightnessVisual {
  return {
    opacity: brightnessFraction(level),
    glowScale: 0.6 + level * 0.18, // L1 ~0.78 .. L5 ~1.5
    levelId: LADDER_LEVEL_ID[level],
    lit: level >= 2,
  };
}

// Coarse qualitative band for an aggregate 0-1 brightness. Identity surfaces show
// "how lit" the Soul Core / a trait is WITHOUT a raw percentage, because a number
// on an identity card reads as a self-score (D-25: no self-quantifying % on
// identity surfaces). Stays text-free (returns a stable id; the localized word
// lives at the call site). Thresholds follow the canon ladder (L2 0.4 / L3 0.6).
export type BrightnessBand = "dim" | "fair" | "bright";

export function brightnessBand(fraction: number): BrightnessBand {
  if (fraction >= 0.6) return "bright";
  if (fraction >= 0.4) return "fair";
  return "dim";
}
