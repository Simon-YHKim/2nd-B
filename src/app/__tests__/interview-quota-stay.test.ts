import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { INTERVIEW_PURPOSE, readDayLimitRefusal } from "../../lib/interview/session-end";

const screen = readFileSync(join(process.cwd(), "src/app/interview.tsx"), "utf8");
const source = ts.createSourceFile("interview.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Execute the shipped callback; controlled I/O stops before any real model/write. */
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

function quota(status = 429, body: unknown = { error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }) {
  return { context: new Response(JSON.stringify(body), { status }) };
}

function setup() {
  noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch());
  let reject!: (error: unknown) => void;
  const request = new Promise<never>((_resolve, no) => { reject = no; });
  const initial = {
    turns: [
      { role: "interviewer", text: "Earlier question", layer: "fact", period: "school" },
      { role: "user", text: "Earlier accepted answer", layer: "fact", period: "school", answered: true },
      { role: "interviewer", text: "CURRENT QUESTION", layer: "emotion", period: "school" },
    ],
    draft: "  My unsent draft, with spacing  ", pendingLayer: "emotion", openers: ["An opening"],
    coverage: { unchanged: true }, stuckStreak: 2, abandoned: ["meaning"], busy: false,
    notice: null as string | null, done: false, concreteOnly: false,
  };
  const state = { ...initial };
  const updates: string[] = [];
  const setters = Object.fromEntries(Object.keys(state).map((name) => [
    `set${name[0].toUpperCase()}${name.slice(1)}`,
    jest.fn((value: unknown) => { Object.assign(state, { [name]: value }); updates.push(name); }),
  ]));
  const scope = {
    ...initial, ...setters, userId: "A", locale: "en", period: "school", isMinor: false,
    mounted: { current: true }, ended: { current: false }, coverageReady: true, concreteOnly: false,
    draftEditRevision: { current: 0 }, sending: { current: false }, crisisRouting: { current: false },
    turnsOwnerRef: { current: initial.turns }, localPromptsExhausted: () => false, currentScene: () => [],
    captureAccountOwnerLease, readDayLimitRefusal, INTERVIEW_PURPOSE,
    entriesOf: () => [], nextMove: () => ({ kind: "drill", layer: "emotion" }), nextProbe: jest.fn(() => request),
    classifyInputAnyLocale: jest.fn(() => ({ zone: "green" })), answerDisposition: () => "continue",
    isLocalNonAnswer: () => false, MAX_SCAFFOLDS_PER_LAYER: 2, t: (key: string) => key,
    startInterviewCrisisRouting: jest.fn((_guard, _input, visible) => { visible(); return { started: true, done: Promise.resolve() }; }),
    publishCrisisNotice: jest.fn(), hotlineFor: () => "KR_109", finish: (): unknown => undefined,
    ask: (..._args: unknown[]): unknown => undefined, changeAngle: (..._args: unknown[]): unknown => undefined,
    confirmedAnswer: jest.fn(), incrementCoverage: jest.fn(), createRecord: jest.fn(), addCoverage: jest.fn(),
  };
  scope.finish = callback("finish", scope);
  scope.ask = callback("ask", scope);
  scope.changeAngle = callback("changeAngle", scope);
  function render() {
    Object.assign(scope, state);
    scope.turnsOwnerRef.current = state.turns;
    scope.ask = callback("ask", scope);
    scope.changeAngle = callback("changeAngle", scope);
    return { send: callback("send", scope), change: scope.changeAngle };
  }
  return { scope, state, initial, updates, reject, render, send: callback("send", scope), change: scope.changeAngle, edit: callback("editDraft", scope) };
}

test.each([
  { error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE },
  { error: "daily_limit_exceeded" },
])("confirmed quota %j preserves the question, exact draft and answer count", async (body) => {
  const h = setup(); const pending = h.send();
  expect(h.state.draft).toBe("");
  h.reject(quota(429, body)); await pending;
  expect(h.state).toMatchObject({ ...h.initial, notice: "drill.dayLimit", busy: false });
  expect(h.state.turns).toBe(h.initial.turns);
  expect(h.state.turns.filter((turn) => turn.role === "user")).toHaveLength(1);
  expect(h.scope.ended.current).toBe(false);
  expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
  expect(h.scope.confirmedAnswer).not.toHaveBeenCalled();
  expect(h.scope.incrementCoverage).not.toHaveBeenCalled();
  expect(h.scope.createRecord).not.toHaveBeenCalled();
  expect(h.scope.addCoverage).not.toHaveBeenCalled();
});

test("a rejected answer-chip request restores the actual submitted answer", async () => {
  const h = setup(); const pending = h.send("CHIP ANSWER"); h.reject(quota()); await pending;
  expect(h.state.draft).toBe("CHIP ANSWER");
  expect(h.state.turns).toBe(h.initial.turns);
  expect(h.state.pendingLayer).toBe(h.initial.pendingLayer);
});

