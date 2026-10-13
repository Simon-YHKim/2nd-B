import type { DrillLayer, InterviewTurn } from "./probe";
import { isNonAnswer } from "./stuck";

export type AnswerDisposition = "answer" | "uncertain" | "skip" | "stop";

// When a typed answer means "stop".
//
// The rule used to be "begins with one of these words", so an answer that only begins like one
// ended the conversation too: "여기까지 오는 데 친구들이 많이 도와줬어요", "중단됐던 프로젝트를
// 다시 했어요", "Stop signs were everywhere" (review of #2436, round 4).
//
// Now the FIRST SENTENCE has to be a request to stop and nothing else: one of the stop words,
// an ending that makes it a request ("여기까지 할게요", "그만해 주세요", "stop asking questions"),
// and at most a short tail from a fixed list (a word of time or thanks, a plain reason). A
// sentence that goes on to say anything else is an answer, whatever it begins with: "그만할래
// 하다가 계속했어요", "Not now, but later I understood why". More sentences may follow a stop
// ("그만할래요. 이제 다 그만하고 싶어요").
//
// Narrower only: every stop sentence below begins with a word of the old rule, so nothing stops
// here that did not stop before. What no longer stops goes on to the model as an answer and is
// read like any other; the button that ends the conversation is always on the screen.
// Each piece is a regex literal, joined by its source, so the phrases read one per line.
const KO_MAY_I = /(?:돼요?|될까요|되나요|될까|되죠|됩니까)/.source;
const KO_WILL = /(?:할래요?|할게요?|할께요?|할까요|할\s*거예요|할\s*거에요|할\s*겁니다)/.source;
// What may follow 여기까지 and 중단, which the old rule let anything follow.
const KO_ASKING =
  /하자|해요?|하죠|합시다|해\s*주세요|해\s*줘요?|하겠습니다|하겠어요|하고\s*싶(?:어요?|습니다|네요)|하고\s*끝낼(?:게요?|래요?)|하면\s*안\s*될까요/.source;
const KO_WRAP_UP = "(?:" + KO_WILL + "|" + KO_ASKING + "|" + /해도\s*/.source + KO_MAY_I + ")";
// What may still follow in the same sentence: a word of time or thanks, a plain reason.
const KO_TAIL =
  /(?:[\s,]+(?:이제|이젠|오늘은|오늘|지금은|지금|그냥|여기서|이쯤에서|죄송해요|죄송합니다|미안해요|감사합니다|고마워요|고맙습니다|(?:너무\s*|좀\s*)?(?:힘들어요|힘듭니다|힘드네요|피곤해요|피곤합니다|지쳤어요)|(?:더는\s*|더\s*이상\s*|더\s*)?못\s*하겠어요))*/.source;
const KO_STOP_SENTENCE = new RegExp(
  "^(?:" +
    [
      // 그만: only the forms the old rule knew (그만요, 그만할…, 그만하자, 그만해…). The bare word
      // stops only as the whole of what was said, which the function checks by itself.
      /그만요/.source,
      /그만\s*/.source + KO_WILL,
      /그만\s*할\s*수\s*있(?:을까요|나요)/.source,
      /그만하자/.source,
      /그만해(?:요|\s*주세요|\s*줘요?)?/.source,
      /그만해도\s*/.source + KO_MAY_I,
      /여기까지(?:요|만요?)?/.source,
      /여기까지\s*(?:만\s*)?/.source + KO_WRAP_UP,
      /멈춰(?:요|\s*주세요|\s*줘요?)?/.source,
      /중단(?:요)?/.source,
      /중단\s*/.source + KO_WRAP_UP,
      /끝낼(?:래요?|게요?|께요?|까요|\s*거예요|\s*거에요|\s*겁니다)/.source,
    ].join("|") +
    ")" +
    KO_TAIL +
    "$",
);
// A refusal may sit anywhere in what was said, but it has to end there: "말하기 싫어요" refuses,
// "말하기 싫다고 했지만 결국 이야기했어요" tells what happened.
const KO_ENDS = /(?=$|[\s.,!?…])/.source;
const KO_REFUSAL = new RegExp(
  [
    /(?:말|얘기|이야기|답)(?:하고|하기|하긴|변하기)?\s*싫(?:어요?|다|네요?|습니다)/.source + KO_ENDS,
    /(?:말|이야기|답변)하고 싶지 않(?:아요?|다|네요?|습니다)/.source + KO_ENDS,
    /말\s*안\s*할래/.source,
    /말하지 않을래/.source,
    /(?:이야기|얘기|주제)(?:는|가)\s*불편(?:해요?|합니다|하네요|하다)/.source + KO_ENDS,
  ].join("|"),
);

