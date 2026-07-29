// Layer C aggregate for the constellation home (PRD §4.4). The 북극성 (Polaris)
// reading is the mean of the visible home domain stars + a small all-lit bonus.
// It is NOT the same formula as soulCoreBrightness (stars.ts): that older layer-B
// construct aggregate still spans seven evidence axes, while this layer-A home
// headline follows the canon's includedDomainIds and excludes collect. Per the
// brightness-honesty rule the headline number means "how much of my visible life
// domains are mapped", nothing more — construct confidence (layer B) governs
// persona claim strength elsewhere, never this number. Deterministic, LLM-free.
//
// domainStarLevels() turns per-domain entries into the per-star L1~L5 the home
// renders; northStarBrightness() aggregates those into the Polaris glow.

import { canonPolarisBrightness } from "../canon";
import { type LadderLevel, brightnessFraction } from "./brightness";
import { domainLevel } from "./domain-confidence";
import { DOMAIN_STARS, isDomainId, type DomainEntry, type DomainId } from "./domain-stars";

// The headline's input set is NOT "every domain" — it is "every domain the home
// actually draws", and that set lives in the canon
// (public/proto/data/core/constellation.json -> polarisBrightness), not here.
// Simon decided it on 2026-07-29 03:44; S4 recorded it in the canon; this module
// reads it so the number and the picture can never drift apart.
//
// Why it matters concretely: detect-domain.ts sends every capture that matches no
// keyword to `collect`, and `collect` is not a home star. Averaging it in meant a
// user whose writing never tripped a keyword watched Polaris brighten while all
// six stars they can see stayed dark. Measured on the QA account 2026-07-29:
// 0.7929 with collect vs 0.7333 without (before the all-lit bonus).
const CANON = canonPolarisBrightness;
const ALL_LIT_BONUS = CANON.allLitBonus;
const ALL_LIT_MIN_LEVEL = CANON.allLitMinimumLevel;

/** The domain stars the home draws, in canon order. Excludes `collect` (a data
 *  domain that is not a home star) and never includes `museum` (a portal, not a
 *  domain, so it has no level to average). */
export const HEADLINE_DOMAIN_IDS: readonly DomainId[] = CANON.includedDomainIds.filter(
  (id): id is DomainId => isDomainId(id),
);

export interface DomainStarOpts {
  crossSourceAgreement?: boolean;
  ratified?: boolean;
}

/** Per-domain L1~L5 levels for all 7 stars. Domains with no entries default to L1
 *  (honest: a dark star stays dark). Per-domain ratify / cross-source flags thread
 *  through domainLevel() so propose->ratify (L5) and triangulation still apply.
 *
 *  `now` (epoch ms) is OPT-IN and forwarded into every domain's recency check
 *  (domain-confidence.ts §4.5 ④): a domain whose newest entry is older than the
 *  staleness window dims one band. Omitting `now` keeps the function pure and every
 *  existing caller unchanged — only the Supabase-read boundary (loadDomainLevels)
 *  injects a real Date.now(), so recency stays live without polluting this module. */
export function domainStarLevels(
  entriesByDomain: Partial<Record<DomainId, readonly DomainEntry[]>>,
  opts: Partial<Record<DomainId, DomainStarOpts>> = {},
  now?: number,
): Record<DomainId, LadderLevel> {
  const out = {} as Record<DomainId, LadderLevel>;
  for (const d of DOMAIN_STARS) {
    out[d.id] = domainLevel(entriesByDomain[d.id] ?? [], { ...(opts[d.id] ?? {}), now });
  }
  return out;
}

/** 북극성 headline brightness 0-1 = mean of the brightnesses of the domains the
 *  home DRAWS, plus the all-lit bonus when every one of those is >= the canon's
 *  minimum. Missing domains count as L1. `collect` is excluded from both the mean
 *  and the bonus test (canon polarisBrightness.excludedDomainIds), so a domain the
 *  user cannot see can never move the number they can. */
export function northStarBrightness(levels: Partial<Record<DomainId, LadderLevel>>): number {
  const perStar = HEADLINE_DOMAIN_IDS.map((id) => levels[id] ?? 1) as LadderLevel[];
  const mean = perStar.reduce((sum, l) => sum + brightnessFraction(l), 0) / perStar.length;
  const allLit = perStar.every((l) => l >= ALL_LIT_MIN_LEVEL);
  return Math.min(1, mean + (allLit ? ALL_LIT_BONUS : 0));
}
