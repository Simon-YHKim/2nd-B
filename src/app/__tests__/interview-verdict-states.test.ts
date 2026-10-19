import * as sceneProbe from "../../lib/interview/probe";
import * as sceneStuck from "../../lib/interview/stuck";
import * as sceneEnd from "../../lib/interview/session-end";
import type { InterviewFlow, InterviewChoice, SaveReceipt } from "../interview";
import { INTERVIEW_DRAFT_TTL_MS } from "../../lib/interview/draft-codec";
import { encodeInterviewDraftSnapshot, type InterviewDraftSnapshot, type InterviewStableSnapshot } from "../../lib/interview/draft-snapshot";
import { prepareInterviewDraftRestore } from "../../lib/interview/draft-restore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { accountTransitionSnapshot, captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner, subscribeAccountTransition } from "../../lib/auth/account-epoch";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice } from "../../lib/safety/crisis-notice";
import { hookHarness } from "../../lib/nav/__tests__/hook-harness";
import { answerDisposition, canCreditAnswer, confirmedAnswer, currentScene } from "../../lib/interview/continuity";
import { DRILL_LAYERS, LIFE_PERIODS, emptyCoverage, incrementCoverage, nextMove, nextProbe, seedQuestion, usableQuestion, type Coverage, type DrillLayer, type InterviewTurn, type ProbeResult } from "../../lib/interview/probe";
import { interviewAnswerLabel, storedTurns, storyTitle } from "../../lib/interview/saved-story";
import { isUneditedOpener, type OpenerSelection } from "../../lib/interview/opener-selection";
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

