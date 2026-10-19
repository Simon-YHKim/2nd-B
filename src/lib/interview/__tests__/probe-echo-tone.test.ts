// T33 · Simon 2026-10-14 Q-261014-15 가: the interview asks in HustleK's voice (an AI, not a person)
// and first takes back one short phrase from the user's last answer, then asks one thing.
// The rule lives in the system prompt; the acceptance check refuses a quote the user never said,
// a quote after a non-answer, and a repeat hidden behind a new quote (independent review r1).
import { callLlm } from "../../llm/boundary";
import type { LlmResult } from "../../llm/types";
import { emptyCoverage, nextProbe, usableQuestion, type InterviewTurn } from "../probe";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const llm = jest.mocked(callLlm);

function reply(question: string): LlmResult<unknown> {
  return {
    text: JSON.stringify({ question, answeredLayer: "fact", openers: [] }),
    safety: { zone: "green", matched: [], categories: [] },
    audit: { promptHash: "fixture", outputHash: "fixture", modelUsed: "offline", vertexBackend: false, safetyZone: "green", latencyMs: 0 },
  };
}

const scene = (q: string, a: string, period: InterviewTurn["period"] = "school"): InterviewTurn[] => [
  { role: "interviewer", text: q, layer: "fact", period, sceneStart: true },
  { role: "user", text: a, layer: "fact", period },
];
const KO = scene("그날 어디에 있었나요?", "방과 후에 도서관 창가 자리에 혼자 앉아 있었어요.");
const EN = scene("Where were you that day?", "I sat alone by the library window after class.");

async function systemFor(locale: "ko" | "en", history: InterviewTurn[]): Promise<string> {
  llm.mockResolvedValueOnce(reply(locale === "ko" ? "그때 누가 있었나요?" : "Who else was there?"));
  await nextProbe("qa-echo", locale, "school", history, emptyCoverage(), false, 0, "feeling");
  return String(llm.mock.calls.at(-1)![0].system);
}

beforeEach(() => llm.mockReset());

describe("interview speaks as HustleK and takes back one phrase before asking", () => {
  test("Korean prompt names HustleK as an AI, asks for one echoed phrase, and lets stop and crisis win", async () => {
    const system = await systemFor("ko", KO);
    expect(system).toContain("당신은 허슬케이입니다");
    expect(system).toContain("사람이 아니라 AI");
    expect(system).toContain("한 구절");
    expect(system).toContain("받아 주지도 묻지도 않고 그 규칙만 따릅니다");
    expect(system).not.toContain("질문하는 인터뷰어입니다");
  });

  test("English prompt names HustleK as an AI, asks for one echoed phrase, and lets stop and crisis win", async () => {
    const system = await systemFor("en", EN);
    expect(system).toContain("You are HustleK");
    expect(system).toContain("an AI, not a person");
    expect(system).toContain("one short phrase");
    expect(system).toContain("do not take a phrase back or ask; follow only that rule");
    expect(system).not.toContain("You are an interviewer");
  });
});

describe("acceptance check for echoed questions", () => {
  test.each([
    ["ko", KO, "'도서관 창가 자리에 혼자'라고 하셨는데, 그때 몸은 어떤 느낌이었나요?"],
    ["en", EN, "You said “alone by the library window”, so what did that feel like in your body?"],
    ["en", EN, "What's the first thing you noticed there?"],
  ] as const)("%s keeps a true echo or a plain question", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale)).toBe(question);
  });

  test.each([
    ["ko", KO, "'운동장에서 뛰었다'라고 하셨는데, 그때 기분은 어땠나요?"],
    ["en", EN, "You said “played in the gym”, so how did that feel?"],
  ] as const)("%s refuses a quote the user never said", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale)).not.toBe(question);
  });

  test.each([
    ["ko", scene("그 일이 어떤 의미였나요?", "잘 모르겠어요."), "'잘 모르겠어요'라고 하셨는데, 그 일이 없었다면 뭐가 달랐을까요?"],
    ["ko", scene("그때 집에서는 어땠나요?", "그 얘기는 하고 싶지 않아요."), "'하고 싶지 않아요'라고 하셨는데, 다른 장면은 어떤가요?"],
    ["en", scene("What did that mean to you?", "I don't really know."), "You said “I don't really know”, so what would have been different?"],
    ["en", scene("How were things at home?", "I'd rather not talk about that."), "You said “rather not talk about that”, so what else comes to mind?"],
  ] as const)("%s refuses an echo of a non-answer", (locale, history, question) => {
    expect(usableQuestion(question, history, "meaning", locale)).not.toBe(question);
  });

  test.each([
    ["ko", [...KO, { role: "interviewer", text: "그 말을 들었을 때 바로 어떤 기분이었나요?", layer: "feeling", period: "school" }, { role: "user", text: "선생님이 다시 해 오라고 했어요.", layer: "feeling", period: "school" }] as InterviewTurn[],
      "'다시 해 오라고'라고 하셨는데, 그 말을 들었을 때 바로 어떤 기분이었나요?"],
    ["en", [...EN, { role: "interviewer", text: "Right after that, what did you feel in your body?", layer: "feeling", period: "school" }, { role: "user", text: "My teacher told me to redo it.", layer: "feeling", period: "school" }] as InterviewTurn[],
      "You said “told me to redo it” - right after that, what did you feel in your body?"],
  ] as const)("%s refuses a repeated question hidden behind a new quote", (locale, history, question) => {
    expect(usableQuestion(question, history, "feeling", locale)).not.toBe(question);
  });

  test("a fabricated quote from the model falls back to a prepared question", async () => {
    llm.mockResolvedValueOnce(reply("'운동장에서 뛰었다'라고 하셨는데, 그때 기분은 어땠나요?"));
    const result = await nextProbe("qa-echo", "ko", "school", KO, emptyCoverage(), false, 0, "feeling");
    expect(result.question).not.toContain("운동장");
    expect(result.question).toBe(usableQuestion("", KO, "feeling", "ko"));
  });
});
