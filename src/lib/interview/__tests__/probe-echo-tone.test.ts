// T33 · Simon 2026-10-14 Q-261014-15 가: the interview asks in HustleK's voice (an AI, not a person)
// and first takes back one short phrase from the user's last answer, then asks one thing.
// The prompt asks for it; on the model path the acceptance check makes it hold
// (independent review r1 · r2 · r3):
// - after a stop the reply is the rule-4 closing line, before anything else is considered;
// - after a real answer in the current scene, a question opens with exactly one quote of the user's
//   own words (the model's when it is leading, single and true; otherwise a phrase taken from the
//   answer, in front of the model's question or of a prepared one);
// - after decline · unsure · skip · no answer in this scene, nothing is quoted (never a closing);
// - Korean question bodies end in 해요체 and ask or suggest one thing;
// - a line without a question mark (rule-4 closing, rule-5 pivot) gets no echo;
// - a repeat hidden behind a new quote or a new lead-in is still a repeat.
import { callLlm } from "../../llm/boundary";
import type { LlmResult } from "../../llm/types";
import { emptyCoverage, nextProbe, usableQuestion, type InterviewTurn } from "../probe";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const llm = jest.mocked(callLlm);

function reply(question: string, zone: "green" | "yellow" = "green"): LlmResult<unknown> {
  return {
    text: JSON.stringify({ question, answeredLayer: "fact", openers: [] }),
    safety: { zone, matched: [], categories: [] },
    audit: { promptHash: "fixture", outputHash: "fixture", modelUsed: "offline", vertexBackend: false, safetyZone: zone, latencyMs: 0 },
  };
}

const scene = (q: string, a: string, period: InterviewTurn["period"] = "school"): InterviewTurn[] => [
  { role: "interviewer", text: q, layer: "fact", period, sceneStart: true },
  { role: "user", text: a, layer: "fact", period },
];
const KO = scene("그날 어디에 있었나요?", "방과 후에 도서관 창가 자리에 혼자 앉아 있었어요.");
const EN = scene("Where were you that day?", "I sat alone by the library window after class.");
const echo = { path: "model", zone: "green", guidance: false } as const;
const QUOTE = /(?<![A-Za-z0-9])['‘"“「『]/u;
const plainKo = usableQuestion("", KO, "feeling", "ko");

async function probe(locale: "ko" | "en", history: InterviewTurn[], question: string, zone: "green" | "yellow" = "green") {
  llm.mockResolvedValueOnce(reply(question, zone));
  return nextProbe("qa-echo", locale, "school", history, emptyCoverage(), false, 0, "feeling");
}

beforeEach(() => llm.mockReset());

describe("interview speaks as HustleK and takes back one phrase before asking", () => {
  test("Korean prompt names HustleK as an AI, asks for one echoed phrase, and lets stop and crisis win", async () => {
    await probe("ko", KO, "그때 누가 있었나요?");
    const system = String(llm.mock.calls.at(-1)![0].system);
    expect(system).toContain("당신은 허슬케이입니다");
    expect(system).toContain("사람이 아니라 AI");
    expect(system).toContain("한 구절");
    expect(system).toContain("받아 주지도 묻지도 않고 그 규칙만 따릅니다");
    expect(system).not.toContain("질문하는 인터뷰어입니다");
  });

  test("English prompt names HustleK as an AI, asks for one echoed phrase, and lets stop and crisis win", async () => {
    await probe("en", EN, "Who else was there?");
    const system = String(llm.mock.calls.at(-1)![0].system);
    expect(system).toContain("You are HustleK");
    expect(system).toContain("an AI, not a person");
    expect(system).toContain("one short phrase");
    expect(system).toContain("do not take a phrase back or ask; follow only that rule");
    expect(system).not.toContain("You are an interviewer");
  });
});

describe("after a stop the rule-4 closing line comes first", () => {
  test.each([
    ["ko", scene("요즘 어떤 순간이 기억에 남나요?", "그만할래요."), "다른 이야기를 해 볼까요?", "여기서 멈춰도 좋아요."],
    ["en", scene("What stays with you lately?", "Let's stop here."), "Shall we talk about something else?", "It's okay to pause here."],
    ["en", scene("How were things at home?", "I'd rather not talk about that."), "What else comes to mind?", "It's okay to pause here."],
  ] as const)("%s: even a valid unquoted question closes", (locale, history, question, closing) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(closing);
    expect(usableQuestion("", history, "feeling", locale, 0, echo)).toBe(closing);
  });
});

