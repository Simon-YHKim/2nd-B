// 답 하나가 "칸을 채울 만한 답인가" 를 가르는 로컬 문턱. **이 파일은 import 가 없다.**
//
// 왜 따로 있나 (Q-261005-09 B안, 2026-10-07). 인터뷰 판정 원장(0220)은 이 문턱을
// **서버에서 다시 계산한다**(docs/design/interview-measurement-261006.md 3.3 `local_gate`).
// 클라이언트가 보낸 "통과했다" 를 그대로 믿으면 칸 하나가 판정 호출 하나라는 약속이
// 깨진다. 그래서 openai-proxy 가 `../../../src/lib/interview/answer-gate.ts` 로 이 파일을
// 그대로 읽는다(polaris-generation.ts 가 lexicon.ts 를 읽는 것과 같은 길).
//
// Deno 는 확장자 없는 상대 import 를 못 푼다. 그래서 여기에는 import 를 두지 않는다
// (`lexicon.ts` · `untrusted.ts` 와 같은 규율). 층 이름도 `probe.ts` 에서 가져오지 않고
// 같은 다섯 글자를 적는다 -- `answer-gate.test.ts` 가 둘이 같은지를 검사한다.
//
// 내용은 옮긴 것이다. `isNonAnswer` 는 `stuck.ts`, `answerDisposition` · `canCreditAnswer`
// 는 `continuity.ts` 에 있던 것을 글자 그대로 옮겼고, 두 파일은 여기서 다시 내보낸다.
// 판정 규칙(짧은 답 · 거부권)을 바꾸는 것은 이 파일의 일이 아니다(설계 문서 4절, 3단계).

export type GateLocale = "en" | "ko";
export type GateLayer = "fact" | "feeling" | "meaning" | "belief" | "echo";

/** 다섯 층. `probe.ts` 의 `DRILL_LAYERS` 와 같은 순서 · 같은 글자다. */
export const GATE_LAYERS: readonly GateLayer[] = ["fact", "feeling", "meaning", "belief", "echo"];

/** "못 답하겠다"는 표시. 정규화된 답 **전체가** 사실상 이것뿐일 때만 걸린다. */
const NON_ANSWER: Record<GateLocale, RegExp> = {
  // 모르겠다 / 몰라 / 글쎄 / 딱히 / 생각 안 나 / 기억 안 나 / 없다 / 패스
  ko: /(모르겠|모르갰|몰라|모름|글쎄|딱히|생각안|생각이안|기억안|기억이안|잘모|없는것같|없어|없음|패스|스킵)/,
  en: /\b(i\s*(do\s*not|don'?t|dont)\s*know|no\s*idea|not\s*sure|dunno|idk|nothing|can'?t\s*think|skip|pass)\b/,
};

/** 이보다 길면 "그냥 모르겠다"가 아니라 무언가를 말한 것으로 본다.
 *
 *  "모르겠다는 게 아니라 사실 그때 진짜 무서웠어" 같은 답을 비-답변으로 세면
 *  진짜 재료를 버리게 된다. 길이는 **정규화 후 글자 수**로 잰다. */
const NON_ANSWER_MAX_LEN = 24;

function normalize(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

/**
 * 이 답이 "못 답하겠다"인가.
 *
 * 보수적이다 — 짧고, 그 안에 포기 표시가 있을 때만 참이다. 빈 답은 화면이 먼저
 * 막으므로 여기서는 참으로 보지 않는다(칸을 세지 않는 것은 어차피 같다).
 */
export function isNonAnswer(text: string, locale: GateLocale): boolean {
  const clean = normalize(text);
  if (clean.length === 0) return false;
  if (clean.length > NON_ANSWER_MAX_LEN) return false;
  // English word boundaries need spaces; punctuation-only normalization erased them.
  return NON_ANSWER[locale].test(locale === "en" ? text.toLowerCase().replace(/[’]/g, "'") : clean);
}

export type AnswerDisposition = "answer" | "uncertain" | "skip" | "stop";

/** Explicit choices only. This is a conversation control, never a safety classifier. */
export function answerDisposition(text: string, locale: GateLocale): AnswerDisposition {
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

/** 맞장구 한 마디. 답이 아니라 대화 신호다. */
const BARE_ACK = /^(네|예|응|아니|아니요|음|어|yes|no|ok|okay|yeah|hmm|sure)$/;

function compactOf(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

/** 감정층이 아닌 층에서 이보다 짧으면 장면을 아직 꺼내지 않은 것으로 본다. */
function minCompactLength(locale: GateLocale): number {
  return locale === "ko" ? 8 : 14;
}

/** Conservative sufficiency, not an intimacy/length score. One feeling word can suffice;
 * a bare place/name does not yet introduce an event. The model can only veto this gate. */
export function canCreditAnswer(text: string, layer: GateLayer, locale: GateLocale): boolean {
  return localGate(text, layer, locale) === "pass";
}

/** 로컬 문턱의 결과. 원장(0220 `local_gate`)이 이 세 값을 그대로 적는다. */
export type LocalGate = "pass" | "short" | "non_answer";

/**
 * `canCreditAnswer` 를 **왜 못 넘었는지까지** 말한다.
 *
 * - `non_answer`: "모르겠다" · 거절 · 건너뛰기 · 맞장구 한 마디 · 한 글자
 * - `short`: 감정층이 아닌 층에서 ko 8 · en 14 글자(정규화 후) 미만. 설계 문서 4절 P1 이
 *   바로 이 갈래를 다룬다 -- 규칙을 바꾸기 전에 얼마나 걸리는지를 원장으로 재려고 가른다.
 * - `pass`: 문턱 통과. 모델 판정(거부권)은 여기 없다.
 *
 * 겨냥한 층이 없으면(`null`) 감정층이 아닌 층의 문턱을 쓴다 -- 그런 답은 어차피 칸이
 * 오르지 않으므로 기록만을 위한 값이다.
 */
export function localGate(text: string, layer: GateLayer | null, locale: GateLocale): LocalGate {
  if (answerDisposition(text, locale) !== "answer") return "non_answer";
  const compact = compactOf(text);
  if (BARE_ACK.test(compact)) return "non_answer";
  if (compact.length < 2) return "non_answer";
  if (layer === "feeling") return "pass";
  return compact.length >= minCompactLength(locale) ? "pass" : "short";
}

/**
 * 답 길이의 구간. 원장은 원문도 글자 수도 남기지 않고 이 구간 하나만 남긴다
 * (설계 문서 3.3 `answer_len_bucket`: 0-4 · 5-7 · 8-13 · 14+). 길이는 정규화 후 글자 수다.
 */
export function answerLengthBucket(text: string): 0 | 1 | 2 | 3 {
  const n = compactOf(text).length;
  if (n <= 4) return 0;
  if (n <= 7) return 1;
  if (n <= 13) return 2;
  return 3;
}
