// Pure S2 contracts; screen callbacks are exercised in interview-verdict-states.
import { DRILL_LAYERS, emptyCoverage, nextMove, sceneStatus, failedAttempts, acceptQuestion, choiceAvailability, usableQuestion, nextProbe, type DrillLayer, type InterviewTurn } from "../probe";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const answered = (layer: DrillLayer): InterviewTurn => ({ role: "user", text: "I left the meeting", layer, answered: true });
const plan = (history: InterviewTurn[], abandoned: DrillLayer[] = [], streak = 0) =>
  nextMove(emptyCoverage(), "work", [], new Date(), streak ? { layer: "fact", streak } : null,
    abandoned, { history, locale: "en" });

test("S2 mixed credit and abandonment offers a scene choice without awarding the empty cell", () => {
  const history = DRILL_LAYERS.slice(0, 4).map(answered);
  expect(plan(history, ["echo"])).toEqual({ kind: "sceneChoice", reason: "first-pass-handled" });
  expect(history).toHaveLength(4);
});
test("S2 two confirmed misses offer a choice, never a third scaffold or automatic finish", () => {
  expect(plan([], [], 2)).toEqual({ kind: "stuckChoice", layer: "fact", attempts: 2 });
});
test("S2 all abandoned has no eligible layer rather than reviving fact", () => {
  expect(plan([], [...DRILL_LAYERS])).toEqual({ kind: "sceneChoice", reason: "no-eligible" });
});

const status = (layers: DrillLayer[], abandoned: DrillLayer[] = [], concrete = false) =>
  sceneStatus(layers.map(answered), "work", "en", abandoned, concrete);
test.each([[[...DRILL_LAYERS], []], [["fact"], ["feeling", "meaning", "belief", "echo"]]] as [DrillLayer[], DrillLayer[]][])(
  "confirmed or abandoned first pass %j / %j", (layers, abandoned) => {
    expect(status(layers, abandoned)).toMatchObject({ kind: "complete", reason: "first-pass-handled", progress: layers.length });
  });
test("only current confirmed valid answers count, never cumulative coverage or pending turns", () => {
  const history: InterviewTurn[] = [...DRILL_LAYERS.map(answered), { role: "interviewer", text: "New?", sceneStart: true },
    { ...answered("fact"), answered: undefined }, { ...answered("feeling"), unsettled: true },
    { ...answered("meaning"), answered: null }, { ...answered("belief"), text: "..." }];
  expect(sceneStatus(history, "work", "en")).toMatchObject({ kind: "incomplete", progress: 0, target: "fact" });
  expect(status(["fact", "feeling"], ["echo"])).toMatchObject({ kind: "incomplete", target: "meaning" });
});
test("concrete counts all four confirmed advances, but abandoned fact wins", () => {
  expect(status(["fact", "feeling", "meaning", "fact"], [], true)).toMatchObject({ kind: "complete", reason: "concrete-progress" });
  expect(status(["fact", "feeling", "meaning", "fact"], ["fact"], true).kind).toBe("noEligible");
});
test("only a confirmed answer resets misses in that layer and scene", () => {
  const miss = { ...answered("fact"), answered: false };
  const history = [miss, { ...miss, answered: null }, { ...miss, unsettled: true }, { ...miss, answered: undefined }, miss];
  expect(failedAttempts(history, "fact", "en")).toBe(2);
  expect(failedAttempts([...history, answered("feeling")], "fact", "en")).toBe(2);
  expect(failedAttempts([...history, answered("fact"), miss], "fact", "en")).toBe(1);
  expect(failedAttempts([...history, { role: "interviewer", text: "New?", sceneStart: true }], "fact", "en")).toBe(0);
});
const input = { target: "fact" as const, eligible: ["fact"] as DrillLayer[], policy: "assigned-target" as const,
  history: [] as InterviewTurn[], locale: "en" as const, localGuard: false };
