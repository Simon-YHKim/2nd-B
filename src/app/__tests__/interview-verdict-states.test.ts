import { INTERVIEW_DRAFT_TTL_MS } from "../../lib/interview/draft-codec";
import { encodeInterviewDraftSnapshot, type InterviewDraftSnapshot, type InterviewStableSnapshot } from "../../lib/interview/draft-snapshot";
import { prepareInterviewDraftRestore } from "../../lib/interview/draft-restore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { answerDisposition, canCreditAnswer, confirmedAnswer, currentScene } from "../../lib/interview/continuity";
import { emptyCoverage, incrementCoverage, nextMove, nextProbe, seedQuestion, usableQuestion, type Coverage, type DrillLayer, type InterviewTurn } from "../../lib/interview/probe";
import { storedTurns } from "../../lib/interview/saved-story";
import { INTERVIEW_PURPOSE, localPromptsExhausted, readDayLimitRefusal } from "../../lib/interview/session-end";
import { isNonAnswer, MAX_SCAFFOLDS_PER_LAYER, scaffoldQuestion, shouldScaffold } from "../../lib/interview/stuck";
import { callLlm } from "../../lib/llm/boundary";
import { classifyInputAnyLocale } from "../../lib/safety/classifier";

jest.mock("../../lib/llm/boundary", () => ({ callLlm: jest.fn() }));
const llm = jest.mocked(callLlm);
const screen = readFileSync(join(process.cwd(), "src/app/interview.tsx"), "utf8");
const source = ts.createSourceFile("interview.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the shipped send/ask/finish callbacks with the real nextProbe parser,
// continuity/scene rules and owner lease. Only model I/O and native setters are inert.
function callback(name: string, scope: Record<string, unknown>): (...args: unknown[]) => unknown {
  let body: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && ts.isCallExpression(node.initializer)) body = node.initializer.arguments[0];
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!body) throw new Error(`Missing ${name}`);
  const js = ts.transpileModule(`const run = (${body.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${js}\nreturn run;`)(...Object.values(scope));
}

function setup(locale: "ko" | "en" = "ko", minor = false) {
  llm.mockReset();
  noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch());
  const state = {
    turns: [{ role: "interviewer", text: seedQuestion("work", locale), layer: "fact", period: "work", sceneStart: true }] as InterviewTurn[],
    coverage: emptyCoverage() as Coverage, draft: "", pendingLayer: "fact" as DrillLayer | null,
    openers: [] as string[], stuckStreak: 0, abandoned: [] as DrillLayer[], busy: false,
    notice: null as string | null, done: false, concreteOnly: false,
  };
  const updates: string[] = [];
  const setters = Object.fromEntries(Object.keys(state).map((name) => [
    `set${name[0].toUpperCase()}${name.slice(1)}`,
    jest.fn((value: unknown) => { Object.assign(state, { [name]: value }); updates.push(name); }),
  ]));
  const scope = {
    ...state, ...setters, userId: "A", period: "work", locale, isMinor: minor, coverageReady: true,
    ended: { current: false }, mounted: { current: true }, sending: { current: false },
    interviewInstance: { current: 1 }, probeRequest: { current: 0 },
    turnsOwnerRef: { current: state.turns }, draftEditRevision: { current: 0 }, crisisRouting: { current: false },
    captureAccountOwnerLease, answerDisposition, canCreditAnswer, confirmedAnswer, currentScene,
    nextMove, nextProbe, usableQuestion, incrementCoverage, scaffoldQuestion, shouldScaffold,
    MAX_SCAFFOLDS_PER_LAYER, INTERVIEW_PURPOSE, readDayLimitRefusal, localPromptsExhausted,
    isLocalNonAnswer: (text: string, layer: DrillLayer | null) => layer != null && !canCreditAnswer(text, layer, locale),
    entriesOf: () => [], classifyInputAnyLocale, t: (key: string) => key,
    hotlineFor: () => minor ? "KR_1388" : "KR_109", publishCrisisNotice: jest.fn().mockReturnValue(true),
    startInterviewCrisisRouting: jest.fn((_guard, _input, visible) => { visible(); return { started: true, done: Promise.resolve() }; }),
    finish: (): unknown => undefined, ask: (..._args: unknown[]): unknown => undefined,
    changeAngle: (..._args: unknown[]): unknown => undefined,
  };
  scope.finish = callback("finish", scope);
  function render() {
    Object.assign(scope, state);
    scope.turnsOwnerRef.current = state.turns;
    scope.ask = callback("ask", scope);
    scope.changeAngle = callback("changeAngle", scope);
    return { send: callback("send", scope), change: scope.changeAngle };
  }
  const text = locale === "ko" ? "회의에서 제 생각을 이야기했는데 동료가 끝까지 들어주었습니다" : "My colleague listened while I shared my ideas in our meeting";
  async function submit(verdict: DrillLayer | "none" | undefined, index = 0) {
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: verdict, question: `MODEL NEXT QUESTION ${index}?`, openers: ["MODEL OPENER"] }), safety: { zone: "green" } } as never);
    state.draft = `${text} ${index}`;
    await render().send();
  }
  return { state, scope, updates, render, submit, text };
}

