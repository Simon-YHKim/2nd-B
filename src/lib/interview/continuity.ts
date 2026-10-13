import type { DrillLayer, InterviewTurn } from "./probe";
import { isNonAnswer } from "./stuck";

export type AnswerDisposition = "answer" | "uncertain" | "skip" | "stop";

// A phrase that asks to stop, at the start of what was said.
//
// The rule used to be "begins with one of these words", so an answer that only begins like one
// ended the conversation too: "여기까지 오는 데 친구들이 많이 도와줬어요", "중단됐던 프로젝트를
// 다시 했어요", "Stop signs were everywhere" (review of #2436, round 4). Each word now has to be
// followed by the end of its sentence or by an ending that makes it a request ("여기까지 할게요",
// "그만해 주세요", "stop please").
//
// Narrower only: every form below begins with a word of the old rule, so nothing stops here
// that did not stop before (`stop-phrase.test.ts` keeps the old rule to check exactly that).
// What no longer stops goes on to the model as an answer, where it is read like any other.
// Each piece is a regex literal, joined by its source, so the phrases read one per line.
const KO_END = /(?:$|[.,!?~…])/.source;
const KO_NOT_A_WORD_ON = /(?![가-힣])/.source;
const KO_MAY_I = /(?:돼요?|될까요|되나요|될까|되죠|됩니까)/.source;
const KO_ASKING =
  /할(?:래요?|게요?|께요?|까요)|하자|해요|하죠|합시다|해\s*(?:주세요|줘요?)|하고\s*싶(?:어요?|습니다|네요|다)|하겠(?:습니다|어요)/.source;
const KO_WRAP_UP =
  /(?:만\s*)?/.source + "(?:" + KO_ASKING + "|" + /해도\s*/.source + KO_MAY_I + ")" + KO_NOT_A_WORD_ON;
const KO_STOP_PHRASE = new RegExp(
  "^(?:" +
    [
      /그만$/.source,
      /그만요/.source + KO_NOT_A_WORD_ON,
      /그만\s*할(?:래요?|게요?|께요?|까요)/.source + KO_NOT_A_WORD_ON,
      /그만\s*할\s*수\s*있(?:을까|나)/.source,
      /그만하자/.source + KO_NOT_A_WORD_ON,
      /그만해요/.source + KO_NOT_A_WORD_ON,
      /그만해/.source + KO_END,
      /그만해\s*(?:주세요|줘요?)/.source,
      /그만해도\s*/.source + KO_MAY_I + KO_NOT_A_WORD_ON,
      /여기까지(?:요|만요?)?/.source + KO_END,
      /여기까지\s*/.source + KO_WRAP_UP,
      /멈춰(?:요)?/.source + KO_END,
      /멈춰\s*(?:주세요|줘요?)/.source,
      /중단(?:요)?/.source + KO_END,
      /중단\s*/.source + KO_WRAP_UP,
      /끝낼(?:래요?|게요?|께요?|까요)/.source + KO_NOT_A_WORD_ON,
    ].join("|") +
    ")",
);
const EN_STOP_PHRASE =
  /^(?:please\s+)?(?:stop|enough|let'?s stop|i'?m done|i am done|that'?s enough|no thanks|not now)(?:\s+with\s+(?:this|that|it|these questions|the (?:interview|questions|conversation)))?(?:\s+(?:please|now|here|there|for now|for today|today|thanks|thank you))*\s*(?:$|[.,!?;:])/;

/** Explicit choices only. This is a conversation control, never a safety classifier. */
export function answerDisposition(text: string, locale: "en" | "ko"): AnswerDisposition {
  const clean = text.trim().toLowerCase().replace(/[.!?。！？]+$/u, "");
  if (locale === "ko") {
    if (/^(싫어요|싫어|안\s?할래요?|됐어요|됐어)$/.test(clean)) return "stop";
    if (/^그만\s*(?:물어|물으|묻|질문|얘기|이야기)/.test(clean)) return "stop";
    if (KO_STOP_PHRASE.test(clean)) return "stop";
    if (/(?:말|얘기|이야기|답)(?:하고|하기|하긴|변하기)?\s*싫(?:어|다|네|습니다)|(?:말|이야기|답변)하고 싶지 않(?:아|다|네|습니다)|말\s*안\s*할래|말하지 않을래|(?:이야기|얘기|주제)(?:는|가)\s*불편/.test(clean)) return "stop";
    if (/^(패스|스킵|건너뛰|넘어가|다른 (이야기|얘기|주제))/.test(clean)) return "skip";
  } else {
    if (/\b(?:i want to|i'?d like to|can we|let us)\s+stop\b/.test(clean)) return "stop";
    if (EN_STOP_PHRASE.test(clean)) return "stop";
    if (/\b(?:don'?t|do not|would rather not)\s+(?:want to\s+)?(?:talk|share|answer)|\b(?:prefer|rather) not(?: to)?\b|\bnot comfortable (?:sharing|talking|answering)\b/.test(clean)) return "stop";
    if (/^(?:skip|pass|change (?:the )?(?:topic|subject)|something else)\b/.test(clean)) return "skip";
  }
  return isNonAnswer(text, locale) ? "uncertain" : "answer";
}

/** Conservative sufficiency, not an intimacy/length score. One feeling word can suffice;
 * a bare place/name does not yet introduce an event. The model can only veto this gate. */
export function canCreditAnswer(text: string, layer: DrillLayer, locale: "en" | "ko"): boolean {
  if (answerDisposition(text, locale) !== "answer") return false;
  const compact = text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
  if (/^(네|예|응|아니|아니요|음|어|yes|no|ok|okay|yeah|hmm|sure)$/.test(compact)) return false;
  if (compact.length < 2) return false;
  if (layer === "feeling") return true;
  return compact.length >= (locale === "ko" ? 8 : 14);
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
  return canCreditAnswer(text, askedLayer, locale) && judgedLayer === askedLayer;
}
