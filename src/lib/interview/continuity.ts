import type { AnswerOutcome, DrillLayer, InterviewTurn } from "./probe";
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

/** 맞장구 · 예/아니오 **하나의 되풀이**로만 된 답("네" · "네네" · "아니아니" · "okok").
 *  무엇을 열었는지 담고 있지 않다. 띄어 쓰거나 섞은 조합("yes no" · "네예")은 아래 낱말 판정이 잡는다. */
const CONTENT_FREE = /^(네|예|응|아니요|아니|음|어|yes|no|okay|ok|yeah|hmm|sure)\1*$/u;

/** 자모만으로 된 답("ㅋㅋ" · "ㅇㅇ" · "ㅠㅠ"). 호환 자모 · 첫가끝 자모 · 확장 · 반각 전부.
 *  NFKC 는 호환 자모(U+3131…)를 첫가끝 자모(U+1100…)로 바꾸므로 두 범위를 다 본다. */
const JAMO_ONLY = /^[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF\uFFA0-\uFFDC]+$/u;
const JAMO = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF\uFFA0-\uFFDC]/gu;

/**
 * 낱말 하나가 **비었는가** (게이트 W4R2-02): 숫자만 · 맞장구 · 예/아니오.
 *
 * - 숫자만("12" · "1-2" 의 1 과 2 · 전각 "１２")은 무엇을 열었는지 담고 있지 않다.
 * - 예/아니오 맞장구는 한 낱말 안에서 섞여도 비었다("네예" · "응네").
 * - 망설임 소리(음 · 어)는 같은 소리의 되풀이만 -- "어음"은 낱말이다.
 * - 영어 맞장구도 같은 말의 되풀이만("okok") -- 붙여 쓴 서로 다른 말("nook")은 낱말일 수 있다.
 *
 * 자모는 떼고 본다("ㅋㅋ네").
 */
const FILLER_WORD = /^(?:(?:네|예|응|아니요|아니)+|(음|어)\1*|(yes|no|okay|ok|yeah|hmm|sure)\2*|\p{N}+)$/u;

function isFillerWord(word: string): boolean {
  const stripped = word.replace(JAMO, "");
  return stripped.length === 0 || FILLER_WORD.test(stripped);
}

/** 공백 · 문장부호 · 기호 · 제어/서식 문자로 가른 낱말들(NFKC · 소문자). */
function wordsOf(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().split(/[\s\p{P}\p{S}\p{C}]+/u).filter(Boolean);
}

/**
 * 판정에 쓰는 꼴: NFKC 로 맞추고 공백 · 문장부호 · 기호 · 제어/서식 문자를 뺀 소문자.
 *
 * NFKC 가 먼저다 (게이트 W4R1-02). 자모로 풀린(NFD) 한글은 음절마다 코드 단위가 2~3개라,
 * 정규화 없이 세면 "운동장이요"(5자)가 13자가 되어 술어 없는 언급 판정을 빠져나갔다.
 */
function compactOf(text: string): string {
  return text.normalize("NFKC").replace(/[\s\p{P}\p{S}\p{C}]+/gu, "").toLowerCase();
}

/**
 * 답이 **비었는가** -- 글자는 있어도 무엇을 열었는지 담고 있지 않다 (게이트 W4R1-02).
 *
 * 글자 수 문턱(ko 8 · en 14)을 걷어낸 뒤(R2F-04) 로컬 문턱이 지키는 것은 이것뿐이라,
 * 모델이 "닿았다"고 해도 여기 걸리는 답은 칸을 올리지 않는다:
 *   - 글자(문자 · 숫자)가 둘 미만 -- 한 글자 · 이모지만 · 키캡 같은 결합 기호
 *   - 맞장구 하나의 되풀이 -- "네" · "네네" · "yes yes"
 *   - 자모만 -- "ㅋㅋ" · "ㅇㅇ" · "ㅠㅠ"
 *   - 낱말이 전부 빈 낱말(`isFillerWord`) -- 숫자만 "12" · "1-2" · "１２", 섞인 맞장구
 *     "네예" · "yes no" · "음 네" · "ㅋㅋ 네" (게이트 W4R2-02)
 *   - 같은 글자 하나의 되풀이 -- "하하하" · "zzz"
 */
