// Graph relatedness (2026-05-31 user directive): when a user adds data
// (memos / knowledge), the main graph should place each piece in the village
// that matches its meaning AND draw connections between pieces that are
// actually related — not just hang everything under one fixed node.
//
// Two pure functions, both unit-tested so NavGraph/index stay thin:
//   1. domainForTags  — route a piece's tags to one of the five Pattern Cores.
//   2. relatedEdges   — connect pieces that share enough tags.
//
// Vocabulary stays in the project register (no clinical/technical terms).

// The five tier-2 Pattern Cores (NavGraph MENU_NODES tier-2 ids).
export type PatternCoreId = "work" | "relation" | "knowledge" | "records" | "taste";
export type VillageId = PatternCoreId | "imagine";

export const VILLAGE_IDS: readonly PatternCoreId[] = [
  "work",
  "relation",
  "knowledge",
  "records",
  "taste",
];

/** Canonical user-facing core names (kept in step with NavGraph's tier-2
 *  node labels). Single source for any surface that filters by village — e.g.
 *  the Records domain chips — so the wording can't drift from the graph. */
export const VILLAGE_LABEL: Record<VillageId, { en: string; ko: string }> = {
  work: { en: "Growth Core", ko: "Growth Core" },
  relation: { en: "Bond Core", ko: "Bond Core" },
  knowledge: { en: "Wisdom Core", ko: "Wisdom Core" },
  records: { en: "Narrative Core", ko: "Narrative Core" },
  taste: { en: "Muse Core", ko: "Muse Core" },
  imagine: { en: "Divergent workshop", ko: "Divergent workshop" },
};

// Keyword → village. Lowercase substrings matched against a piece's tags
// (and, as a fallback, its title). Ordering of VILLAGE_IDS breaks ties so the
// mapping is deterministic. English + Korean cues since tags can be either.
const DOMAIN_KEYWORDS: Record<PatternCoreId, readonly string[]> = {
  work: [
    "work", "career", "job", "study", "project", "goal", "growth", "skill",
    "productivity", "business", "startup", "money", "finance",
    "일", "업무", "커리어", "직장", "공부", "학습", "프로젝트", "목표", "성장", "성장기록", "돈", "재테크",
  ],
  relation: [
    "relationship", "relation", "people", "friend", "family", "love",
    "partner", "team", "social", "conversation",
    "관계", "사람", "친구", "가족", "사랑", "연인", "동료", "소통", "대화",
  ],
  knowledge: [
    "knowledge", "learning", "study-note", "reference", "article", "paper",
    "book", "research", "concept", "idea", "tech", "ai", "science",
    "지식", "배움", "자료", "논문", "책", "리서치", "개념", "기술", "과학",
  ],
  records: [
    "record", "journal", "diary", "log", "memo", "note", "daily", "today",
    "기록", "일기", "일지", "메모", "노트", "오늘", "일상",
  ],
  taste: [
    "taste", "inspiration", "spark", "music", "film", "movie", "art",
    "design", "aesthetic", "style", "favorite", "like", "imagine",
    "idea-spark", "dream", "fiction", "story", "creative", "imagination",
    "what-if", "scene",
    "취향", "영감", "음악", "영화", "예술", "디자인", "미감", "스타일", "좋아하는",
    "공상", "상상", "꿈", "이야기", "창작", "장면", "아이디어",
  ],
};

const DEFAULT_VILLAGE: PatternCoreId = "knowledge";

/**
 * Pick the village whose keywords best match this piece's tags. The piece's
 * title is used as a weak fallback signal. Returns DEFAULT_VILLAGE ("knowledge")
 * when nothing matches, so a freshly captured note still lands somewhere sane.
 */
export function domainForTags(tags: readonly string[], title = ""): PatternCoreId {
  const hay = [...tags.map((t) => t.toLowerCase()), title.toLowerCase()];
  const score = new Map<PatternCoreId, number>();
  for (const village of VILLAGE_IDS) {
    let s = 0;
    for (const kw of DOMAIN_KEYWORDS[village]) {
      for (const h of hay) {
        if (h.includes(kw)) s += 1;
      }
    }
    if (s > 0) score.set(village, s);
  }
  if (score.size === 0) return DEFAULT_VILLAGE;
  // Highest score wins; VILLAGE_IDS order breaks ties deterministically.
  let best: PatternCoreId = DEFAULT_VILLAGE;
  let bestScore = -1;
  for (const village of VILLAGE_IDS) {
    const s = score.get(village) ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = village;
    }
  }
  return best;
}

export interface RelatableNode {
  id: string;
  tags: readonly string[];
}

export interface RelatednessEdge {
  from: string;
  to: string;
  /** Number of shared tags — drives line strength. */
  weight: number;
}

/**
 * Connect pieces that share at least `minShared` tags. Undirected, deduped
 * (from < to by id), and capped per node so a few hyper-tagged pieces don't
 * turn the graph into a hairball. Pure → tested.
 */
export function relatedEdges(
  nodes: readonly RelatableNode[],
  opts: { minShared?: number; maxPerNode?: number } = {},
): RelatednessEdge[] {
  const minShared = opts.minShared ?? 2;
  const maxPerNode = opts.maxPerNode ?? 4;

  // Normalize each node's tags to a lowercase Set once.
  const sets = nodes.map((n) => ({
    id: n.id,
    tags: new Set(n.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
  }));

  const candidates: RelatednessEdge[] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i];
      const b = sets[j];
      let shared = 0;
      for (const t of a.tags) if (b.tags.has(t)) shared += 1;
      if (shared >= minShared) {
        // Stable ordering: smaller id first.
        const [from, to] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        candidates.push({ from, to, weight: shared });
      }
    }
  }

  // Strongest first, then cap per node.
  candidates.sort((x, y) => y.weight - x.weight || (x.from + x.to).localeCompare(y.from + y.to));
  const degree = new Map<string, number>();
  const kept: RelatednessEdge[] = [];
  for (const e of candidates) {
    const df = degree.get(e.from) ?? 0;
    const dt = degree.get(e.to) ?? 0;
    if (df >= maxPerNode || dt >= maxPerNode) continue;
    kept.push(e);
    degree.set(e.from, df + 1);
    degree.set(e.to, dt + 1);
  }
  return kept;
}
