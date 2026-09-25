import { answerDisposition, canCreditAnswer, confirmedAnswer, currentScene } from "../continuity";
import { emptyCoverage, nextMove, nextProbe, usableQuestion, type InterviewTurn } from "../probe";
import { mockInterviewProbe } from "../mock-probe";
import { callLlm } from "../../llm/boundary";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const llm = jest.mocked(callLlm);
const now = new Date("2026-09-25T00:00:00Z");
const scene: InterviewTurn[] = [
  { role: "interviewer", text: "What happened at work?", layer: "fact", sceneStart: true },
  { role: "user", text: "I led the Monday meeting and my colleague interrupted me.", layer: "fact" },
];

describe("scene continuity and choice", () => {
  it("uses this event's answers even when previous sessions covered every layer", () => {
    const coverage = emptyCoverage();
    coverage.work = { fact: 7, feeling: 6, meaning: 5, belief: 4, echo: 3 };
    expect(nextMove(coverage, "work", [], now, null, [], { history: scene, locale: "en" }))
      .toEqual({ kind: "drill", layer: "feeling" });
    const sparse = [scene[0]!, { role: "user", text: "Office", layer: "fact" } as const];
    expect(nextMove(coverage, "work", [], now, null, [], { history: sparse, locale: "en" }))
      .toEqual({ kind: "drill", layer: "fact" });
  });

  it.each([
    ["I don't want to talk about this anymore even if you ask in a different way.", "en"],
    ["지금은 이 일에 대해서 더 이상 이야기하고 싶지 않아요", "ko"],
    ["그만할래요", "ko"],
    ["말 안 할래요", "ko"],
    ["no thanks", "en"],
    ["I'd rather not", "en"],
    ["I want to stop here", "en"],
    ["그만 물어봐요", "ko"],
  ] as const)("stops on explicit refusal: %s", (text, locale) => {
    expect(answerDisposition(text, locale)).toBe("stop");
    expect(nextMove(emptyCoverage(), "work", [], now, null, [], {
      history: [...scene, { role: "user", text, layer: "feeling" }], locale,
    })).toEqual({ kind: "finish" });
  });

  it("does not mistake a described past feeling or quitting a job for a current refusal", () => {
    expect(answerDisposition("그때는 말하기 싫었어요", "ko")).toBe("answer");
    expect(answerDisposition("그만두고 새 회사에 들어갔어요", "ko")).toBe("answer");
  });

  it("keeps the chosen factual path factual and finite", () => {
    expect(nextMove(emptyCoverage(), "work", [], now, null, [], {
      history: scene, locale: "en", concreteOnly: true,
    })).toEqual({ kind: "drill", layer: "fact" });
    expect(nextMove(emptyCoverage(), "work", [], now, null, [], {
      history: [...scene, scene[1]!, scene[1]!, scene[1]!], locale: "en", concreteOnly: true,
    })).toEqual({ kind: "finish" });
  });

  it("ends after the scaffold budget without reaching for a more intimate layer", () => {
    expect(nextMove(emptyCoverage(), "work", [], now, { layer: "meaning", streak: 3 }, [], {
      history: scene, locale: "en",
    })).toEqual({ kind: "finish" });
  });

  it.each(["", "yes", "hmm", "Office", "I don't know", "not sure"])("does not credit sparse facts: %s", (answer) => {
    expect(canCreditAnswer(answer, "fact", "en")).toBe(false);
  });

  it("allows short concrete feelings without requiring more disclosure", () => {
    expect(canCreditAnswer("Sad", "feeling", "en")).toBe(true);
    expect(canCreditAnswer("서운했어요", "feeling", "ko")).toBe(true);
    expect(confirmedAnswer("Sad", "feeling", "en", "feeling")).toBe(true);
    expect(confirmedAnswer("Sad", "feeling", "en", undefined)).toBe(false);
    expect(confirmedAnswer("yes", "fact", "en", "fact")).toBe(false);
    expect(confirmedAnswer(scene[1]!.text, "fact", "en", "meaning")).toBe(false);
  });

  it("drops a skipped topic from the prompt while retaining the full save transcript", async () => {
    const fresh: InterviewTurn[] = [
      { role: "interviewer", text: "Another moment?", layer: "fact", sceneStart: true },
      { role: "user", text: "I cooked dinner for friends on Saturday.", layer: "fact" },
    ];
    const history = [...scene, ...fresh];
    expect(currentScene(history)).toEqual(fresh);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ question: "What did you enjoy about that dinner?", answeredLayer: "fact" }), safety: { zone: "green" } } as never);
    await nextProbe("qa", "en", "work", history, emptyCoverage(), false, 0, "feeling");
    const request = llm.mock.calls[llm.mock.calls.length - 1]![0];
    expect(request.user).toContain("dinner for friends");
    expect(request.user).not.toContain("colleague interrupted");
    expect(request.user).toContain("A (fact)");
    expect(request.system).toContain("same scene");
    expect(request.purpose).toBe("interview_probe");
    expect(history).toHaveLength(4);
  });

  it.each([
    ["ko", "1인칭을 인터뷰어 자신의 말처럼 재사용하지 않습니다", "사용자 말로 명확히 인용하거나 주어를 생략합니다"],
    ["en", "do not reuse the user's first-person I/me as the interviewer's voice", "Clearly quote it as the user's words"],
  ] as const)("keeps the speaker boundary explicit in the %s question prompt", async (locale, boundary, alternative) => {
    llm.mockResolvedValueOnce({ text: JSON.stringify({ question: "What mattered to you then?", answeredLayer: "feeling" }), safety: { zone: "green" } } as never);
    await nextProbe("qa", locale, "work", [...scene,
      { role: "user", text: "I worried I looked stubborn, but I was proud to help the team.", layer: "feeling" },
    ], emptyCoverage(), false, 0, "meaning");
    const request = llm.mock.calls[llm.mock.calls.length - 1]![0];
    expect(request.system).toContain(boundary);
    expect(request.system).toContain(alternative);
  });
});