function wireFlow(scope: Record<string, unknown>) {
  const names = ["sessionCurrent", "frameSnapshot", "stampCurrent", "actionCurrent", "beginAction", "releaseAction", "commitFrame", "showChoice", "acceptIntoFrame", "latchCrisis", "availableChoices", "ask", "startNewScene", "changeAngle", "chooseNext", "canContinueSave", "writeReceipt", "showSaveFailure", "completeSave", "saveCoverage", "retryCoverage", "keepIt", "send", "editDraft", "selectOpener"];
  const bodies = names.map(name => {
    let found: ts.FunctionDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
      ts.forEachChild(node, visit);
    };
    visit(source); if (!found) throw new Error(`Missing flow callback ${name}`);
    return found.getText(source);
  }).join("\n");
  const js = ts.transpileModule(bodies, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  Object.assign(scope, new Function(...Object.keys(scope), `${js}\nreturn {${names.join(",")}};`)(...Object.values(scope)));
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
    choice: null as InterviewChoice | null, saveReceipt: { phase: "idle" } as SaveReceipt, saving: false, failModal: false, toast: null as unknown,
  };
  const updates: string[] = [];
  const setters = Object.fromEntries(Object.keys(state).map((name) => [
    `set${name[0].toUpperCase()}${name.slice(1)}`,
    jest.fn((value: unknown) => { Object.assign(state, { [name]: typeof value === "function" ? value((state as Record<string, unknown>)[name]) : value }); updates.push(name); }),
  ]));
  const scope = {
    ...sceneProbe, ...sceneStuck, ...sceneEnd,
    isUneditedOpener, openerSelection: { current: undefined as OpenerSelection | undefined },
    sessionContext: { current: null as object | null }, sessionOwner: { current: captureAccountOwnerLease("A") }, contextRef: { current: { key: "initial" } },
    flowRef: { current: { revision: 0, action: null, choice: null, receipt: { phase: "idle" }, crisisLatched: false, crisisEpoch: 0 } as InterviewFlow },

    ...state, ...setters,
    interviewAnswerLabel, storedTurns, storyTitle, recallInterviewSystemTags, homeT: (key: string) => key, auditPeriod: "work", growthOrigin: false,
    baseCoverage: { current: emptyCoverage() }, createRecord: jest.fn().mockResolvedValue({ id: "saved" }),
    addCoverage: jest.fn().mockResolvedValue({ kind: "acknowledged", receipt: "upsert" }),
    loadSevenLevels: jest.fn().mockResolvedValue({ starLevels: {} }), recordSevenTiers: jest.fn(),
    saveCueAllowed: () => true, isRecordingAudioMode: () => false, playSaveCue: jest.fn(), router: { replace: jest.fn() },
    userId: "A", period: "work", locale, isMinor: minor, coverageReady: true,
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
  scope.sessionContext.current = scope.contextRef.current;
  scope.isGuidanceCurrent = callback("isGuidanceCurrent", scope);
  scope.finish = callback("finish", scope);
  wireFlow(scope);
  function render() {
    Object.assign(scope, state);
    scope.turnsOwnerRef.current = state.turns;
    wireFlow(scope);
    scope.ask = callback("ask", scope);
    scope.changeAngle = callback("changeAngle", scope);
    return { send: callback("send", scope), change: scope.changeAngle,
      choose: callback("chooseNext", scope), newScene: callback("startNewScene", scope),
      save: callback("keepIt", scope), retry: callback("retryCoverage", scope), edit: callback("editDraft", scope),
      select: callback("selectOpener", scope),
      mode: () => callback("projectMode", scope)(Boolean(scope.sessionOwner.current?.isCurrent()) && scope.mounted.current,
        scope.flowRef.current.crisisLatched, scope.ended.current, state.done, state.choice),
    };
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

describe("T37 opener provenance follows the submitted answer", () => {
  test("typing an identical candidate without selecting its chip has no provenance", async () => {
    const h = setup("en"); h.state.openers = [h.text];
    h.render().edit(h.text);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")).not.toHaveProperty("fromOpener");
  });

  test.each(["fact", "feeling", "none", undefined] as const)("%s verdict has identical credit and system rules with provenance", async verdict => {
    const run = async (marked: boolean) => {
      const h = setup("en"); h.state.draft = h.text;
      h.state.openers = [h.text];
      if (marked) h.render().select(0);
      llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: verdict, question: "How did that feel?" }), safety: { zone: "green" } } as never);
      await h.render().send();
      const answer = h.state.turns.find(turn => turn.role === "user");
      expect(answer?.fromOpener).toBe(marked ? true : undefined);
      return { coverage: h.state.coverage, answered: answer?.answered, system: llm.mock.calls[0]![0].system };
    };
    expect(await run(true)).toEqual(await run(false));
  });

  test.each(["ko", "en"] as const)("%s: send, model history and saved original retain the marker", async locale => {
    const h = setup(locale);
    h.state.openers = [h.text];
    h.render().select(0);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")).toMatchObject({ text: h.text, fromOpener: true, answered: true });
    expect(h.state.coverage.work.fact).toBe(1);
    expect(llm.mock.calls[0]![0].user).toContain(`A (suggested, sent as is) (fact): ${h.text}`);
    h.scope.finish();
    await h.render().save();
    expect(h.scope.createRecord.mock.calls[0]![0].body).toContain(
      `${locale === "ko" ? "답변(제안 그대로)" : "A (suggested, sent as is)"}: ${h.text}`,
    );
  });

  test.each(["letter", "inner-space", "newline", "punctuation", "case", "leading-space", "trailing-space", "leading-newline", "trailing-newline", "edit-restore", "different-question"])("%s is an ordinary answer", async change => {
    const h = setup("en");
    h.state.openers = [h.text]; h.render().select(0);
    const edited = change === "letter" ? h.text + "s" : change === "inner-space" ? h.text.replace(" ", "  ")
      : change === "newline" ? h.text.replace(" ", "\n") : change === "punctuation" ? h.text + "."
        : change === "case" ? h.text.toLowerCase() : change === "leading-space" ? ` ${h.text}`
          : change === "trailing-space" ? `${h.text} ` : change === "leading-newline" ? `\n${h.text}` : `${h.text}\n`;
    if (change === "different-question") {
      h.state.turns = [...h.state.turns, { role: "interviewer", text: "A different question?", layer: "fact", period: "work" }];
    } else {
      h.render().edit(edited);
      expect(h.scope.openerSelection.current).toBeUndefined();
      if (change === "edit-restore") h.render().edit(h.text);
    }
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")).not.toHaveProperty("fromOpener");
    expect(llm.mock.calls[0]![0].user).not.toContain("suggested, sent as is");
    h.scope.finish(); await h.render().save();
    expect(h.scope.createRecord.mock.calls[0]![0].body).toContain(`A: ${h.state.turns.find(turn => turn.role === "user")!.text}`);
  });

  test("a direct-send override cannot borrow the selected chip's provenance", async () => {
    const h = setup("en"); h.state.openers = [h.text]; h.render().select(0);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send(h.text);
    expect(h.state.turns.find(turn => turn.role === "user")).not.toHaveProperty("fromOpener");
  });

  test.each(["ko", "en"] as const)("%s: quota rollback after an identical override cannot revive opener provenance", async locale => {
    const h = setup(locale); h.state.openers = [h.text]; h.render().select(0);
    const initialTurns = h.state.turns;
    llm.mockRejectedValueOnce({ context: new Response(JSON.stringify({ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }), { status: 429 }) });
    await h.render().send(h.text);
    expect(h.state.notice).toBe("drill.dayLimit");
    expect(h.state.turns).toBe(initialTurns);
    expect(h.state.draft).toBe(h.text);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    const answer = h.state.turns.find(turn => turn.role === "user");
    expect(answer).toMatchObject({ text: h.text, answered: true });
    expect(answer).not.toHaveProperty("fromOpener");
    expect(interviewAnswerLabel(answer?.fromOpener, locale)).toBe(locale === "ko" ? "답변" : "A");
    expect(llm.mock.calls[1]![0].user).not.toContain("suggested, sent as is");
    h.scope.finish(); await h.render().save();
    const savedBody = h.scope.createRecord.mock.calls[0]![0].body;
    expect(savedBody).toContain(`${locale === "ko" ? "답변" : "A"}: ${h.text}`);
    expect(savedBody).not.toContain(locale === "ko" ? "제안 그대로" : "suggested, sent as is");
  });

  test.each(["leading-space", "trailing-newline"])("raw %s mismatch cannot pass by trimming even with a selection", async change => {
    const h = setup("en"); h.state.openers = [h.text]; h.render().select(0);
    // Exercise the send guard independently of the normal edit invalidation.
    h.state.draft = change === "leading-space" ? ` ${h.text}` : `${h.text}\n`;
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")).not.toHaveProperty("fromOpener");
  });

  test("selecting a chip again creates fresh provenance after an edit", async () => {
    const h = setup("en"); h.state.openers = ["Another candidate", h.text];
    h.render().select(1); h.render().edit(`${h.text} `); h.render().select(1);
    expect(h.scope.openerSelection.current?.openerIndex).toBe(1);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")?.fromOpener).toBe(true);
    expect(h.scope.openerSelection.current).toBeUndefined();
  });

  test("a stale question's chip callback cannot select an old candidate", () => {
    const h = setup("en"); h.state.openers = [h.text]; const stale = h.render();
    stale.newScene(); stale.select(0);
    expect(h.state.draft).toBe(""); expect(h.scope.openerSelection.current).toBeUndefined();
  });

  test.each(["repeated-question", "replaced-question", "replaced-candidate"])("%s cannot reuse a selected chip", async change => {
    const h = setup("en"); h.state.openers = [h.text]; h.render().select(0);
    if (change === "repeated-question") h.state.turns = [...h.state.turns, { ...h.state.turns[0] }];
    if (change === "replaced-question") h.state.turns = [{ ...h.state.turns[0], text: "A different question?" }];
    if (change === "replaced-candidate") h.state.openers = ["A different candidate"];
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")).not.toHaveProperty("fromOpener");
  });

  test("the candidate Pressable selects provenance while TextInput invalidates it", () => {
    expect(screen).toMatch(/openers\.map\(\(o, index\) => \([\s\S]*?onPress=\{\(\) => selectOpener\(index\)\}/);
    expect(screen).toMatch(/<TextInput[\s\S]*?onChangeText=\{editDraft\}/);
  });

  test.each([false, true])("quota rollback preserves selection only without an intervening edit: %s", async edited => {
    const h = setup("en"); h.state.openers = [h.text]; h.render().select(0);
    let reject!: (error: unknown) => void;
    llm.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }) as never);
    const pending = h.render().send();
    expect(h.scope.openerSelection.current).toBeUndefined();
    if (edited) { h.render().edit(`${h.text} `); h.render().edit(h.text); }
    reject({ context: new Response(JSON.stringify({ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }), { status: 429 }) });
    await pending;
    expect(h.state.draft).toBe(h.text);
    expect(Boolean(h.scope.openerSelection.current)).toBe(!edited);
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await h.render().send();
    expect(h.state.turns.find(turn => turn.role === "user")?.fromOpener).toBe(edited ? undefined : true);
  });

  test.each(["selected", "edited", "legacy"])("restored %s draft retains only known, unedited selection", async kind => {
    const h = setup("en"); h.state.openers = [h.text];
    if (kind !== "legacy") h.render().select(0);
    else h.render().edit(h.text);
    if (kind === "edited") { h.render().edit(`${h.text} `); h.render().edit(h.text); }
    const restored = roundtrip(snapshotOf(h)).draft.state;
    const fresh = setup("en");
    Object.assign(fresh.state, { turns: restored.turns, draft: restored.draft, openers: restored.openers, pendingLayer: restored.pendingLayer });
    fresh.scope.openerSelection.current = restored.openerSelection;
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "fact", question: "How did that feel?" }), safety: { zone: "green" } } as never);
    await fresh.render().send();
    expect(fresh.state.turns.find(turn => turn.role === "user")?.fromOpener).toBe(kind === "selected" ? true : undefined);
  });
});

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
    expect(h.state.done).toBe(false);
    if (credit && layer === "echo") expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "first-pass-handled" }); expect(llm).toHaveBeenCalledTimes(1);
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

