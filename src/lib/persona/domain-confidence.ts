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

// §4.5 ④최신성 (recency): a domain the user has not fed in a long time should
// not stay as bright as one updated today — "how am I NOW", not "how was I".
// A domain whose newest entry is older than this drops one coverage band, the
// same one-step downgrade raw-heavy domains take. 60 days ≈ two months untouched.
const STALE_AFTER_DAYS = 60;
const DAY_MS = 86_400_000;

/** Epoch-ms of the newest dated entry, or null when none carry a parseable
 *  createdAt (undated entries cannot prove staleness, so they never dim). */
function newestEntryMs(entries: readonly DomainEntry[]): number | null {
  let newest = -Infinity;
  for (const e of entries) {
    const t = e.createdAt ? Date.parse(e.createdAt) : NaN;
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  return newest === -Infinity ? null : newest;
}

function isOrganized(e: DomainEntry): boolean {
  return Boolean(e.category) || (Array.isArray(e.tags) && e.tags.length > 0);
}

function downgrade(c: TraitConfidence["confidence"]): TraitConfidence["confidence"] {
  return c === "high" ? "medium" : "low";
}

/** Coverage + consistency (+ optional recency) → TraitConfidence, consumable by
 *  ladderLevel(). Bands mirror traitConfidenceFor: 0→default(L1), 1-4→low(L2),
 *  5-14→medium(L3), >=15→high(L4). Raw-heavy domains (organized-ratio < floor)
 *  drop one band. Recency (§4.5 ④) is OPT-IN and deterministic: only when the
 *  caller passes `now` (epoch ms) does a stale domain — newest entry older than
 *  staleAfterDays — drop a further band. Omitting `now` keeps the function pure
 *  (no Date.now()) and every existing caller unchanged. */
export function domainConfidence(
  entries: readonly DomainEntry[],
  opts: { now?: number; staleAfterDays?: number } = {},
): TraitConfidence {
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
  if (opts.now != null) {
    const newest = newestEntryMs(entries);
    const staleAfter = (opts.staleAfterDays ?? STALE_AFTER_DAYS) * DAY_MS;
    if (newest != null && opts.now - newest > staleAfter) {
      confidence = downgrade(confidence);
    }
  }
  return { source: "journal_text", confidence, observationCount };
}

/** The domain star's L1~L5 level. Threads domainConfidence through the existing
 *  ladderLevel() so cross-source agreement / ratification still apply when a caller
 *  supplies them (e.g. a domain validated by both an import and a manual entry, or
 *  a user-ratified domain → L5 via propose→ratify). */
export function domainLevel(
  entries: readonly DomainEntry[],
  opts: {
    crossSourceAgreement?: boolean;
    ratified?: boolean;
    now?: number;
    staleAfterDays?: number;
  } = {},
): LadderLevel {
  const { crossSourceAgreement, ratified, now, staleAfterDays } = opts;
  return ladderLevel({
    confidence: domainConfidence(entries, { now, staleAfterDays }),
    crossSourceAgreement,
    ratified,
  });
}

/** 0-1 brightness fraction (L1=0.2 … L5=1.0) for rendering the domain star glow. */
export function domainBrightnessFraction(
  entries: readonly DomainEntry[],
  opts: {
    crossSourceAgreement?: boolean;
    ratified?: boolean;
    now?: number;
    staleAfterDays?: number;
  } = {},
): number {
  return brightnessFraction(domainLevel(entries, opts));
}
