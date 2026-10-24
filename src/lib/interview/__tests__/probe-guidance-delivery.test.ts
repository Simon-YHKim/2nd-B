import { callLlm } from "../../llm/boundary";
import type { LlmResult } from "../../llm/types";
import * as account from "../../auth/account-epoch";
import * as guidance from "../probe-guidance";
import { emptyCoverage, nextProbe, usableQuestion, type InterviewTurn, type ProbeGuidanceContext } from "../probe";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const llm = jest.mocked(callLlm);
const history: InterviewTurn[] = [
  { role: "interviewer", text: "What happened at work?", layer: "fact", period: "work", sceneStart: true },
  { role: "user", text: "I led Monday's meeting and my colleague interrupted me.", layer: "fact", period: "work" },
];
const envelope = (question = "Call 109 now.", answeredLayer: unknown = "fact", extra = {}) =>
  JSON.stringify({ question, answeredLayer, openers: ["I felt...", "My thought..."], ...extra });
function reply(text: unknown, zone: "green" | "yellow" | "red" = "green"): LlmResult<unknown> {
  return { text, safety: { zone, matched: [], categories: [],
    ...(zone === "red" ? { crisisRouting: { hotline: "KR_109" as const, label: "Support", number: "109" } } : {}) },
  audit: { promptHash: "fixture", outputHash: "fixture", modelUsed: "offline", vertexBackend: false, safetyZone: zone, latencyMs: 0 } };
}
const context = (isMinor: boolean | null = false): ProbeGuidanceContext => ({ isMinor, isCurrent: () => true });
const run = (delivery?: ProbeGuidanceContext, rows = history, minor = false, streak = 0) =>
  nextProbe("qa-guidance", "en", "work", rows, emptyCoverage(), minor, streak, "fact", undefined, delivery);
let inspect: jest.SpyInstance;
beforeEach(() => {
  llm.mockReset(); account.__resetAccountEpochForTests(); account.noteResolvedOwner("qa-guidance");
  inspect = jest.spyOn(guidance, "inspectProbeContactGuidance");
});
afterEach(() => jest.restoreAllMocks());

test("without context the exact legacy result remains and B1 does not run", async () => {
  const raw = envelope(); llm.mockResolvedValueOnce(reply(raw));
  expect(await run()).toEqual({ question: "Call 109 now.", openers: ["I felt...", "My thought..."],
    zone: "green", hotline: undefined, layer: "fact", answeredLayer: "fact" });
  expect(inspect).not.toHaveBeenCalled();
});

test.each([true, null, false])("guidance retains age %p independently of the existing LLM boolean", async isMinor => {
  const raw = envelope(); llm.mockResolvedValueOnce(reply(raw));
  const result = await run(context(isMinor), history, isMinor === true);
  expect(inspect).toHaveBeenCalledWith(raw, isMinor);
  expect(result.guidance).toMatchObject({ kind: "contacts", contacts: isMinor === false ? ["KR_109"] : ["KR_1388", "KR_109"] });
  expect(result.question).toBe(usableQuestion("", history, "fact", "en"));
  expect(result.openers).toEqual([]); expect(result.answeredLayer).toBe("fact");
  expect(llm.mock.calls[0]![0].minor).toBe(isMinor === true);
});

test.each(["green", "yellow"] as const)("positive contacts in %s replace only question/openers", async zone => {
  const raw = envelope("Call 109 now.\nCall 988 now."); llm.mockResolvedValueOnce(reply(raw, zone));
  const result = await run(context());
  expect(result).toMatchObject({ zone, answeredLayer: "fact", layer: "fact", openers: [],
    guidance: { kind: "contacts", contacts: ["KR_109", "GLOBAL_988"] } });
  expect(result.question).toBe(usableQuestion("", history, "fact", "en"));
  expect(inspect).toHaveBeenCalledWith(raw, false);
});

