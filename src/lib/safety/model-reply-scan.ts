// What the gate may overlook in a MODEL REPLY, and what it records when it replaces one.
// Kept apart from crisis-context.ts so the Deno proxies' import graph does not change:
// they scan what the USER wrote, and none of this applies there.
import { prepareCrisisScanText } from "./crisis-context";

// ── Model-reply scan copy (Simon 2026-10-13, Q-261013-34 with D1-D3) ───────────
// The gate matches Korean terms as bare substrings, so a reply the model wrote
// can hold a crisis term's letters inside an unrelated word: "다짐이 되어" holds
// "짐이 되". This list is CLOSED. It applies to the scan of a MODEL REPLY only,
// never to what the user wrote, and only when the caller allows it (an adult's
// conversation with no recent crisis signal). Each entry is a whole other word
// or a fixed collocation that merely contains the term; nothing here judges
// context, so no pattern, no stem, no near-synonym belongs in it. Adding an
// entry needs a new legal opinion and a new independent review.
// Left out on purpose (legal review 2026-10-13): every form of "끝내고 싶" and
// "끝낼 거", the hotline's own name, empathy sentences, "마지막 인사", "다음 생에는".
export const MODEL_REPLY_BENIGN_OVERLAPS: readonly string[] = [
  "다짐이 되",
  "마음가짐이 되",
  "몸가짐이 되",
  "유서 깊",
  "사유서",
  "이유서",
  "더 이상 살펴",
];

// Returns a SCAN COPY of a model reply with each listed overlap blanked out.
// Only the listed occurrence is masked: the same term standing anywhere else in
// the reply still reaches the unchanged matcher.
export function prepareModelReplyScanText(text: string): string {
  let scan = prepareCrisisScanText(text);
  for (const overlap of MODEL_REPLY_BENIGN_OVERLAPS) {
    scan = scan.split(overlap).join(" ".repeat(overlap.length));
  }
  return scan;
}

// Fixed numbers for the Korean gate terms (D3). When a model reply is replaced
// by the crisis template, the number of the matched term is the only thing
// recorded about what matched: no reply text, no user text, no hash. A number is
// never reused or reassigned; a term added to the gate takes the next number.
// The keys must equal CRISIS_TERMS.ko (model-reply-scan.test.ts checks it; this
// file stays dependency-free for the Deno proxies, so it cannot import the list).
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
