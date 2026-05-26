// Compute the delta between a wiki page's current outgoing wiki_links and
// the slugs its body_md currently references. Pure function — the queries
// layer wraps this with a Supabase round-trip.
//
// The diff classifies every desired slug into one of:
//   - resolved + already-linked → no-op
//   - resolved + not-yet-linked → add edge
//   - unresolved (no page with that slug exists) → dangling
// And every current edge whose target is no longer in the body → remove.

export interface LinkDiffInput {
  /** Outgoing edges currently in wiki_links. */
  currentEdges: { to_page_id: string; to_slug: string }[];
  /** Slugs extracted from the page body (after extractWikilinkSlugs). */
  desiredSlugs: string[];
  /** Slug → page_id map for every wiki page that exists for this user. */
  knownPagesBySlug: Map<string, string>;
  /** The page being synced (excluded from add/remove sets to forbid self-edges). */
  fromPageId: string;
}

export interface LinkDiff {
  /** Page ids of new edges to insert. */
  toAddIds: string[];
  /** Page ids of edges to delete. */
  toRemoveIds: string[];
  /** Slugs the body references that don't resolve to any known page. */
  danglingSlugs: string[];
}

export function diffWikiLinks(input: LinkDiffInput): LinkDiff {
  const { currentEdges, desiredSlugs, knownPagesBySlug, fromPageId } = input;

  const desiredIds = new Set<string>();
  const dangling: string[] = [];
  const seenDangling = new Set<string>();

  for (const slug of desiredSlugs) {
    const pageId = knownPagesBySlug.get(slug);
    if (pageId === undefined) {
      if (!seenDangling.has(slug)) {
        seenDangling.add(slug);
        dangling.push(slug);
      }
      continue;
    }
    // CHECK (from_page <> to_page) — silently drop self-links rather than
    // pass them to the DB and surface a constraint error to the user.
    if (pageId === fromPageId) continue;
    desiredIds.add(pageId);
  }

  const currentIds = new Set(currentEdges.map((e) => e.to_page_id));

  const toAddIds: string[] = [];
  for (const id of desiredIds) if (!currentIds.has(id)) toAddIds.push(id);

  const toRemoveIds: string[] = [];
  for (const id of currentIds) if (!desiredIds.has(id)) toRemoveIds.push(id);

  return { toAddIds, toRemoveIds, danglingSlugs: dangling };
}