describe("question guard and offline fixture", () => {
  it("rejects punctuation-only repeats and multiple questions", () => {
    const asked: InterviewTurn[] = [{ role: "interviewer", text: "How did that feel?" }];
    expect(usableQuestion("HOW did that feel!", asked, "feeling", "en")).not.toBe("HOW did that feel!");
    expect(usableQuestion("Who was there? What happened?", [], "fact", "en")).not.toBe("Who was there? What happened?");
    const repeated = "What feeling stands out from that moment now?";
    expect(usableQuestion(repeated, [{ role: "interviewer", text: "What feeling stands out from that moment?" }], "feeling", "en"))
      .not.toBe(repeated);
  });

  it("stops when all safe fallback questions have already been asked", () => {
    const asked: InterviewTurn[] = [];
    for (let n = 0; n < 3; n++) {
      const question = usableQuestion("", asked, "feeling", "en");
      expect(question).not.toBe("");
      expect(asked.some((turn) => turn.text === question)).toBe(false);
      asked.push({ role: "interviewer", text: question });
    }
    expect(usableQuestion("", asked, "feeling", "en")).toBe("");
  });

  it("offline fixture carries the answer and target, without claiming live-model quality", () => {
    const first = JSON.parse(mockInterviewProbe("Next depth layer to probe: L2", "A (fact): I hosted a meeting on Monday.", "en"));
    const next = JSON.parse(mockInterviewProbe("Next depth layer to probe: L3", "A (feeling): I felt ignored.", "en"));
    expect(first.question).toContain("meeting on Monday");
    expect(next.question).toContain("I felt ignored");
    expect(first.question).not.toBe(next.question);
    expect(first.answeredLayer).toBe("fact");
    expect(next.answeredLayer).toBe("feeling");
  });

  it.each([
    "다섯 살 때 유치원 발표회에서 혼자 노래했어요. 엄마가 앞에서 보고 있었어요.",
    "발표회에서 노래했어요.\n엄마가 보고 있었어요.",
  ])("keeps transcript fences out of the real nextProbe → mock response: %s", async (text) => {
    llm.mockImplementationOnce(async (input) => ({
      text: mockInterviewProbe(input.system ?? "", input.user, input.locale),
      safety: { zone: "green" },
    } as never));
    const result = await nextProbe("qa", "ko", "infancy", [
      { role: "interviewer", text: "기억나는 장면이 있나요?", layer: "fact", sceneStart: true },
      { role: "user", text, layer: "fact" },
    ], emptyCoverage(), false, 0, "feeling");
    expect(result.question).toContain(text.replace(/\s+/g, " "));
    expect(result.question).not.toMatch(/<\/?UNTRUSTED|interview_transcript/);
    expect(result.answeredLayer).toBe("fact");
  });
});
