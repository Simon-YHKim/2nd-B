// T33 · Simon 2026-10-14 Q-261014-15 가: the interview asks in HustleK's voice (an AI, not a person)
// and first takes back one short phrase from the user's last answer, then asks one thing.
// The rule lives in the system prompt the probe sends; the acceptance check keeps such a line.
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

const KO: InterviewTurn[] = [
  { role: "interviewer", text: "그날 어디에 있었나요?", layer: "fact", period: "school", sceneStart: true },
  { role: "user", text: "방과 후에 도서관 창가 자리에 혼자 앉아 있었어요.", layer: "fact", period: "school" },
];
const EN: InterviewTurn[] = [
  { role: "interviewer", text: "Where were you that day?", layer: "fact", period: "school", sceneStart: true },
  { role: "user", text: "I sat alone by the library window after class.", layer: "fact", period: "school" },
];

async function systemFor(locale: "ko" | "en", history: InterviewTurn[]): Promise<string> {
  llm.mockResolvedValueOnce(reply(locale === "ko" ? "그때 누가 있었나요?" : "Who else was there?"));
  await nextProbe("qa-echo", locale, "school", history, emptyCoverage(), false, 0, "feeling");
  return String(llm.mock.calls.at(-1)![0].system);
}

beforeEach(() => llm.mockReset());

describe("interview speaks as HustleK and takes back one phrase before asking", () => {
  test("Korean prompt names HustleK as an AI and asks for one echoed phrase", async () => {
    const system = await systemFor("ko", KO);
    expect(system).toContain("당신은 허슬케이입니다");
    expect(system).toContain("사람이 아니라 AI");
    expect(system).toContain("한 구절");
    expect(system).not.toContain("질문하는 인터뷰어입니다");
  });

  test("English prompt names HustleK as an AI and asks for one echoed phrase", async () => {
    const system = await systemFor("en", EN);
    expect(system).toContain("You are HustleK");
    expect(system).toContain("an AI, not a person");
    expect(system).toContain("one short phrase");
    expect(system).not.toContain("You are an interviewer");
  });

  test("an echoed line with one question still passes the acceptance check", () => {
    const echoed = "'도서관 창가 자리에 혼자'라고 하셨네요. 그때 몸은 어떤 느낌이었나요?";
    expect(usableQuestion(echoed, KO, "feeling", "ko")).toBe(echoed);
  });
});
