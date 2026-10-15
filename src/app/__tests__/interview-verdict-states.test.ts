import { INTERVIEW_DRAFT_TTL_MS } from "../../lib/interview/draft-codec";
import { encodeInterviewDraftSnapshot, type InterviewDraftSnapshot, type InterviewStableSnapshot } from "../../lib/interview/draft-snapshot";
import { prepareInterviewDraftRestore } from "../../lib/interview/draft-restore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { answerDisposition, canCreditAnswer, confirmedAnswer, currentScene } from "../../lib/interview/continuity";
import { DRILL_LAYERS, LIFE_PERIODS, emptyCoverage, incrementCoverage, nextMove, nextProbe, seedQuestion, usableQuestion, type Coverage, type DrillLayer, type InterviewTurn } from "../../lib/interview/probe";
import { storedTurns, storyTitle } from "../../lib/interview/saved-story";
import { INTERVIEW_PURPOSE, localPromptsExhausted, readDayLimitRefusal } from "../../lib/interview/session-end";
import { isNonAnswer, MAX_SCAFFOLDS_PER_LAYER, scaffoldQuestion, shouldScaffold } from "../../lib/interview/stuck";
import { callLlm } from "../../lib/llm/boundary";
import { classifyInputAnyLocale } from "../../lib/safety/classifier";
import { resolveProbeGuidanceCopy } from "../../lib/interview/probe-guidance-copy";
import { recallInterviewSystemTags } from "../../lib/records/system-tags";
import * as guidanceInspector from "../../lib/interview/probe-guidance";

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

function setup(locale: "ko" | "en" = "ko", minor: boolean | null = false) {
  llm.mockReset();
  noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch());
  const state = {
    turns: [{ role: "interviewer", text: seedQuestion("work", locale), layer: "fact", period: "work", sceneStart: true }] as InterviewTurn[],
    coverage: emptyCoverage() as Coverage, draft: "", pendingLayer: "fact" as DrillLayer | null,
    openers: [] as string[], stuckStreak: 0, abandoned: [] as DrillLayer[], busy: false,
    notice: null as string | null, done: false, concreteOnly: false,
    guidanceDelivery: null as unknown,
  };
  const updates: string[] = [];
  const setters = Object.fromEntries(Object.keys(state).map((name) => [
    `set${name[0].toUpperCase()}${name.slice(1)}`,
    jest.fn((value: unknown) => { Object.assign(state, { [name]: typeof value === "function" ? value((state as Record<string, unknown>)[name]) : value }); updates.push(name); }),
  ]));
  const scope = {
    ...state, ...setters, userId: "A", period: "work", locale, isMinor: minor, coverageReady: true,
    ended: { current: false }, mounted: { current: true }, sending: { current: false },
    interviewInstance: { current: 1 }, probeRequest: { current: 0 },
    guidanceRef: { current: null as unknown }, lastGuidanceRequest: { current: 0 },
    guidanceScroll: { current: { pending: null, accepted: null } }, resolveProbeGuidanceCopy,
    isGuidanceCurrent: (..._args: unknown[]): unknown => false,
    turnsOwnerRef: { current: state.turns }, draftEditRevision: { current: 0 }, crisisRouting: { current: false },
    captureAccountOwnerLease, answerDisposition, canCreditAnswer, confirmedAnswer, currentScene,
    nextMove, nextProbe, usableQuestion, incrementCoverage, scaffoldQuestion, shouldScaffold,
    MAX_SCAFFOLDS_PER_LAYER, INTERVIEW_PURPOSE, readDayLimitRefusal, localPromptsExhausted,
    isLocalNonAnswer: (_text: string, _layer: DrillLayer | null): boolean => false,
    entriesOf: () => [], classifyInputAnyLocale, t: (key: string) => key,
    hotlineFor: () => minor ? "KR_1388" : "KR_109", publishCrisisNotice: jest.fn().mockReturnValue(true),
    startInterviewCrisisRouting: jest.fn((_guard, _input, visible) => { visible(); return { started: true, done: Promise.resolve() }; }),
    finish: (): unknown => undefined, ask: (..._args: unknown[]): unknown => undefined,
    changeAngle: (..._args: unknown[]): unknown => undefined,
  };
  // Keep the local gate exact: it is shared by send and the local-prompt guard.
  scope.isLocalNonAnswer = callback("isLocalNonAnswer", { ...scope,
    isBlockedAnswer: callback("isBlockedAnswer", { ...scope, isNonAnswer }),
  }) as typeof scope.isLocalNonAnswer;
  scope.isGuidanceCurrent = callback("isGuidanceCurrent", scope);
  scope.finish = callback("finish", scope);
  function render() {
    Object.assign(scope, state);
    scope.turnsOwnerRef.current = state.turns;
    scope.ask = callback("ask", scope);
    scope.changeAngle = callback("changeAngle", scope);
    return { send: callback("send", scope), change: scope.changeAngle };
  }
  const text = locale === "ko" ? "회의에서 제 생각을 이야기했는데 동료가 끝까지 들어주었습니다" : "My colleague listened while I shared my ideas in our meeting";
  async function submit(verdict: DrillLayer | "none" | undefined, index = 0, question = `MODEL NEXT QUESTION ${index}?`) {
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: verdict, question, openers: ["MODEL OPENER"] }), safety: { zone: "green" } } as never);
    state.draft = `${text} ${index}`;
    await render().send();
  }
  return { state, scope, updates, render, submit, text };
}