describe("after a real answer the question opens with exactly one quote of the user's own words", () => {
  test.each([
    ["ko", KO, "'도서관 창가 자리에 혼자'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", EN, "You said “alone by the library window”, so what did that feel like in your body?"],
  ] as const)("%s keeps a leading, single, true quote", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(question);
  });

  test.each([
    ["ko", KO, "그때 몸은 어떤 느낌이었나요?", "'혼자 앉아 있었어요'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", EN, "What's the first thing you noticed there?", "You said “library window after class”. What's the first thing you noticed there?"],
  ] as const)("%s puts a phrase from the answer in front of a question that has none", (locale, history, question, expected) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(expected);
  });

  test.each([
    ["ko", KO, "'운동장에서 뛰었다'라고 하셨는데, 그때 기분은 어땠나요?", "made-up"],
    ["ko", KO, "그때 '도서관 창가'에서 무엇을 했나요?", "trailing"],
    ["ko", KO, "'도서관 창가'라고 하셨는데, '혼자 앉아'에 대해 더 말해 줄래요?", "two quotes"],
    ["en", EN, "You said “played in the gym”, so how did that feel?", "made-up"],
    ["en", EN, "What did you do by the “library window”?", "trailing"],
  ] as const)("%s refuses a quote (%s) and opens the prepared question with the user's words", (locale, history, question, _kind) => {
    const shown = usableQuestion(question, history, "feeling", locale, 0, echo);
    expect(shown).not.toBe(question);
    expect(shown).toMatch(QUOTE);
    expect(shown.search(QUOTE)).toBeLessThanOrEqual(locale === "en" ? 9 : 0);
    expect(shown.endsWith(usableQuestion("", history, "feeling", locale))).toBe(true);
  });

  test("a question too long to take an echo falls back to the prepared question with one", () => {
    const long = `${"그때 ".repeat(150).slice(0, 300)}무엇이 보였나요?`;
    expect(long.length).toBeLessThanOrEqual(320);
    const shown = usableQuestion(long, KO, "feeling", "ko", 0, echo);
    expect(shown).toBe(`'혼자 앉아 있었어요'라고 하셨는데, ${plainKo}`);
  });

  test("the user's words stay as they were: an apostrophe and a long answer without spaces", () => {
    const apostrophe = scene("How do you feel about it?", "I don't feel ready yet.");
    expect(usableQuestion("What would ready look like?", apostrophe, "feeling", "en", 0, echo))
      .toBe("You said “don't feel ready yet”. What would ready look like?");
    const noSpaces = scene("그날 어디에 있었나요?", "방과후에도서관창가자리에혼자앉아있었어요오래오래");
    const shown = usableQuestion("그때 몸은 어떤 느낌이었나요?", noSpaces, "feeling", "ko", 0, echo);
    const quoted = shown.match(/^'([^']+)'라고 하셨는데, /u)?.[1] ?? "";
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.length).toBeLessThanOrEqual(24);
    expect(noSpaces[1].text).toContain(quoted);
  });

  test.each([
    ["ko", scene("왜 그 일을 계속했나요?", "비 오는 날이 싫어서 계속 연습했어요."), "'비 오는 날이 싫어서'라고 하셨는데, 그때 어떤 마음이었나요?"],
    ["ko", scene("그때 집에서는 어땠나요?", "그때는 그 이야기를 하고 싶지 않았어요."), "'하고 싶지 않았어요'라고 하셨는데, 그때 무엇이 가장 마음에 걸렸나요?"],
    ["ko", scene("요즘 일은 어떤가요?", "그 일은 하고 싶지 않아요."), "'그 일은 하고 싶지 않아요'라고 하셨는데, 어떤 점이 가장 걸리나요?"],
    ["en", scene("What about weekends?", "I won't work weekends anymore."), "You said “won't work weekends anymore”, so what changed?"],
    ["en", scene("What is on your mind at work?", "I don't want to leave my current job."), "You said “don't want to leave my current job”, so what keeps you there?"],
  ] as const)("%s keeps a true quote of an answer that only contains a negative word or a past refusal", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(question);
  });

  test.each([
    ["'도서관 창가'라고 하셨는데, 그때 뭐 했어?", "반말"],
    ["'도서관 창가'라고 하셨는데, 그때 무엇을 하셨습니까?", "하십시오체"],
    ["'도서관 창가'라고 하셨는데, 먼저 장면을 말해 주세요. 이유도 알려 주세요.", "두 가지 요청"],
    ["'도서관 창가'라고 하셨는데, 그때 기분은 어땠나요? 누가 있었나요?", "두 질문"],
  ] as const)("Korean body must be 해요체 and one thing: %s (%s) is replaced", (question, _why) => {
    const shown = usableQuestion(question, KO, "feeling", "ko", 0, echo);
    expect(shown).not.toBe(question);
    expect(shown).toBe(`'혼자 앉아 있었어요'라고 하셨는데, ${plainKo}`);
  });

  test("a rule-5 pivot that names a hotline passes as it is, with no echo", () => {
    expect(usableQuestion("Call 109 now.", EN, "feeling", "en", 0, echo)).toBe("Call 109 now.");
    expect(usableQuestion("지금은 109에 연락해 보세요.", KO, "feeling", "ko", 0, echo)).toBe("지금은 109에 연락해 보세요.");
  });

  test.each([
    ["그렇군요.", "질문 · 요청 0"],
    ["여기서 멈춰도 좋아요.", "실제 답 뒤의 닫는 말"],
    ["'도서관 창가'라고 하셨는데, 장면을 말해 주세요, 이유도 알려 주세요.", "한 문장 안 요청 둘"],
  ] as const)("a Korean line after a real answer must ask or suggest exactly one thing: %s (%s)", (question, _why) => {
    expect(usableQuestion(question, KO, "feeling", "ko", 0, echo)).toBe(`'혼자 앉아 있었어요'라고 하셨는데, ${plainKo}`);
  });

  test.each([
    ["ko", scene("그날 어디에 있었나요?", "방과 후 도서관에서 \"혼자\" 있었어요."), "그때 몸은 어떤 느낌이었나요?", "'방과 후 도서관에서'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", scene("Where were you?", "I stayed in the library “alone”."), "What did you notice there?", "You said “stayed in the library”. What did you notice there?"],
  ] as const)("%s: an answer ending in a quoted word still gives an echo from the words before it", (locale, history, question, expected) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(expected);
  });

  test.each([
    ["ko", KO, "'...'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", EN, "You said “…”, so what did you notice?"],
  ] as const)("%s: a quote of punctuation only is not the user's words", (locale, history, question) => {
    const shown = usableQuestion(question, history, "feeling", locale, 0, echo);
    expect(shown).not.toBe(question);
    expect(shown).toMatch(locale === "ko" ? /^'혼자 앉아 있었어요'라고 하셨는데, / : /^You said “library window after class”\. /u);
  });

  test("the model path echoes; a yellow reply and the default (other callers) do not", async () => {
    expect((await probe("ko", KO, "그때 몸은 어떤 느낌이었나요?")).question).toMatch(/^'혼자 앉아 있었어요'라고 하셨는데, /u);
    expect((await probe("ko", KO, "그때 몸은 어떤 느낌이었나요?", "yellow")).question).toBe("그때 몸은 어떤 느낌이었나요?");
    expect(usableQuestion("그때 몸은 어떤 느낌이었나요?", KO, "feeling", "ko")).toBe("그때 몸은 어떤 느낌이었나요?");
  });
});

