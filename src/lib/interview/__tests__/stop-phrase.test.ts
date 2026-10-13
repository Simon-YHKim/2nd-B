import { answerDisposition, canCreditAnswer } from "../continuity";
import { emptyCoverage, nextMove, type InterviewTurn } from "../probe";

// An answer that only begins like "stop" used to end the interview (review of #2436, round 4).
// The lists below are the contract: what still stops, and what is an answer again.
//
// The rule: the first sentence is a request to stop and nothing else, with at most a short tail
// from a fixed list. A sentence that goes on to say anything else is an answer.

const KO_STOPS = [
  // the word alone
  "그만", "그만요", "여기까지", "여기까지요", "여기까지만", "여기까지만요", "멈춰", "멈춰요", "중단",
  // the word with an ending that asks
  "그만할래요", "그만 할게요", "그만할까요", "그만하자", "그만해요", "그만해", "그만해 주세요", "그만해줘요",
  "그만해도 될까요", "그만해도 돼요", "그만할 수 있을까요", "그만할 거예요",
  "여기까지 할래요", "여기까지만 할게요", "여기까지 하고 싶어요", "여기까지 할까요", "여기까지 해도 될까요",
  "여기까지 하고 끝낼게요", "여기까지 하겠습니다",
  "멈춰 주세요", "중단할게요", "중단해 주세요", "중단하고 싶어요", "중단할 겁니다", "끝낼게요", "끝낼래요",
  // a short tail from the list: a word of time or thanks, a plain reason
  "그만할래요 이제", "여기까지 할게요 오늘은", "여기까지 할게요, 죄송해요", "그만할래요 너무 힘들어요",
  "그만요, 더는 못 하겠어요", "여기까지만 할게요 감사합니다",
  // more sentences after it
  "그만할래요. 이제 다 그만하고 싶어요", "여기까지 할래요. 이제 다 그만하고 싶어요", "여기까지. 감사합니다",
  // a refusal, which may sit anywhere but has to end there
  "싫어요", "됐어요", "안 할래요", "그만 물어봐요", "말 안 할래요", "말하기 싫어요", "이 이야기는 불편해요",
  "지금은 이 일에 대해서 더 이상 이야기하고 싶지 않아요",
] as const;

// Every one of these ended the conversation before.
const KO_ANSWERS = [
  "여기까지 오는 데 친구들이 많이 도와줬어요",
  "여기까지 왔어요",
  "여기까지가 제가 기억하는 전부예요",
  "여기까지만 오면 됐어요",
  "여기까지 하고 싶었지만 더 했어요",
  "여기까지, 오는 데 여러 사람이 도와줬어요",
  "중단됐던 프로젝트를 다시 했어요",
  "중단했어요",
  "끝낼 수 없던 일이 있었어요",
  "끝낼게요 하다가 마음을 바꿨어요",
  "멈춰 서서 하늘을 봤어요",
  "멈춰 있던 시간이 길었어요",
  "그만할 수 없었던 운동이에요",
  "그만할 수 있나 고민했어요",
  "그만할 뻔했어요",
  "그만할까 고민했던 적이 있어요",
  "그만할래 하다가 계속했어요",
  "그만할래요 라고 말했다가 계속했어요",
  "그만할래요라고 말했어요",
  "그만해도 된다는 말을 들었어요",
  "그만해 봤는데 안 됐어요",
  "그만해야 했어요",
  "그만하자고 했어요",
  "말하기 싫다고 했지만 결국 이야기했어요",
  "이 이야기는 불편했지만 도움이 됐어요",
] as const;

const EN_STOPS = [
  "stop", "Stop.", "Stop…", "please stop", "stop please", "Stop. I can't do this.", "stop, I can't do this anymore",
  "stop asking questions", "stop asking me questions", "stop the interview", "stop this",
  "enough", "Enough, thanks.", "enough of these questions", "that's enough for today", "let's stop here",
  "I'm done", "I am done.", "I'm done with this", "I'm done with the interview", "I'm done answering",
  "no thanks", "No thanks.", "not now", "Not now, maybe later",
  // rules this change leaves as they were, or only asks to end where they stand
  "I want to stop here", "I'd rather not", "I'd rather not talk about it",
  "I don't want to talk about this anymore even if you ask in a different way.",
] as const;

// Every one of these ended the conversation before.
const EN_ANSWERS = [
  "Stop signs were everywhere in my town",
  "Enough food was a problem growing up",
  "No thanks to my brother, I failed the test",
  "Not now but later I understood why",
  "Not now, but later I understood why",
  "I'm done with school by then, so I worked",
  "I would rather not go to that school, I told my mom",
] as const;