test.each(["ko", "en"] as const)("%s: a successful missing verdict follows local sufficiency and advances one asked layer", async locale => {
  const h = setup(locale); await h.submit(undefined);
  expect(h.state.coverage.work).toEqual({ fact: 1, feeling: 0, meaning: 0, belief: 0, echo: 0 });
  expect(h.state.turns.find(t => t.role === "user")?.answered).toBe(true);
  expect(h.state.pendingLayer).toBe("feeling"); expect(h.state.stuckStreak).toBe(0);
  expect(h.state.done).toBe(false); expect(llm).toHaveBeenCalledTimes(1);
  expect(llm.mock.calls[0]?.[0]).toMatchObject({ minor: false, purpose: "interview_probe", responseSchema: { required: ["answeredLayer", "question"] } });
});

test("a missing final-layer verdict can complete only the locally sufficient fifth layer", async () => {
  const h = setup();
  for (let i = 0; i < 5; i++) await h.submit(undefined, i);
  expect(h.state.coverage.work).toEqual({ fact: 1, feeling: 1, meaning: 1, belief: 1, echo: 1 });
  expect(h.state.done).toBe(true); expect(llm).toHaveBeenCalledTimes(5);
});

test("another named layer preserves earlier misses, the asked layer and original saved words", async () => {
  const h = setup(); await h.submit("none", 0); await h.submit("none", 1);
  expect(h.state.stuckStreak).toBe(2);
  await h.submit("belief", 2);
  expect(h.state.stuckStreak).toBe(2); expect(h.state.done).toBe(false);
  expect(h.state.pendingLayer).toBe("fact"); expect(h.state.coverage).toEqual(emptyCoverage());
  const neutral = h.state.turns.find(t => t.answered === null)!;
  expect(neutral).toMatchObject({ text: `${h.text} 2`, layer: "fact", role: "user" });
  expect(storedTurns(h.state.turns)).toContainEqual(neutral);
  expect(h.state.turns.filter(t => t.role === "interviewer").at(-1)?.layer).toBe("fact");
  expect(h.state.turns.some(t => t.text.startsWith("MODEL NEXT QUESTION"))).toBe(false);
  expect(h.state.openers).toEqual([]); expect(llm).toHaveBeenCalledTimes(3);
  // A subsequent explicit none still consumes the third miss; neutrality does not reset it.
  await h.submit("none", 3); expect(h.state.done).toBe(true); expect(h.state.coverage).toEqual(emptyCoverage());
});

test("neutral responses do not exhaust the miss budget or end when local questions run out", async () => {
  const h = setup();
  for (let i = 0; i < 7; i++) await h.submit("belief", i);
  expect(h.state.turns.filter(t => t.role === "user")).toHaveLength(7);
  expect(h.state.turns.filter(t => t.role === "user").every(t => t.answered === null)).toBe(true);
  const questions = h.state.turns.filter(t => t.role === "interviewer");
  expect(new Set(questions.map(t => t.text)).size).toBe(questions.length);
  expect(questions.every(t => t.layer === "fact")).toBe(true);
  expect(h.state.done).toBe(false); expect(h.state.stuckStreak).toBe(0); expect(h.state.pendingLayer).toBe("fact");
  expect(h.state.coverage).toEqual(emptyCoverage()); expect(llm).toHaveBeenCalledTimes(7);
  expect(nextMove(h.state.coverage, "work", [], new Date(), null, [], { history: h.state.turns, locale: "ko" })).toEqual({ kind: "drill", layer: "fact" });
});

