// Layer C aggregate for the constellation home (PRD §4.4). The 북극성 (Polaris)
// reading is the mean of the 7 DOMAIN star levels + a small all-lit bonus — the
// SAME formula as soulCoreBrightness (stars.ts), but over the domain axis (layer A)
// instead of the construct axis. Per the brightness-honesty rule the headline
// number means "how much of my life is mapped" (domain coverage), nothing more —
// construct confidence (layer B) governs persona claim strength elsewhere, never
// this number. Deterministic, LLM-free.
//
// domainStarLevels() turns per-domain entries into the per-star L1~L5 the home
// renders; northStarBrightness() aggregates those into the Polaris glow.

import { type LadderLevel, brightnessFraction } from "./brightness";
import { domainLevel } from "./domain-confidence";
import { DOMAIN_STARS, type DomainEntry, type DomainId } from "./domain-stars";

// Mirrors stars.ts soulCoreBrightness: breadth (all seven known a little) outshines
// one deep spike, so every-domain-lit earns a small bonus.
const ALL_LIT_BONUS = 0.05;

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

/** 북극성 headline brightness 0-1 = mean of the 7 domain brightnesses + all-lit
 *  bonus when every domain is >= L2. Missing domains count as L1. Mirrors
 *  soulCoreBrightness exactly, over the domain axis. */
export function northStarBrightness(levels: Partial<Record<DomainId, LadderLevel>>): number {
  const perStar = DOMAIN_STARS.map((d) => levels[d.id] ?? 1) as LadderLevel[];
  const mean = perStar.reduce((sum, l) => sum + brightnessFraction(l), 0) / perStar.length;
  const allLit = perStar.every((l) => l >= 2);
  return Math.min(1, mean + (allLit ? ALL_LIT_BONUS : 0));
}