// The rule as it was on main before this change, kept to check one thing over the lists in this
// file: the new rule does not stop where the old one did not. The lists are finite, so this is a
// regression check. That the new rule is a subset of the old one is argued from the patterns
// themselves (each stop sentence begins with a word of the old rule).
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
    expect(canCreditAnswer(text, "feeling", "ko")).toBe(false);
  });

  test.each(EN_STOPS)("en: %s", (text) => {
    expect(answerDisposition(text, "en")).toBe("stop");
    expect(moveAfter(text, "en")).toEqual({ kind: "finish" });
    expect(canCreditAnswer(text, "feeling", "en")).toBe(false);
  });
});

describe("an answer that only begins like one is an answer", () => {
  test.each(KO_ANSWERS)("ko: %s", (text) => {
    expect(answerDisposition(text, "ko")).toBe("answer");
    expect(moveAfter(text, "ko")).not.toEqual({ kind: "finish" });
    expect(stoppedBefore(text, "ko")).toBe(true);
  });

  test.each(EN_ANSWERS)("en: %s", (text) => {
    expect(answerDisposition(text, "en")).toBe("answer");
    expect(moveAfter(text, "en")).not.toEqual({ kind: "finish" });
    expect(stoppedBefore(text, "en")).toBe(true);
  });

  test("and it can earn its layer again", () => {
    // `canCreditAnswer` refuses whatever is not an answer, so these used to earn nothing.
    expect(canCreditAnswer("여기까지 오는 데 친구들이 많이 도와줬어요", "fact", "ko")).toBe(true);
    expect(canCreditAnswer("Stop signs were everywhere in my town", "fact", "en")).toBe(true);
  });
});

describe("the same words with different punctuation", () => {
  test("a comma does not end a sentence", () => {
    expect(answerDisposition("Not now, maybe later", "en")).toBe("stop");
    expect(answerDisposition("Not now, but later I understood why", "en")).toBe("answer");
    expect(answerDisposition("여기까지 할게요, 죄송해요", "ko")).toBe("stop");
    expect(answerDisposition("여기까지, 오는 데 여러 사람이 도와줬어요", "ko")).toBe("answer");
  });

  test("a full stop, an ellipsis or a line break does", () => {
    for (const text of ["여기까지. 오는 데 여러 사람이 도와줬어요", "여기까지… 오는 데 여러 사람이", "여기까지\n오는 데 여러 사람이"]) {
      expect([text, answerDisposition(text, "ko")]).toEqual([text, "stop"]);
    }
    for (const text of ["Stop. Signs were everywhere", "Stop… I can't", "stop\nplease"]) {
      expect([text, answerDisposition(text, "en")]).toEqual([text, "stop"]);
    }
  });
});

describe("narrower only (over the lists in this file)", () => {
  const corpus: Array<[string, "en" | "ko"]> = [
    ...KO_STOPS.map((text): [string, "ko"] => [text, "ko"]),
    ...KO_ANSWERS.map((text): [string, "ko"] => [text, "ko"]),
    ...EN_STOPS.map((text): [string, "en"] => [text, "en"]),
    ...EN_ANSWERS.map((text): [string, "en"] => [text, "en"]),
    // ordinary answers and near misses
    ["매점 종소리가 기억나요", "ko"], ["이제 그만할래요", "ko"], ["오늘은 여기까지 할게요", "ko"], ["그때는 말하기 싫었어요", "ko"],
    ["그만두고 새 회사에 들어갔어요", "ko"], ["모르겠어요", "ko"], ["그만하고 싶어요", "ko"], ["그만 해요", "ko"],
    ["그만합시다", "ko"], ["그만이요", "ko"], ["그만… 더는 못 하겠어요", "ko"], ["그만. 이제 됐어요", "ko"],
    ["I remember the bell", "en"], ["We stopped at the gate", "en"], ["I don't know", "en"],
    ["Stopped going to class in the second year", "en"], ["please, stop", "en"],
  ];

  test.each(corpus)("%s (%s) does not stop unless it stopped before", (text, locale) => {
    if (answerDisposition(text, locale) === "stop") expect(stoppedBefore(text, locale)).toBe(true);
  });

  test("what did not stop before still does not", () => {
    // Not widened on the way: the old rule did not know these forms, so they stay answers.
    // The bare word stopped only as the whole of what was said, and still does.
    for (const text of [
      "이제 그만할래요", "오늘은 여기까지 할게요", "그만하고 싶어요", "그만 해요", "그만합시다", "그만이요",
      "그만… 더는 못 하겠어요", "그만. 이제 됐어요",
    ]) {
      expect([text, stoppedBefore(text, "ko"), answerDisposition(text, "ko")]).toEqual([text, false, "answer"]);
    }
    for (const text of ["please, stop", "Stopped going to class in the second year"]) {
      expect([text, stoppedBefore(text, "en"), answerDisposition(text, "en")]).toEqual([text, false, "answer"]);
    }
  });
});
