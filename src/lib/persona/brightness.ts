// Deterministic value-ladder brightness (L1-L5) for a self-understanding axis.
// One ordinal scale = brightness = data quality = source trust = drill-stop,
// per CONTEXT.md "The value ladder L1 to L5". This is pure and LLM-free: it
// consumes the existing TraitConfidence (from traitConfidenceFor) so an LLM can
// never invent a score - the INSTRUMENT layer alone decides the level. L5 is
// reached only by user ratification (the propose -> ratify loop); cross-source
// agreement (>=2 independent elicitation paths converging) lifts an axis one
// tier, capped at 5.

import type { TraitConfidence } from "./build";

export type LadderLevel = 1 | 2 | 3 | 4 | 5;

export interface BrightnessInput {
  /** Per-axis confidence from traitConfidenceFor(). */
  confidence: TraitConfidence;
  /** True when >=2 independent elicitation paths agree (triangulation). +1 tier. */
  crossSourceAgreement?: boolean;
  /** True when the user has ratified a self-model change for this axis. -> L5. */
  ratified?: boolean;
}

// Base ladder level from a single confidence reading (no cross-source, no
// ratify). Mirrors the CONTEXT.md ladder: default -> L1, journal 1-4 obs (low)
// -> L2, 5-14 (medium) -> L3, >=15 (high) -> L4, validated instrument -> L4.
export function baseLevelFor(c: TraitConfidence): LadderLevel {
  if (c.source === "default") return 1;
  if (c.source === "questionnaire") return 4; // validated instrument (BFI / ECR-S)
  // journal_text scales with observation count via its confidence band.
  return c.confidence === "high" ? 4 : c.confidence === "medium" ? 3 : 2;
}

// Brightness as an L1-L5 level. Ratification is the only path to L5; otherwise
// the base level, lifted one tier (capped at 5) when independent paths agree.
export function ladderLevel(input: BrightnessInput): LadderLevel {
  if (input.ratified) return 5;
  const base = baseLevelFor(input.confidence);
  if (input.crossSourceAgreement) {
    return Math.min(5, base + 1) as LadderLevel;
  }
  return base;
}

// Brightness as a 0-1 fraction (L1 = 0.2 ... L5 = 1.0) for rendering star /
// node glow + opacity. Matches the canon 20 / 40 / 60 / 80 / 100 percent.
export function brightnessFraction(level: LadderLevel): number {
  return level * 0.2;
}