// Fixtures only: earlier layers already have confirmed turns. The pending answer
// still runs the shipped send -> ask -> nextProbe/parser -> continuity callbacks.
function atLayer(layer: DrillLayer, locale: "ko" | "en") {
  const h = setup(locale);
  for (const earlier of DRILL_LAYERS.slice(0, DRILL_LAYERS.indexOf(layer))) {
    h.state.turns.push({ role: "user", text: `Earlier confirmed ${earlier} answer about this event.`,
      layer: earlier, period: "work", answered: true });
    h.state.coverage = incrementCoverage(h.state.coverage, "work", earlier);
    const next = DRILL_LAYERS[DRILL_LAYERS.indexOf(earlier) + 1]!;
    h.state.turns.push({ role: "interviewer", text: `The current ${next} question?`, layer: next, period: "work" });
  }
  h.state.pendingLayer = layer;
  return h;
}

// Q4 removes the generic KO8/EN14 and minimum-two-character proxy for meaning.
// Q5 applies local fallback only to a successful missing verdict, never none/other.
const shortAnswerCases = [
  ["ko", "fact", "집을 나왔어요"], ["en", "fact", "I left"],
  ["ko", "feeling", "화"], ["en", "feeling", "Sad"],
  ["ko", "meaning", "7"], ["en", "meaning", "It mattered"],
  ["ko", "belief", "서로 믿어요"], ["en", "belief", "Trust matters"],
  ["ko", "echo", "🙂"], ["en", "echo", "I still care"],
  ["ko", "fact", "민수"], ["en", "fact", "Jane"],
  ["ko", "fact", "서울특별시립중앙도서관"], ["en", "fact", "0"],
  ["ko", "fact", "👩‍👩‍👦"],
] as const;

describe.each(["same", "missing", "none", "other"] as const)("S1 actual %s verdict", kind => {
  test.each(shortAnswerCases)("%s %s %s reaches one model call and waits before any credit", async (locale, layer, text) => {
    const h = atLayer(layer, locale); h.state.draft = text;
    const before = h.state.coverage; let settle!: (value: unknown) => void;
    llm.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }) as never);
    const pending = h.render().send();
    expect(llm).toHaveBeenCalledTimes(1); expect(h.state.coverage).toEqual(before);
    expect(h.state.turns.at(-1)).toMatchObject({ role: "user", text, layer });
    expect(h.state.turns.at(-1)?.answered).toBeUndefined(); expect(h.state.done).toBe(false);
    expect(llm.mock.calls[0]![0].user).toContain(`A (${layer}): ${text}`);
    const verdict = kind === "missing" ? undefined : kind === "same" ? layer
      : kind === "none" ? "none" : layer === "fact" ? "belief" : "fact";
    settle({ text: JSON.stringify({ answeredLayer: verdict, question: "What happened next in that moment?", openers: ["MODEL OPENER"] }), safety: { zone: "green" } });
    await pending;
    const credit = kind === "same" || kind === "missing";
    expect(h.state.coverage).toEqual(credit ? incrementCoverage(before, "work", layer) : before);
    expect(h.state.turns.filter(turn => turn.role === "user").at(-1)).toMatchObject({
      text, layer, answered: credit ? true : kind === "none" ? false : null,
    });
    expect(h.state.pendingLayer).toBe(credit ? DRILL_LAYERS[DRILL_LAYERS.indexOf(layer) + 1] ?? null : layer);
    expect(h.state.stuckStreak).toBe(kind === "none" ? 1 : 0);
    // S1 preserves the current final-layer completion. Scene choices belong to S2.
    expect(h.state.done).toBe(credit && layer === "echo"); expect(llm).toHaveBeenCalledTimes(1);
    if (!credit) expect(h.state.turns.some(turn => turn.text === "What happened next in that moment?")).toBe(false);
  });
});

