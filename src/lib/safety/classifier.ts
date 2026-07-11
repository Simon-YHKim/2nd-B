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
  // Normalize the haystack (and term) before comparison so a crisis phrase still
  // matches when the words are separated by a newline / non-breaking space (U+00A0)
  // / full-width space (U+3000) / double space, or when the input arrives as
  // NFD-decomposed Hangul (iOS/macOS clipboard, imported/third-party clips). The
  // \s+ collapse folds every whitespace run to one ASCII space so multi-word EN
  // terms ("want to die") and spaced KO terms ("죽고 싶") still match; NFC unifies
  // Hangul composition so decomposed input matches the NFC-authored lexicon. Without
  // this, a RED crisis phrase silently drops to GREEN — a false negative that breaks
  // the module's 0-false-negatives-on-in-lexicon-terms invariant.
  const lower = haystack.normalize("NFC").toLowerCase().replace(/\s+/g, " ");
  const t = term.normalize("NFC").toLowerCase();
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

// Cross-locale crisis backstop. A user in one UI locale commonly writes crisis
// terms in the OTHER language (very common in KR: English UI, Korean feelings).
// A single-locale input scan misses that, and the direct/Vertex client path has
// no proxy backstop to catch it. This scans BOTH lexicons (mirroring embedTexts
// and the proxies' EN+KO hasCrisisTerm) but keeps the UI locale's hotline so the
// routed help matches what the user reads. Strictly additive to crisis coverage.
export function classifyInputAnyLocale(text: string, uiLocale: Locale, opts: ClassifyOptions = {}): SafetyResult {
  const primary = classifyInput(text, uiLocale, opts);
  if (primary.zone === "red") return primary;
  const other = classifyInput(text, uiLocale === "ko" ? "en" : "ko", opts);
  if (other.zone === "red") {
    const h = pickCrisisHotline(uiLocale, opts.minor);
    return {
      zone: "red",
      matched: other.matched,
      categories: ["crisis"],
      crisisRouting: { hotline: h.id, label: h.label, number: h.number },
    };
  }
  return primary;
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