describe("the safety state comes before the echo", () => {
  const yellow = { path: "model", zone: "yellow", guidance: false } as const;
  const withGuidance = { path: "model", zone: "green", guidance: true } as const;
  const red = { path: "model", zone: "red", guidance: false } as const;
  test("a yellow reply or shown guidance may not quote the user, even truly", async () => {
    const quoted = "'도서관 창가 자리에 혼자'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?";
    for (const options of [yellow, withGuidance]) {
      const shown = usableQuestion(quoted, KO, "feeling", "ko", 0, options);
      expect(shown).not.toMatch(QUOTE);
      expect(shown).toBe(plainKo);
    }
    expect((await probe("ko", KO, quoted, "yellow")).question).not.toMatch(QUOTE);
  });

  test("a stop closes on green and yellow alike; red and shown guidance keep their own path", async () => {
    const stop = scene("요즘 어떤 순간이 기억에 남나요?", "그만할래요.");
    expect(usableQuestion("다른 이야기를 해 볼까요?", stop, "feeling", "ko", 0, yellow)).toBe("여기서 멈춰도 좋아요.");
    expect((await probe("ko", stop, "다른 이야기를 해 볼까요?", "yellow")).question).toBe("여기서 멈춰도 좋아요.");
    expect(usableQuestion("", stop, "feeling", "ko", 0, withGuidance)).toBe(usableQuestion("", stop, "feeling", "ko"));
    expect(usableQuestion("", stop, "feeling", "ko", 0, red)).toBe(usableQuestion("", stop, "feeling", "ko"));
  });
});

