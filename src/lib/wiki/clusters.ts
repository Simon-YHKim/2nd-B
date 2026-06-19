// Wiki STEP 3 (docs/wiki-system-upgrade.md): lightweight clustering for the
// personal knowledge graph — no Python/Leiden, no embeddings. A pure helper
// that runs cheaply on-device and feeds /research, /wiki, and SecondB.
//
// Two signals:
//   1. Knowledge islands — connected components over the undirected edge graph
//      (union-find), each named by its most common tag. "흩어진 기록이 이렇게
//      이어져요" made literal.
//   2. A "surprise" — an edge bridging two pages that share NO tags. The
//      unexpected cross-topic connection that's the whole point of a second
//      brain ("이 두 가지가 이어져 있었네요").

import type { WikiPageRow } from "./types";

export type ClusterEdge = { from_page: string; to_page: string };

export interface KnowledgeCluster {
  /** Stable index by descending size, then label. */
  id: number;
  /** Page ids in this connected component. */
  members: string[];
  size: number;
  /** Most frequent tag among members; "" when the cluster is untagged. */
  label: string;
}

export interface SurpriseLink {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
}

export interface ClusterResult {
  /** Connected components of size >= 2, largest first. */
  clusters: KnowledgeCluster[];
  /** Count of single-node components (no edges) — the orphan islands. */
  singletonCount: number;
  /** One cross-topic bridge edge, or null when none/everything overlaps. */
  surprise: SurpriseLink | null;
}

function titleOf(page: { title: string; slug: string }): string {
  const t = page.title.trim();
  if (t.length > 0) return t;
  return page.slug.replace(/[-_]+/g, " ").trim() || page.slug;
}

/** Most frequent tag across a set of pages; "" if none. Alphabetical tiebreak
 *  keeps the label deterministic. */
function dominantTag(members: string[], pagesById: Map<string, WikiPageRow>): string {
  const freq = new Map<string, number>();
  for (const id of members) {
    const p = pagesById.get(id);
    if (!p) continue;
    for (const tag of p.tags) freq.set(tag, (freq.get(tag) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [tag, n] of freq) {
    if (n > bestN || (n === bestN && (best === "" || tag < best))) {
      best = tag;
      bestN = n;
    }
  }
  return best;
}

export function clusterGraph(pages: WikiPageRow[], edges: ClusterEdge[]): ClusterResult {
  const pagesById = new Map(pages.map((p) => [p.id, p]));

  // Union-find over page ids.
  const parent = new Map<string, string>();
  for (const p of pages) parent.set(p.id, p.id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    // Path-compress for the next lookup.
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of edges) {
    if (parent.has(e.from_page) && parent.has(e.to_page)) union(e.from_page, e.to_page);
  }

  // Group page ids by component root.
  const groups = new Map<string, string[]>();
  for (const p of pages) {
    const r = find(p.id);
    const arr = groups.get(r);
    if (arr) arr.push(p.id);
    else groups.set(r, [p.id]);
  }

  let singletonCount = 0;
  const multi: KnowledgeCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) {
      singletonCount += 1;
      continue;
    }
    multi.push({ id: 0, members, size: members.length, label: dominantTag(members, pagesById) });
  }
  multi.sort((a, b) => b.size - a.size || a.label.localeCompare(b.label));
  multi.forEach((c, i) => (c.id = i));

  // Degree map for surprise ranking.
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from_page, (degree.get(e.from_page) ?? 0) + 1);
    degree.set(e.to_page, (degree.get(e.to_page) ?? 0) + 1);
  }

  let surprise: SurpriseLink | null = null;
  let surpriseScore = -1;
  for (const e of edges) {
    const a = pagesById.get(e.from_page);
    const b = pagesById.get(e.to_page);
    if (!a || !b) continue;
    if (a.tags.length === 0 || b.tags.length === 0) continue; // need topics on both sides
    const overlap = a.tags.some((t) => b.tags.includes(t));
    if (overlap) continue;
    const score = (degree.get(e.from_page) ?? 0) + (degree.get(e.to_page) ?? 0);
    // Deterministic: higher combined degree wins; tiebreak by id pair.
    if (
      score > surpriseScore ||
      (score === surpriseScore &&
        surprise !== null &&
        (e.from_page < surprise.fromId ||
          (e.from_page === surprise.fromId && e.to_page < surprise.toId)))
    ) {
      surprise = { fromId: e.from_page, toId: e.to_page, fromTitle: titleOf(a), toTitle: titleOf(b) };
      surpriseScore = score;
    }
  }

  return { clusters: multi, singletonCount, surprise };
}
