// Phase 1.5: materialize entity/concept pages + link the source to them.
//
// Phase 2 (`generateSourcePage`) promotes a `sources` row to a single
// `kind='source'` wiki page and folds Phase 1 `concepts` into that page's
// tags. It does NOT turn the Phase 1 `entities[]` / `concepts[]` into their
// own graph nodes, so the wiki graph is source-pages-only and the
// god-node / cluster stats in `graph-stats.ts` have nothing to chew on.
//
// This module closes that gap. For each extracted entity and concept it
// get-or-creates a `kind='entity'|'concept'` page (idempotent on
// (user_id, slug)) and draws a `wiki_links` edge from the source page to it.
//
// Invariants:
//   - Never overwrites an existing page body. A name that already has a page
//     (any kind) is reused as-is — only the edge is (idempotently) added.
//   - Dedupe by slug within a single run; skip empty names and self-links.
//   - Only NEW edges are inserted (diffed against the page's current
//     out-edges), so re-running on the same source is a no-op write.
//   - $0/mo, RLS-scoped (user_id on every row), no extra LLM call (C1/C3/C9
//     already satisfied by Phase 1).

import { getOutgoingLinks, getWikiPage, upsertWikiPage } from "./queries";
import { getSupabaseClient } from "../supabase/client";
import { slugForTitle } from "./slug";
import type { Phase1Result } from "./phase1";
import type { WikiPageKind, WikiPageRow } from "./types";

export interface MaterializeResult {
  /** New `kind='entity'` pages created this run. */
  entityPagesCreated: number;
  /** New `kind='concept'` pages created this run. */
  conceptPagesCreated: number;
  /** Names that already had a page (any kind) and were reused. */
  pagesReused: number;
  /** New source→node edges inserted (already-present edges are not recounted). */
  linksAdded: number;
}

const EMPTY: MaterializeResult = {
  entityPagesCreated: 0,
  conceptPagesCreated: 0,
  pagesReused: 0,
  linksAdded: 0,
};

interface NodeSpec {
  name: string;
  kind: Extract<WikiPageKind, "entity" | "concept">;
}

/**
 * Turn a source page's Phase 1 entities/concepts into graph nodes and link
 * the source to each. Safe to call repeatedly on the same source.
 *
 * @param userId  owner (must equal auth.uid(); RLS enforces it)
 * @param source  the already-upserted kind='source' page to link FROM
 * @param phase1  the source's Phase 1 extraction (entities[] + concepts[])
 */
export async function materializeGraphFromPhase1(
  userId: string,
  source: Pick<WikiPageRow, "id">,
  phase1: Pick<Phase1Result, "entities" | "concepts">,
): Promise<MaterializeResult> {
  // Order entities first, then concepts; first-seen slug wins so a name that is
  // both an entity and a concept materializes once (as an entity).
  const specs: NodeSpec[] = [
    ...phase1.entities.map((name): NodeSpec => ({ name, kind: "entity" })),
    ...phase1.concepts.map((name): NodeSpec => ({ name, kind: "concept" })),
  ];
  if (specs.length === 0) return { ...EMPTY };

  const result: MaterializeResult = { ...EMPTY };

  // slug → resolved target page id. Dedupes names that collapse to one slug
  // (e.g. "AI" / "ai") within this run, avoiding redundant round-trips.
  const resolved = new Map<string, string>();

  for (const spec of specs) {
    const name = spec.name.trim();
    if (name.length === 0) continue;
    const slug = slugForTitle(name);
    if (resolved.has(slug)) continue; // already handled this slug this run

    // get-or-create. NEVER overwrite an existing page's body/kind.
    const existing = await getWikiPage(userId, slug);
    if (existing) {
      resolved.set(slug, existing.id);
      result.pagesReused += 1;
      continue;
    }
    const created = await upsertWikiPage({
      user_id: userId,
      slug,
      kind: spec.kind,
      title: name,
      body_md: "",
      frontmatter: {},
      tags: [],
      source_id: null,
    });
    resolved.set(slug, created.id);
    if (spec.kind === "entity") result.entityPagesCreated += 1;
    else result.conceptPagesCreated += 1;
  }

  // Edge set: source → each resolved node, minus self-links and minus edges
  // that already exist (so re-runs don't churn the table).
  const targetIds = [...resolved.values()].filter((id) => id !== source.id);
  if (targetIds.length === 0) return result;

  const existingEdges = await getOutgoingLinks(userId, source.id);
  const existingTo = new Set(existingEdges.map((e) => e.to_page_id));
  const newTargets = [...new Set(targetIds)].filter((id) => !existingTo.has(id));
  if (newTargets.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("wiki_links")
    .insert(newTargets.map((to_page) => ({ user_id: userId, from_page: source.id, to_page })));
  if (error) throw error;
  result.linksAdded = newTargets.length;

  return result;
}
