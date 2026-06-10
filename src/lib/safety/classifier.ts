import {
  ANALYSIS_UNIVERSAL_FORBIDDEN,
  CRISIS_TERMS,
  FORBIDDEN_TERMS,
  HOTLINES,
  type HotlineId,
  type Locale,
} from "./lexicon";

export type SafetyZone = "green" | "yellow" | "red";

export interface SafetyResult {
  zone: SafetyZone;
  matched: string[];
  categories: ("crisis" | "forbidden_lexicon")[];
  crisisRouting?: {
    hotline: HotlineId;
    label: string;
    number: string;
  };
}

export interface ClassifyOptions {
  // When the user is a minor, route crisis to a youth-appropriate line
  // (Korea: 1388). Defaults to false (adult routing) so the signature stays
  // backward-compatible until age tiers thread it in at the call sites.
  minor?: boolean;
}

// Matches a term against text using a locale-appropriate boundary check.
// English: word boundary via lowercased substring with surrounding non-letter.
// Korean: substring presence (Hangul has no whitespace word boundaries).
// Both are case-insensitive and operate on lower-cased haystacks.
function matchesTerm(haystack: string, term: string, locale: Locale): boolean {
  const lower = haystack.toLowerCase();
  const t = term.toLowerCase();
  if (locale === "ko") return lower.includes(t);
  if (t.length === 0) return false;
  const isBoundary = (ch: string) => /[^a-z0-9]/i.test(ch);
  // Scan every occurrence: a term embedded in a larger word at its first
  // position (for example inside a longer word) must not mask a later standalone one.
  for (let idx = lower.indexOf(t); idx !== -1; idx = lower.indexOf(t, idx + 1)) {
    const before = idx === 0 ? " " : lower[idx - 1];
    const after = idx + t.length >= lower.length ? " " : lower[idx + t.length];
    if (isBoundary(before) && isBoundary(after)) return true;
  }
  return false;
}

// Age-aware crisis routing — the single source of truth for WHICH hotlines a
// (locale, minor) crisis surfaces, in display order (primary first). Both the
// callGemini path (routeCrisis) and the Advisor path (fixedCrisisResponse) read
// this so the numbers never drift between surfaces.
//   KO adult -> [109]        자살예방상담전화 (109 merged 1393 in 2024-01)
//   KO minor -> [1388, 109]  청소년전화 first, then 109
//   EN any   -> [988]        serves all ages
// Defaults to adult routing; unknown age is safe because 109/988 are all-ages.
export function crisisHotlines(
  locale: Locale,
  minor = false,
): { id: HotlineId; label: string; number: string }[] {
  if (locale === "ko") {
    const ids: HotlineId[] = minor ? ["KR_1388", "KR_109"] : ["KR_109"];
    return ids.map((id) => ({ id, label: HOTLINES[id].label, number: HOTLINES[id].number }));
  }
  return [{ id: "GLOBAL_988", label: HOTLINES.GLOBAL_988.label, number: HOTLINES.GLOBAL_988.number }];
}

// The single primary hotline (first of crisisHotlines) — used for the
// SafetyResult.crisisRouting field and the CrisisRouter modal.
function pickCrisisHotline(locale: Locale, minor = false): { id: HotlineId; label: string; number: string } {
  return crisisHotlines(locale, minor)[0];
}

// Classifies a user input or LLM output. Order:
//   1. CRISIS_TERMS → red (short-circuit, surface hotline)
//   2. FORBIDDEN_TERMS → yellow (downgrade; surface rephrase hint)
//   3. otherwise → green
export function classifyInput(text: string, locale: Locale, opts: ClassifyOptions = {}): SafetyResult {
  if (!text || text.trim().length === 0) {
    return { zone: "green", matched: [], categories: [] };
  }
  const crisisMatches: string[] = [];
  for (const term of CRISIS_TERMS[locale]) {
    if (matchesTerm(text, term, locale)) crisisMatches.push(term);
  }
  if (crisisMatches.length > 0) {
    const h = pickCrisisHotline(locale, opts.minor);
    return {
      zone: "red",
      matched: crisisMatches,
      categories: ["crisis"],
      crisisRouting: { hotline: h.id, label: h.label, number: h.number },
    };
  }
  const lexiconMatches: string[] = [];
  for (const term of FORBIDDEN_TERMS[locale]) {
    if (matchesTerm(text, term, locale)) lexiconMatches.push(term);
  }
  if (lexiconMatches.length > 0) {
    return { zone: "yellow", matched: lexiconMatches, categories: ["forbidden_lexicon"] };
  }
  return { zone: "green", matched: [], categories: [] };
}

// Returns true if any forbidden lexicon term appears in `text` for the
// given locale. Used by the CI scanner with deduplicated matching logic.
export function containsForbiddenLexicon(text: string, locale: Locale): string[] {
  const hits: string[] = [];
  for (const term of FORBIDDEN_TERMS[locale]) {
    if (matchesTerm(text, term, locale)) hits.push(term);
  }
  return hits;
}

// Same boundary semantics as containsForbiddenLexicon, over the Analysis
// Lexicon universal floor (lexicon.ts §Analysis Lexicon v0.1). Used by the
// CI scanner; available to runtime output filtering when Voice work lands.
export function containsAnalysisForbidden(text: string, locale: Locale): string[] {
  const hits: string[] = [];
  for (const term of ANALYSIS_UNIVERSAL_FORBIDDEN[locale]) {
    if (matchesTerm(text, term, locale)) hits.push(term);
  }
  return hits;
}
