// D-27 Phase 1c — feed /research from RECORDS, the ratified node-set.
//
// D-27 (2026-07-05) settled that the connection graph runs on the user's
// `records`, not `wiki_pages`, because wiki_pages is near-empty for a normal
// user. /records took that migration (RecordsGraph, Phase 1b). /research never
// did: it kept reading the wiki track, so it counted a table that has never had
// a single row in production while telling the user, in its own copy, that it
// connects their 기록. An account holding 138 records still read
// "아직 이어줄 기록이 없어요".
//
// Rather than rebuild the research view-model, this adapter re-expresses the
// records tag-graph in the shapes buildDeepResearchView already consumes
// (WikiPageRow + WikiEdge). Everything downstream — hubs, clusters, orphans,
// islands, the surprise pick — then works unchanged over real records.
//
// Same guarantees as buildRecordsGraph, which does the actual work: pure,
// deterministic, NO LLM, NO embeddings, no egress, no schema change. It works
// from record #2 and costs $0, which is why it is the first-run floor rather
// than the consent-and-cost-gated kNN layer.

import { buildRecordsGraph, type GraphRecord } from "./records-graph";
import type { WikiPageRow } from "../wiki/types";

/** Structural mirror of wiki-graph-view's WikiEdge (kept local to avoid a
 *  lib -> screens import; the screen passes these straight through). */
export interface ResearchEdge {
  from_page: string;
  to_page: string;
}

export interface RecordsResearchGraph {
  pages: WikiPageRow[];
  edges: ResearchEdge[];
}

export interface RecordsResearchOptions {
  locale?: "en" | "ko";
  /** Cap on cross-domain tag links, forwarded to buildRecordsGraph. */
  maxLinks?: number;
}

/**
 * Adapt the user's records into the (pages, edges) pair the research view eats.
 *
 * A record becomes a page row carrying only the fields the view actually reads
 * — id, title, tags — with the rest filled to schema-valid blanks. Nothing here
 * is written back to the database: these rows exist for the duration of one
 * render and never touch `wiki_pages`, so promoting records into the wiki table
 * (which D-27 rejected) is not smuggled in through the back door.
 *
 * Edges are the cross-domain shared-tag links, the same ones RecordsGraph draws
 * dashed. Spine and branch edges are deliberately dropped: an edge from 북극성
 * to a domain star is scaffolding, not a discovered connection, and counting it
 * would inflate "N개의 연결을 찾았어요" with structure the user did not create.
 */
export function recordsToResearchGraph(
  records: readonly GraphRecord[],
  opts: RecordsResearchOptions = {},
): RecordsResearchGraph {
  const graph = buildRecordsGraph(records, {
    locale: opts.locale ?? "en",
    ...(opts.maxLinks === undefined ? {} : { maxLinks: opts.maxLinks }),
  });

  const byId = new Map(records.map((r) => [r.id, r]));
  const pages: WikiPageRow[] = [];

  for (const node of graph.nodes) {
    if (node.kind !== "record") continue;
    const source = byId.get(node.id);
    const tags = (source?.tags ?? []).filter((t): t is string => typeof t === "string");
    pages.push({
      id: node.id,
      user_id: "",
      slug: node.id,
      // Synthetic rows, never persisted. "concept" is the closest of the three
      // legal kinds: a record is the user's own thought, not an ingested source.
      kind: "concept",
      title: node.label,
      body_md: (source?.summary ?? "").trim(),
      frontmatter: {},
      tags,
      source_id: null,
      created_at: "",
      updated_at: "",
    });
  }

  const edges: ResearchEdge[] = graph.edges
    .filter((e) => e.kind === "link")
    .map((e) => ({ from_page: e.a, to_page: e.b }));

  return { pages, edges };
}