test("S2 choice blocks queued ordinary answers after two misses", async () => {
  const h = setup(); await h.submit("none", 0); await h.submit("none", 1);
  const before = h.state.turns; await h.submit("belief", 2);
  expect(h.state.turns).toBe(before); expect(h.state.choice).toMatchObject({ kind: "stuckChoice", attempts: 2 });
  expect(h.state.done).toBe(false); expect(llm).toHaveBeenCalledTimes(2);
});

test("S1 actual local-prompt guard uses the same candidate gate after twelve local questions", async () => {
  for (const text of ["I left", "Office"]) {
    const h = setup("en");
    h.state.turns = Array.from({ length: 12 }, (_, i) => ({ role: "interviewer", text: `Prior question ${i}?`, layer: "fact", period: "work", sceneStart: i === 0 }));
    h.state.draft = text;
    llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "none", question: "Next question?" }), safety: { zone: "green" } } as never);
    await h.render().send(); h.render().change("skip");
    expect(llm).toHaveBeenCalledTimes(text === "I left" ? 1 : 0);
    expect(h.state.done).toBe(false);
    if (text === "Office") expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "local-prompts-exhausted" }); expect(h.state.coverage).toEqual(emptyCoverage());
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
  expect(h.state.done).toBe(false); expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "first-pass-handled" }); expect(llm).toHaveBeenCalledTimes(5);
});

test("another named layer preserves earlier misses, the asked layer and original saved words", async () => {
  const h = setup(); await h.submit("none", 0);
  expect(h.state.stuckStreak).toBe(1);
  await h.submit("belief", 2);
  expect(h.state.stuckStreak).toBe(1); expect(h.state.done).toBe(false);
  expect(h.state.pendingLayer).toBe("fact"); expect(h.state.coverage).toEqual(emptyCoverage());
  const neutral = h.state.turns.find(t => t.answered === null)!;
  expect(neutral).toMatchObject({ text: `${h.text} 2`, layer: "fact", role: "user" });
  expect(storedTurns(h.state.turns)).toContainEqual(neutral);
  expect(h.state.turns.filter(t => t.role === "interviewer").at(-1)?.layer).toBe("fact");
  expect(h.state.turns.some(t => t.text.startsWith("MODEL NEXT QUESTION"))).toBe(false);
  expect(h.state.openers).toEqual([]); expect(llm).toHaveBeenCalledTimes(2);
  // A subsequent explicit none still consumes the third miss; neutrality does not reset it.
  await h.submit("none", 3); expect(h.state.done).toBe(false); expect(h.state.choice).toMatchObject({ kind: "stuckChoice" }); expect(h.state.coverage).toEqual(emptyCoverage());
});

test("neutral responses do not exhaust the miss budget or end when local questions run out", async () => {
  const h = setup();
  for (let i = 0; i < 7; i++) await h.submit("belief", i);
  expect(h.state.turns.filter(t => t.role === "user")).toHaveLength(4);
  expect(h.state.turns.filter(t => t.role === "user").every(t => t.answered === null)).toBe(true);
  const questions = h.state.turns.filter(t => t.role === "interviewer");
  expect(new Set(questions.map(t => t.text)).size).toBe(questions.length);
  expect(questions.every(t => t.layer === "fact")).toBe(true);
  expect(h.state.done).toBe(false); expect(h.state.stuckStreak).toBe(0); expect(h.state.pendingLayer).toBeNull();
  expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "question-exhausted" });
  expect(h.state.coverage).toEqual(emptyCoverage()); expect(llm).toHaveBeenCalledTimes(4);
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
  expect(h.state.done).toBe(false); expect(h.state.choice).toMatchObject({ kind: "stuckChoice" }); expect(h.state.coverage).toEqual(emptyCoverage());
  expect(llm).toHaveBeenCalledTimes(2);
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
      ...(h.scope.openerSelection.current ? { openerSelection: h.scope.openerSelection.current } : {}),
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
  expect(h.state.done).toBe(false); expect(h.state.choice?.kind).toBe("sceneChoice"); expect(h.state.coverage.work.echo).toBe(1);
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
    const createRecord = jest.fn().mockResolvedValue({ id: "saved" }), addCoverage = jest.fn().mockResolvedValue({ kind: "acknowledged", receipt: "upsert" });
    const setFailModal = jest.fn();
    const scope = { ...h.scope, ...h.state, saving: false, storedTurns, storyTitle, recallInterviewSystemTags,
      setSaving: jest.fn(), createRecord, homeT: (key: string) => key, auditPeriod: "work", growthOrigin: false,
      baseCoverage: { current: emptyCoverage() }, emptyCoverage, LIFE_PERIODS, DRILL_LAYERS, addCoverage,
      loadSevenLevels: jest.fn().mockResolvedValue({ starLevels: {} }), recordSevenTiers: jest.fn(),
      setToast: jest.fn(), saveCueAllowed: () => false, isRecordingAudioMode: () => false, playSaveCue: jest.fn(),
      router: { replace: jest.fn() }, setFailModal };
    scope.ended.current = true; scope.turnsOwnerRef.current = h.state.turns; wireFlow(scope);
    await callback("keepIt", scope)();
    expect(setFailModal).not.toHaveBeenCalled(); expect(createRecord).toHaveBeenCalledTimes(1);
    const saved = createRecord.mock.calls[0][0];
    expect(saved.body).toContain(h.text); expect(saved.summary).toBe(storyTitle("ds.star.work", [`${h.text} 0`]));
    expect(JSON.stringify(saved)).not.toMatch(/109|guidance|contacts|연락 안내/);
    expect(saved).toMatchObject({ withFollowup: false, kind: "audit_response" });
    expect(addCoverage).toHaveBeenCalledWith("A", expect.objectContaining({ work: { fact: 1, feeling: 0, meaning: 0, belief: 0, echo: 0 } }), expect.any(Function));
  } finally { jest.useRealTimers(); }
});


