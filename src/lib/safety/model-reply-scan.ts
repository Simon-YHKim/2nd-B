// What the gate may overlook in a MODEL REPLY, and what it records when it replaces one.
// Kept out of classifier.ts and lexicon.ts: nothing here applies to what the USER wrote, and
// the gate terms and the input scan stay exactly as they are.
import { classifyInput, type ClassifyOptions, type SafetyResult } from "./classifier";
import { hasCrisisRiskContext } from "./crisis-context";
import type { Locale } from "./lexicon";

// ── The closed list (Simon 2026-10-13, Q-261013-34 with D1-D3) ───────────────
// The gate matches Korean terms as bare substrings, so a reply the model wrote
// can hold a crisis term's letters inside an unrelated word: "다짐이 되어" holds
// "짐이 되". This list is CLOSED. Each entry is a complete other word (never a
// prefix that a crisis sentence could continue), and nothing here judges
// context: no pattern, no stem, no near-synonym belongs in it. Adding an entry
// needs a new legal opinion and a new independent review.
// Left out on purpose:
// - every form of "끝내고 싶" and "끝낼 거", the hotline's own name, empathy
//   sentences, "마지막 인사", "다음 생에는" (legal review 2026-10-13);
// - "유서 깊", "사유서", "이유서": approved by that review, then dropped by the
//   independent review of this change. "유서 깊" is a prefix ("유서 깊숙이 숨겨
//   뒀어" is a will), and "이 유서" typed without its space is "이유서".
export const MODEL_REPLY_BENIGN_OVERLAPS: readonly string[] = ["다짐이 되", "마음가짐이 되", "몸가짐이 되", "더 이상 살펴"];

// The reply as the gate normalizes it, with each listed word blanked out in
// place. Only the listed occurrence is masked: the same term standing anywhere
// else in the reply is still there for the unchanged matcher.
export function maskModelReplyOverlaps(text: string): string {
  let scan = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  for (const overlap of MODEL_REPLY_BENIGN_OVERLAPS) {
    scan = scan.split(overlap).join(" ".repeat(overlap.length));
  }
  return scan;
}

export interface ModelReplyOptions extends ClassifyOptions {
  // Allow the closed list above. The caller sets this only for an adult's
  // conversation with no recent crisis signal.
  benignOverlaps?: boolean;
}

// Classifies a MODEL REPLY. It answers exactly as classifyInput does unless all
// of these hold: the caller allowed the overlaps; the user is a known adult
// (minor === false; unknown is treated as a minor); the strict scan was red;
// what is left after the listed words are blanked carries no risk context (the
// same test the existing exceptions sit behind); and the unchanged scan of what
// is left is not red. Never use this for what the user wrote.
export function classifyModelReply(text: string, locale: Locale, opts: ModelReplyOptions = {}): SafetyResult {
  const strict = classifyInput(text, locale, opts);
  if (strict.zone !== "red" || opts.benignOverlaps !== true || opts.minor !== false) return strict;
  const rest = maskModelReplyOverlaps(text);
  if (hasCrisisRiskContext(rest)) return strict;
  const restResult = classifyInput(rest, locale, opts);
  return restResult.zone === "red" ? { ...strict, matched: restResult.matched } : restResult;
}

// ── Fixed numbers for the Korean gate terms (D3) ─────────────────────────────
// When a model reply is replaced by the crisis template, the number of the
// matched term is the only thing recorded about what matched: no reply text, no
// user text, no hash. A number is never reused or reassigned; a term added to
// the gate takes the next number. The keys must equal CRISIS_TERMS.ko, in order
// (model-reply-scan.test.ts checks it).
export const KO_CRISIS_TERM_CODES: Readonly<Record<string, number>> = {
  "자살": 1,
  "죽고 싶": 2,
  "죽고싶": 3,
  "살고 싶지 않": 4,
  "사라지고 싶": 5,
  "더 이상 살": 6,
  "끝내고 싶": 7,
  "끝낼 거": 8,
  "끝낼거": 9,
  "자해": 10,
  "목숨을 끊": 11,
  "스스로 목숨": 12,
  "유서": 13,
  "마지막 인사": 14,
  "짐이 되": 15,
  "없어지는 게 나아": 16,
  "사라지는 게 나": 17,
  "다음 생에는": 18,
  "영영 잠들고 싶": 19,
};

export const MODEL_REPLY_TERM_CATEGORY_PREFIX = "crisis_term:";

// Category entries for a replaced MODEL REPLY: the fixed number of each matched
// Korean term, in ascending order, and nothing else. A term without a number
// (another language's list, an unknown string) yields no entry.
export function modelReplyTermCategories(matched: readonly string[]): string[] {
  const codes = new Set<number>();
  for (const term of matched) {
    const code = Object.prototype.hasOwnProperty.call(KO_CRISIS_TERM_CODES, term) ? KO_CRISIS_TERM_CODES[term] : undefined;
    if (typeof code === "number" && Number.isInteger(code) && code >= 1 && code <= 19) codes.add(code);
  }
  return [...codes].sort((a, b) => a - b).map((code) => `${MODEL_REPLY_TERM_CATEGORY_PREFIX}${code}`);
}