export function isContentFree(text: string): boolean {
  const compact = compactOf(text);
  if ((compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 2) return true;
  if (CONTENT_FREE.test(compact) || JAMO_ONLY.test(compact)) return true;
  if (wordsOf(text).every(isFillerWord)) return true;
  const chars = Array.from(compact);
  return chars.every((c) => c === chars[0]);
}

/** 영어 사실 답에서 떼고 보는 앞말. "the office" · "my dad" 도 이름 하나다. */
const EN_LEAD = new Set(["the", "a", "an", "my", "our", "his", "her", "their", "your", "at", "in", "on", "to"]);

/** 받침이 ㅆ 인 음절(했 · 었 · 았 · 였 · 쳤 · 있 …). 과거 시제와 '있다'의 표지다. */
function hasSsangSiotFinal(syllable: string): boolean {
  const code = syllable.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 20;
}

/**
 * 사실층에서 **술어 없는 짧은 언급**(장소 · 사람 이름 하나)인가.
 *
 * 그런 답은 장면을 열었지만 아직 "무슨 일이 있었나"가 없다("운동장이요" · "할머니 댁" ·
 * "Office"). 일부러 **좁게** 잡는다 -- 여기 걸리지 않은 답은 모델이 판정한다.
 * 글자 수로 내용을 재지 않는다(QA 261005 R2F-04): "시험 망쳤어요"(6자)는 사건이고,
 * 예전 문턱(ko 8 · en 14)은 이런 답까지 막아 모델을 한 번도 부르지 않고 대화를 끝냈다.
 *
 * - en: 앞말(the · my · at …)을 떼고 낱말이 하나만 남으면 언급이다.
 * - ko: 8자 미만이고, ㅆ 받침(과거 · 있다)도 활용 어미(-어/-아/-다 …)도 없으면 언급이다.
 *   "-이요 · -예요"처럼 이름 뒤에 붙는 말끝은 떼고 본다. 명사형("넘어짐")은 언급으로
 *   잡힐 수 있다 -- 그 답은 칸만 못 채우고, 대화는 모델의 다음 질문으로 이어진다.
 *   글자 수는 NFKC 로 맞춘 뒤 **코드 포인트**로 센다 -- 자모로 풀린 한글이 길게 세어져
 *   이 판정을 빠져나가지 않게(게이트 W4R1-02).
 */
export function isBareMention(text: string, locale: "en" | "ko"): boolean {
  if (locale === "en") {
    const words = text.normalize("NFKC").toLowerCase().replace(/[’]/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean);
    while (words.length > 1 && EN_LEAD.has(words[0]!)) words.shift();
    return words.length === 1;
  }
  const compact = compactOf(text);
  const length = Array.from(compact).length;
  if (length === 0 || length >= 8) return false;
  if (Array.from(compact).some(hasSsangSiotFinal)) return false;
  const stem = compact.replace(/(?:이에요|예요|이요|입니다|이야|요|야|임)$/u, "");
  if (stem.length === 0) return false;
  return !/(?:[어아여해워와져돼봐줘가]|다|지|죠|네|래|게|고|서|면|니|까)$/u.test(stem);
}

/**
 * Conservative sufficiency, not an intimacy/length score.
 *
 * 로컬 문턱은 **답이 비었는가**만 본다: 명시적 비답 · 맞장구 · 한 글자 · 사실층의 술어 없는
 * 언급. 그 밖의 짧은 답("나는 혼자다" · "책임감이요" · "People leave.")은 여기서 막지 않고
 * 모델의 판정을 받는다. 모델은 거부권만 갖는다(`confirmedAnswer`) -- 이 함수가 false 면
 * 모델이 닿았다고 해도 칸은 오르지 않는다. 그래서 이 함수와 화면의 로컬 비답 판정이
 * 갈라지면 "모델이 인정했는데 칸이 안 오르는" 답이 생긴다(R2F-04 가 본 모순).
 *
 * 판정 전에 NFKC 로 맞춘다 -- 같은 글자를 다른 코드 단위로 보낸 답(NFD 한글)이 같은 판정을
 * 받아야 한다. "비었는가"는 `isContentFree` 가 정한다(게이트 W4R1-02).
 */
export function canCreditAnswer(text: string, layer: DrillLayer, locale: "en" | "ko"): boolean {
  const normalized = text.normalize("NFKC");
  if (answerDisposition(normalized, locale) !== "answer") return false;
  if (isContentFree(normalized)) return false;
  if (layer === "fact") return !isBareMention(normalized, locale);
  return true;
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

/**
 * 모델 판정을 받은 답이 어떻게 끝났는가 (QA 261005 R2F-05).
 *
 * - `credited` : 로컬 문턱과 모델 판정이 모두 그 층을 인정했다.
 * - `missed`   : 모델이 "답을 아예 안 했다"(`none`)고 봤다. 막힘으로 센다.
 * - `unlanded` : 답은 했는데 그 층에 안 닿았다 -- 다른 층으로 판정됐거나, 판정이 없거나
 *                (응답이 깨짐), 로컬 문턱이 너무 성기다고 봤다. **막힘으로 세지 않는다.**
 *
 * `none` 은 직전 질문이 우회 질문(발판 · 같은 층 다시 묻기)이었어도 **막힘이다** (게이트
 * W4-R1-02). 처음에는 우회 질문 뒤의 `none` 을 막힘에서 뺐는데, 그러면 되묻기 · 항의 같은
 * 실제 비답도 빠져서 "왜 물으시는 건가요?" 세 번이 대화를 끝내지 않고 다음 층으로 밀었다
 * -- 못 답하겠다는 사람을 더 깊이 미는 셈이다. 우회 질문에 정직하게 답한 사람은 다른 길로
 * 지킨다: 프롬프트가 모델에게 "우회 질문에 답했으면 `none` 이 아니라 그 답이 닿은 층"을
 * 넣으라고 알리고(probe.ts 규칙 9), 그 판정은 `unlanded` 다.
 */
export function answerOutcome(
  confirmed: boolean,
  judgedLayer: DrillLayer | null | undefined,
): Exclude<AnswerOutcome, "blocked" | "errored"> {
  if (confirmed) return "credited";
  return judgedLayer === null ? "missed" : "unlanded";
}

/**
 * 이번 장면에서 한 층에 쌓인 **인정되지 않은 답**의 수.
 *
 * - `tries`    : 인정 못 받은 답 전부(비답 · 모델 none · 안 닿음). 층마다 상한이 있다
 *                (`MAX_TRIES_PER_LAYER`) -- 다 쓰면 그 칸은 비운 채 다음 층으로 간다.
 * - `failures` : 그중 "답을 못 했다"(화면의 비답 · 모델 none). 발판 번호이고, 상한을 넘으면
 *                대화를 끝낸다 -- 못 답하겠다는 사람을 더 깊이 밀지 않는다.
 *
 * 판정 전인 답(`answered` 없음)은 세지 않는다. 호출이 실패해 판정을 못 받은 답(`errored`)도
 * 세지 않는다 -- 요청이 실패한 것은 답이 부족한 것이 아니다(게이트 W4-R2-01).
 */
export function layerTally(
  scene: readonly InterviewTurn[], layer: DrillLayer,
): { tries: number; failures: number } {
  let tries = 0;
  let failures = 0;
  for (const turn of scene) {
    if (turn.role !== "user" || turn.layer !== layer || turn.answered !== false) continue;
    if (turn.outcome === "errored") continue;
    tries += 1;
    if (turn.outcome === "blocked" || turn.outcome === "missed") failures += 1;
  }
  return { tries, failures };
}