test.each([
  ["fact", "fact"], ["none", null], ["feeling", "feeling"], [undefined, undefined], [7, undefined],
])("positive metadata leaves original answeredLayer %p as %p", async (verdict, expected) => {
  const raw = JSON.stringify({ question: "Call 109 now.", answeredLayer: verdict });
  llm.mockResolvedValueOnce(reply(raw)); const result = await run(context());
  expect(result.guidance?.kind).toBe("contacts"); expect(result.answeredLayer).toBe(expected);
});

test("a first question still has no answer verdict and a complete last layer does not finish inside probe", async () => {
  llm.mockResolvedValueOnce(reply(envelope("Call 109 now.", "fact")));
  expect((await run(context(), [history[0]!])).answeredLayer).toBeUndefined();
  const rows = history.map(row => ({ ...row, layer: "echo" as const }));
  const coverage = emptyCoverage(); coverage.work = { fact: 1, feeling: 1, meaning: 1, belief: 1, echo: 0 };
  const before = JSON.stringify(coverage);
  llm.mockResolvedValueOnce(reply(envelope("Call 109 now.", "echo")));
  const result = await nextProbe("qa-guidance", "en", "work", rows, coverage, false, 0, "echo", undefined, context());
  expect(result).toMatchObject({ layer: "echo", answeredLayer: "echo", guidance: { kind: "contacts" } });
  expect(JSON.stringify(coverage)).toBe(before); expect(result).not.toHaveProperty("finished");
});

test.each(["Call 1234 now for support.", "Call 112 now for support."])("confirmed unresolved recommendation stays metadata only: %s", async text => {
  llm.mockResolvedValueOnce(reply(envelope(text, "none")));
  const result = await run(context());
  expect(result.guidance?.kind).toBe("unresolved"); expect(result.answeredLayer).toBeNull();
  expect(result.question).toBe(usableQuestion("", history, "fact", "en")); expect(result.openers).toEqual([]);
  expect(JSON.stringify(result.guidance)).not.toMatch(/1234|112|question|https|zone/);
});

test("the existing scaffold and exhausted question pool remain authoritative", async () => {
  llm.mockResolvedValueOnce(reply(envelope()));
  expect((await run(context(), history, false, 2)).question).toBe(usableQuestion("", history, "fact", "en", 2));
  const exhausted = [...history];
  for (let count = 0; count < 3; count++) {
    const text = usableQuestion("", exhausted, "fact", "en");
    expect(text).not.toBe(""); exhausted.push({ role: "interviewer", text, layer: "fact" });
  }
  llm.mockResolvedValueOnce(reply(envelope()));
  const result = await run(context(), exhausted);
  expect(result.question).toBe(""); expect(result.guidance?.kind).toBe("contacts");
});

test.each([
  ["plain text", 'not JSON: Call 109 now.'], ["incomplete JSON", '{"question":"Call 109 now.'],
  ["fenced JSON", '```json\n{"question":"Call 109 now.","answeredLayer":"fact"}\n```'],
  ["oversized question", envelope("Call 109 now.".padEnd(4097, " "))],
  ["oversized envelope", envelope("Call 109 now.", "fact", { padding: "x".repeat(16384) })],
  ["unknown field", envelope("What happened?", "fact", { unknown: "Call 109 now." })],
  ["number only", envelope("109 calls.")], ["historical", envelope("I called 109 yesterday.")],
  ["negation", envelope("Do not call 109.")], ["quotation", envelope('He said "call 109 now" yesterday.')],
])("uninspected or absent evidence never creates guidance: %s", async (_name, raw) => {
  llm.mockResolvedValueOnce(reply(raw)); const legacy = await run();
  llm.mockResolvedValueOnce(reply(raw)); const result = await run(context());
  expect(result).toEqual(legacy); expect(result).not.toHaveProperty("guidance");
});

