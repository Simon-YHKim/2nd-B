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

// Age-aware crisis routing. Minors in the KO locale go to the youth line
// (1388) instead of 1393; EN's 988 already serves all ages, so minors stay on
// it. Defaults to adult routing.
function pickCrisisHotline(locale: Locale, minor = false): { id: HotlineId; label: string; number: string } {
  if (locale === "ko") {
    const id: HotlineId = minor ? "KR_1388" : "KR_1393";
    const h = HOTLINES[id];
    return { id, label: h.label, number: h.number };
  }
  const h = HOTLINES.GLOBAL_988;
  return { id: "GLOBAL_988", label: h.label, number: h.number };
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