describe("after a non-answer, or with no answer in this scene, nothing is quoted and nothing closes", () => {
  test.each([
    ["ko", scene("그 일이 어떤 의미였나요?", "잘 모르겠어요."), "'잘 모르겠어요'라고 하셨는데, 그 일이 없었다면 뭐가 달랐을까요?", "meaning"],
    ["en", scene("What did that mean to you?", "I don't really know."), "You said “I don't really know”, so what would have been different?", "meaning"],
    ["ko", scene("그때 집에서는 어땠나요?", "그 얘기는 하고 싶지 않아요."), "'그 얘기는'이라고 하셨는데, 다른 장면은 어떤가요?", "feeling"],
    ["ko", scene("그때 집에서는 어땠나요?", "죄송하지만 그 이야기는 지금은 하고 싶지 않아요."), "'그 이야기는'이라고 하셨는데, 다른 장면은 어떤가요?", "feeling"],
  ] as const)("%s refuses the quote and gives an unquoted prepared question", (locale, history, question, layer) => {
    const shown = usableQuestion(question, history, layer, locale, 0, echo);
    expect(shown).not.toBe(question);
    expect(shown).not.toMatch(QUOTE);
    expect(shown).not.toMatch(/멈춰도 좋아요|pause here/u);
    expect(usableQuestion("다른 장면은 어떤가요?", history, layer, locale, 0, echo)).toBe("다른 장면은 어떤가요?");
  });

  test("after a decline the model may close with rule 4's exact line instead of asking about it again", () => {
    const decline = scene("그때 집에서는 어땠나요?", "그 얘기는 하고 싶지 않아요.");
    expect(usableQuestion("여기서 멈춰도 좋아요.", decline, "feeling", "ko", 0, echo)).toBe("여기서 멈춰도 좋아요.");
    expect(usableQuestion("여기서 멈춰도 좋아요.", KO, "feeling", "ko", 0, echo)).not.toBe("여기서 멈춰도 좋아요.");
  });

  test("no answer in the current scene: an earlier scene's answer is never quoted", () => {
    const history: InterviewTurn[] = [...KO, { role: "interviewer", text: "다른 장면을 떠올려 볼까요?", layer: "fact", period: "school", sceneStart: true }];
    const shown = usableQuestion("그때 어디에 있었나요?", history, "fact", "ko", 0, echo);
    expect(shown).toBe("그때 어디에 있었나요?");
    expect(usableQuestion("'혼자 앉아'라고 하셨는데, 누가 있었나요?", history, "fact", "ko", 0, echo)).not.toMatch(QUOTE);
  });
});

describe("a repeat stays a repeat behind a quote or a lead-in", () => {
  const koRepeat: InterviewTurn[] = [...KO,
    { role: "interviewer", text: "그 말을 들었을 때 바로 어떤 기분이었나요?", layer: "feeling", period: "school" },
    { role: "user", text: "선생님이 다시 해 오라고 했어요.", layer: "feeling", period: "school" }];
  const enRepeat: InterviewTurn[] = [...EN,
    { role: "interviewer", text: "Right after that, what did you feel in your body?", layer: "feeling", period: "school" },
    { role: "user", text: "My teacher told me to redo it.", layer: "feeling", period: "school" }];
  test.each([
    ["ko", koRepeat, "'다시 해 오라고'라고 하셨는데, 그 말을 들었을 때 바로 어떤 기분이었나요?"],
    ["ko", koRepeat, "'다시 해 오라고'라는 말에 머물러 보면, 그 말을 들었을 때 바로 어떤 기분이었나요?"],
    ["en", enRepeat, "You said “told me to redo it” - right after that, what did you feel in your body?"],
    ["en", enRepeat, "Thinking back to “told me to redo it”, and focusing on that moment, right after that, what did you feel in your body?"],
    ["en", enRepeat, "You mentioned “told me to redo it”. Right after that, what did you feel in your body?"],
  ] as const)("%s refuses: %s", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).not.toBe(question);
  });

  test.each([
    ["ko", [...KO,
      { role: "interviewer", text: "'혼자 앉아'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?", layer: "feeling", period: "school" },
      { role: "user", text: "창밖에 비가 오고 있었어요.", layer: "feeling", period: "school" }] as InterviewTurn[],
      "'비가 오고'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", [...EN,
      { role: "interviewer", text: "You said “alone”. What did that feel like in your body?", layer: "feeling", period: "school" },
      { role: "user", text: "It was raining outside the window.", layer: "feeling", period: "school" }] as InterviewTurn[],
      "You said “raining outside”. What did that feel like in your body?"],
  ] as const)("%s: an earlier echoed question with a different quote is still the same question", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).not.toBe(question);
  });

  test("a prepared question already asked behind an echo is not chosen again", () => {
    const asked: InterviewTurn[] = [...KO,
      { role: "interviewer", text: `'혼자 앉아 있었어요'라고 하셨는데, ${plainKo}`, layer: "feeling", period: "school" },
      { role: "user", text: "창밖에 비가 오고 있었어요.", layer: "feeling", period: "school" }];
    const shown = usableQuestion("", asked, "feeling", "ko", 0, echo);
    expect(shown.endsWith(plainKo)).toBe(false);
  });
});
