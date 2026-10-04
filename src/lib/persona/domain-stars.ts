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
  // rev2 (PRD v2.0): domain 6 reframed 오락 -> 휴식 (rest). Code id/slug stays `recreation`.
  { id: "recreation", index: 6, slug: "recreation", nameKo: "휴식", nameEn: "Rest" },
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

// The reserved tag namespace that carries a record's domain slug in the shared
// records.tags[] column (the no-migration tag convention, PRD §15 M-migrate).
// It is an INTERNAL classification tag, orthogonal to user content tags: any
// consumer that keyword-classifies or DISPLAYS tags must ignore it (legacy graph
// village routing, wiki export, interest trends, tag chips) so the new layer-A
// namespace never pollutes the legacy taxonomy or leaks into user-facing copy.
export const DOMAIN_TAG_PREFIX = "domain:";

/** The canonical tag string for a domain (what capture writes + /records?tags= matches). */
export function domainTagFor(id: DomainId): string {
  return `${DOMAIN_TAG_PREFIX}${id}`;
}

/** True for a reserved domain: tag (case-insensitive). */
export function isDomainTag(tag: string): boolean {
  return tag.toLowerCase().startsWith(DOMAIN_TAG_PREFIX);
}

/** Drop reserved domain: tags, leaving only user/content tags. The filter every
 *  legacy tag consumer applies so the domain namespace stays invisible to them. */
export function stripDomainTags(tags: readonly string[]): string[] {
  return tags.filter((t) => !isDomainTag(t));
}

// Tags the APP writes to say how or where a record was captured, never a topic
// the user chose. QA 261004 D-07: /discover and /research showed first_light,
// first_light:affirm and interview as the user's "interests" because they
// stripped domain: only. One rule, so every consumer that counts or displays
// tags as user topics agrees on what is scaffolding.
//
// The user can type any hashtag (capture's sanitizeChips rejects only domain:),
// and an LLM-suggested or hand-typed "interview" or "todo" is a real topic.
// So a tag is judged with the record it sits on, never by its spelling alone
// (gate SG-01 / BL-01):
//
// 1. Reserved namespaces. A tag in one of these is the app's by construction:
//      domain:<slug>          the domain namespace (isDomainTag)
//      first_light:<choice>   the first-run TTFV note (TTFVScreen)
//      entry-ui:<locale>      the UI language the recall interview ran in
// 2. Bare words the app also writes. Each is dropped only when the record
//    itself proves the app wrote that copy; otherwise it stays a user topic:
//      first_light            beside a first_light:<choice> tag (TTFV always
//                               writes the pair)
//      interview / recall /   on a kind "audit_response" record (the recall
//      screener                 interview; no hashtag input writes that kind)
//      voice / todo           on a kind "note" record as its first tag outside
//                               the reserved namespaces (capture writes
//                               [mode, ...hashtags] and createRecord puts the
//                               one domain: tag before it)
// Storage readers (assess completionTags, career-timeline entry-ui, TTFV
// isFirstLight) keep reading the raw tags; only topic surfaces strip these.
const APP_TAG_NAMESPACES: readonly string[] = [DOMAIN_TAG_PREFIX, "first_light:", "entry-ui:"];
const AUDIT_RESPONSE_TAGS: ReadonlySet<string> = new Set(["interview", "recall", "screener"]);
const CAPTURE_MODE_TAGS: ReadonlySet<string> = new Set(["voice", "todo"]);

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** True for a tag in a namespace only the app writes (domain:, first_light:,
 *  entry-ui:). A bare word is never judged here: see stripSystemTags. */
export function isReservedAppTag(tag: string): boolean {
  const t = normalizeTag(tag);
  return APP_TAG_NAMESPACES.some((p) => t.startsWith(p));
}

/** What a caller knows about the record a tag list came from. `kind` is
 *  records.kind; leave it out when unknown, and the bare words that need proof
 *  then stay as the user's own. */
export interface TagOrigin {
  kind?: string | null;
}

/** Drop the app-written scaffolding tags of ONE record, leaving the user's own
 *  topic tags. Pass the whole tag list of that record plus its kind. */
export function stripSystemTags(tags: readonly string[], origin: TagOrigin = {}): string[] {
  const norm = tags.map(normalizeTag);
  const reserved = norm.map((t) => APP_TAG_NAMESPACES.some((p) => t.startsWith(p)));
  const hasTtfvChoice = norm.some((t) => t.startsWith("first_light:"));
  const modeIndex = origin.kind === "note" ? reserved.indexOf(false) : -1;
  return tags.filter((_, i) => {
    const t = norm[i];
    if (reserved[i]) return false;
    if (t === "first_light" && hasTtfvChoice) return false;
    if (AUDIT_RESPONSE_TAGS.has(t) && origin.kind === "audit_response") return false;
    if (CAPTURE_MODE_TAGS.has(t) && i === modeIndex) return false;
    return true;
  });
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
