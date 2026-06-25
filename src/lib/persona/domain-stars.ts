// Layer A of the constellation 3-layer model (PRD §4.2, docs/CONSTELLATION-DESIGN.md
// §2): the seven DOMAIN stars the user puts life data INTO. These are the visible
// Big Dipper stars on the home — distinct from the layer-B psychological constructs
// in stars.ts (SELF_UNDERSTANDING_STARS), which are the hidden validation layer
// behind 북극성 (layer C). Each domain = a 4-slot contract (입력 → 출력 + 리스트업 +
// 검증 피드). Brightness is coverage-driven (domain-confidence.ts), per the
// brightness-honesty rule: the home star light = "how much I put in", NOT how
// validated the inference is.
//
// NOT to be confused with the legacy internal domain keys (work/relation/knowledge/
// records/taste) that persist only as data tags — these seven domain slugs are the
// new surface model and are not 1:1 with the old keys.

export type DomainId =
  | "career"
  | "finance"
  | "growth"
  | "relation"
  | "health"
  | "recreation"
  | "collect";

export interface DomainStar {
  id: DomainId;
  index: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Stable slug for [[wikilink]] citations + routes (kept === id). */
  slug: DomainId;
  nameKo: string;
  nameEn: string;
}

// Canonical seven (CONSTELLATION-DESIGN §13 slug set). Order = the Big Dipper
// rendering order; exact star coordinates are owned by constellation-home.ts and
// fixed in Phase 4 (§17-e). The "collect" (담아내기) star is the catch-all router.
export const DOMAIN_STARS: readonly DomainStar[] = [
  { id: "career", index: 1, slug: "career", nameKo: "커리어", nameEn: "Career" },
  { id: "finance", index: 2, slug: "finance", nameKo: "재정", nameEn: "Finance" },
  { id: "growth", index: 3, slug: "growth", nameKo: "성장", nameEn: "Growth" },
  { id: "relation", index: 4, slug: "relation", nameKo: "관계", nameEn: "Relationships" },
  { id: "health", index: 5, slug: "health", nameKo: "건강", nameEn: "Health" },
  { id: "recreation", index: 6, slug: "recreation", nameKo: "오락", nameEn: "Recreation" },
  { id: "collect", index: 7, slug: "collect", nameKo: "담아내기", nameEn: "Collect" },
] as const;

export const DOMAIN_COUNT = 7 as const;

const DOMAIN_BY_ID = Object.fromEntries(
  DOMAIN_STARS.map((d) => [d.id, d]),
) as Record<DomainId, DomainStar>;

export function getDomainStar(id: DomainId): DomainStar {
  return DOMAIN_BY_ID[id];
}

export function isDomainId(value: string): value is DomainId {
  return Object.prototype.hasOwnProperty.call(DOMAIN_BY_ID, value);
}

// A single life-data item under a domain star — the unit domain-confidence counts.
// Minimal by design; real records carry more, but coverage + organized-ratio is all
// the v1 brightness adapter needs. `category`/`tags` presence marks the item as
// organized (리스트업), which feeds the ②internal-consistency signal (§4.5).
export interface DomainEntry {
  domain: DomainId;
  /** ISO timestamp; reserved for v1.1 recency decay (§4.5 ④최신성, deferred). */
  createdAt?: string;
  category?: string | null;
  tags?: string[] | null;
}