test.each([['local', 'local'], ['local', 'model'], ['model', 'local'], ['model', 'model']])(
  "S2 actual second failure offers a choice: %s then %s", async (first, second) => {
    const h = setup("en");
    for (const kind of [first, second]) {
      h.state.draft = kind === "local" ? "I don't know" : "I left";
      if (kind === "model") llm.mockResolvedValueOnce({ text: JSON.stringify({ answeredLayer: "none", question: "Next?" }), safety: { zone: "green" } } as never);
      await h.render().send();
    }
    expect(h.state.done).toBe(false);
    expect(h.state.pendingLayer).toBeNull();
    expect(h.state.turns.filter(t => t.role === "user").map(t => t.answered)).toEqual([false, false]);
    expect(h.state.turns.filter(t => t.role === "interviewer")).toHaveLength(2);
  });


function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function completed(concrete = false) {
  const h = atLayer("echo", "en"); h.state.concreteOnly = concrete;
  await h.submit("echo", 9, "What happened next?");
  expect(h.state.choice?.kind).toBe("sceneChoice"); return h;
}
function reply(verdict: string | undefined, question = "What did you do after you left?", openers = ["Then I"]) {
  return { text: JSON.stringify({ answeredLayer: verdict, question, openers }), safety: { zone: "green" } } as never;
}

// Run the actual gate/session hook bodies and their effects, with no RN renderer.
// Only the final session JSX is replaced by an observation of its callbacks/state.
// The gate's real JSX key drives mount/unmount; no context reset logic is copied.
function contextHarness() {
  noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch());
  const oldNotice = getCrisisNotice(); if (oldNotice) dismissCrisisNotice(oldNotice.id);
  const context = { language: "en", userId: "A", isMinor: false, period: "work", growthOrigin: false };
  const gateHooks = hookHarness();
  let sessionHooks = hookHarness();
  const native = { InterviewFrame: "frame", View: "view", PremiumLoadingState: "loading", MdCard: "card", Text: "text",
    styles: {}, m3TextStyle: () => ({}) };
  const probe = jest.fn().mockResolvedValue({ zone: "green", layer: "feeling", question: "How did that moment feel?", questionSource: "model", answeredLayer: "fact" });
  const scope = {
    ...sceneProbe, ...sceneStuck, ...sceneEnd, ...native, isUneditedOpener, projectMode: callback("projectMode", {}),
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: context.language } }),
    useAuth: () => ({ userId: context.userId, isMinor: context.isMinor, age: 30 }),
    useAppRouter: () => ({ replace: jest.fn() }), useKeyboard: () => 0, useGoHomeStop: () => {},
    useUiSound: () => jest.fn(), RECORD_SAVE_CUE: { source: 0 },
    loadCoverage: jest.fn().mockResolvedValue(emptyCoverage()),
    loadSevenLevels: jest.fn().mockResolvedValue({ starLevels: {} }), starEntryStatus: () => ({ kind: "available" }),
    livedPeriods: () => ["work"], accountTransitionSnapshot, subscribeAccountTransition, captureAccountOwnerLease,
    resolveProbeGuidanceCopy, classifyInputAnyLocale, answerDisposition, canCreditAnswer, confirmedAnswer, currentScene,
    nextProbe: probe, publishCrisisNotice,
    React: { createElement: (type: unknown, props: Record<string, unknown>) => ({ type, key: props?.key, props }) },
    InterviewSession: "session",
  };
  function compile(name: string, hooks: ReturnType<typeof hookHarness>, observe = false) {
    const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name) as ts.FunctionDeclaration;
    let text = node.getText(source);
    if (observe) {
      const last = node.body!.statements.at(-1)!;
      if (!ts.isReturnStatement(last)) throw new Error("Session no longer ends with its JSX return");
      text = text.replace(last.getText(source), "return { send, finish, editDraft, view, turns, coverage, pendingLayer, draft, busy, flowRef, sessionCurrent, contextRef, sessionContext, mounted };");
    }
    const bindings = { ...scope, ...hooks.hooks };
    const js = ts.transpileModule(text, { fileName: "context.tsx", compilerOptions: {
      target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
    } }).outputText;
    return new Function(...Object.keys(bindings), `${js}\nreturn ${name};`)(...Object.values(bindings));
  }
  const gate = compile("TrackGatedInterview", gateHooks);
  let session = compile("InterviewSession", sessionHooks, true);
  let key: unknown = Symbol("not-mounted");
  const read = () => sessionHooks.render(() => session(context)) as {
    send: (text: string) => Promise<unknown>; editDraft: (text: string) => void;
    view: { mode: string }; turns: InterviewTurn[]; coverage: Coverage; pendingLayer: DrillLayer | null;
    draft: string; busy: boolean; flowRef: { current: InterviewFlow }; mounted: { current: boolean };
  };
  async function render() {
    const props = { ...context, age: 30 };
    gateHooks.render(() => gate(props)); await Promise.resolve();
    const element = gateHooks.render(() => gate(props)) as { key: unknown; type: string };
    expect(element.type).toBe("session");
    if (key !== element.key) {
      sessionHooks.unmount(); sessionHooks = hookHarness();
      session = compile("InterviewSession", sessionHooks, true); key = element.key;
    }
    read(); await Promise.resolve();
    return read();
  }
  return { context, probe, render, read, unmount: () => { sessionHooks.unmount(); gateHooks.unmount(); } };
}

test("F3 actual context-key rerenders discard old green and leave both new and restored language usable", async () => {
  const h = contextHarness();
  try {
    const first = await h.render();
    const d = deferred<ProbeResult>(); h.probe.mockImplementationOnce(() => d.promise);
    const pending = first.send("I left the office after the meeting");
    h.context.language = "ko";
    const korean = await h.render();
    expect(korean.view.mode).toBe("active"); expect(first.mounted.current).toBe(false);
    expect(korean.flowRef).not.toBe(first.flowRef);
    d.resolve({ zone: "green", layer: "feeling", question: "OLD GREEN QUESTION?", openers: [], answeredLayer: "fact", questionSource: "model" });
    await pending;
    korean.editDraft("새 문맥의 답");
    expect(h.read().draft).toBe("새 문맥의 답");
    expect(h.read().coverage).toEqual(emptyCoverage());
    expect(h.read().turns.some(t => t.text === "OLD GREEN QUESTION?")).toBe(false);
    await h.read().send("회의를 마치고 집으로 돌아왔어요");
    expect(h.read().coverage.work.fact).toBe(1); expect(h.read().busy).toBe(false);
    h.context.language = "en";
    const restored = await h.render();
    expect(restored.view.mode).toBe("active"); expect(restored.flowRef).not.toBe(first.flowRef);
    expect(restored.flowRef).not.toBe(korean.flowRef);
    expect(restored.coverage).toEqual(emptyCoverage());
    await restored.send("I left the office after the meeting");
    expect(h.read().coverage.work.fact).toBe(1); expect(h.read().busy).toBe(false);
  } finally { h.unmount(); }
});

