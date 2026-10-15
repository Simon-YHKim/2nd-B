// Additional explicit phrases use the same conservative policy as the EN/KO gate.
// Negation, quotations and past reports do not silently exempt a matched phrase.
// SystemLocale remains en/ko; recognition language is a separate concern.
import { ADDITIONAL_CRISIS_PHRASES, COMPLETE_CRISIS_PHRASES, type AdditionalCrisisLanguage } from "./lexicon";
export interface AdditionalCrisisMatch {
  language: AdditionalCrisisLanguage;
  phrase: string;
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC").replace(/\s+/g, " ");
}

function isWordCharacter(text: string): boolean {
  return /[\p{L}\p{N}_]/u.test(text);
}

function previousCharacter(text: string, index: number): string {
  if (index === 0) return "";
  const last = text.charCodeAt(index - 1);
  return text.slice(index - (last >= 0xdc00 && last <= 0xdfff ? 2 : 1), index);
}

function endsCompletePhrase(text: string, after: number): boolean {
  // Whitespace was already collapsed. End, a clause mark or a closing quote
  // completes only the new wish phrases; a following complement does not.
  const next = text[after] === " " ? after + 1 : after;
  return next === text.length || /[.,;!?。！？"'’”»]/u.test(text[next]);
}

// A bounded number of fixed phrases, scanned linearly. Unicode boundaries avoid
// treating a Latin phrase inside a longer non-ASCII word as an independent claim.
export function matchAdditionalCrisisLanguage(text: string): AdditionalCrisisMatch | null {
  const normalized = normalize(text);
  for (const language of ["es", "pt", "id"] as const) {
    for (const phrase of [...ADDITIONAL_CRISIS_PHRASES[language], ...COMPLETE_CRISIS_PHRASES[language]]) {
      const term = normalize(phrase);
      const complete = COMPLETE_CRISIS_PHRASES[language].includes(phrase);
      for (let at = normalized.indexOf(term); at !== -1; at = normalized.indexOf(term, at + 1)) {
        const after = at + term.length;
        const next = after === normalized.length ? "" : String.fromCodePoint(normalized.codePointAt(after)!);
        if (!isWordCharacter(previousCharacter(normalized, at)) && !isWordCharacter(next) &&
          (!complete || endsCompletePhrase(normalized, after))) {
          return { language, phrase };
        }
      }
    }
  }
  return null;
}