const candidate = { question: "What happened after the meeting?", layer: "fact" as const, openers: ["I"], questionSource: "model" as const };
test.each([undefined, "local"] as const)("unknown or local source %s cannot pass model openers", questionSource => {
  const result = acceptQuestion({ ...input, candidate: { ...candidate, questionSource } });
  expect(result).toMatchObject({ kind: "question", source: "local", openers: [], pendingLayer: "fact" });
  if (questionSource === undefined) expect(result).not.toHaveProperty("question", candidate.question);
});
test("assignment mismatch uses a local target question; structural checks do not infer meaning", () => {
  expect(acceptQuestion({ ...input, candidate: { ...candidate, layer: "feeling" } })).toMatchObject({ source: "local", pendingLayer: "fact", openers: [] });
  for (const question of ["What happened that day?", "How did you feel that day?"]) {
    expect(acceptQuestion({ ...input, candidate: { ...candidate, question } })).toMatchObject({ question, source: "model" });
  }
});
test("local fact discards any model wording and openers", () => {
  expect(acceptQuestion({ ...input, policy: "local-fact", candidate })).toEqual({ kind: "question",
    question: usableQuestion("", [], "fact", "en"), source: "local", pendingLayer: "fact", openers: [] });
});
test("guard acts on the accepted source, not on a valid model candidate", () => {
  expect(acceptQuestion({ ...input, localGuard: true, candidate })).toMatchObject({ kind: "question", source: "model" });
  expect(acceptQuestion({ ...input, localGuard: true, candidate: { ...candidate, question: "" } })).toEqual({ kind: "localPromptsExhausted" });
  expect(acceptQuestion({ ...input, eligible: [] })).toEqual({ kind: "noEligible" });
});
test("empty, malformed, duplicate and exhausted questions choose a local replacement or explicit outcome", () => {
  const history: InterviewTurn[] = [];
  for (let n = 0; n < 3; n++) {
    const question = usableQuestion("", history, "fact", "en");
    expect(question).not.toBe(""); history.push({ role: "interviewer", text: question });
  }
  expect(acceptQuestion({ ...input, history })).toEqual({ kind: "questionExhausted" });
  for (const question of ["", "{}", candidate.question]) {
    const result = acceptQuestion({ ...input, history: [{ role: "interviewer", text: candidate.question }], candidate: { ...candidate, question } });
    expect(result).toMatchObject({ kind: "question", source: "local", openers: [] });
  }
});
test.each(["no-eligible", "question-exhausted", "local-prompts-exhausted"] as const)("choice buttons for %s", reason => {
  expect(choiceAvailability({ kind: "sceneChoice", reason, eligible: ["fact"], hasUserTurns: true, locked: false }))
    .toEqual({ more: false, newScene: reason !== "local-prompts-exhausted", save: true, skipLayer: false });
  expect(choiceAvailability({ kind: "sceneChoice", reason, eligible: [], hasUserTurns: false, locked: true }))
    .toEqual({ more: false, newScene: false, save: false, skipLayer: false });
});
import { callLlm } from "../../llm/boundary";
test("question source is opt-in and records replacement, guidance and exhaustion", async () => {
  const llm = jest.mocked(callLlm);
  const run = (raw: string, history: InterviewTurn[] = [], metadata = true) => {
    llm.mockResolvedValueOnce({ text: JSON.stringify({ question: raw }), safety: { zone: "green" } } as never);
    return nextProbe("A", "en", "work", history, emptyCoverage(), false, 0, "fact", undefined,
      { isMinor: false, isCurrent: () => true }, metadata ? { includeQuestionSource: true } : undefined);
  };
  expect(await run(candidate.question)).toHaveProperty("questionSource", "model");
  expect(await run("")).toHaveProperty("questionSource", "local");
  expect(await run("Call 109 now.")).toHaveProperty("questionSource", "local");
  expect(await run(candidate.question, [], false)).not.toHaveProperty("questionSource");
  const history: InterviewTurn[] = [];
  for (let i = 0; i < 3; i++) history.push({ role: "interviewer", text: usableQuestion("", history, "fact", "en") });
  expect(await run("", history)).toMatchObject({ question: "", questionSource: "local" });
});