test.each(["response", "callback"])("F3 previous context RED %s reaches the root after remount", async source => {
  const h = contextHarness();
  try {
    const first = await h.render(), d = deferred<ProbeResult>(); h.probe.mockImplementationOnce(() => d.promise);
    const pending = first.send("I left the office after the meeting");
    h.context.language = "ko";
    const next = await h.render();
    if (source === "callback") {
      const args = h.probe.mock.calls[0] as unknown as Parameters<typeof nextProbe>;
      args[8]?.("KR_119");
    }
    d.resolve(source === "response" ? { zone: "red", hotline: "KR_119", layer: "fact", question: "", openers: [] }
      : { zone: "green", layer: "feeling", question: "OLD GREEN QUESTION?", openers: [], answeredLayer: "fact", questionSource: "model" });
    await pending;
    expect(getCrisisNotice()?.hotline).toBe("KR_119");
    expect(h.read().flowRef).toBe(next.flowRef);
    expect(h.read().coverage).toEqual(emptyCoverage());
    expect(h.read().turns).toHaveLength(1);
  } finally { h.unmount(); const notice = getCrisisNotice(); if (notice) dismissCrisisNotice(notice.id); }
});

test.each(["isMinor", "growthOrigin", "userId", "owner-ABA", "language-es"])("F3 session identity also follows %s", async field => {
  const h = contextHarness();
  try {
    const first = await h.render(); first.editDraft("OLD DRAFT");
    if (field === "isMinor") h.context.isMinor = true;
    if (field === "growthOrigin") h.context.growthOrigin = true;
    if (field === "userId") { h.context.userId = "B"; noteResolvedOwner("B"); clearAccountTransition(currentAccountEpoch()); }
    if (field === "owner-ABA") { noteResolvedOwner("B"); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch()); }
    if (field === "language-es") h.context.language = "es";
    const next = await h.render();
    expect(first.mounted.current).toBe(false); expect(next.flowRef).not.toBe(first.flowRef);
    expect(next.view.mode).toBe("active"); expect(next.draft).toBe("");
    next.editDraft("NEW DRAFT"); expect(h.read().draft).toBe("NEW DRAFT");
  } finally { h.unmount(); }
});

test.each(["fact", "none", "belief", undefined])("S2 question-only more leaves previous verdicts and coverage intact: %s", async verdict => {
  const h = await completed(); const users = h.state.turns.filter(t => t.role === "user"), cov = h.state.coverage;
  const choice = h.state.choice!; llm.mockResolvedValueOnce(reply(verdict));
  await h.render().choose("more", choice);
  expect(llm).toHaveBeenCalledTimes(2); expect(h.state.choice).toBeNull();
  expect(h.state.turns.filter(t => t.role === "user")).toEqual(users); expect(h.state.coverage).toBe(cov);
  expect(h.state.pendingLayer).toBe("fact"); expect(h.state.turns.at(-1)?.layer).toBe("fact");
  expect(llm.mock.calls[1][0].system).toContain("L1");
  await h.submit("fact", 10, "What happened outside?");
  expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "first-pass-handled" });
  expect(h.state.coverage.work.fact).toBe(2); expect(h.state.done).toBe(false);
});

test.each(["ko", "en"] as const)("F1 finish then queued %s RED still reaches C9; ordinary input stays ended", async locale => {
  const h = setup(locale);
  const classify = jest.fn(classifyInputAnyLocale);
  Object.assign(h.scope, { classifyInputAnyLocale: classify });
  const queued = h.render().send;
  h.scope.finish();
  const before = { ...h.state };
  await queued(h.text);
  expect(classify).toHaveBeenCalledTimes(1);
  expect(h.state).toEqual(before);
  await queued(locale === "ko" ? "죽고 싶어요" : "I want to die");
  expect(classify).toHaveBeenCalledTimes(2);
  expect(h.scope.startInterviewCrisisRouting).toHaveBeenCalledTimes(1);
  expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1);
  expect(h.scope.flowRef.current.crisisLatched).toBe(true);
  expect(h.state.turns).toBe(before.turns);
  expect(h.state.coverage).toBe(before.coverage);
  expect(llm).not.toHaveBeenCalled();
});

test.each([false, true])("F2 more returns after the first safe local/none/other verdict (concrete=%s)", async concrete => {
  for (const verdict of ["local", "none", "other"] as const) {
    const h = await completed(concrete);
    if (!concrete) llm.mockResolvedValueOnce(reply("fact"));
    await h.render().choose("more", h.state.choice);
    const before = h.state.turns, cov = h.state.coverage, calls = llm.mock.calls.length;
    if (verdict !== "local") llm.mockResolvedValueOnce(reply(verdict === "other" ? "belief" : "none"));
    await h.render().send(verdict === "local" ? "I don't know" : h.text);
    expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: concrete ? "concrete-progress" : "first-pass-handled" });
    expect(h.state.turns).toHaveLength(before.length + 1);
    expect(h.state.turns.at(-1)).toMatchObject({ role: "user", answered: verdict === "other" ? null : false });
    expect(h.state.coverage).toBe(cov);
    expect(h.state.stuckStreak).toBe(verdict === "other" ? 0 : 1);
    expect(h.state.pendingLayer).toBeNull();
    expect(h.state.openers).toEqual([]);
    expect(llm).toHaveBeenCalledTimes(calls + (verdict === "local" ? 0 : 1));
    expect(h.state.choice?.snapshot.returnToChoice).toBe(false);
  }
});

test.each(["local", "none"])("F2 a second %s failure after another more keeps the two-failure priority", async verdict => {
  const h = await completed();
  for (let attempt = 0; attempt < 2; attempt++) {
    llm.mockResolvedValueOnce(reply("fact", `What happened in moment ${attempt}?`));
    await h.render().choose("more", h.state.choice);
    if (verdict === "none") llm.mockResolvedValueOnce(reply("none"));
    await h.render().send(verdict === "local" ? "I don't know" : h.text);
  }
  expect(h.state.choice).toMatchObject({ kind: "stuckChoice", layer: "fact", attempts: 2 });
  expect(h.state.coverage.work.fact).toBe(1);
  expect(h.state.choice?.snapshot.returnToChoice).toBe(false);
});

