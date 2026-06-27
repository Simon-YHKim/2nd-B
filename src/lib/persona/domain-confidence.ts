// The keystone adapter (docs/CONSTELLATION-DESIGN.md §13, §4.5): turn a domain
// star's entries into a TraitConfidence so the EXISTING brightness.ts chain
// (baseLevelFor → ladderLevel → brightnessFraction) produces the domain's L1~L5
// with NO change to that chain. v1 scores ①coverage (entry-count band) +
// ②internal consistency (organized-ratio); ③cross-source and ④recency are
// deferred (§4.5). Deterministic, LLM-free — the INSTRUMENT layer alone sets the
// level, never an LLM (the brightness-honesty rule).

import type { TraitConfidence } from "./build";
import { ladderLevel, brightnessFraction, type LadderLevel } from "./brightness";
import type { DomainEntry } from "./domain-stars";

// Below this organized-ratio a domain is "raw-heavy": lots of unsorted captures
// with no category/tag. Per §4.5 ②, raw volume should not reach Information /
// Knowledge — we drop the coverage band one step so brightness reflects organized
// depth, not noise.
const ORGANIZED_RATIO_FLOOR = 0.5;

function isOrganized(e: DomainEntry): boolean {
  return Boolean(e.category) || (Array.isArray(e.tags) && e.tags.length > 0);
}

function downgrade(c: TraitConfidence["confidence"]): TraitConfidence["confidence"] {
  return c === "high" ? "medium" : "low";
}

/** Coverage + consistency → TraitConfidence, consumable by ladderLevel(). Bands
 *  mirror traitConfidenceFor: 0→default(L1), 1-4→low(L2), 5-14→medium(L3),
 *  >=15→high(L4). Raw-heavy domains (organized-ratio < floor) drop one band. */
export function domainConfidence(entries: readonly DomainEntry[]): TraitConfidence {
  const observationCount = entries.length;
  if (observationCount <= 0) {
    return { source: "default", confidence: "low", observationCount: 0 };
  }
  let confidence: TraitConfidence["confidence"] =
    observationCount >= 15 ? "high" : observationCount >= 5 ? "medium" : "low";
  const organizedRatio = entries.filter(isOrganized).length / observationCount;
  if (organizedRatio < ORGANIZED_RATIO_FLOOR) {
    confidence = downgrade(confidence);
  }
  return { source: "journal_text", confidence, observationCount };
}

/** The domain star's L1~L5 level. Threads domainConfidence through the existing
 *  ladderLevel() so cross-source agreement / ratification still apply when a caller
 *  supplies them (e.g. a domain validated by both an import and a manual entry, or
 *  a user-ratified domain → L5 via propose→ratify). */
export function domainLevel(
  entries: readonly DomainEntry[],
  opts: { crossSourceAgreement?: boolean; ratified?: boolean } = {},
): LadderLevel {
  return ladderLevel({ confidence: domainConfidence(entries), ...opts });
}

/** 0-1 brightness fraction (L1=0.2 … L5=1.0) for rendering the domain star glow. */
export function domainBrightnessFraction(
  entries: readonly DomainEntry[],
  opts: { crossSourceAgreement?: boolean; ratified?: boolean } = {},
): number {
  return brightnessFraction(domainLevel(entries, opts));
}
