// T33 · Simon 2026-10-14 Q-261014-15 가: the interview asks in HustleK's voice (an AI, not a person)
// and first takes back one short phrase from the user's last answer, then asks one thing.
// The prompt asks for it; the acceptance check (independent review r1 · r2) makes it hold:
// - after a real answer, a question always opens with a phrase the user actually said
//   (the model's own echo when it is true, otherwise one taken mechanically from the answer);
// - after a non-answer (stop · decline · unsure · nothing yet) nothing is quoted;
// - after stop or decline the only fallback is the rule-4 closing line, never another question;
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
const echo = { echo: true } as const;
const QUOTE = /(?<![A-Za-z0-9])['‘"“「『]/u;

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

describe("after a real answer the question opens with the user's own words", () => {
  test.each([
    ["ko", KO, "'도서관 창가 자리에 혼자'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", EN, "You said “alone by the library window”, so what did that feel like in your body?"],
  ] as const)("%s keeps a true echo as it is", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(question);
  });

  test.each([
    ["ko", KO, "그때 몸은 어떤 느낌이었나요?", "'혼자 앉아 있었어요'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", EN, "What's the first thing you noticed there?", "You said “library window after class”. What's the first thing you noticed there?"],
  ] as const)("%s puts a phrase from the answer in front of a question that has none", (locale, history, question, expected) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(expected);
  });

  test.each([
    ["ko", KO, "'운동장에서 뛰었다'라고 하셨는데, 그때 기분은 어땠나요?"],
    ["en", EN, "You said “played in the gym”, so how did that feel?"],
  ] as const)("%s refuses a quote the user never said and still opens with their words", (locale, history, question) => {
    const shown = usableQuestion(question, history, "feeling", locale, 0, echo);
    expect(shown).not.toBe(question);
    expect(shown).not.toMatch(/운동장|gym/u);
    expect(shown).toMatch(QUOTE);
    expect(shown.endsWith(usableQuestion("", history, "feeling", locale))).toBe(true);
  });

  test.each([
    ["ko", scene("왜 그 일을 계속했나요?", "비 오는 날이 싫어서 계속 연습했어요."), "'비 오는 날이 싫어서'라고 하셨는데, 그때 어떤 마음이었나요?"],
    ["en", scene("What is on your mind at work?", "I don't want to leave my current job."), "You said “don't want to leave my current job”, so what keeps you there?"],
  ] as const)("%s keeps a true quote that only contains a negative word", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(question);
  });

  test("a line without a question mark (closing or pivot) gets no echo", () => {
    expect(usableQuestion("여기서 멈춰도 좋아요.", KO, "feeling", "ko", 0, echo)).toBe("여기서 멈춰도 좋아요.");
    expect(usableQuestion("Call 109 now.", EN, "feeling", "en", 0, echo)).toBe("Call 109 now.");
  });

  test("the model path echoes; a yellow reply and the guidance-free default do not", async () => {
    expect((await probe("ko", KO, "그때 몸은 어떤 느낌이었나요?")).question).toMatch(/^'혼자 앉아 있었어요'라고 하셨는데, /u);
    expect((await probe("ko", KO, "그때 몸은 어떤 느낌이었나요?", "yellow")).question).toBe("그때 몸은 어떤 느낌이었나요?");
    expect(usableQuestion("그때 몸은 어떤 느낌이었나요?", KO, "feeling", "ko")).toBe("그때 몸은 어떤 느낌이었나요?");
  });
});

describe("after a non-answer nothing is quoted", () => {
  test.each([
    ["ko", scene("그 일이 어떤 의미였나요?", "잘 모르겠어요."), "'잘 모르겠어요'라고 하셨는데, 그 일이 없었다면 뭐가 달랐을까요?"],
    ["en", scene("What did that mean to you?", "I don't really know."), "You said “I don't really know”, so what would have been different?"],
  ] as const)("%s unsure: the quote is refused and the prepared question has none", (locale, history, question) => {
    const shown = usableQuestion(question, history, "meaning", locale, 0, echo);
    expect(shown).not.toBe(question);
    expect(shown).not.toMatch(QUOTE);
    expect(usableQuestion("그 일이 없었다면 뭐가 달랐을까요?", history, "meaning", locale, 0, echo)).not.toMatch(QUOTE);
  });

  test.each([
    ["ko", scene("그때 집에서는 어땠나요?", "그 얘기는 하고 싶지 않아요."), "'그 얘기는'이라고 하셨는데, 다른 장면은 어떤가요?", "여기서 멈춰도 좋아요."],
    ["en", scene("How were things at home?", "I'd rather not talk about that."), "You said “talk about that”, so what else comes to mind?", "It's okay to pause here."],
  ] as const)("%s decline: any quote, or nothing usable, gives the rule-4 closing line", (locale, history, question, closing) => {
    expect(usableQuestion(question, history, "feeling", locale, 0, echo)).toBe(closing);
    expect(usableQuestion("", history, "feeling", locale, 0, echo)).toBe(closing);
    expect(usableQuestion(closing, history, "feeling", locale, 0, echo)).toBe(closing);
  });

  test("no answer yet: a quote is refused", () => {
    const first: InterviewTurn[] = [{ role: "interviewer", text: "그날 어디에 있었나요?", layer: "fact", period: "school", sceneStart: true }];
    expect(usableQuestion("'도서관'이라고 하셨는데, 누가 있었나요?", first, "fact", "ko", 0, echo)).not.toMatch(QUOTE);
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
});
