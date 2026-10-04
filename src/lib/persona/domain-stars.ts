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
// A tag is the app's only when the record proves it (gate SG-01 / BL-01 /
// SG-03). Its spelling proves nothing: the user can type any hashtag except
// domain: (capture, record detail, /dashboard's capture from /capture?tag=).
// Neither does the record's kind alone (/audit answers are audit_response too,
// and record detail adds tags to any kind), nor "first tag of a note"
// (/dashboard's capture stores [<tag>], and record detail can give an untagged
// note its first tag). What does prove it:
//
// 1. domain:<slug>. createRecord strips it from the caller's tags and every tag
//    input refuses it, so a stored one is always the app's.
// 2. The exact array a writer stores, as the first of the record's tags.
//    createRecord stores [domain:<slug>, ...writer tags]; later the app only
//    moves domain: (record detail's Move puts it last) or puts domain: and
//    reasoning:ratified in front (/reasoning), and record detail appends the
//    user's tags at the end. Setting those two aside, the writer's array is
//    still the prefix:
//      TTFV first-run note    note            first_light, first_light:affirm|soft
//      recall interview       audit_response  interview, recall, screener[, entry-ui:ko|en]
//      drill interview        audit_response  interview, life_audit, period-<p>, ...
//        (before #745, 2026-07-05; only interview is a word this rule hides)
//      call reflection        note            call_reflection, voice
//        (only voice is a word this rule hides)
//    Record detail refuses the first_light: and entry-ui: namespaces
//    (isReservedAppTag), so the TTFV pair cannot be rebuilt by hand on an
//    untagged note.
// 3. Nothing else. A note whose first tag is voice or todo is UNCLEAR: capture's
//    voice/todo mode stores [mode, ...hashtags] and the deep-space CaptureView
//    stores [todo], but /dashboard's capture and record detail store the same
//    shape with the user's word. Topic surfaces keep it (stripSystemTags);
//    the brightness signal does not count it as the user organizing the record
//    (provenUserTags), as load-domain-levels never did.
// Storage readers (assess completionTags, career-timeline entry-ui, TTFV
// isFirstLight) keep reading the raw tags; only topic surfaces strip these.
const APP_TAG_NAMESPACES: readonly string[] = [DOMAIN_TAG_PREFIX, "first_light:", "entry-ui:"];
// /reasoning writes it beside domain: when the user ratifies a proposal
// (src/app/reasoning.tsx REASONING_RATIFIED_TAG).
const REASONING_RATIFIED_TAG = "reasoning:ratified";
const CAPTURE_MODE_TAGS: ReadonlySet<string> = new Set(["voice", "todo"]);

/** True for a tag in a namespace the app writes (domain:, first_light:,
 *  entry-ui:). Record detail refuses to add one by hand. It does not decide
 *  what a topic surface hides: see tagSources. */
export function isReservedAppTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return APP_TAG_NAMESPACES.some((p) => t.startsWith(p));
}

/** What a caller knows about the record a tag list came from. `kind` is
 *  records.kind; leave it out when unknown, and no writer's array can be
 *  proven, so only domain: is the app's. */
export interface TagOrigin {
  kind?: string | null;
}

/** "app": the record proves the app wrote it. "unclear": an app writer and a
 *  user path both store this shape. "user": nothing says the app wrote it. */
export type TagSource = "app" | "unclear" | "user";

/** Label every tag of ONE record (the whole list, plus its kind). */
export function tagSources(tags: readonly string[], origin: TagOrigin = {}): TagSource[] {
  const out: TagSource[] = tags.map((t) => (isDomainTag(t) ? "app" : "user"));
  // The writer's array, with the tags the app adds later set aside.
  const slots = tags.flatMap((t, i) => (out[i] === "user" && t !== REASONING_RATIFIED_TAG ? [i] : []));
  const at = (k: number): string | undefined => (k < slots.length ? tags[slots[k]] : undefined);
  const mark = (k: number, source: TagSource) => {
    out[slots[k]] = source;
  };
  if (origin.kind === "note") {
    if (at(0) === "first_light" && (at(1) === "first_light:affirm" || at(1) === "first_light:soft")) {
      mark(0, "app");
      mark(1, "app");
    } else if (at(0) === "call_reflection" && at(1) === "voice") {
      mark(1, "app");
    } else if (CAPTURE_MODE_TAGS.has(at(0) ?? "")) {
      mark(0, "unclear");
    }
  } else if (origin.kind === "audit_response") {
    if (at(0) === "interview" && at(1) === "recall" && at(2) === "screener") {
      mark(0, "app");
      mark(1, "app");
      mark(2, "app");
      if (at(3) === "entry-ui:ko" || at(3) === "entry-ui:en") mark(3, "app");
    } else if (at(0) === "interview" && at(1) === "life_audit" && (at(2) ?? "").startsWith("period-")) {
      mark(0, "app");
    }
  }
  return out;
}

/** Drop the app-written scaffolding tags of ONE record, for surfaces that show
 *  or link the user's topics. A tag the rule cannot prove is kept. */
export function stripSystemTags(tags: readonly string[], origin: TagOrigin = {}): string[] {
  const sources = tagSources(tags, origin);
  return tags.filter((_, i) => sources[i] !== "app");
}

/** Only the tags nothing says the app wrote: what counts as the user organizing
 *  that record. The unclear first tag of a note is left out. */
export function provenUserTags(tags: readonly string[], origin: TagOrigin = {}): string[] {
  const sources = tagSources(tags, origin);
  return tags.filter((_, i) => sources[i] === "user");
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
