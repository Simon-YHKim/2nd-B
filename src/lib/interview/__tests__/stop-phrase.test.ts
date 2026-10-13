import { answerDisposition, canCreditAnswer } from "../continuity";
import { emptyCoverage, nextMove, type InterviewTurn } from "../probe";

// An answer that only begins like "stop" used to end the interview (review of #2436, round 4).
// The lists below are the contract: what still stops, and what is an answer again.

const KO_STOPS = [
  // the word alone
  "그만", "그만요", "여기까지", "여기까지요", "여기까지만", "여기까지만요", "멈춰", "멈춰요", "중단",
  // the word with an ending that asks
  "그만할래요", "그만 할게요", "그만할까요", "그만하자", "그만해요", "그만해", "그만해 주세요", "그만해줘요",
  "그만해도 될까요", "그만해도 돼요", "그만할 수 있을까요",
  "여기까지 할래요", "여기까지만 할게요", "여기까지 하고 싶어요", "여기까지 할까요", "여기까지 해도 될까요",
  "멈춰 주세요", "중단할게요", "중단해 주세요", "중단하고 싶어요", "끝낼게요", "끝낼래요",
  // more said after it
  "그만할래요. 이제 다 그만하고 싶어요", "여기까지 할래요. 이제 다 그만하고 싶어요", "여기까지. 감사합니다",
  "그만할래요 너무 힘들어요", "여기까지 할게요, 죄송해요", "그만요, 더는 못 하겠어요",
  // rules this change does not touch
  "싫어요", "됐어요", "안 할래요", "그만 물어봐요", "말 안 할래요", "이 이야기는 불편해요",
  "지금은 이 일에 대해서 더 이상 이야기하고 싶지 않아요",
] as const;

const KO_ANSWERS = [
  "여기까지 오는 데 친구들이 많이 도와줬어요",
  "여기까지 왔어요",
  "여기까지가 제가 기억하는 전부예요",
  "여기까지만 오면 됐어요",
  "여기까지 하고 싶었지만 더 했어요",
  "중단됐던 프로젝트를 다시 했어요",
  "중단했어요",
  "끝낼 수 없던 일이 있었어요",
  "멈춰 서서 하늘을 봤어요",
  "멈춰 있던 시간이 길었어요",
  "그만할 수 없었던 운동이에요",
  "그만할 뻔했어요",
  "그만할까 고민했던 적이 있어요",
  "그만해도 된다는 말을 들었어요",
  "그만해 봤는데 안 됐어요",
  "그만해야 했어요",
  "그만하자고 했어요",
  "그만할래요라고 말했어요",
] as const;

const EN_STOPS = [
  "stop", "Stop.", "please stop", "stop please", "Stop. I can't do this.", "enough", "Enough, thanks.",
  "that's enough for today", "let's stop here", "I'm done", "I am done.", "I'm done with this",
  "I'm done with the interview", "no thanks", "No thanks.", "not now", "Not now, maybe later",
  // rules this change does not touch
  "I want to stop here", "I'd rather not",
  "I don't want to talk about this anymore even if you ask in a different way.",
] as const;

const EN_ANSWERS = [
  "Stop signs were everywhere in my town",
  "Enough food was a problem growing up",
  "No thanks to my brother, I failed the test",
  "Not now but later I understood why",
  "I'm done with school by then, so I worked",
  "Stopped going to class in the second year",
] as const;

