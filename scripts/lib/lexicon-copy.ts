import { containsAnalysisForbidden, containsForbiddenLexicon } from "../../src/lib/safety/classifier";
import { LEXICON_NON_CLINICAL_CONTEXTS, type Locale } from "../../src/lib/safety/lexicon";

// A denial elsewhere in a file, sentence, or JSON field cannot excuse a claim.
// These are conservative copy checks, not a semantic classifier or a runtime
// safety override. Clauses we cannot identify as explicit prohibitions fail.
const CLAUSE_BOUNDARY = /[.!?。！？;,\r\n]|\b(?:but|however|yet|though|although|whereas|while)\b|\band\s+(?=we\b|our\b|this\b|it\b|you\b|the app\b|\w+\s+(?:is|are)\b)|하지만|그러나/gi;

function isProhibited(clause: string, term: string, locale: Locale, index: number): boolean {
  const before = clause.slice(0, index);
  const after = clause.slice(index + term.length);
  if (locale === "en") {
    // "not only proven" affirms the claim. A generic "not" elsewhere in the
    // clause (for example "no account required") is not a prohibition either.
    if (/\bnot\s+(?:only|just|merely)\b/i.test(before)) return false;
    return /\b(?:never|avoid|do not|don['’]?t|must not|should not)\s+(?:diagnos\w*|(?:provide|offer|claim|make|use|give|perform|present|include|suggest|describe|say|label|call|imply)\b)[^.!?;,]{0,100}$/i.test(before + term)
      || /\b(?:not|no|without)\s+(?:(?:a|an|any|as|providing|offering)\s+)?$/i.test(before)
      || /\bwithout\s+(?:labeling|labelling)\s+or\s+$/i.test(before)
      || /\b(?:not|no)\s+(?:a|an)?\s*(?:diagnosis|therapy|treatment)\s+or\s+$/i.test(before)
      || /^\s+(?:is|are)\s+(?:forbidden|banned|prohibited)\b/i.test(after);
  }
  const prohibition = /금지|(?:제공|말|주장|사용|표현|단정|진단)하지\s*(?:마|않)|(?:쓰|하|부르)지\s*(?:마|않)|(?:가|이)\s*아닙|(?:말|할|쓸)\s*것이?\s*아니/.exec(after);
  // An affirmative verb before a later prohibition belongs to another claim:
  // "provide X and prohibit Y" must still flag X.
  if (prohibition && prohibition.index <= 70
    && !/(?:하고|하며|합니다|해요|입니다|이에요)/.test(after.slice(0, prohibition.index))) return true;
  return /(?:금지|쓰지\s*말|사용하지\s*말)[^.!?;,]{0,25}$/.test(before);
}

function copyHits(content: string, locale: Locale, find: (text: string, locale: Locale) => string[]): string[] {
  if (find(content, locale).length === 0) return [];
  let text = content.normalize("NFKC")
    .replace(/([A-Za-z가-힣])\r?\n[ \t]*(?=[A-Za-z가-힣])/g, "$1 ");
  for (const pattern of LEXICON_NON_CLINICAL_CONTEXTS[locale]) {
    text = text.replace(pattern, (span) => " ".repeat(span.length));
  }
  const hits = new Set<string>();
  for (const rawClause of text.split(CLAUSE_BOUNDARY)) {
    const clause = rawClause.replace(/\s+/g, " ");
    for (const term of find(clause, locale)) {
      const lower = clause.toLowerCase();
      const needle = term.toLowerCase();
      for (let index = lower.indexOf(needle); index !== -1; index = lower.indexOf(needle, index + needle.length)) {
        if (locale === "en" && (/[a-z0-9]/i.test(lower[index - 1] ?? " ") ||
            /[a-z0-9]/i.test(lower[index + needle.length] ?? " "))) continue;
        if (!isProhibited(clause, term, locale, index)) hits.add(term);
      }
    }
  }
  return [...hits];
}

export function findCopyLexiconHits(content: string, locale: Locale): { forbidden: string[]; analysis: string[] } {
  return {
    forbidden: copyHits(content, locale, containsForbiddenLexicon),
    analysis: copyHits(content, locale, containsAnalysisForbidden),
  };
}