test("a queued newer edit wins over the rejected request's old draft", async () => {
  const h = setup(); const pending = h.send();
  await h.edit("NEWER INPUT"); h.reject(quota()); await pending;
  expect(h.state.draft).toBe("NEWER INPUT");
  expect(h.state.turns).toBe(h.initial.turns);
  expect(h.state.pendingLayer).toBe("emotion");
  expect(screen).toContain("editable={!busy && coverageReady}");
  expect(screen).toContain("onChangeText={editDraft}");
  expect(screen).toContain("onPress={() => editDraft(o)}");
});

test("a same-render second tap cannot consume another request", async () => {
  const h = setup(); const pending = h.send();
  await h.send(); expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
  h.reject(quota()); await pending;
  expect(h.state.turns).toBe(h.initial.turns);
});

test.each([
  [429, { error: "llm_capacity_exceeded" }],
  [429, { error: "purpose_limit_exceeded", feature: "secondb_chat" }],
  [503, { error: "daily_limit_exceeded" }],
])("%s %j retains the ordinary retry error behavior", async (status, body) => {
  const h = setup(); const pending = h.send(); h.reject(quota(status as number, body)); await pending;
  expect(h.state.notice).toBe("drill.failed");
  expect(h.state.draft).toBe("");
  expect(h.state.turns).toHaveLength(4);
  expect(h.state.turns[3]).toMatchObject({ unsettled: true });
  expect(h.scope.ended.current).toBe(false);
});

test.each(["B", "ABA", "unmounted", "ended"])("late quota after %s cannot restore stale UI", async (transition) => {
  const h = setup(); const pending = h.send();
  if (transition === "B" || transition === "ABA") {
    noteResolvedOwner(transition === "B" ? "B" : null);
    if (transition === "ABA") noteResolvedOwner("A");
    clearAccountTransition(currentAccountEpoch());
  } else if (transition === "unmounted") h.scope.mounted.current = false;
  else h.scope.ended.current = true;
  const before = h.updates.length;
  h.reject(quota()); await pending;
  expect(h.updates.slice(before).filter((name) => name !== "busy")).toEqual([]);
  expect(h.state.draft).toBe("");
});

test("a stop while the quota response body is still loading prevents restoration", async () => {
  const h = setup(); const pending = h.send();
  let deliver!: (value: unknown) => void;
  const body = new Promise((resolve) => { deliver = resolve; });
  h.reject({ context: { status: 429, clone: () => ({ json: () => body }) } });
  await Promise.resolve(); h.scope.finish();
  const before = h.updates.length;
  deliver({ error: "daily_limit_exceeded" }); await pending;
  expect(h.updates.slice(before).filter((name) => name !== "busy")).toEqual([]);
  expect(h.state.done).toBe(true);
});

test("after a quota refusal, crisis input still routes before any additional request or count", async () => {
  const h = setup(); const pending = h.send(); h.reject(quota()); await pending;
  h.scope.classifyInputAnyLocale.mockReturnValueOnce({ zone: "red" });
  await h.send("crisis fixture");
  expect(h.scope.startInterviewCrisisRouting).toHaveBeenCalledTimes(1);
  expect(h.scope.publishCrisisNotice).toHaveBeenCalledTimes(1);
  expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
  expect(h.scope.incrementCoverage).not.toHaveBeenCalled();
  expect(h.state.turns).toBe(h.initial.turns);
  expect(h.state.done).toBe(true);
});


test.each(["skip", "concrete"])("a same-render %s cannot replace a question while its answer is pending", async (choice) => {
  const h = setup(); const pending = h.send();
  const before = { ...h.state };
  h.change(choice);
  expect(h.state).toEqual(before);
  h.reject(quota()); await pending;
  expect(h.state).toEqual({ ...h.initial, notice: "drill.dayLimit" });
  expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
});

test.each(["skip", "concrete"])("a same-render send cannot answer the stale question after %s", async (choice) => {
  const h = setup(); h.change(choice);
  const changed = { ...h.state };
  await h.send();
  expect(h.scope.nextProbe).not.toHaveBeenCalled();
  expect(h.state).toEqual(changed);
  expect(h.state.pendingLayer).toBe("fact");
  expect(h.state.concreteOnly).toBe(choice === "concrete");
  h.change(choice === "skip" ? "concrete" : "skip");
  expect(h.state).toEqual(changed);
});

test("a newly committed local question stays usable and quota restores that question", async () => {
  const h = setup(); h.change("concrete");
  await h.edit("ANSWER TO THE NEW QUESTION");
  const changed = { ...h.state };
  const pending = h.render().send();
  h.reject(quota()); await pending;
  expect(h.state).toEqual({ ...changed, notice: "drill.dayLimit" });
  expect(h.state.pendingLayer).toBe("fact");
  expect(h.state.concreteOnly).toBe(true);
  expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
});

test("after quota the user can explicitly choose a new scene without another request", async () => {
  const h = setup(); const pending = h.send(); h.reject(quota()); await pending;
  h.render().change("skip");
  expect(h.state.turns.at(-1)).toMatchObject({ text: "drill.anotherScene", layer: "fact", sceneStart: true });
  expect(h.state.pendingLayer).toBe("fact");
  expect(h.state.concreteOnly).toBe(false);
  expect(h.state.notice).toBeNull();
  expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
});