test.each([
  ["ko", "집"], ["ko", "학교"], ["ko", "회사"], ["ko", "사무실"], ["ko", "도서관"],
  ["en", " Office "], ["en", " AT  THE\tOFFICE "], ["en", "in the office"],
] as const)("S1 actual %s bare fact %s remains local, but the same text in feeling reaches the model", async (locale, text) => {
  const h = setup(locale); h.state.draft = text; await h.render().send();
  expect(llm).not.toHaveBeenCalled(); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(h.state.stuckStreak).toBe(1); expect(h.state.pendingLayer).toBe("fact");
  const feeling = atLayer("feeling", locale); feeling.state.draft = text;
  llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "feeling", question: "What did that mean to you?" }), safety: { zone: "green" } } as never);
  await feeling.render().send(); expect(llm).toHaveBeenCalledTimes(1);
  expect(feeling.state.coverage.work).toEqual({ fact: 1, feeling: 1, meaning: 0, belief: 0, echo: 0 });
});

test.each(["...", "，。！？", "yes", "음", "모르겠어요", "drill.dontKnow"])(
  "S1 actual exact non-answer %s remains outside model calls", async text => {
    const h = setup(); h.state.draft = text; await h.render().send();
    expect(llm).not.toHaveBeenCalled(); expect(h.state.coverage).toEqual(emptyCoverage());
    expect(h.state.stuckStreak).toBe(1); expect(h.state.done).toBe(false);
  });

describe.each(["error", "quota", "red", "early-red"] as const)("S1 actual short answer %s", outcome => {
  test.each(DRILL_LAYERS)("%s never receives ordinary credit", async layer => {
    const h = atLayer(layer, "en"); h.state.draft = "I left";
    const before = { ...h.state }; let settle!: (value: unknown) => void; let reject!: (error: unknown) => void;
    llm.mockImplementationOnce(() => new Promise((resolve, no) => { settle = resolve; reject = no; }) as never);
    const pending = h.render().send(); expect(llm).toHaveBeenCalledTimes(1);
    expect(h.state.coverage).toEqual(before.coverage); expect(h.state.done).toBe(false);
    if (outcome === "error") reject(new Error("offline"));
    else if (outcome === "quota") reject({ context: new Response(JSON.stringify({ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }), { status: 429 }) });
    else {
      if (outcome === "early-red") llm.mock.calls[0]![0].onCrisisDetected?.("KR_119");
      settle({ text: JSON.stringify({ answeredLayer: layer, question: "Call 109 now." }),
        safety: outcome === "red" ? { zone: "red", crisisRouting: { hotline: "KR_119" } } : { zone: "green" } });
    }
    await pending; expect(h.state.coverage).toEqual(before.coverage); expect(llm).toHaveBeenCalledTimes(1);
    expect(h.state.guidanceDelivery).toBeNull(); expect(h.state.stuckStreak).toBe(0);
    if (outcome === "quota") expect(h.state).toEqual({ ...before, notice: "drill.dayLimit" });
    else if (outcome === "error") {
      expect(h.state.turns.at(-1)).toMatchObject({ text: "I left", layer, unsettled: true });
      expect(h.state.turns.at(-1)?.answered).toBeUndefined(); expect(h.state.pendingLayer).toBe(layer);
      expect(h.state.done).toBe(false); expect(h.state.notice).toBe("drill.failed");
    } else {
      expect(h.state.turns.filter(turn => turn.role === "user").at(-1)?.answered).toBeUndefined();
      expect(h.state.done).toBe(true); expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1);
      expect(h.scope.publishCrisisNotice).toHaveBeenCalledWith(expect.anything(), "KR_119");
    }
  });
});

test("S1 actual short answers preserve the existing miss budget and other-layer neutrality until S2", async () => {
  const h = setup();
  for (const verdict of ["none", "none", "belief", "none"]) {
    h.state.draft = "집을 나왔어요";
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: verdict, question: "Next question?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    if (verdict === "belief") { expect(h.state.stuckStreak).toBe(2); expect(h.state.done).toBe(false); }
  }
  expect(llm).toHaveBeenCalledTimes(4); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(h.state.done).toBe(true); expect(h.state.turns.filter(turn => turn.role === "user").map(turn => turn.answered)).toEqual([false, false, null, false]);
});