test("a successful answer after a neutral verdict still credits the asked layer, never the model's other layer", async () => {
  const h = setup(); await h.submit("belief"); await h.submit(undefined, 1);
  expect(h.state.coverage.work).toEqual({ fact: 1, feeling: 0, meaning: 0, belief: 0, echo: 0 });
  expect(h.state.pendingLayer).toBe("feeling");
});

test("another-layer verdict at the final layer cannot accept the optimistic finish", async () => {
  const h = setup();
  for (let i = 0; i < 4; i++) await h.submit(undefined, i);
  expect(h.state.pendingLayer).toBe("echo");
  await h.submit("belief", 4);
  expect(h.state.done).toBe(false); expect(h.state.pendingLayer).toBe("echo");
  expect(h.state.coverage.work).toEqual({ fact: 1, feeling: 1, meaning: 1, belief: 1, echo: 0 });
  expect(h.state.turns.filter(t => t.role === "interviewer").at(-1)?.layer).toBe("echo");
  expect(h.state.turns.filter(t => t.role === "user").at(-1)?.answered).toBeNull();
});

test("a local non-answer after neutrality retains the existing scaffold budget", async () => {
  const h = setup(); await h.submit("none", 0); await h.submit("none", 1); await h.submit("belief", 2);
  h.state.draft = "모르겠어요"; await h.render().send();
  expect(h.state.done).toBe(true); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(llm).toHaveBeenCalledTimes(3);
});

test("local non-answers remain outside model egress and coverage", async () => {
  const h = setup(); h.state.draft = "모르겠어요";
  expect(isNonAnswer(h.state.draft, "ko")).toBe(true);
  await h.render().send(); expect(llm).not.toHaveBeenCalled();
  expect(h.state.coverage).toEqual(emptyCoverage()); expect(h.state.stuckStreak).toBe(1);
});

test("a transport error remains unsettled with no local credit", async () => {
  const h = setup(); llm.mockRejectedValueOnce(new Error("offline")); h.state.draft = h.text;
  await h.render().send();
  expect(h.state.coverage).toEqual(emptyCoverage()); expect(h.state.pendingLayer).toBe("fact");
  expect(h.state.notice).toBe("drill.failed");
  expect(h.state.turns.at(-1)).toMatchObject({ unsettled: true });
  expect(h.state.turns.at(-1)?.answered).toBeUndefined(); expect(h.state.done).toBe(false);
});

test.each(["other", "missing"])("%s: owner changes discard safe results before verdict handling", async kind => {
  const h = setup(); let settle!: (value: unknown) => void;
  llm.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }) as never);
  h.state.draft = h.text; const pending = h.render().send();
  noteResolvedOwner("B"); clearAccountTransition(currentAccountEpoch()); const before = h.updates.length;
  settle({ text: JSON.stringify({ answeredLayer: kind === "other" ? "belief" : undefined, question: "Later question?" }), safety: { zone: "green" } });
  await pending; expect(h.updates.slice(before)).toEqual([]); expect(h.state.coverage).toEqual(emptyCoverage());
});

test("output crisis precedes a missing verdict and retains minor routing", async () => {
  const h = setup("ko", true); h.state.draft = h.text;
  llm.mockResolvedValueOnce({ text: "", safety: { zone: "red", crisisRouting: { hotline: "KR_1388" } } } as never);
  await h.render().send(); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(h.state.done).toBe(true); expect(h.scope.publishCrisisNotice).toHaveBeenCalledWith(expect.anything(), "KR_1388");
  expect(llm.mock.calls[0]?.[0]).toMatchObject({ minor: true });
});

test("input crisis routes without entering verdict or model handling", async () => {
  const h = setup(); h.state.draft = "죽고 싶어요"; await h.render().send();
  expect(llm).not.toHaveBeenCalled(); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(h.state.done).toBe(true); expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1);
});

