import { CRISIS_TERMS, FORBIDDEN_TERMS, HOTLINES, type HotlineId, type Locale } from "./lexicon";

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

// Matches a term against text using a locale-appropriate boundary check.
// English: word boundary via lowercased substring with surrounding non-letter.
// Korean: substring presence (Hangul has no whitespace word boundaries).
// Both are case-insensitive and operate on lower-cased haystacks.
function matchesTerm(haystack: string, term: string, locale: Locale): boolean {
  const lower = haystack.toLowerCase();
  const t = term.toLowerCase();
  if (locale === "ko") return lower.includes(t);
  const idx = lower.indexOf(t);
  if (idx === -1) return false;
  const before = idx === 0 ? " " : lower[idx - 1];
  const after = idx + t.length >= lower.length ? " " : lower[idx + t.length];
  const isBoundary = (ch: string) => /[^a-z0-9]/i.test(ch);
  return isBoundary(before) && isBoundary(after);
}

function pickCrisisHotline(locale: Locale): { id: HotlineId; label: string; number: string } {
  if (locale === "ko") {
    const h = HOTLINES.KR_1393;
    return { id: "KR_1393", label: h.label, number: h.number };
  }
  const h = HOTLINES.GLOBAL_988;
  return { id: "GLOBAL_988", label: h.label, number: h.number };
}

// Classifies a user input or LLM output. Order:
//   1. CRISIS_TERMS → red (short-circuit, surface hotline)
//   2. FORBIDDEN_TERMS → yellow (downgrade; surface rephrase hint)
//   3. otherwise → green
export function classifyInput(text: string, locale: Locale): SafetyResult {
  if (!text || text.trim().length === 0) {
    return { zone: "green", matched: [], categories: [] };
  }
  const crisisMatches: string[] = [];
  for (const term of CRISIS_TERMS[locale]) {
    if (matchesTerm(text, term, locale)) crisisMatches.push(term);
  }
  if (crisisMatches.length > 0) {
    const h = pickCrisisHotline(locale);
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
