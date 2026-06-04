// Pattern Data color resolver (v49 static tesseract pass).
//
// Tier-3 Pattern Data tesseracts ship in 9 color variants (red…black). A
// category bundle picks ONE color. This module is the single, deterministic
// place that maps a category signal (an explicit color key, or free-text
// name/description/keywords, or — as a last resort — a stable hash of an id)
// to one of those 9 color keys.
//
// Pure logic only: no user-facing strings, so it has no i18n / lexicon impact.
// The keyword table is transcribed verbatim from the v49 package manifest's
// `categoryColorMatchingGuidance` (EN + KO keywords per color); see
// public/assets/cosmic-pixel-v4-tesseract-v49/manifest.json. It is embedded
// here (not read at runtime) so the resolver stays a synchronous pure function.

export type PatternDataColorKey =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "indigo"
  | "violet"
  | "white"
  | "black";

// Fixed canonical order — drives both the tie-break and the hash fallback so
// the same input ALWAYS resolves to the same color.
export const PATTERN_DATA_COLOR_ORDER: readonly PatternDataColorKey[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
  "white",
  "black",
] as const;

// Transcribed from manifest.json → categoryColorMatchingGuidance (v49 package).
// EN + KO keywords per color. Matched as case-insensitive substrings.
export const PATTERN_DATA_COLOR_KEYWORDS: Record<PatternDataColorKey, readonly string[]> = {
  red: ["love", "emotion", "relationship", "heart", "conflict", "urgent", "passion", "사랑", "감정", "관계", "갈등", "긴급"],
  orange: ["work", "project", "execution", "energy", "career", "momentum", "일", "업무", "프로젝트", "실행", "커리어"],
  yellow: ["idea", "learning", "insight", "memory", "highlight", "study", "아이디어", "배움", "인사이트", "학습"],
  green: ["growth", "health", "routine", "habit", "finance", "life", "성장", "건강", "루틴", "습관", "재정"],
  blue: ["knowledge", "analysis", "fact", "planning", "logic", "system", "지식", "분석", "사실", "계획", "논리"],
  indigo: ["reflection", "identity", "deep thought", "strategy", "structure", "내면", "성찰", "전략", "구조"],
  violet: ["muse", "taste", "inspiration", "creative", "art", "hobby", "취향", "영감", "창작", "예술", "취미"],
  white: ["general", "neutral", "uncategorized", "inbox", "meta", "일반", "중립", "미분류", "메타"],
  black: ["private", "sensitive", "archive", "shadow", "unknown", "reserved", "비공개", "민감", "보관", "불명"],
} as const;

const COLOR_SET = new Set<string>(PATTERN_DATA_COLOR_ORDER);

function isPatternDataColorKey(value: string | undefined): value is PatternDataColorKey {
  return value != null && COLOR_SET.has(value);
}

// djb2-style hash mirroring `seeded()` in NavGraph.tsx, minus the salt term, so
// the fallback is stable + deterministic across calls and platforms.
function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return h >>> 0;
}

export interface PatternDataColorInput {
  /** Explicit color key, if the caller already knows it (highest priority). */
  colorKey?: string;
  /** Alias for colorKey — some sources carry it as `color`. */
  color?: string;
  /** Category / node label. */
  name?: string;
  /** Longer description text. */
  description?: string;
  /** Tags / extra signal words. */
  keywords?: readonly string[];
  /** Stable id, used only for the deterministic hash fallback. */
  id?: string;
}

/**
 * Resolve a category signal to one of the 9 Pattern Data color keys.
 *
 * Algorithm (in order):
 *   1. Explicit colorKey / color, when it is a valid key → return it.
 *   2. Keyword match: lowercase-join name + description + keywords, count
 *      substring hits per color, return the color with the most hits.
 *      Ties broken deterministically by PATTERN_DATA_COLOR_ORDER.
 *   3. Stable hash fallback: djb2(id ?? name ?? "") % 9 → color by fixed order.
 *
 * Always returns a valid key; identical input always yields the same color.
 */
export function resolvePatternDataColor(input: PatternDataColorInput): PatternDataColorKey {
  // 1. Explicit key passthrough.
  if (isPatternDataColorKey(input.colorKey)) return input.colorKey;
  if (isPatternDataColorKey(input.color)) return input.color;

  // 2. Keyword match over the joined, lowercased signal text.
  const haystack = [input.name ?? "", input.description ?? "", ...(input.keywords ?? [])]
    .join(" ")
    .toLowerCase();

  if (haystack.trim().length > 0) {
    let best: PatternDataColorKey | null = null;
    let bestHits = 0;
    // Iterate in fixed order so the first color reaching the max wins the tie.
    for (const color of PATTERN_DATA_COLOR_ORDER) {
      let hits = 0;
      for (const kw of PATTERN_DATA_COLOR_KEYWORDS[color]) {
        if (kw.length > 0 && haystack.includes(kw.toLowerCase())) hits++;
      }
      if (hits > bestHits) {
        bestHits = hits;
        best = color;
      }
    }
    if (best != null) return best;
  }

  // 3. Deterministic hash fallback.
  const seed = input.id ?? input.name ?? "";
  const idx = djb2(seed) % PATTERN_DATA_COLOR_ORDER.length;
  return PATTERN_DATA_COLOR_ORDER[idx]!;
}
