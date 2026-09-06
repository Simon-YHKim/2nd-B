import { findAnthroViolations } from "./anthro";

type Violation = "attachment-or-overclaim" | "unsourced-claim";

// Ordinary warmth is allowed (Simon, 2026-08-15). Emotional dependence,
// exclusivity and unsupported knowledge of the person are still disallowed.
const EXCLUSIVE = /\b(?:your only friend|you only need me)\b|(?:너|당신)에게는?\s*나만\s*있으면/i;
const SOURCE = /\b(?:records?|entries|registros?|catatan(?:mu|nya)?)\b|기록/i;
const GREETING = /^(?:안녕하세요|반가워요|환영해요|hello|hi|welcome|hola|olá|oi|halo|selamat datang)(?:,?\s+\{\{who\}\}(?:님)?)?[.!。]*$/i;
const ACTION = /^(?:choose|pick|open|check|select|ask|start|try|read|save|tell|comprueba|elige|abre|escolha|confira|veja|pilih|buka|lihat)\b|^Você pode conferir\b|^You can skip this question[.!]*$|(?:물어보세요|골라\s?보세요|확인해\s?보세요|선택하세요|입력하세요|(?:작성|이야기)해\s?주세요|저장하세요|열어\s?보세요|다시 시도해\s?보세요|편하게 말해도 돼요)[.!。]*$/i;
const OPTIONAL_QUESTION = /^(?:Puedes (?:omitir|saltar) esta pregunta|Você pode pular esta pergunta|Kamu (?:boleh|bisa) melewati pertanyaan ini)[.!]*$/iu;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?。？！])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

/** Only instruction fields may quote forbidden behavior to prohibit it.
 * Contrast clauses are checked separately so one "do not" cannot exempt
 * a later affirmative claim. This is a copy check, not a runtime classifier. */
export function mascotVoiceViolations(
  text: string,
  options: { requireSource?: boolean; instruction?: boolean } = {},
): Violation[] {
  const hits = new Set<Violation>();
  for (const sentence of sentences(text)) {
    const clauses = sentence.split(/;|,\s*(?=(?:I|we|you|yo|te|eu|você|aku|saya|kamu)\b)|\b(?:and|y|e|dan)\s+(?=(?:I|we|you|yo|te|eu|você|aku|saya|kamu)\b)|\b(?:but|however|yet|pero|sin embargo|mas|porém|tetapi|tapi|namun)\b|하지만|그렇지만/iu);
    for (const rawClause of clauses) {
      const clause = rawClause.replace(/^[,\s]+|[,\s]+$/g, "");
      if (!clause) continue;
      const prohibited = options.instruction && (
        /^\s*(?:(?:you|the assistant)\s+(?:must|should)\s+)?(?:never|do not|don['’]t)\s+(?:say|write|claim|tell|pretend|act|use)\b/i.test(clause) ||
        /(?:쓰지|말하지|하지|굴지)\s*(?:마세요|말 것|마)[.!。]*$/.test(clause) ||
        /^(?:nunca|no)\s+(?:digas|escribas|afirmes|finjas|uses)\b/iu.test(clause) ||
        /^(?:nunca|não)\s+(?:diga|escreva|afirme|finja|use)\b/iu.test(clause) ||
        /^(?:jangan|hindari)\s+(?:mengatakan|menulis|mengaku|mengklaim|berpura-pura|ucapan)\b/i.test(clause)
      );
      if (!prohibited && (findAnthroViolations(clause).length || EXCLUSIVE.test(clause))) {
        hits.add("attachment-or-overclaim");
      }
      // A source in another clause cannot justify this personal assertion.
      // A greeting, question or clear action makes no personal assertion.
      if (options.requireSource && !/[?？]$/.test(clause) && !GREETING.test(clause) &&
          !ACTION.test(clause) && !OPTIONAL_QUESTION.test(clause) && !SOURCE.test(clause)) hits.add("unsourced-claim");
    }
  }
  return [...hits];
}
