// Pure view-model builders for the deep-space /wiki and /research screens.
//
// The screens themselves are thin React shells; all the "what does the graph
// say" logic lives here so it can be unit-tested without rendering. Both views
// derive from the same inputs the legacy /wiki already loads — listWikiPages +
// listAllWikiLinks — and lean on computeGraphStats for hubs/tags/orphans.
//
// STEP 1b ("wire deep-space UI to real data"). Real clustering is STEP 3; until
// then /research surfaces what graph-stats can honestly give: god-nodes (top
// hubs) and tag groupings as cluster proxies.

import { computeGraphStats } from "@/lib/wiki/graph-stats";
import { clusterGraph, type SurpriseLink } from "@/lib/wiki/clusters";
import type { WikiPageRow } from "@/lib/wiki/types";

export type WikiEdge = { from_page: string; to_page: string };

/** Friendly page name: the title, else the slug humanized (no raw hyphen slug). */
export function displayName(page: { title: string; slug: string }): string {
  const title = page.title.trim();
  if (title.length > 0) return title;
  return page.slug.replace(/[-_]+/g, " ").trim() || page.slug;
}

/** One-line snippet from the body, collapsed whitespace, capped. "" when empty. */
export function snippetOf(body: string, max = 96): string {
  const oneLine = body.replace(/[#>*_`[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max).trimEnd();
}

/** in+out degree per page id — "connections" touching each node. */
export function connectionCounts(edges: WikiEdge[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of edges) {
    m.set(e.from_page, (m.get(e.from_page) ?? 0) + 1);
    m.set(e.to_page, (m.get(e.to_page) ?? 0) + 1);
  }
  return m;
}

export interface DeepWikiPageView {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  connections: number;
}

export interface DeepWikiView {
  pageCount: number;
  edgeCount: number;
  /** "전체" + top tags, with counts; the active one is decided by the screen. */
  tagChips: { tag: string; count: number }[];
  /** Pages, most-connected first; filtered to activeTag when set. */
  pages: DeepWikiPageView[];
}

export interface BuildDeepWikiOpts {
  activeTag?: string | null;
  maxPages?: number;
  maxTagChips?: number;
}

export function buildDeepWikiView(
  pages: WikiPageRow[],
  edges: WikiEdge[],
  opts: BuildDeepWikiOpts = {},
): DeepWikiView {
  const maxPages = opts.maxPages ?? 12;
  const maxTagChips = opts.maxTagChips ?? 4;
  const stats = computeGraphStats({ pages, edges, topTagLimit: maxTagChips });
  const conn = connectionCounts(edges);

  const activeTag = opts.activeTag ?? null;
  const filtered = activeTag ? pages.filter((p) => p.tags.includes(activeTag)) : pages;

  const views: DeepWikiPageView[] = filtered
    .map((p) => ({
      id: p.id,
      title: displayName(p),
      snippet: snippetOf(p.body_md),
      tags: p.tags,
      connections: conn.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.connections - a.connections)
    .slice(0, maxPages);

  return {
    pageCount: stats.pageCount,
    edgeCount: stats.edgeCount,
    tagChips: stats.topTags,
    pages: views,
  };
}

export interface DeepResearchView {
  pageCount: number;
  edgeCount: number;
  orphanCount: number;
  /** Tag groupings — chip filters across the graph. */
  clusters: { tag: string; count: number }[];
  /** God-nodes — pages with the most incoming citations. */
  hubs: { id: string; title: string; inDegree: number }[];
  /** The single most-connected node, for the headline insight. */
  headline: { id: string; title: string; inDegree: number } | null;
  /** STEP 3: connected-component islands (size >= 2). */
  islandCount: number;
  /** STEP 3: one unexpected cross-topic connection, or null. */
  surprise: SurpriseLink | null;
}

export function buildDeepResearchView(
  pages: WikiPageRow[],
  edges: WikiEdge[],
  opts: { maxClusters?: number; maxHubs?: number } = {},
): DeepResearchView {
  const maxClusters = opts.maxClusters ?? 3;
  const maxHubs = opts.maxHubs ?? 5;
  const stats = computeGraphStats({
    pages,
    edges,
    topHubLimit: maxHubs,
    topTagLimit: maxClusters,
  });
  const grouped = clusterGraph(pages, edges);
  return {
    pageCount: stats.pageCount,
    edgeCount: stats.edgeCount,
    orphanCount: stats.orphans.length,
    clusters: stats.topTags,
    hubs: stats.topHubs,
    headline: stats.topHubs.length > 0 ? stats.topHubs[0] : null,
    islandCount: grouped.clusters.length,
    surprise: grouped.surprise,
  };
}