test.each(["error", "quota", "red", "early-red"])("F2 more answer %s cannot consume a safe verdict or append another question", async outcome => {
  const h = await completed(); llm.mockResolvedValueOnce(reply("fact"));
  await h.render().choose("more", h.state.choice);
  const before = h.state.turns, cov = h.state.coverage;
  const d = deferred<never>(); llm.mockImplementationOnce(() => d.promise);
  const pending = h.render().send(h.text);
  if (outcome === "error") d.reject(new Error("offline"));
  else if (outcome === "quota") d.reject({ context: new Response(JSON.stringify({ error: "daily_limit_exceeded" }), { status: 429 }) });
  else {
    if (outcome === "early-red") llm.mock.calls.at(-1)![0].onCrisisDetected?.("KR_119");
    d.resolve({ text: "{}", safety: outcome === "red" ? { zone: "red", crisisRouting: { hotline: "KR_119" } } : { zone: "green" } } as never);
  }
  await pending;
  expect(h.state.coverage).toBe(cov);
  expect(h.state.choice).toBeNull();
  expect(h.state.turns.filter(t => t.role === "interviewer")).toEqual(before.filter(t => t.role === "interviewer"));
  if (outcome === "error" || outcome === "quota") {
    expect(h.state.done).toBe(false);
    if (outcome === "error") expect(h.state.turns.at(-1)).toMatchObject({ unsettled: true });
    else expect(h.state.turns).toBe(before);
    llm.mockResolvedValueOnce(reply("belief"));
    await h.render().send(h.text);
    expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "first-pass-handled" });
    expect(h.state.choice?.snapshot.returnToChoice).toBe(false);
  } else {
    expect(h.state.done).toBe(true);
    expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1);
    expect(h.scope.flowRef.current.crisisLatched).toBe(true);
  }
});
test("S2 concrete answers and more use local fact questions without model openers", async () => {
  const h = setup("en"); h.render().change("concrete"); expect(llm).not.toHaveBeenCalled();
  await h.submit("fact", 0, "How did that change your beliefs?");
  expect(h.state.turns.at(-1)?.text).toBe(usableQuestion("", h.state.turns.slice(0, -1), "fact", "en"));
  expect(h.state.openers).toEqual([]); expect(h.state.pendingLayer).toBe("fact");
  const c = await completed(true), before = llm.mock.calls.length;
  await c.render().choose("more", c.state.choice);
  expect(llm).toHaveBeenCalledTimes(before); expect(c.state.openers).toEqual([]); expect(c.state.pendingLayer).toBe("fact");
});
test("S2 concrete never revives abandoned fact or clears misses", () => {
  const h = setup("en"); h.state.abandoned = ["fact"]; h.state.stuckStreak = 1;
  h.render().change("concrete");
  expect(h.state.choice).toMatchObject({ kind: "sceneChoice", reason: "no-eligible" });
  expect(h.state.abandoned).toEqual(["fact"]); expect(h.state.stuckStreak).toBe(1); expect(llm).not.toHaveBeenCalled();
});
test("S2 skip-layer commits only its abandonment and assigns the next allowed target", async () => {
  const h = setup("en"); await h.render().send("I don't know"); await h.render().send("I don't know");
  const users = h.state.turns.filter(t => t.role === "user"), cov = h.state.coverage;
  llm.mockResolvedValueOnce(reply("fact")); await h.render().choose("skip-layer", h.state.choice);
  expect(h.state.abandoned).toEqual(["fact"]); expect(h.state.coverage).toBe(cov);
  expect(h.state.turns.filter(t => t.role === "user")).toEqual(users);
  expect(h.state.pendingLayer).toBe("feeling"); expect(llm.mock.calls[0][0].system).toContain("L2");
});
test.each(["error", "quota"])("S2 %s restores the same choice and gives retry a new token", async failure => {
  const h = await completed(); const choice = h.state.choice!; const d = deferred<never>();
  llm.mockImplementationOnce(() => d.promise); const actions = h.render(); const first = actions.choose("more", choice);
  const firstToken = h.scope.flowRef.current.action!.token;
  await actions.choose("more", choice); await actions.send("stop"); actions.change("skip");
  expect(llm).toHaveBeenCalledTimes(2);
  d.reject(failure === "quota" ? { context: new Response(JSON.stringify({ error: "daily_limit_exceeded" }), { status: 429 }) } : new Error("offline"));
  await first;
  expect(h.state.choice?.generation).toBe(choice.generation); expect(h.state.choice?.snapshot).toBe(choice.snapshot);
  expect(h.state.turns).toBe(choice.snapshot.turns); expect(h.state.pendingLayer).toBeNull();
  const next = deferred<never>(); llm.mockImplementationOnce(() => next.promise);
  const retry = h.render().choose("more", h.state.choice); expect(h.scope.flowRef.current.action!.token).not.toBe(firstToken);
  next.reject(new Error("offline")); await retry;
});
test("S2 skip-layer error does not commit proposed abandonment", async () => {
  const h = setup("en"); await h.render().send("I don't know"); await h.render().send("I don't know");
  const choice = h.state.choice; llm.mockRejectedValueOnce(new Error("offline"));
  await h.render().choose("skip-layer", choice);
  expect(h.state.choice?.generation).toBe(choice?.generation); expect(h.state.abandoned).toEqual([]); expect(h.state.pendingLayer).toBeNull();
});
test.each(["exhausted", "guard"])("S2 skip-layer commits abandonment when local replacement is %s", async condition => {
  const h = setup("en");
  if (condition === "exhausted") for (let n = 0; n < 3; n++) h.state.turns.push({ role: "interviewer", text: usableQuestion("", h.state.turns, "feeling", "en"), layer: "feeling" });
  else for (let n = 0; n < 10; n++) h.state.turns.push({ role: "interviewer", text: `Earlier ${n}?`, layer: "fact", sceneStart: n === 8 });
  await h.render().send("I don't know"); await h.render().send("I don't know");
  llm.mockResolvedValueOnce(reply("fact", ""));
  await h.render().choose("skip-layer", h.state.choice);
  expect(h.state.abandoned).toEqual(["fact"]); expect(h.state.choice).toMatchObject({ kind: "sceneChoice",
    reason: condition === "exhausted" ? "question-exhausted" : "local-prompts-exhausted" });
  expect(h.state.pendingLayer).toBeNull(); expect(llm).toHaveBeenCalledTimes(1);
});
test("S2 no-answer guard does not preblock a normal model more and only blocks local fallback", async () => {
  for (const model of [true, false]) {
    const h = await completed();
    // Synthetic choice snapshot at the whole-history guard, independent of completion.
    const history: InterviewTurn[] = Array.from({ length: 12 }, (_, i) => ({ role: "interviewer", text: `Old prompt ${i}?`, layer: "fact", sceneStart: i === 10 }));
    h.state.turns = history; h.state.choice = { ...h.state.choice!, snapshot: { ...h.state.choice!.snapshot, turns: history } };
    h.scope.flowRef.current.choice = h.state.choice;
    llm.mockResolvedValueOnce(reply(undefined, model ? "Where did you go afterwards?" : ""));
    await h.render().choose("more", h.state.choice);
    expect(llm).toHaveBeenCalledTimes(2);
    if (model) expect(h.state.turns.at(-1)?.text).toBe("Where did you go afterwards?");
    else expect(h.state.choice).toMatchObject({ reason: "local-prompts-exhausted" });
  }
});
test("S2 unavailable and stale choice buttons make no request; new scene preserves accumulated credit", async () => {
  const h = await completed(); const old = h.state.choice!, cov = h.state.coverage;
  h.render().newScene(old); expect(h.state.concreteOnly).toBe(false); expect(h.state.abandoned).toEqual([]);
  expect(h.state.coverage).toBe(cov); expect(h.state.turns.at(-1)).toMatchObject({ sceneStart: true, layer: "fact" });
  await h.render().choose("more", old); expect(llm).toHaveBeenCalledTimes(1);
  const exhausted = { ...old, reason: "question-exhausted" as const }; h.state.choice = exhausted; h.scope.flowRef.current.choice = exhausted;
  await h.render().choose("more", exhausted); expect(llm).toHaveBeenCalledTimes(1);
});