test("S1 actual local-prompt guard uses the same candidate gate after twelve local questions", async () => {
  for (const text of ["I left", "Office"]) {
    const h = setup("en");
    h.state.turns = Array.from({ length: 12 }, (_, i) => ({ role: "interviewer", text: `Prior question ${i}?`, layer: "fact", period: "work", sceneStart: i === 0 }));
    h.state.draft = text;
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "none", question: "Next question?" }), safety: { zone: "green" } } as never);
    await h.render().send(); h.render().change("skip");
    expect(llm).toHaveBeenCalledTimes(text === "I left" ? 1 : 0);
    expect(h.state.done).toBe(text === "Office"); expect(h.state.coverage).toEqual(emptyCoverage());
  }
});

test("S1 actual short missing-verdict guidance remains separate from original words and later prompts", async () => {
  const h = setup(); h.state.draft = "집을 나왔어요";
  llm.mockResolvedValueOnce({ text: JSON.stringify({ question: "Call 109 now." }), safety: { zone: "green" } } as never);
  await h.render().send();
  expect(h.state.coverage.work.fact).toBe(1);
  expect(h.state.guidanceDelivery).toMatchObject({ guidance: { kind: "contacts", contacts: ["KR_109"] } });
  expect(storedTurns(h.state.turns)).toContainEqual(expect.objectContaining({ text: "집을 나왔어요", answered: true }));
  expect(JSON.stringify(storedTurns(h.state.turns))).not.toMatch(/109|guidance|contacts/);
  const delivered = h.state.guidanceDelivery;
  h.state.draft = "화";
  llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "feeling", question: "What did it mean?" }), safety: { zone: "green" } } as never);
  await h.render().send(); expect(h.state.coverage.work.feeling).toBe(1); expect(h.state.guidanceDelivery).toBe(delivered);
  expect(llm.mock.calls[1]![0].user).toContain("집을 나왔어요");
  expect(JSON.stringify(llm.mock.calls[1]![0])).not.toMatch(/Call 109 now|한국에서 대화 지원|"guidance"|"contacts"/);
});

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


test.each([
  ["fact", true, 1], [undefined, true, 1], ["none", false, 0], ["belief", null, 0],
] as const)("actual positive guidance preserves %s verdict and never enters turns, prompt or draft", async (verdict, answered, credit) => {
  const h = setup(); await h.submit(verdict, 0, "Call 109 now.");
  expect(h.state.guidanceDelivery).toMatchObject({ guidance: { kind: "contacts", contacts: ["KR_109"] }, ready: false });
  expect(h.state.turns.find(turn => turn.role === "user")?.answered).toBe(answered);
  expect(h.state.coverage.work.fact).toBe(credit); expect(h.state.done).toBe(false);
  expect(JSON.stringify(storedTurns(h.state.turns))).not.toMatch(/109|guidance|contacts/);
  const value = snapshotOf(h); expect(JSON.stringify(value)).not.toMatch(/109|guidance|contacts/); roundtrip(value);
  const delivered = h.state.guidanceDelivery;
  await h.submit(undefined, 1); expect(h.state.guidanceDelivery).toBe(delivered);
  expect(JSON.stringify(llm.mock.calls[1]![0])).not.toMatch(/Call 109 now|한국에서 대화 지원|"guidance"|"contacts"/);
});

test.each([true, null, false])("actual ask forwards age %p unchanged into B1", async minor => {
  const inspect = jest.spyOn(guidanceInspector, "inspectProbeContactGuidance");
  try {
    const h = setup("ko", minor); await h.submit("fact", 0, "Call 109 now.");
    expect(inspect).toHaveBeenCalledWith(expect.any(String), minor);
    expect(llm.mock.calls[0]![0].minor).toBe(minor === true);
    expect(h.state.guidanceDelivery).toMatchObject({ guidance: { kind: "contacts", contacts: minor === false ? ["KR_109"] : ["KR_1388", "KR_109"] } });
  } finally { inspect.mockRestore(); }
});