test("the current neutral question retains T34 same-render ownership and quota restoration", async () => {
  const h = setup(); await h.submit("belief"); h.state.draft = h.text;
  const before = { ...h.state }; let reject!: (error: unknown) => void;
  llm.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }) as never);
  const current = h.render(); const pending = current.send();
  current.change("skip"); await current.send(); expect(llm).toHaveBeenCalledTimes(2);
  reject({ context: new Response(JSON.stringify({ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }), { status: 429 }) });
  await pending; expect(h.state).toEqual({ ...before, notice: "drill.dayLimit" });
  expect(h.state.turns.some(t => t.answered === null)).toBe(true);
});

// The dormant v2 codec consumes the outcomes of the actual screen callbacks above.
// No copied send/ask logic and no storage/UI activation is used for these roundtrips.
function snapshotOf(h: ReturnType<typeof setup>, phase: InterviewStableSnapshot["phase"] = "active",
  endReason: InterviewStableSnapshot["endReason"] = null): InterviewDraftSnapshot {
  return { v: 2, ownerId: "A", draftId: "screen-draft", revision: 4, createdAt: 1000,
    expiresAt: 1000 + INTERVIEW_DRAFT_TTL_MS, contentGeneration: "content-1", period: "work",
    uiLanguage: h.scope.locale, conversationLocale: h.scope.locale, growthOrigin: false,
    state: { turns: h.state.turns, draft: h.state.draft, inputRevision: h.scope.draftEditRevision.current,
      pendingLayer: h.state.pendingLayer, openers: h.state.openers, stuckStreak: h.state.stuckStreak,
      abandoned: h.state.abandoned, concreteOnly: h.state.concreteOnly, phase, endReason,
      crisisHotline: phase === "crisis-ended" ? h.scope.publishCrisisNotice.mock.calls.at(-1)?.[1] : null,
      notice: h.state.notice as InterviewStableSnapshot["notice"],
      coverage: { base: emptyCoverage(), current: h.state.coverage, baseline: "confirmed" } }, pending: null };
}
function roundtrip(value: InterviewDraftSnapshot) {
  const context = { ownerId: "A", accountEpoch: currentAccountEpoch(), viewGeneration: 1,
    inputRevision: 0, content: { status: "confirmed" as const, generation: "content-1" } };
  const result = prepareInterviewDraftRestore(encodeInterviewDraftSnapshot(value), context, context, 1001);
  if (result.status !== "restored") throw new Error(`Unexpected restore ${result.status}`);
  expect(result.draft).toEqual(value);
  return result;
}

test.each([
  ["fact", true, 1], [undefined, true, 1], ["none", false, 0], ["belief", null, 0],
] as const)("v2 preserves the actual safe %s verdict, asked layer, coverage and question", async (verdict, answered, credit) => {
  const h = setup(); await h.submit(verdict);
  const result = roundtrip(snapshotOf(h));
  expect(result.draft.state.turns.find(turn => turn.role === "user")?.answered).toBe(answered);
  expect(result.draft.state.coverage.current.work.fact).toBe(credit);
  expect(result.draft.state.pendingLayer).toBe(credit ? "feeling" : "fact");
  expect(result.next).toBe("resume-choice"); expect(llm).toHaveBeenCalledTimes(1);
});

test.each([false, true])("v2 keeps actual quota rollback and late edit=%s, without a rejected user turn", async lateEdit => {
  const h = setup(); await h.submit("none"); await h.submit("belief", 1);
  h.state.draft = h.text; h.state.openers = ["Original opener"];
  const before = snapshotOf(h); let reject!: (error: unknown) => void;
  llm.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }) as never);
  const pending = h.render().send();
  if (lateEdit) { h.scope.draftEditRevision.current++; h.state.draft = "Newer unsent edit"; }
  reject({ context: new Response(JSON.stringify({ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }), { status: 429 }) });
  await pending;
  const result = roundtrip(snapshotOf(h));
  expect(result.draft.state.turns).toEqual(before.state.turns);
  expect(result.draft.state.pendingLayer).toBe(before.state.pendingLayer);
  expect(result.draft.state.openers).toEqual(before.state.openers);
  expect(result.draft.state.stuckStreak).toBe(before.state.stuckStreak);
  expect(result.draft.state.abandoned).toEqual(before.state.abandoned);
  expect(result.draft.state.draft).toBe(lateEdit ? "Newer unsent edit" : h.text);
  expect(result.draft.state.notice).toBe("drill.dayLimit");
  expect(llm).toHaveBeenCalledTimes(3);
});