test.each(["choice", "saving", "busy"])("S2 queued empty send keeps the %s notice untouched", async lock => {
  const h = lock === "choice" || lock === "saving" ? await completed() : setup();
  if (lock === "saving") {
    h.scope.createRecord.mockImplementationOnce(() => new Promise(() => {}));
    void h.render().save(h.state.choice);
  }
  if (lock === "busy") h.state.busy = true;
  h.state.notice = "Keep this notice";
  const before = h.updates.length, calls = llm.mock.calls.length;
  await h.render().send("   ");
  expect(h.state.notice).toBe("Keep this notice");
  expect(h.updates.slice(before)).toEqual([]);
  expect(llm).toHaveBeenCalledTimes(calls);
});

describe("S2 actual save receipts", () => {
  beforeEach(() => jest.useFakeTimers()); afterEach(() => jest.useRealTimers());
  test("record then coverage ACK, frozen intent, double tap and exactly-once effects", async () => {
    const h = await completed(); const record = deferred<{ id: string }>(), coverage = deferred<unknown>();
    h.scope.createRecord.mockReturnValueOnce(record.promise); h.scope.addCoverage.mockReturnValueOnce(coverage.promise);
    const actions = h.render(), pending = actions.save(h.state.choice);
    await actions.save(h.state.choice); actions.edit("changed"); actions.newScene(h.state.choice);
    expect(h.scope.createRecord).toHaveBeenCalledTimes(1); expect(h.scope.addCoverage).not.toHaveBeenCalled(); expect(h.state.done).toBe(false);
    expect(h.state.toast).toBeNull(); expect(h.scope.router.replace).not.toHaveBeenCalled();
    record.resolve({ id: "record-1" }); await Promise.resolve(); await Promise.resolve();
    expect(h.scope.addCoverage).toHaveBeenCalledTimes(1); expect(h.state.toast).toBeNull();
    coverage.resolve({ kind: "acknowledged", receipt: "upsert" }); await pending; await Promise.resolve();
    expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "committed", recordId: "record-1" });
    expect(h.state.toast).toMatchObject({ tone: "success" }); expect(h.scope.playSaveCue).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(700); expect(h.scope.router.replace).toHaveBeenCalledTimes(1);
    await h.render().save(h.state.choice); h.render().retry(); expect(h.scope.createRecord).toHaveBeenCalledTimes(1);
  });
  test.each(["throw", "no-id"])("record %s is unknown forever in this memory intent", async failure => {
    const h = await completed();
    if (failure === "throw") h.scope.createRecord.mockRejectedValueOnce(new Error("timeout")); else h.scope.createRecord.mockResolvedValueOnce({});
    await h.render().save(h.state.choice); h.state.failModal = false; h.scope.finish();
    await h.render().save(); h.render().retry();
    expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "recordPending", record: "unknown" });
    expect(h.scope.createRecord).toHaveBeenCalledTimes(1); expect(h.scope.addCoverage).not.toHaveBeenCalled(); expect(h.state.toast).toBeNull();
  });
  test("only notApplied permits coverage-only retry; unknown never retries", async () => {
    const h = await completed(); h.scope.addCoverage.mockResolvedValueOnce({ kind: "notApplied" });
    await h.render().save(h.state.choice); expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "coveragePending", coverage: "retryable", recordId: "saved" });
    h.scope.addCoverage.mockResolvedValueOnce({ kind: "unknown" }); h.render().retry(); await Promise.resolve(); await Promise.resolve();
    h.render().retry(); await h.render().save(h.state.choice);
    expect(h.scope.createRecord).toHaveBeenCalledTimes(1); expect(h.scope.addCoverage).toHaveBeenCalledTimes(2);
    expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "coveragePending", coverage: "unknown", recordId: "saved" });
    expect(h.state.toast).toBeNull();
  });
  test.each(["record", "coverage", "retryable", "unknown"])("finish immediately wins over %s receipt without erasing it", async stage => {
    const h = await completed(); const d = deferred<unknown>();
    if (stage === "record") h.scope.createRecord.mockReturnValueOnce(d.promise);
    else if (stage === "coverage") h.scope.addCoverage.mockReturnValueOnce(d.promise);
    else h.scope.addCoverage.mockResolvedValueOnce({ kind: stage === "retryable" ? "notApplied" : "unknown" });
    const pending = h.render().save(h.state.choice); await Promise.resolve(); await Promise.resolve();
    h.scope.finish(); expect(h.render().mode()).toEqual({ mode: "legacy-ended" });
    await h.render().save(); h.render().retry();
    if (stage === "record") d.resolve({ id: "late" }); else d.resolve({ kind: "acknowledged", receipt: "upsert" });
    await pending;
    expect(h.scope.flowRef.current.receipt).toMatchObject({ continuation: "interrupted" });
    expect(h.scope.createRecord).toHaveBeenCalledTimes(1); expect(h.state.toast).toBeNull(); expect(h.scope.router.replace).not.toHaveBeenCalled();
  });
  test("legacy-ended can save normally, including repeated finish and zero delta", async () => {
    const h = setup("en"); await h.render().send("I don't know"); h.scope.finish();
    h.scope.addCoverage.mockResolvedValueOnce({ kind: "acknowledged", receipt: "zero-delta" });
    const pending = h.render().save(); h.scope.finish(); await pending;
    expect(h.scope.createRecord).toHaveBeenCalledTimes(1); expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "committed", coverage: "zero-delta" });
    expect(h.state.toast).toMatchObject({ tone: "success" });
  });
  test.each(["red", "owner", "ABA", "context", "instance", "unmount"])("%s during record wait retains late ACK but starts no coverage", async change => {
    const h = await completed(); const d = deferred<{ id: string }>(); h.scope.createRecord.mockReturnValueOnce(d.promise);
    const pending = h.render().save(h.state.choice);
    if (change === "red") await h.render().send("I want to die");
    if (change === "owner" || change === "ABA") { noteResolvedOwner("B"); if (change === "ABA") { noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch()); } }
    if (change === "context") h.scope.contextRef.current = { key: "new-context" };
    if (change === "instance") h.scope.interviewInstance.current += 1;
    if (change === "unmount") h.scope.mounted.current = false;
    d.resolve({ id: "late" }); await pending;
    expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "coveragePending", recordId: "late", continuation: "interrupted" });
    expect(h.scope.addCoverage).not.toHaveBeenCalled(); expect(h.state.toast).toBeNull();
  });
  test("save-result RED latches before synchronous publication re-entry and keeps its id", async () => {
    const h = await completed(); h.scope.createRecord.mockResolvedValueOnce({ id: "red-record", followup: { zone: "red" } });
    h.scope.publishCrisisNotice.mockImplementation(() => { void h.render().save(h.state.choice); return true; });
    await h.render().save(h.state.choice);
    expect(h.scope.flowRef.current.crisisLatched).toBe(true); expect(h.scope.flowRef.current.receipt).toMatchObject({ recordId: "red-record", continuation: "interrupted" });
    expect(h.scope.createRecord).toHaveBeenCalledTimes(1); expect(h.scope.addCoverage).not.toHaveBeenCalled();
  });
  test.each(["unmount", "owner-change"])("save-result RED after %s delegates ownership to the root notice store", async change => {
    const h = await completed();
    const publish = jest.fn(publishCrisisNotice); Object.assign(h.scope, { publishCrisisNotice: publish });
    const d = deferred<never>(); h.scope.createRecord.mockImplementationOnce(() => d.promise);
    const pending = h.render().save(h.state.choice);
    if (change === "unmount") h.scope.mounted.current = false;
    else noteResolvedOwner("B");
    d.resolve({ id: "late-red", followup: { zone: "red" }, crisisHotline: "KR_119" } as never);
    await pending;
    expect(publish).toHaveBeenCalledTimes(1);
    expect(getCrisisNotice()?.hotline).toBe(change === "unmount" ? "KR_119" : undefined);
    expect(h.scope.addCoverage).not.toHaveBeenCalled(); expect(h.state.toast).toBeNull();
    const notice = getCrisisNotice(); if (notice) dismissCrisisNotice(notice.id);
  });
  test("RED while tiers load prevents history write and the 700ms return", async () => {
    const h = await completed(); const levels = deferred<{ starLevels: object }>(); h.scope.loadSevenLevels.mockReturnValueOnce(levels.promise);
    await h.render().save(h.state.choice); await h.render().send("I want to die");
    levels.resolve({ starLevels: {} }); await Promise.resolve(); jest.advanceTimersByTime(700);
    expect(h.scope.recordSevenTiers).not.toHaveBeenCalled(); expect(h.scope.router.replace).not.toHaveBeenCalled();
  });
});


