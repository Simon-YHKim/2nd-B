// Compute network statistics for the wiki graph. Pure function so the
// UI can render an "at-a-glance" overview while we defer a force-directed
// SVG view to a follow-up that ships react-native-svg.
//
// Stats:
//   - countByKind: source/entity/concept page counts
//   - totalEdges: wiki_links count
//   - topHubs: pages with the most incoming links (in-degree)
//   - topTags: tags by frequency across pages
//   - orphans: pages with zero in + zero out edges

import type { WikiPageKind, WikiPageRow } from "./types";

export interface GraphStats {
  pageCount: number;
  edgeCount: number;
  countByKind: Record<WikiPageKind, number>;
  topHubs: { id: string; slug: string; title: string; inDegree: number }[];
  topTags: { tag: string; count: number }[];
  orphans: { id: string; slug: string; title: string }[];
}

export interface GraphStatsInput {
  pages: WikiPageRow[];
  edges: { from_page: string; to_page: string }[];
  /** How many hubs to surface. Defaults to 5. */
  topHubLimit?: number;
  /** How many tags to surface. Defaults to 10. */
  topTagLimit?: number;
}

export function computeGraphStats(input: GraphStatsInput): GraphStats {
  const { pages, edges } = input;
  const topHubLimit = input.topHubLimit ?? 5;
  const topTagLimit = input.topTagLimit ?? 10;

  const countByKind: Record<WikiPageKind, number> = { source: 0, entity: 0, concept: 0 };
  for (const p of pages) countByKind[p.kind] += 1;

  // In/out degree per page id.
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const e of edges) {
    inDegree.set(e.to_page, (inDegree.get(e.to_page) ?? 0) + 1);
    outDegree.set(e.from_page, (outDegree.get(e.from_page) ?? 0) + 1);
  }

  const pagesById = new Map(pages.map((p) => [p.id, p]));

  const topHubs = [...inDegree.entries()]
    .map(([id, deg]) => {
      const p = pagesById.get(id);
      if (!p) return null;
      return { id, slug: p.slug, title: p.title, inDegree: deg };
    })
    .filter((x): x is { id: string; slug: string; title: string; inDegree: number } => x !== null)
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, topHubLimit);

  const tagFreq = new Map<string, number>();
  for (const p of pages) for (const t of p.tags) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  const topTags = [...tagFreq.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topTagLimit);

  const orphans = pages
    .filter((p) => (inDegree.get(p.id) ?? 0) === 0 && (outDegree.get(p.id) ?? 0) === 0)
    .map((p) => ({ id: p.id, slug: p.slug, title: p.title }));

  return {
    pageCount: pages.length,
    edgeCount: edges.length,
    countByKind,
    topHubs,
    topTags,
    orphans,
  };
}