const EN_TAIL =
  /(?:[\s,]+(?:please|now|here|there|for now|for today|today|thanks|thank you|sorry|maybe later|i can'?t do this(?: anymore)?|i'?m tired|this is too (?:much|hard)))*/.source;
const EN_DONE_WITH = /(?:\s+(?:here|answering|talking|with\s+(?:this|that|it|these questions|the\s+(?:interview|questions|conversation))))?/.source;
const EN_STOP_SENTENCE = new RegExp(
  /^(?:please\s+)?/.source +
    "(?:" +
    [
      /stop(?:\s+(?:it|this|that|asking(?:\s+me)?(?:\s+(?:questions|these questions|more questions|any more questions))?|talking(?:\s+about\s+(?:it|this|that))?|(?:the|this)\s+(?:interview|questions|conversation)))?/.source,
      /enough(?:\s+of\s+(?:this|that|questions|these questions|the questions))?/.source,
      /let'?s stop(?:\s+(?:this|the\s+interview))?/.source,
      /i'?m done/.source + EN_DONE_WITH,
      /i am done/.source + EN_DONE_WITH,
      /that'?s enough/.source,
      /no thanks/.source,
      /not now/.source,
    ].join("|") +
    ")" +
    EN_TAIL +
    "$",
);
const EN_REFUSAL =
  /\b(?:don'?t|do not|would rather not)\s+(?:want to\s+)?(?:talk|share|answer)|\b(?:prefer|rather) not(?: to)?(?:\s+(?:say|talk|share|answer|discuss))?(?:\s+(?:about\s+)?(?:it|this|that))?\s*(?=$|[.,!?…])|\bnot comfortable (?:sharing|talking|answering)\b/;

const BARE_STOP_KO = /그만/.source;

/** The first sentence of what was said, without the punctuation that closes it. */
function firstSentence(clean: string): string {
  return (clean.split(/[.!?…。！？\n]+/u)[0] ?? "").trim();
}

/** Explicit choices only. This is a conversation control, never a safety classifier. */
export function answerDisposition(text: string, locale: "en" | "ko"): AnswerDisposition {
  const clean = text.trim().toLowerCase().replace(/[.!?。！？]+$/u, "");
  const sentence = firstSentence(clean);
  if (locale === "ko") {
    if (/^(싫어요|싫어|안\s?할래요?|됐어요|됐어)$/.test(clean)) return "stop";
    if (/^그만\s*(?:물어|물으|묻|질문|얘기|이야기)/.test(clean)) return "stop";
    if (clean === BARE_STOP_KO || KO_STOP_SENTENCE.test(sentence)) return "stop";
    if (KO_REFUSAL.test(clean)) return "stop";
    if (/^(패스|스킵|건너뛰|넘어가|다른 (이야기|얘기|주제))/.test(clean)) return "skip";
  } else {
    if (/\b(?:i want to|i'?d like to|can we|let us)\s+stop\b/.test(clean)) return "stop";
    if (EN_STOP_SENTENCE.test(sentence)) return "stop";
    if (EN_REFUSAL.test(clean)) return "stop";
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