test("v2 preserves actual non-quota failure as unsettled, never a successful missing verdict", async () => {
  const h = setup(); h.state.draft = h.text;
  llm.mockRejectedValueOnce({ context: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }) });
  await h.render().send(); const result = roundtrip(snapshotOf(h));
  expect(result.draft.state.turns.at(-1)).toMatchObject({ unsettled: true });
  expect(result.draft.state.turns.at(-1)?.answered).toBeUndefined();
  expect(result.draft.state.coverage.current).toEqual(emptyCoverage());
  expect(result.draft.state.notice).toBe("drill.failed");
});

test("v2 captures an actual in-flight send without auto-running or letting its eventual answer mutate the copy", async () => {
  const h = setup(); h.state.draft = h.text;
  const before = snapshotOf(h).state; let settle!: (value: unknown) => void;
  llm.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }) as never);
  const sent = h.render().send();
  const value = snapshotOf(h); value.pending = { kind: "request", requestId: "request-1", submittedAnswer: h.text,
    inputRevision: before.inputRevision, before };
  const result = roundtrip(value);
  expect(result.next).toBe("request-unconfirmed"); expect(result.draft.state.turns.at(-1)?.answered).toBeUndefined();
  expect(result.draft.state.coverage.current).toEqual(emptyCoverage()); expect(llm).toHaveBeenCalledTimes(1);
  settle({ text: JSON.stringify({ answeredLayer: "fact", question: "Next question?" }), safety: { zone: "green" } });
  await sent; expect(h.state.coverage.work.fact).toBe(1);
  expect(result.draft.state.coverage.current.work.fact).toBe(0);
  expect(result.draft.state.turns.at(-1)?.answered).toBeUndefined();
});

test.each(["input", "output"])("v2 keeps actual %s crisis termination and never adds input crisis to the transcript", async input => {
  const h = setup("ko", true); h.state.draft = input === "input" ? "죽고 싶어요" : h.text;
  if (input === "output") llm.mockResolvedValueOnce({ text: "", safety: { zone: "red", crisisRouting: { hotline: "KR_1388" } } } as never);
  await h.render().send();
  expect(h.state.done).toBe(true); expect(h.scope.ended.current).toBe(true);
  const result = roundtrip(snapshotOf(h, "crisis-ended", "crisis"));
  expect(result.next).toBe("ended"); expect(result.draft.state.pendingLayer).toBeNull();
  expect(result.draft.state.coverage.current).toEqual(emptyCoverage());
  if (input === "input") expect(result.draft.state.turns.some(turn => turn.text === h.state.draft)).toBe(false);
  expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1);
});

test("v2 keeps the actual user finish while a safe response arrives late", async () => {
  const h = setup(); h.state.draft = h.text; let settle!: (value: unknown) => void;
  llm.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }) as never);
  const sent = h.render().send(); h.scope.finish();
  const result = roundtrip(snapshotOf(h, "ended", "user-stop"));
  expect(result.next).toBe("ended");
  settle({ text: JSON.stringify({ answeredLayer: "fact", question: "Next question?" }), safety: { zone: "green" } });
  await sent; expect(h.state.coverage).toEqual(emptyCoverage());
  expect(result.draft.state.phase).toBe("ended"); expect(llm).toHaveBeenCalledTimes(1);
});


test.each(["KR_119", "KR_112"])("v2 retains the actual output-crisis %s route without publishing it again", async hotline => {
  const h = setup(); h.state.draft = h.text;
  llm.mockResolvedValueOnce({ text: "", safety: { zone: "red", crisisRouting: { hotline } } } as never);
  await h.render().send(); const result = roundtrip(snapshotOf(h, "crisis-ended", "crisis"));
  expect(result.draft.state.crisisHotline).toBe(hotline); expect(result.next).toBe("ended");
  expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1); expect(llm).toHaveBeenCalledTimes(1);
});