// The rule as it was on main before this change, kept only to check one thing: the new rule
// never stops where the old one did not.
function stoppedBefore(text: string, locale: "en" | "ko"): boolean {
  const clean = text.trim().toLowerCase().replace(/[.!?。！？]+$/u, "");
  if (locale === "ko") {
    return (
      /^(싫어요|싫어|안\s?할래요?|됐어요|됐어)$/.test(clean) ||
      /^그만\s*(?:물어|물으|묻|질문|얘기|이야기)/.test(clean) ||
      /^(?:그만(?:요|할|\s*할|하자|해)|그만$|여기까지|멈춰|중단|끝낼)|(?:말|얘기|이야기|답)(?:하고|하기|하긴|변하기)?\s*싫(?:어|다|네|습니다)|(?:말|이야기|답변)하고 싶지 않(?:아|다|네|습니다)|말\s*안\s*할래|말하지 않을래|(?:이야기|얘기|주제)(?:는|가)\s*불편/.test(clean)
    );
  }
  return (
    /\b(?:i want to|i'?d like to|can we|let us)\s+stop\b/.test(clean) ||
    /^(?:please\s+)?(?:stop|enough|let'?s stop|i'?m done|i am done|that'?s enough|no thanks|not now)\b|\b(?:don'?t|do not|would rather not)\s+(?:want to\s+)?(?:talk|share|answer)|\b(?:prefer|rather) not(?: to)?\b|\bnot comfortable (?:sharing|talking|answering)\b/.test(clean)
  );
}

const scene: InterviewTurn[] = [
  { role: "interviewer", text: "어떤 장면이 떠오르나요?", layer: "fact", sceneStart: true },
  { role: "user", text: "운동장 옆 매점에서 종소리를 듣던 기억이 나요", layer: "fact" },
];
const now = new Date("2026-10-14T00:00:00Z");
const moveAfter = (text: string, locale: "en" | "ko") =>
  nextMove(emptyCoverage(), "school", [], now, null, [], {
    history: [...scene, { role: "user", text, layer: "feeling" }],
    locale,
  });

describe("a request to stop still ends the conversation", () => {
  test.each(KO_STOPS)("ko: %s", (text) => {
    expect(answerDisposition(text, "ko")).toBe("stop");
    expect(moveAfter(text, "ko")).toEqual({ kind: "finish" });
  });

  test.each(EN_STOPS)("en: %s", (text) => {
    expect(answerDisposition(text, "en")).toBe("stop");
    expect(moveAfter(text, "en")).toEqual({ kind: "finish" });
  });
});

describe("an answer that only begins like one is an answer", () => {
  test.each(KO_ANSWERS)("ko: %s", (text) => {
    expect(answerDisposition(text, "ko")).toBe("answer");
    expect(moveAfter(text, "ko")).not.toEqual({ kind: "finish" });
  });

  test.each(EN_ANSWERS)("en: %s", (text) => {
    expect(answerDisposition(text, "en")).toBe("answer");
    expect(moveAfter(text, "en")).not.toEqual({ kind: "finish" });
  });

  test("and it can earn its layer again", () => {
    // `canCreditAnswer` refuses whatever is not an answer, so these used to earn nothing.
    expect(canCreditAnswer("여기까지 오는 데 친구들이 많이 도와줬어요", "fact", "ko")).toBe(true);
    expect(canCreditAnswer("Stop signs were everywhere in my town", "fact", "en")).toBe(true);
  });

  test("every one of them ended the conversation before", () => {
    for (const text of KO_ANSWERS) expect([text, stoppedBefore(text, "ko")]).toEqual([text, true]);
    for (const text of EN_ANSWERS.slice(0, 5)) expect([text, stoppedBefore(text, "en")]).toEqual([text, true]);
  });
});

describe("narrower only", () => {
  const corpus: Array<[string, "en" | "ko"]> = [
    ...KO_STOPS.map((text): [string, "ko"] => [text, "ko"]),
    ...KO_ANSWERS.map((text): [string, "ko"] => [text, "ko"]),
    ...EN_STOPS.map((text): [string, "en"] => [text, "en"]),
    ...EN_ANSWERS.map((text): [string, "en"] => [text, "en"]),
    // ordinary answers and near misses
    ["매점 종소리가 기억나요", "ko"], ["이제 그만할래요", "ko"], ["오늘은 여기까지 할게요", "ko"], ["그때는 말하기 싫었어요", "ko"],
    ["그만두고 새 회사에 들어갔어요", "ko"], ["모르겠어요", "ko"], ["그만하고 싶어요", "ko"],
    ["I remember the bell", "en"], ["We stopped at the gate", "en"], ["I don't know", "en"],
  ];

  test.each(corpus)("%s (%s) does not stop unless it stopped before", (text, locale) => {
    if (answerDisposition(text, locale) === "stop") expect(stoppedBefore(text, locale)).toBe(true);
  });

  test("what did not stop before still does not", () => {
    // Not widened on the way: these were answers on main and are answers now.
    for (const text of ["이제 그만할래요", "오늘은 여기까지 할게요", "그만하고 싶어요", "그만두고 새 회사에 들어갔어요"]) {
      expect([text, stoppedBefore(text, "ko"), answerDisposition(text, "ko")]).toEqual([text, false, "answer"]);
    }
  });
});