test("S2 synthetic assignment mismatch uses the requested layer, not the returned label", async () => {
  const h = await completed();
  h.scope.nextProbe = jest.fn().mockResolvedValue({ zone: "green", question: "MODEL MISMATCH?", layer: "belief", openers: ["MODEL"], questionSource: "model" });
  await h.render().choose("more", h.state.choice);
  expect(h.state.pendingLayer).toBe("fact"); expect(h.state.turns.at(-1)?.text).not.toBe("MODEL MISMATCH?"); expect(h.state.openers).toEqual([]);
});
test("S2 queued ordinary commits cannot land after owner change", async () => {
  const h = setup("en"); const queue: Array<(prior: unknown) => unknown> = [];
  Object.assign(h.scope, { setCoverage: jest.fn(update => queue.push(update)) });
  await h.submit("fact"); noteResolvedOwner("B");
  for (const update of queue) expect(update(h.state.coverage)).toBe(h.state.coverage);
});
describe("S2 save fence timing", () => {
  beforeEach(() => jest.useFakeTimers()); afterEach(() => jest.useRealTimers());
  test.each(["claim", "record-ack", "success", "sound"])("RED at %s prevents the next irreversible step", async stage => {
    const h = await completed();
    const red = () => { void h.render().send("I want to die"); };
    if (stage === "claim") Object.assign(h.scope, { setSaving: jest.fn(red) });
    if (stage === "record-ack") Object.assign(h.scope, { setSaveReceipt: jest.fn(update => {
      const next = update(h.state.saveReceipt); h.state.saveReceipt = next;
      if (next.phase === "coveragePending") red();
    }) });
    if (stage === "success") Object.assign(h.scope, { setToast: jest.fn(update => { h.state.toast = update(null); red(); }) });
    if (stage === "sound") h.scope.playSaveCue.mockImplementation(red);
    await h.render().save(h.state.choice); await Promise.resolve(); jest.advanceTimersByTime(700);
    expect(h.scope.createRecord).toHaveBeenCalledTimes(stage === "claim" ? 0 : 1);
    expect(h.scope.addCoverage).toHaveBeenCalledTimes(["claim", "record-ack"].includes(stage) ? 0 : 1);
    expect(h.scope.playSaveCue).toHaveBeenCalledTimes(stage === "sound" ? 1 : 0);
    expect(h.scope.loadSevenLevels).not.toHaveBeenCalled(); expect(h.scope.router.replace).not.toHaveBeenCalled();
  });
  test("RED during a sent coverage write keeps the later ACK without success effects", async () => {
    const h = await completed(); const d = deferred<unknown>(); h.scope.addCoverage.mockReturnValueOnce(d.promise);
    const pending = h.render().save(h.state.choice); await Promise.resolve(); await Promise.resolve();
    await h.render().send("I want to die"); d.resolve({ kind: "acknowledged", receipt: "upsert" }); await pending;
    expect(h.scope.flowRef.current.receipt).toMatchObject({ phase: "committed", continuation: "interrupted", effectsStarted: false });
    expect(h.state.toast).toBeNull(); expect(h.scope.playSaveCue).not.toHaveBeenCalled();
  });
  test("the queued success updater checks its own fence after RED", async () => {
    const h = await completed(); const queued: Array<(prior: unknown) => unknown> = [];
    Object.assign(h.scope, { setToast: jest.fn(update => queued.push(update)) });
    await h.render().save(h.state.choice); expect(queued).toHaveLength(1);
    await h.render().send("I want to die"); expect(queued[0](null)).toBeNull();
    jest.advanceTimersByTime(700); expect(h.scope.router.replace).not.toHaveBeenCalled();
  });
});
