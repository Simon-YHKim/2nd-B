import type { DrillLayer, InterviewTurn } from "./probe";
import { isNonAnswer } from "./stuck";

export type AnswerDisposition = "answer" | "uncertain" | "skip" | "stop";

/** Explicit choices only. This is a conversation control, never a safety classifier. */
export function answerDisposition(text: string, locale: "en" | "ko"): AnswerDisposition {
  const clean = text.trim().toLowerCase().replace(/[.!?。！？]+$/u, "");
  if (locale === "ko") {
    if (/^(싫어요|싫어|안\s?할래요?|됐어요|됐어)$/.test(clean)) return "stop";
    if (/^그만\s*(?:물어|물으|묻|질문|얘기|이야기)/.test(clean)) return "stop";
    if (/^(?:그만(?:요|할|\s*할|하자|해)|그만$|여기까지|멈춰|중단|끝낼)|(?:말|얘기|이야기|답)(?:하고|하기|하긴|변하기)?\s*싫(?:어|다|네|습니다)|(?:말|이야기|답변)하고 싶지 않(?:아|다|네|습니다)|말\s*안\s*할래|말하지 않을래|(?:이야기|얘기|주제)(?:는|가)\s*불편/.test(clean)) return "stop";
    if (/^(패스|스킵|건너뛰|넘어가|다른 (이야기|얘기|주제))/.test(clean)) return "skip";
  } else {
    if (/\b(?:i want to|i'?d like to|can we|let us)\s+stop\b/.test(clean)) return "stop";
    if (/^(?:please\s+)?(?:stop|enough|let'?s stop|i'?m done|i am done|that'?s enough|no thanks|not now)\b|\b(?:don'?t|do not|would rather not)\s+(?:want to\s+)?(?:talk|share|answer)|\b(?:prefer|rather) not(?: to)?\b|\bnot comfortable (?:sharing|talking|answering)\b/.test(clean)) return "stop";
    if (/^(?:skip|pass|change (?:the )?(?:topic|subject)|something else)\b/.test(clean)) return "skip";
  }
  return isNonAnswer(text, locale) ? "uncertain" : "answer";
}

// Q4 (2026-10-07): only known bare places are rejected locally in the fact layer.
// Unknown names/places are model candidates; do not infer them from length or spelling.
const BARE_FACT_PLACES = new Set([
  "집", "학교", "회사", "사무실", "도서관", "office", "at the office", "in the office",
]);

/** Local candidacy, not a semantic judgement or immediate credit. Short answers,
 * numbers and emoji reach the model. Q5's missing-verdict fallback stays separate. */
export function canCreditAnswer(text: string, layer: DrillLayer, locale: "en" | "ko"): boolean {
  if (answerDisposition(text, locale) !== "answer") return false;
  const compact = text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
  if (/^(네|예|응|아니|아니요|음|어|yes|no|ok|okay|yeah|hmm|sure)$/.test(compact)) return false;
  // Symbols (including emoji) must not become empty merely because the legacy
  // exact-choice normalization above removes them.
  if (/^[\s\p{P}]*$/u.test(text)) return false;
  const normalized = text.trim().replace(/\s+/gu, " ").toLowerCase();
  return layer !== "fact" || !BARE_FACT_PLACES.has(normalized);
}

/** Only an explicit topic change starts another scene. Old turns remain in the saved
 * transcript, but are excluded from future prompts after the user skips them. */
export function currentScene(history: readonly InterviewTurn[]): InterviewTurn[] {
  let start = 0;
  for (let i = 0; i < history.length; i++) if (history[i]?.sceneStart) start = i;
  return history.slice(start);
}

export function confirmedAnswer(
  text: string, askedLayer: DrillLayer, locale: "en" | "ko", judgedLayer: DrillLayer | null | undefined,
): boolean {
  // Q5 (2026-10-07): a successful response without a verdict follows the local
  // judgement. Explicit none and another named layer cannot award this layer.
  return canCreditAnswer(text, askedLayer, locale)
    && (judgedLayer === undefined || judgedLayer === askedLayer);
}
