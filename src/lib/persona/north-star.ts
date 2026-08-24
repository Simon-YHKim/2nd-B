// Layer C aggregate for the constellation home (PRD §4.4). The 북극성 (Polaris)
// reading is the mean of the SIX home domain star levels + a small all-lit bonus.
// It shares the SHAPE of soulCoreBrightness (stars.ts) but not its input set: that
// one runs over the construct axis (layer B), this one over the six domain stars
// the home actually draws (layer A). The 7-domain persona synthesis is a separate
// contract and does not feed this number. Per the brightness-honesty rule the headline
// number means "how much of my life is mapped" (domain coverage), nothing more —
// construct confidence (layer B) governs persona claim strength elsewhere, never
// this number. Deterministic, LLM-free.
//
// domainStarLevels() turns per-domain entries into the per-star L1~L5 the home
// renders; northStarBrightness() aggregates those into the Polaris glow.

import { canonPolarisBrightness } from "../canon";
import { type LadderLevel, brightnessFraction } from "./brightness";
import { domainLevel } from "./domain-confidence";
import { DOMAIN_STARS, type DomainEntry, type DomainId } from "./domain-stars";
import { isSevenStarId, type SevenStarId } from "./seven-stars";

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

/**
 * 북극성이 평균하는 별들 — 홈이 **그리는** 자리 중 프로필을 뺀 여섯.
 *
 * ⚠ 2026-08-24 에 구성원이 통째로 바뀌었다. 예전에는 여섯 생활 도메인
 * (커리어·재정·성장·관계·건강·휴식)이었는데, 그 도메인들이 별자리에서 내려가
 * 대시보드로 갔다. 지금은 **나를 알아가는 여섯 자리**다.
 *
 * 규칙 자체(그리는 것만 평균한다)는 Simon 의 2026-07-29 결정 그대로다. 바뀐 것은
 * 무엇이 그려지는가뿐이고, 이 모듈이 캐논에서 읽으므로 **숫자와 그림이 갈라질 수
 * 없다** -- 그게 이 파일이 캐논을 읽는 이유다.
 *
 * 프로필은 여전히 빠진다: 나를 **설명하는** 자리이지 **증거**가 아니라서,
 * 평균에 넣으면 페르소나가 부분적으로 자기 자신의 평균이 된다.
 */
export const HEADLINE_STAR_IDS: readonly HeadlineStarId[] = CANON.includedDomainIds.filter(
  (id): id is HeadlineStarId => isSevenStarId(id) && id !== "profile",
);

/** 평균에 들어가는 별. 프로필은 제외된다. */
export type HeadlineStarId = Exclude<SevenStarId, "profile">;

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

/** 북극성 밝기 0~1 = 홈이 **그리는** 여섯 별 밝기의 평균 + 전부 켜졌을 때의 보너스.
 *  없는 별은 L1 로 센다(어두운 별은 어두운 채로). 사용자가 볼 수 없는 것이
 *  볼 수 있는 숫자를 움직이지 못한다 -- 그게 이 함수의 유일한 규율이다. */
export function northStarBrightness(levels: Partial<Record<HeadlineStarId, LadderLevel>>): number {
  const perStar = HEADLINE_STAR_IDS.map((id) => levels[id] ?? 1) as LadderLevel[];
  const mean = perStar.reduce((sum, l) => sum + brightnessFraction(l), 0) / perStar.length;
  const allLit = perStar.every((l) => l >= ALL_LIT_MIN_LEVEL);
  return Math.min(1, mean + (allLit ? ALL_LIT_BONUS : 0));
}