test.each(["B", "ABA", "hold", "request", "instance", "ended", "unmounted"])(
  "actual deferred ask rejects %s before B1 inspection", async change => {
    const inspect = jest.spyOn(guidanceInspector, "inspectProbeContactGuidance");
    try {
      const h = setup(); let settle!: (value: unknown) => void;
      llm.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }) as never);
      h.state.draft = h.text; const pending = h.render().send();
      if (change === "B") noteResolvedOwner("B");
      if (change === "ABA") { noteResolvedOwner(null); noteResolvedOwner("A"); }
      if (change === "hold") jest.requireActual<typeof import("../../lib/auth/account-epoch")>("../../lib/auth/account-epoch").beginAccountOwnerTransition("B");
      if (change === "request") h.scope.probeRequest.current++;
      if (change === "instance") h.scope.interviewInstance.current++;
      if (change === "ended") h.scope.ended.current = true;
      if (change === "unmounted") h.scope.mounted.current = false;
      settle({ text: JSON.stringify({ answeredLayer: "fact", question: "Call 109 now." }), safety: { zone: "green" } });
      await pending; expect(inspect).not.toHaveBeenCalled(); expect(h.state.guidanceDelivery).toBeNull();
      expect(h.state.coverage).toEqual(emptyCoverage());
    } finally { inspect.mockRestore(); }
  });

test("final-layer guidance remains accepted when the actual verdict finishes the interview", async () => {
  const h = setup(); for (let i = 0; i < 4; i++) await h.submit(undefined, i);
  await h.submit("echo", 4, "Call 109 now.");
  expect(h.state.done).toBe(true); expect(h.state.coverage.work.echo).toBe(1);
  expect(h.state.guidanceDelivery).toMatchObject({ guidance: { kind: "contacts" } });
  expect(h.scope.isGuidanceCurrent(h.state.guidanceDelivery)).toBe(true);
});

test("another-layer guidance survives exhaustion without inventing credit or premature finish", async () => {
  const h = setup(); for (let i = 0; i < 7; i++) await h.submit("belief", i, "Call 109 now.");
  expect(h.state.done).toBe(false); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(h.state.guidanceDelivery).toMatchObject({ guidance: { kind: "contacts" } });
  expect(h.state.turns.every(turn => !turn.text.includes("109"))).toBe(true);
});

test.each(['{"question":"Call 109 now."', 'not JSON: Call 109 now.', '{"question":"I called 109 yesterday."}'])(
  "parse failure or historical text does not create a guidance row: %s", async text => {
    const h = setup(); llm.mockResolvedValueOnce({ text, safety: { zone: "green" } } as never);
    h.state.draft = h.text; await h.render().send(); expect(h.state.guidanceDelivery).toBeNull();
  });

test("actual keepIt stores original answers only, with no row metadata or fixed copy", async () => {
  jest.useFakeTimers();
  try {
    const h = setup(); await h.submit("fact", 0, "Call 109 now.");
    const createRecord = jest.fn().mockResolvedValue({ id: "saved" }), addCoverage = jest.fn().mockResolvedValue(undefined);
    const setFailModal = jest.fn();
    const scope = { ...h.scope, ...h.state, saving: false, storedTurns, storyTitle, recallInterviewSystemTags,
      setSaving: jest.fn(), createRecord, homeT: (key: string) => key, auditPeriod: "work", growthOrigin: false,
      baseCoverage: { current: emptyCoverage() }, emptyCoverage, LIFE_PERIODS, DRILL_LAYERS, addCoverage,
      loadSevenLevels: jest.fn().mockResolvedValue({ starLevels: {} }), recordSevenTiers: jest.fn(),
      setToast: jest.fn(), saveCueAllowed: () => false, isRecordingAudioMode: () => false, playSaveCue: jest.fn(),
      router: { replace: jest.fn() }, setFailModal };
    await callback("keepIt", scope)();
    expect(setFailModal).not.toHaveBeenCalled(); expect(createRecord).toHaveBeenCalledTimes(1);
    const saved = createRecord.mock.calls[0][0];
    expect(saved.body).toContain(h.text); expect(saved.summary).toBe(storyTitle("ds.star.work", [`${h.text} 0`]));
    expect(JSON.stringify(saved)).not.toMatch(/109|guidance|contacts|연락 안내/);
    expect(saved).toMatchObject({ withFollowup: false, kind: "audit_response" });
    expect(addCoverage).toHaveBeenCalledWith("A", expect.objectContaining({ work: { fact: 1, feeling: 0, meaning: 0, belief: 0, echo: 0 } }));
  } finally { jest.useRealTimers(); }
});