test.each(["owner", "hold", "ABA", "request", "instance", "ended", "redSeen", "settled"])(
  "a deferred reply loses its original delivery authority on %s before B1", async change => {
    const owner = account.captureAccountOwnerLease("qa-guidance")!;
    let request = 1, instance = 1, ended = false, redSeen = false, settled = false;
    const delivery = { isMinor: null, isCurrent: jest.fn(() => owner.isCurrent() && request === 1 && instance === 1 && !ended && !redSeen && !settled) };
    let resolve!: (value: LlmResult<unknown>) => void;
    llm.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = run(delivery);
    expect(delivery.isCurrent).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
    if (change === "owner") account.noteResolvedOwner("B");
    if (change === "hold") account.beginAccountOwnerTransition("B");
    if (change === "ABA") { account.noteResolvedOwner(null); account.noteResolvedOwner("qa-guidance"); }
    if (change === "request") request++;
    if (change === "instance") instance++;
    if (change === "ended") ended = true;
    if (change === "redSeen") redSeen = true;
    if (change === "settled") settled = true;
    resolve(reply(envelope()));
    const result = await pending;
    expect(result).not.toHaveProperty("guidance"); expect(result.zone).toBe("green");
    expect(inspect).not.toHaveBeenCalled(); expect(delivery.isCurrent).toHaveBeenCalledTimes(1);
  });

test("final RED is prior to context and does not inspect or replace its existing result", async () => {
  const raw = envelope(); const delivery = { isMinor: null, isCurrent: jest.fn(() => { throw new Error("must not run"); }) };
  llm.mockResolvedValueOnce(reply(raw, "red"));
  const result = await run(delivery);
  expect(result).toMatchObject({ question: "Call 109 now.", zone: "red", hotline: "KR_109", openers: ["I felt...", "My thought..."] });
  expect(result).not.toHaveProperty("guidance"); expect(delivery.isCurrent).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
});

test("the original early RED callback remains forwarded and rejects a later GREEN guidance", async () => {
  let redSeen = false;
  const early = jest.fn(() => { redSeen = true; });
  let resolve!: (value: LlmResult<unknown>) => void;
  llm.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const pending = nextProbe("qa-guidance", "en", "work", history, emptyCoverage(), false, 0, "fact", early,
    { isMinor: false, isCurrent: () => !redSeen });
  expect(llm.mock.calls[0]![0].onCrisisDetected).toBe(early);
  llm.mock.calls[0]![0].onCrisisDetected?.("KR_109");
  resolve(reply(envelope()));
  expect(await pending).not.toHaveProperty("guidance"); expect(inspect).not.toHaveBeenCalled(); expect(early).toHaveBeenCalledTimes(1);
});

test("a rejected boundary response remains an error and has no inspection", async () => {
  const failure = new Error("offline fixture failure"); llm.mockRejectedValueOnce(failure);
  await expect(run(context())).rejects.toBe(failure); expect(inspect).not.toHaveBeenCalled();
});

test("a throwing context or inspector cannot create a new recommendation", async () => {
  llm.mockResolvedValueOnce(reply(envelope()));
  const legacy = await run();
  llm.mockResolvedValueOnce(reply(envelope()));
  expect(await run({ isMinor: false, isCurrent: () => { throw new Error("old instance"); } })).toEqual(legacy);
  expect(inspect).not.toHaveBeenCalled();
  inspect.mockImplementationOnce(() => { throw new Error("inspection failed"); });
  llm.mockResolvedValueOnce(reply(envelope())); expect(await run(context())).toEqual(legacy);
});

test("guidance metadata never enters model input, history, coverage or a later prompt", async () => {
  const before = JSON.stringify(history); const delivery = context(null);
  llm.mockResolvedValueOnce(reply(envelope())); const result = await run(delivery);
  const first = llm.mock.calls[0]![0];
  expect(first).not.toHaveProperty("guidanceContext"); expect(first).not.toHaveProperty("isMinor");
  expect(first).not.toHaveProperty("isCurrent"); expect(first.responseSchema).not.toHaveProperty("properties.guidance");
  expect(JSON.stringify(history)).toBe(before);
  expect(JSON.stringify(result.guidance)).not.toMatch(/Call|question|answeredLayer|fixture|isMinor|isCurrent/);
  llm.mockResolvedValueOnce(reply(envelope("What happened next?"))); await run(delivery);
  expect(llm.mock.calls[1]![0].user).toBe(first.user); expect(llm.mock.calls[1]![0].user).not.toContain("Call 109");
});
