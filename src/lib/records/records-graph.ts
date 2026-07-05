// Phase 1 (D-27, 2026-07-05): records tag-graph view-model.
//
// D-27 ratified that the semantic/connection graph's node-set is `records`, not
// `wiki_pages` (which is near-empty for a normal user, so "연결 제안 찾기" found
// nothing). This ports the proto sb-wikigraph buildGraph tag-link logic
// (public/proto/sb-wikigraph.jsx:47-56) over the user's real records:
//   nodes = 북극성(polaris) + the 7 domain stars + one node per record
//   edges = spine   (polaris -> domain star)
//           branch  (domain star -> its records)
//           link    (cross-domain record<->record that share a user tag) — the
//                    VISIBLE "connection" surface the proto draws as dashed edges.
//
// Pure, deterministic, unit-testable: NO LLM, NO embeddings, NO schema change, no
// egress. This is the Phase-1 first-run floor (works from record #2, $0). The
// embedding/kNN semantic layer is the separate, consent+cost-gated Phase 2.

import {
  DOMAIN_STARS,
  DOMAIN_TAG_PREFIX,
  getDomainStar,
  isDomainId,
  stripDomainTags,
  type DomainId,
} from "../persona/domain-stars";

export type RecordsGraphNodeKind = "polaris" | "domain" | "record";
export type RecordsGraphEdgeKind = "spine" | "branch" | "link";

export interface RecordsGraphNode {
  id: string;
  kind: RecordsGraphNodeKind;
  label: string;
  /** present on domain + record nodes (the star the record hangs under) */
  domain?: DomainId;
}

export interface RecordsGraphEdge {
  a: string;
  b: string;
  kind: RecordsGraphEdgeKind;
  /** the shared user tag that produced a cross-domain 'link' edge */
  tag?: string;
}

export interface RecordsGraph {
  nodes: RecordsGraphNode[];
  edges: RecordsGraphEdge[];
}

/** Minimal record shape the graph needs (subset of TimelineRecord / RecordRow). */
export interface GraphRecord {
  id: string;
  topic?: string | null;
  summary?: string | null;
  tags?: string[] | null;
}

export interface BuildRecordsGraphOptions {
  locale?: "en" | "ko";
  /** render all 7 stars even if a star has no records (default false: only stars
   *  with records, so a new user does not see 6 empty spokes). */
  includeEmptyDomains?: boolean;
  /** cap on cross-domain link edges (O(n^2) worst case) to bound huge corpora. */
  maxLinks?: number;
}

const POLARIS_ID = "polaris";
const DEFAULT_MAX_LINKS = 400;

/** The record's domain from its reserved `domain:<slug>` tag; 'collect' fallback. */
export function recordDomain(tags: readonly string[] | null | undefined): DomainId {
  for (const t of tags ?? []) {
    if (t.startsWith(DOMAIN_TAG_PREFIX)) {
      const slug = t.slice(DOMAIN_TAG_PREFIX.length);
      if (isDomainId(slug)) return slug;
    }
  }
  return "collect";
}

function starLabel(id: DomainId, locale: "en" | "ko"): string {
  const s = getDomainStar(id);
  return locale === "ko" ? s.nameKo : s.nameEn;
}

function recordLabel(r: GraphRecord, locale: "en" | "ko"): string {
  const t = (r.topic ?? r.summary ?? "").trim();
  if (t.length > 0) return t;
  return locale === "ko" ? "(제목 없음)" : "(untitled)";
}

export function buildRecordsGraph(
  records: readonly GraphRecord[],
  opts: BuildRecordsGraphOptions = {},
): RecordsGraph {
  const locale = opts.locale ?? "en";
  const maxLinks = opts.maxLinks ?? DEFAULT_MAX_LINKS;

  const nodes: RecordsGraphNode[] = [
    { id: POLARIS_ID, kind: "polaris", label: locale === "ko" ? "북극성" : "North Star" },
  ];
  const edges: RecordsGraphEdge[] = [];

  // Annotate each record with its domain + user (non-domain) tags once.
  const annotated = records.map((r) => ({
    r,
    domain: recordDomain(r.tags),
    tags: stripDomainTags(r.tags ?? []),
  }));

  // Domain stars: keep DOMAIN_STARS order (Big Dipper). Only stars that carry a
  // record unless includeEmptyDomains.
  const used = new Set<DomainId>(annotated.map((a) => a.domain));
  for (const star of DOMAIN_STARS) {
    if (!opts.includeEmptyDomains && !used.has(star.id)) continue;
    const domId = `domain:${star.id}`;
    nodes.push({ id: domId, kind: "domain", label: starLabel(star.id, locale), domain: star.id });
    edges.push({ a: POLARIS_ID, b: domId, kind: "spine" });
  }

  // Record nodes + their branch edge to the owning domain star.
  for (const a of annotated) {
    nodes.push({ id: a.r.id, kind: "record", label: recordLabel(a.r, locale), domain: a.domain });
    edges.push({ a: `domain:${a.domain}`, b: a.r.id, kind: "branch" });
  }

  // Cross-domain shared-tag links (proto sb-wikigraph:50-56). Only records in
  // DIFFERENT domains that share a user tag; the first shared tag labels the edge.
  let linkCount = 0;
  for (let i = 0; i < annotated.length && linkCount < maxLinks; i++) {
    for (let j = i + 1; j < annotated.length && linkCount < maxLinks; j++) {
      const A = annotated[i];
      const B = annotated[j];
      if (A.domain === B.domain) continue;
      const shared = A.tags.find((t) => B.tags.includes(t));
      if (shared) {
        edges.push({ a: A.r.id, b: B.r.id, kind: "link", tag: shared });
        linkCount++;
      }
    }
  }

  return { nodes, edges };
}
