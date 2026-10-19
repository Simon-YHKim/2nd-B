import * as sceneProbe from "../../lib/interview/probe";
import * as sceneStuck from "../../lib/interview/stuck";
import * as sceneEnd from "../../lib/interview/session-end";
import { isUneditedOpener } from "../../lib/interview/opener-selection";
import type { InterviewFlow, InterviewChoice, SaveReceipt } from "../interview";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice, subscribeCrisisNotice } from "../../lib/safety/crisis-notice";
import { emptyCoverage, nextProbe, type InterviewTurn, type ProbeResult } from "../../lib/interview/probe";
import { resolveProbeGuidanceCopy } from "../../lib/interview/probe-guidance-copy";
import type { AccountOwnerLease } from "../../lib/auth/account-epoch";
import { callLlm } from "../../lib/llm/boundary";
import type { CrisisObserver } from "../../lib/llm/types";
import React from "react";
import type { ScrollView, ScrollViewProps } from "react-native";
import type { ScrollRevealRequest, useScrollMemory } from "../../lib/nav/scroll-memory";
import { hookHarness } from "../../lib/nav/__tests__/hook-harness";
import { INTERVIEW_PURPOSE } from "../../lib/interview/session-end";

Object.assign(globalThis, { React });
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
const mockGuidanceHosts: Array<{ type: string; props: Record<string, unknown> }> = [];
const mockOpenDirectory = jest.fn();
const mockFlatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
  ? Object.assign({}, ...style.map(mockFlatten)) : style && typeof style === "object" ? style as Record<string, unknown> : {};
jest.mock("react-native", () => ({
  Platform: { OS: "web", select: (values: Record<string, unknown>) => values.web ?? values.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => mockFlatten(style), absoluteFill: {} },
  Animated: { createAnimatedComponent: (component: unknown) => component }, Linking: { openURL: (url: string) => mockOpenDirectory(url) },
  View: ({ children, ...props }: { children: React.ReactNode }) => { mockGuidanceHosts.push({ type: "view", props }); return React.createElement("div", null, children); },
  Text: ({ children, ...props }: { children: React.ReactNode }) => { mockGuidanceHosts.push({ type: "text", props }); return React.createElement("span", null, children); },
  Pressable: ({ children, ...props }: { children: React.ReactNode }) => { mockGuidanceHosts.push({ type: "pressable", props }); return React.createElement("button", null, children); },
}));
import { InterviewGuidanceRow } from "../../components/interview/InterviewGuidanceRow";
import { PhoneView } from "../../components/phone/PhoneUIKit";

// Same I/O seams as server-cap-egress: the probe, boundary, lexical classifier,
// owner lease and root store stay real. No SDK/Edge/ledger call leaves this suite.
const mockInvoke = jest.fn();
const mockGenerateContent = jest.fn();
const mockClassifySafety = jest.fn();
const mockAudit = jest.fn();
const mockCrisis = jest.fn();
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn().mockImplementation(() => ({
  models: { generateContent: mockGenerateContent },
})) }));
jest.mock("../../lib/supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));
jest.mock("../../lib/supabase/audit", () => ({ insertAiAuditLog: (...args: unknown[]) => mockAudit(...args) }));
jest.mock("../../lib/supabase/crisis-events", () => ({ insertCrisisEvent: (...args: unknown[]) => mockCrisis(...args) }));
jest.mock("../../lib/llm/safety", () => ({
  ...jest.requireActual("../../lib/llm/safety"),
  classifySafety: (...args: unknown[]) => mockClassifySafety(...args),
}));
jest.mock("../../lib/env", () => ({ getEnv: () => ({
  EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co", EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
  EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: false,
  EXPO_PUBLIC_USE_VERTEX: true, GOOGLE_CLOUD_PROJECT: "test-project",
  GOOGLE_CLOUD_LOCATION: "us-central1", GOOGLE_API_KEY: undefined, SENTRY_DSN: undefined,
}) }));

// Execute the screen's real callbacks, including deferred promises. Native
// rendering is inert here; account ownership and the app notice store are real.
const screen = readFileSync(resolve(__dirname, "../interview.tsx"), "utf8");
const source = ts.createSourceFile("interview.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name: string, scope: Record<string, unknown>) {
  let body: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer
      && ts.isCallExpression(node.initializer)) body = node.initializer.arguments[0];
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!body) throw new Error(`Missing callback ${name}`);
  const js = ts.transpileModule(`const run = (${body.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}\nreturn run;`)(...Object.values(scope));
}

type Delivery = { requestId: number; guidance: NonNullable<ProbeResult["guidance"]>; owner: AccountOwnerLease;
  instance: number; locale: string; token: object; ready: boolean };
type DeliveryUpdate = Delivery | null | ((previous: Delivery | null) => Delivery | null);
function wireFlow(scope: Record<string, unknown>) {
  const names = ["sessionCurrent", "frameSnapshot", "stampCurrent", "actionCurrent", "beginAction", "releaseAction", "commitFrame", "showChoice", "acceptIntoFrame", "latchCrisis", "availableChoices", "ask", "startNewScene", "changeAngle", "chooseNext", "canContinueSave", "writeReceipt", "showSaveFailure", "completeSave", "saveCoverage", "retryCoverage", "keepIt", "send", "editDraft"];
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

function setup(resetOwner = true, locale = "ko") {
  if (resetOwner) {
    noteResolvedOwner(null);
    noteResolvedOwner("A");
    clearAccountTransition(currentAccountEpoch());
  }
  const old = getCrisisNotice();
  if (old) dismissCrisisNotice(old.id);
  let settle!: (value: Partial<ProbeResult> & { zone: ProbeResult["zone"] }) => void;
  let reject!: (error: Error) => void;
  const request = new Promise<Partial<ProbeResult> & { zone: ProbeResult["zone"] }>((yes, no) => { settle = yes; reject = no; });
  let delivery: Delivery | null = null;
  const ended = { current: false };
  const mounted = { current: true };
  const scope = {
    ...sceneProbe, ...sceneStuck, ...sceneEnd,
    isUneditedOpener, openerSelection: { current: undefined },
    sessionContext: { current: null as object | null }, sessionOwner: { current: captureAccountOwnerLease("A") }, contextRef: { current: { key: "initial" } },
    flowRef: { current: { revision: 0, action: null, choice: null, receipt: { phase: "idle" }, crisisLatched: false, crisisEpoch: 0 } as InterviewFlow },

    choice: null as InterviewChoice | null, saveReceipt: { phase: "idle" } as SaveReceipt,
    turns: [] as InterviewTurn[], coverage: sceneProbe.emptyCoverage(), pendingLayer: "fact", openers: [], abandoned: [], draft: "", stuckStreak: 0,
    draftEditRevision: { current: 0 }, sending: { current: false },
    isLocalNonAnswer: () => false, setAbandoned: jest.fn(), setConcreteOnly: jest.fn(), setChoice: jest.fn(), setDraft: jest.fn(),
    userId: "A", period: "work", locale, isMinor: false, concreteOnly: false,
    ended, mounted, captureAccountOwnerLease, publishCrisisNotice,
    interviewInstance: { current: 1 }, probeRequest: { current: 0 }, turnsOwnerRef: { current: [] as unknown[] },
    guidanceRef: { current: null as Delivery | null }, lastGuidanceRequest: { current: 0 },
    guidanceScroll: { current: { pending: null as object | null, accepted: null as object | null } },
    resolveProbeGuidanceCopy, isGuidanceCurrent: (_value: Delivery): boolean => false,
    setGuidanceDelivery: jest.fn((next: DeliveryUpdate) => { delivery = typeof next === "function" ? next(delivery) : next; }),
    nextMove: jest.fn(() => ({ kind: "drill", layer: "fact" })),
    entriesOf: jest.fn(() => []), nextProbe: jest.fn((..._args: unknown[]) => request),
    hotlineFor: () => "KR_109", t: (key: string) => key,
    setBusy: jest.fn(), setNotice: jest.fn(), setDone: jest.fn(), setPendingLayer: jest.fn(), setOpeners: jest.fn(),
    setTurns: jest.fn((_value: InterviewTurn[]) => {}), setCoverage: jest.fn(), setStuckStreak: jest.fn(), confirmedAnswer: jest.fn(), incrementCoverage: jest.fn(),
    INTERVIEW_PURPOSE, readDayLimitRefusal: jest.fn(async () => false), setDayLimited: jest.fn(), finish: jest.fn(),
  };
  scope.sessionContext.current = scope.contextRef.current;
  scope.isGuidanceCurrent = callback("isGuidanceCurrent", scope);
  scope.finish = jest.fn(callback("finish", scope));
  scope.turns = scope.turnsOwnerRef.current as InterviewTurn[];
  wireFlow(scope);
  return { scope, settle, reject, ask: (...args: unknown[]) => { scope.turns = scope.turnsOwnerRef.current as InterviewTurn[]; wireFlow(scope); return callback("ask", scope)(...args); }, get delivery() { return delivery; } };
}

function evaluateExpression(text: string, scope: Record<string, unknown>) {
  const js = ts.transpileModule(`const result = (${text});`, { fileName: "screen-fixture.tsx", compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
  return new Function(...Object.keys(scope), `${js}\nreturn result;`)(...Object.values(scope));
}
function initializer(name: string, scope: Record<string, unknown>) {
  let found: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found?.initializer) throw new Error(`Missing actual initializer ${name}`);
  return evaluateExpression(found.initializer.getText(source), scope);
}
function actualEffect(needle: string, scope: Record<string, unknown>) {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ["useEffect", "useLayoutEffect"].includes(node.expression.getText(source))
      && node.arguments[0]?.getText(source).includes(needle)) found = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source); if (!found) throw new Error(`Missing actual effect ${needle}`);
  return evaluateExpression(found.getText(source), scope) as () => void | (() => void);
}
function guidanceRuntime(h: ReturnType<typeof setup>) {
  const display = initializer("guidanceDisplay", { ...h.scope, guidanceDelivery: h.delivery });
  const scope = { ...h.scope, guidanceDisplay: display };
  const ready = callback("markGuidanceReady", scope), dismiss = callback("dismissGuidance", scope);
  const cancel = callback("cancelGuidanceReveal", scope);
  const priority = initializer("priorityReveal", { ...scope, cancelGuidanceReveal: cancel }) as ScrollRevealRequest | null;
  const render = () => {
    let element: ts.JsxExpression | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)
        && node.expression.condition.getText(source) === "guidanceDisplay") element = node;
      ts.forEachChild(node, visit);
    };
    visit(source); if (!element?.expression) throw new Error("Missing actual guidance row expression");
    const parent = element.parent;
    expect(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source)).toBe("ScrollView");
    if (!ts.isJsxElement(parent)) throw new Error("Guidance must be a shared ScrollView sibling");
    const done = parent.children.findIndex(node => ts.isJsxExpression(node) && !!node.expression && ts.isConditionalExpression(node.expression)
      && node.expression.condition.getText(source) === "done");
    expect(done).toBeGreaterThan(parent.children.indexOf(element));
    mockGuidanceHosts.length = 0;
    const tree = evaluateExpression(element.expression.getText(source), { guidanceDisplay: display, React, View: PhoneView,
      InterviewGuidanceRow, markGuidanceReady: ready, dismissGuidance: dismiss });
    return renderToStaticMarkup(tree);
  };
  return { display, ready, dismiss, cancel, priority, render };
}
const contact: NonNullable<ProbeResult["guidance"]> = { kind: "contacts", contacts: ["KR_109"], physicalUrgency: false, corrections: [] };
async function acceptGuidance(h: ReturnType<typeof setup>, value = contact) {
  const pending = h.ask([{ role: "user", text: "An original answer", layer: "fact" }], emptyCoverage());
  h.settle({ zone: "green", question: "A separate question?", layer: "fact", openers: [], guidance: value });
  await pending;
}

// Runs the shipped hook and screen end-scroll effect together. Only native
// commands/timers and React hook cells are inert, not the reveal arbitration.
function screenScroll(h: ReturnType<typeof setup>, focused = true) {
  jest.useFakeTimers();
  const savedRAF = global.requestAnimationFrame, savedCancel = global.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>(), archived: FrameRequestCallback[] = [];
  let frameId = 0;
  global.requestAnimationFrame = fn => { frames.set(++frameId, fn); archived.push(fn); return frameId; };
  global.cancelAnimationFrame = id => { if (id != null) frames.delete(id); };
  const account = jest.requireActual<typeof import("../../lib/auth/account-epoch")>("../../lib/auth/account-epoch");
  const memory = jest.requireActual<typeof import("../../lib/nav/view-memory")>("../../lib/nav/view-memory");
  const key = "scroll:phone:interview:guidance";
  memory.readViewMemory(key); memory.writeViewMemory(key, { x: 0, y: 640 });
  const scope = { id: "phone:interview", slots: { next: 0 }, focused };
  const hooks = hookHarness(scope), endEffects = hookHarness();
  const modules: Record<string, unknown> = { react: hooks.hooks, "../auth/account-epoch": account, "./view-memory": memory };
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../../lib/nav/scroll-memory.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {} as { useScrollMemory: typeof useScrollMemory };
  new Function("require", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected real scroll hook import: ${name}`);
    return modules[name];
  }, exports);
  const node = { scrollTo: jest.fn(), scrollToEnd: jest.fn() };
  const scrollRef = { current: node as unknown as ScrollView };
  let hook!: ReturnType<typeof useScrollMemory<ScrollView>>;
  const end = () => endEffects.render(() => {
    const turns = h.scope.turnsOwnerRef.current;
    const scrollToLatest = initializer("scrollToLatest", { ...h.scope, turns, scrollRef, useCallback: endEffects.hooks.useCallback });
    let actual: ts.CallExpression | undefined;
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.getText(source) === "useEffect"
        && n.arguments[0]?.getText(source) === "scrollToLatest") actual = n;
      ts.forEachChild(n, visit);
    };
    visit(source); if (!actual) throw new Error("Missing actual end-scroll effect");
    evaluateExpression(actual.getText(source), { useEffect: endEffects.hooks.useEffect, scrollToLatest });
  });
  const render = (commitEnd = true) => {
    const row = guidanceRuntime(h);
    hook = hooks.render(() => exports.useScrollMemory<ScrollView>({ testID: "guidance", onScrollBeginDrag: row.cancel }, scrollRef, false, row.priority));
    hook.ref(node as unknown as ScrollView);
    if (commitEnd) end();
  };
  const layout = () => {
    hook.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } } as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]);
    hook.onContentSizeChange(320, 1600);
  };
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); };
  const flush = () => { flushFrames(); jest.runOnlyPendingTimers(); };
  render(); layout();
  return { scope, node, render, layout, end, flushFrames, flush, archived, memory, key, get hook() { return hook; },
    close: () => { hooks.unmount(); endEffects.unmount(); jest.useRealTimers(); global.requestAnimationFrame = savedRAF; global.cancelAnimationFrame = savedCancel; } };
}
async function askOrdinary(h: ReturnType<typeof setup>) {
  const previous = h.scope.turnsOwnerRef.current as InterviewTurn[];
  h.scope.nextProbe.mockResolvedValueOnce({ zone: "green", question: "Ordinary follow-up?", layer: "fact", openers: [] });
  await h.ask([...previous, { role: "user", text: "A later original answer", layer: "fact" }], emptyCoverage());
}

test.each(["frame", "settle"])("actual screen acceptance defeats pending %s restore and same-commit end-scroll", async stage => {
  const h = setup(), m = screenScroll(h);
  try {
    const stale = m.archived.slice(); if (stage === "settle") m.flushFrames();
    await acceptGuidance(h);
    m.render(false); guidanceRuntime(h).ready(); m.render(false); // Layout can ACK before the passive end effect.
    expect(h.scope.guidanceScroll.current.pending).toBeNull();
    m.end(); stale.forEach(fn => fn(0)); m.flush();
    expect(m.node.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
    expect(m.node.scrollTo.mock.calls.filter(([v]) => v.y === 0)).toHaveLength(1);
    expect(m.node.scrollToEnd).not.toHaveBeenCalled();
    expect(m.memory.readViewMemory(m.key)).toEqual({ x: 0, y: 0 });
    await askOrdinary(h); m.render(); expect(m.node.scrollToEnd).toHaveBeenCalledTimes(1);
    expect(guidanceRuntime(h).render()).toContain("109");
  } finally { m.close(); }
});

test.each(["ready-first", "focus-first"])("hidden accepted row survives another ask and reveals on first visibility: %s", async order => {
  const h = setup(), m = screenScroll(h, false);
  try {
    await acceptGuidance(h); m.render();
    if (order === "ready-first") { guidanceRuntime(h).ready(); m.render(); }
    const token = h.delivery!.token; await askOrdinary(h); m.render(); m.flush();
    expect(h.scope.guidanceScroll.current.pending).toBe(token); expect(h.scope.guidanceScroll.current.accepted).toBeNull();
    expect(m.node.scrollTo).not.toHaveBeenCalled(); expect(m.node.scrollToEnd).not.toHaveBeenCalled();
    m.scope.focused = true; m.render(); m.layout();
    if (order === "focus-first") {
      expect(m.node.scrollTo).not.toHaveBeenCalled(); guidanceRuntime(h).ready(); m.render();
    }
    m.flush(); expect(m.node.scrollTo.mock.calls).toEqual([[{ x: 0, y: 0, animated: false }]]);
    expect(h.scope.guidanceScroll.current.pending).toBeNull(); expect(m.node.scrollToEnd).not.toHaveBeenCalled();
    m.render(); m.layout(); m.flush(); expect(m.node.scrollTo).toHaveBeenCalledTimes(1);
    await askOrdinary(h); m.render(); expect(m.node.scrollToEnd).toHaveBeenCalledTimes(1);
  } finally { m.close(); }
});

test("real drag releases the pending row without reveal and later focus restores the user's offset", async () => {
  const h = setup(), m = screenScroll(h);
  try {
    await acceptGuidance(h); m.render();
    m.hook.onScrollBeginDrag({} as Parameters<NonNullable<ScrollViewProps["onScrollBeginDrag"]>>[0]);
    m.hook.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 900 } } } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]);
    guidanceRuntime(h).ready(); m.render(); m.flush();
    expect(m.node.scrollTo).not.toHaveBeenCalledWith({ x: 0, y: 0, animated: false });
    expect(h.scope.guidanceScroll.current.pending).toBeNull(); expect(m.node.scrollToEnd).not.toHaveBeenCalled();
    m.scope.focused = false; m.render(); m.scope.focused = true; m.render(); m.flush();
    expect(m.node.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 900, animated: false });
    await askOrdinary(h); m.render(); expect(m.node.scrollToEnd).toHaveBeenCalledTimes(1);
  } finally { m.close(); }
});

test("accepted contact renders the real shared row through React SSR and survives normal finish", async () => {
  const h = setup(); await acceptGuidance(h);
  const first = guidanceRuntime(h); const markup = first.render();
  expect(markup).toContain("연락 안내"); expect(markup).toContain("한국에서 대화 지원이 필요하면 109로 연락할 수 있습니다.");
  expect(markup).not.toContain("An original answer"); expect(mockOpenDirectory).not.toHaveBeenCalled();
  const layout = mockGuidanceHosts.find(host => typeof host.props.onLayout === "function")?.props.onLayout;
  expect(typeof layout).toBe("function"); (layout as () => void)(); expect(h.delivery?.ready).toBe(true);
  const token = h.delivery!.token; h.scope.finish();
  expect(h.scope.ended.current).toBe(true); expect(h.delivery!.token).toBe(token);
  expect(guidanceRuntime(h).render()).toContain("한국에서 대화 지원이 필요하면 109로 연락할 수 있습니다.");
  first.dismiss(); expect(guidanceRuntime(h).render()).toBe(""); expect(h.delivery).toBeNull();
  await h.ask([], {}); expect(h.delivery).toBeNull();
});

test.each(["owner", "hold", "ABA", "instance", "unmount"])("accepted row and stale layout/dismiss vanish on %s", async change => {
  const h = setup(); const cleanup = actualEffect("interviewInstance.current += 1", h.scope)();
  await acceptGuidance(h); const old = guidanceRuntime(h); const calls = h.scope.setGuidanceDelivery.mock.calls.length;
  const account = jest.requireActual<typeof import("../../lib/auth/account-epoch")>("../../lib/auth/account-epoch");
  if (change === "owner") noteResolvedOwner("B");
  if (change === "hold") account.beginAccountOwnerTransition("B");
  if (change === "ABA") { noteResolvedOwner(null); noteResolvedOwner("A"); }
  if (change === "instance") h.scope.interviewInstance.current++;
  if (change === "unmount") cleanup?.();
  expect(guidanceRuntime(h).render()).toBe(""); old.ready(); old.dismiss(); old.cancel();
  expect(h.scope.setGuidanceDelivery.mock.calls).toHaveLength(calls);
  if (change !== "unmount") {
    actualEffect("lastGuidanceRequest.current = 0", h.scope)();
    expect(h.delivery).toBeNull(); expect(h.scope.guidanceRef.current).toBeNull();
  }
});

test("an accepted updater queued before an owner switch cannot populate the new account", async () => {
  const h = setup(); const queue: DeliveryUpdate[] = [];
  h.scope.setGuidanceDelivery.mockImplementationOnce(update => { queue.push(update); });
  await acceptGuidance(h); expect(queue).toHaveLength(1); expect(h.delivery).toBeNull();
  noteResolvedOwner("B");
  const update = queue[0]; expect(typeof update).toBe("function");
  expect((update as (before: null) => Delivery | null)(null)).toBeNull();
  expect(guidanceRuntime(h).render()).toBe("");
});

test("old row callbacks cannot dismiss, ready or acknowledge a replacement delivery", async () => {
  const h = setup(); await acceptGuidance(h); const old = guidanceRuntime(h);
  h.scope.nextProbe.mockResolvedValueOnce({ zone: "green", question: "Another question?", layer: "fact", openers: [],
    guidance: { kind: "unresolved", reason: "unsupported-contact" } });
  await h.ask([], emptyCoverage()); const replacement = h.delivery!; expect(replacement.token).not.toBe(old.priority!.token);
  old.ready(); old.dismiss(); old.cancel(); old.priority!.onRevealed();
  expect(h.delivery).toBe(replacement); expect(h.delivery?.ready).toBe(false);
  expect(h.scope.guidanceScroll.current.pending).toBe(replacement.token);
  const current = guidanceRuntime(h); expect(current.render()).toContain("연락처를 확인하지 못했습니다.");
  current.dismiss(); expect(h.delivery).toBeNull(); current.ready(); current.dismiss();
  expect(guidanceRuntime(h).render()).toBe("");
});

test.each(["none", "error", "invalid", "throw"])("later %s retains the previously accepted row", async next => {
  const h = setup(); await acceptGuidance(h); const delivery = h.delivery!;
  if (next === "error") h.scope.nextProbe.mockRejectedValueOnce(new Error("offline"));
  else h.scope.nextProbe.mockResolvedValueOnce({ zone: "green", question: "Ordinary question?", layer: "fact", openers: [],
    ...(next === "none" ? {} : { guidance: contact }) });
  const scope = { ...h.scope, resolveProbeGuidanceCopy: next === "invalid" ? () => ({ kind: "invalid" })
    : next === "throw" ? () => { throw new Error("resolver unavailable"); } : resolveProbeGuidanceCopy };
  await callback("ask", scope)([], emptyCoverage());
  expect(h.delivery).toBe(delivery); expect(guidanceRuntime(h).render()).toContain("109");
});

test.each(["ko", "es", "pt", "id"])("actual common row renders all fixed blocks for %s without a raw model fallback", async locale => {
  const h = setup(true, locale);
  await acceptGuidance(h, { kind: "contacts", contacts: ["KR_109", "KR_119", "KR_1388", "GLOBAL_988"], physicalUrgency: true, corrections: [] });
  const runtime = guidanceRuntime(h); const markup = runtime.render();
  const copy = resolveProbeGuidanceCopy(h.delivery!.guidance, locale);
  expect(copy.kind).toBe("ready");
  if (copy.kind !== "ready") throw new Error("Expected fixed copy");
  expect(copy.blocks).toHaveLength(3); for (const block of copy.blocks) expect(markup).toContain(block.body);
  expect(markup).not.toContain("A separate question?"); expect(markup).not.toContain("An original answer");
  h.scope.finish(); expect(guidanceRuntime(h).render()).toBe(markup);
});

test("the real ask guidance context becomes false on early RED and after settlement", async () => {
  const h = setup(); const pending = h.ask([], emptyCoverage());
  const args = h.scope.nextProbe.mock.calls[0];
  const context = args[9] as { isCurrent(): boolean };
  expect(context.isCurrent()).toBe(true);
  (args[8] as (hotline: string) => void)("KR_109"); expect(context.isCurrent()).toBe(false);
  h.settle({ zone: "green", question: "Late?", layer: "fact", guidance: contact }); await pending;
  expect(h.delivery).toBeNull(); expect(context.isCurrent()).toBe(false); expect(h.scope.setTurns).not.toHaveBeenCalled();
  const ordinary = setup(); await acceptGuidance(ordinary);
  const settled = ordinary.scope.nextProbe.mock.calls[0][9] as { isCurrent(): boolean };
  expect(settled.isCurrent()).toBe(false); expect(ordinary.delivery).not.toBeNull();
});

test("a resolver-side owner transition stops row acceptance and subsequent question changes", async () => {
  const h = setup(); const ready = resolveProbeGuidanceCopy(contact, "ko");
  const ask = callback("ask", { ...h.scope, resolveProbeGuidanceCopy: () => { noteResolvedOwner("B"); return ready; } });
  const pending = ask([], emptyCoverage()); h.settle({ zone: "green", question: "Stale?", layer: "fact", guidance: contact });
  await pending; expect(h.delivery).toBeNull(); expect(h.scope.setTurns).not.toHaveBeenCalled(); expect(h.scope.setCoverage).not.toHaveBeenCalled();
});

test.each(["stopped", "unmounted", "active"])("late red reaches app when interview is %s and adds no question or credit", async state => {
  const { scope, settle, ask } = setup();
  const pending = ask([{ role: "user", text: "some answer", layer: "fact" }], {}, null, [], "fact");
  if (state !== "active") scope.ended.current = true;
  if (state === "unmounted") scope.mounted.current = false;
  settle({ zone: "red" });
  await pending;
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.setTurns).not.toHaveBeenCalled();
  expect(scope.confirmedAnswer).not.toHaveBeenCalled();
  if (state === "unmounted") {
    expect(scope.finish).not.toHaveBeenCalled();
    expect(scope.setBusy.mock.calls).toEqual([[true]]);
  } else {
    expect(scope.ended.current).toBe(true);
    if (state === "active") expect(scope.setDone).toHaveBeenCalledWith(true);
    else expect(scope.finish).not.toHaveBeenCalled();
    dismissCrisisNotice(getCrisisNotice()!.id);
    await ask([], {});
    expect(scope.nextProbe).toHaveBeenCalledTimes(1); // closing cannot resume
  }
});

test.each(["B", null])("late red after switching to %s cannot reach the next owner", async owner => {
  const { scope, settle, ask } = setup();
  const pending = ask([], {});
  noteResolvedOwner(owner);
  clearAccountTransition(currentAccountEpoch());
  settle({ zone: "red" });
  await pending;
  expect(getCrisisNotice()).toBeNull();
  expect(scope.finish).not.toHaveBeenCalled();
  expect(scope.setBusy.mock.calls).toEqual([[true]]);
});

test.each(["stopped", "unmounted"])("ordinary result after %s remains discarded", async state => {
  const { scope, settle, ask } = setup();
  const pending = ask([], {});
  scope.ended.current = true;
  scope.mounted.current = state !== "unmounted";
  settle({ zone: "green" });
  await pending;
  expect(getCrisisNotice()).toBeNull();
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.setTurns).not.toHaveBeenCalled();
});

test("late failure after unmount cannot change the next screen", async () => {
  const { scope, reject, ask } = setup();
  const pending = ask([], {});
  scope.mounted.current = false;
  scope.ended.current = true;
  reject(new Error("offline"));
  await pending;
  expect(scope.setNotice.mock.calls).toEqual([[null]]);
  expect(scope.setBusy.mock.calls).toEqual([[true]]);
});

test("local red ends before ledger writes finish without adding a saved answer or credit", async () => {
  const { scope } = setup();
  let ledgerDone!: () => void;
  const done = new Promise<void>(resolve => { ledgerDone = resolve; });
  const sendScope = {
    ...scope, busy: false, coverageReady: true, draft: "위기 입력", turns: [],
    crisisRouting: { current: false }, setDraft: jest.fn(),
    classifyInputAnyLocale: jest.fn(() => ({ zone: "red" })),
    startInterviewCrisisRouting: jest.fn((_guard, _input, visible) => { visible(); return { started: true, done }; }),
  };
  const send = callback("send", sendScope);
  await send();
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(scope.ended.current).toBe(true);
  expect(scope.setTurns).not.toHaveBeenCalled();
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.nextProbe).not.toHaveBeenCalled();
  dismissCrisisNotice(getCrisisNotice()!.id);
  await send();
  expect(sendScope.startInterviewCrisisRouting).toHaveBeenCalledTimes(1);
  ledgerDone();
});

test("app guidance is mounted outside route gates while existing screen dialogs stay focus-bound", () => {
  const layout = readFileSync(resolve(__dirname, "../_layout.tsx"), "utf8");
  expect(layout.indexOf("<AppCrisisHost />")).toBeGreaterThan(layout.indexOf("</SecondbHeadTrackProvider>"));
  expect(layout.indexOf("<AppCrisisHost />")).toBeLessThan(layout.indexOf("</AuthProvider>"));
  const router = readFileSync(resolve(__dirname, "../../components/safety/CrisisRouter.tsx"), "utf8");
  expect(router).toContain("<CrisisDialog {...props} Dialog={Modal} />");
  expect(router).toContain("Dialog={MotionModal}");
  expect(router).toContain("if (!notice) return null;");
});


test.each(["KR_119", "KR_112"] as const)("late %s survives interview end without an extra question", async (hotline) => {
  const { scope, settle, ask } = setup();
  const pending = ask([{ role: "user", text: "some answer", layer: "fact" }], {}, null, [], "fact");
  scope.ended.current = true;
  settle({ zone: "red", hotline });
  await pending;
  expect(getCrisisNotice()?.hotline).toBe(hotline);
  expect(scope.setTurns).not.toHaveBeenCalled();
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.confirmedAnswer).not.toHaveBeenCalled();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observer(h: ReturnType<typeof setup>): CrisisObserver {
  const value = h.scope.nextProbe.mock.calls[0]?.[8];
  if (typeof value !== "function") throw new Error("The screen did not pass its RED observer");
  return value as CrisisObserver;
}

test("callback and final share one publication and preserve the first routing", async () => {
  const h = setup(); const pending = h.ask([], {});
  const early = observer(h); early("KR_119");
  const first = getCrisisNotice();
  early("KR_112"); h.settle({ zone: "red", hotline: "KR_112" }); await pending;
  expect(getCrisisNotice()).toEqual(first);
  expect(first?.hotline).toBe("KR_119"); expect(h.scope.finish).toHaveBeenCalledTimes(1);
});

test.each(["green", "error"])("RED then late %s cannot restart questions, credit, stuck or failure UI", async result => {
  const h = setup(); const pending = h.ask([], {}, null, [], "fact");
  observer(h)("KR_119"); dismissCrisisNotice(getCrisisNotice()!.id);
  if (result === "error") h.reject(new Error("late failure")); else h.settle({ zone: "green" });
  await pending;
  expect(getCrisisNotice()).toBeNull(); expect(h.scope.finish).toHaveBeenCalledTimes(1);
  expect(h.scope.setTurns).not.toHaveBeenCalled(); expect(h.scope.setCoverage).not.toHaveBeenCalled();
  expect(h.scope.setStuckStreak).not.toHaveBeenCalled(); expect(h.scope.readDayLimitRefusal).not.toHaveBeenCalled();
  expect(h.scope.setNotice.mock.calls).toEqual([[null]]);
});

test.each(["B", "ABA"])("%s before the callback invalidates the original request owner", async change => {
  const h = setup(); const pending = h.ask([], {});
  noteResolvedOwner(change === "B" ? "B" : null);
  if (change === "ABA") noteResolvedOwner("A");
  clearAccountTransition(currentAccountEpoch());
  observer(h)("KR_119"); h.settle({ zone: "red" }); await pending;
  expect(getCrisisNotice()).toBeNull(); expect(h.scope.finish).not.toHaveBeenCalled();
  expect(h.scope.setBusy.mock.calls).toEqual([[true]]);
});

test.each(["B", "ABA", "instance", "unmount"])("publish subscriber %s prevents stale finish/setters", async change => {
  const h = setup(); const pending = h.ask([], {});
  const unsubscribe = subscribeCrisisNotice(() => {
    if (!getCrisisNotice()) return;
    if (change === "instance") h.scope.interviewInstance.current += 1;
    else if (change === "unmount") h.scope.mounted.current = false;
    else {
      noteResolvedOwner(change === "B" ? "B" : null);
      if (change === "ABA") noteResolvedOwner("A");
      clearAccountTransition(currentAccountEpoch());
    }
  });
  try { observer(h)("KR_119"); } finally { unsubscribe(); }
  h.settle({ zone: "red" }); await pending;
  expect(h.scope.finish).not.toHaveBeenCalled(); expect(h.scope.setBusy.mock.calls).toEqual([[true]]);
  expect(h.scope.setTurns).not.toHaveBeenCalled(); expect(h.scope.setCoverage).not.toHaveBeenCalled();
  if (change === "B" || change === "ABA") expect(getCrisisNotice()).toBeNull();
  else expect(getCrisisNotice()?.hotline).toBe("KR_119");
});

test("a synchronous subscriber re-entering the observer cannot publish twice", async () => {
  const h = setup(); const pending = h.ask([], {}); const early = observer(h);
  const listener = jest.fn(() => early("KR_112")); const unsubscribe = subscribeCrisisNotice(listener);
  try { early("KR_119"); } finally { unsubscribe(); }
  h.settle({ zone: "red", hotline: "KR_112" }); await pending;
  expect(listener).toHaveBeenCalledTimes(1); expect(getCrisisNotice()?.hotline).toBe("KR_119");
  expect(h.scope.finish).toHaveBeenCalledTimes(1);
});

test("a new interview request for the same owner gets its own once", async () => {
  const first = setup(); const firstPending = first.ask([], {}); observer(first)("KR_119");
  dismissCrisisNotice(getCrisisNotice()!.id);
  first.scope.mounted.current = false;
  const second = setup(false); const secondPending = second.ask([], {}); observer(second)("KR_112");
  const secondNotice = getCrisisNotice();
  first.settle({ zone: "red", hotline: "KR_119" }); await firstPending;
  second.settle({ zone: "red", hotline: "KR_112" }); await secondPending;
  expect(getCrisisNotice()).toEqual(secondNotice); expect(secondNotice?.hotline).toBe("KR_112");
  expect(second.scope.finish).toHaveBeenCalledTimes(1);
});

test.each(["question", "instance"])("ordinary results from a replaced %s cannot update the screen", async change => {
  const h = setup(); const pending = h.ask([], {});
  if (change === "question") h.scope.turnsOwnerRef.current = []; else h.scope.interviewInstance.current += 1;
  h.settle({ zone: "green" }); await pending;
  expect(h.scope.setTurns).not.toHaveBeenCalled(); expect(h.scope.finish).not.toHaveBeenCalled();
  expect(h.scope.setBusy.mock.calls).toEqual([[true]]);
});

test("a second ordinary request cannot take the first lock, and a later explicit request has its own token", async () => {
  const h = setup(); const first = h.ask([], emptyCoverage());
  await h.ask([], emptyCoverage()); expect(h.scope.nextProbe).toHaveBeenCalledTimes(1);
  h.settle({ zone: "green", question: "Next?", layer: "fact", openers: [] }); await first;
  const secondResult = deferred<{ zone: ProbeResult["zone"] }>();
  h.scope.nextProbe.mockImplementationOnce(() => secondResult.promise);
  const second = h.ask([], emptyCoverage()); expect(h.scope.nextProbe).toHaveBeenCalledTimes(2);
  secondResult.resolve({ zone: "red" }); await second; expect(h.scope.finish).toHaveBeenCalledTimes(1);
});

test("an observer called after its request settled cannot open a new notice", async () => {
  const h = setup(); const pending = h.ask([], {}); const early = observer(h);
  h.settle({ zone: "green" }); await pending;
  early("KR_119"); expect(getCrisisNotice()).toBeNull();
});

describe("real nextProbe → boundary → screen, before deferred audit", () => {
  const green = { zone: "green", triggers: [], confidence: 0.4, cssrsLevel: null, source: "llm" };
  const red = { ...green, zone: "red", triggers: ["active_ideation_no_method"], confidence: 0.97, cssrsLevel: 3 };
  const pinned = { EXPO_PUBLIC_BACKBONE_VENDOR: "gemini", EXPO_PUBLIC_FAILOVER_VENDOR: undefined };
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const [key, value] of Object.entries(pinned)) {
      saved[key] = process.env[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  afterAll(() => {
    for (const key of Object.keys(pinned)) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
  beforeEach(() => {
    mockInvoke.mockReset(); mockGenerateContent.mockReset(); mockClassifySafety.mockReset();
    mockClassifySafety.mockResolvedValue(green);
    mockAudit.mockReset().mockResolvedValue(undefined); mockCrisis.mockReset().mockResolvedValue(undefined);
  });

  test.each(["lexical", "semantic"])("%s RED reaches root before audit finishes through the actual probe", async kind => {
    const h = setup();
    h.scope.nextProbe.mockImplementation((...args) => nextProbe(...args as Parameters<typeof nextProbe>));
    const auditStarted = deferred<void>(); const auditDone = deferred<void>();
    mockAudit.mockImplementation(() => { auditStarted.resolve(); return auditDone.promise; });
    mockInvoke.mockResolvedValue({ data: { text: kind === "lexical"
      ? "약을 이미 많이 먹었어요."
      : "Maybe it would be easier for everyone if you just slipped away quietly.", modelUsed: "offline-fixture" }, error: null });
    if (kind === "semantic") mockClassifySafety.mockImplementation(async (_text, _locale, options) => {
      options.onRed?.(undefined);
      return red;
    });
    const settled = jest.fn(); const pending = h.ask([], emptyCoverage()).then(settled);
    await auditStarted.promise;
    try {
      expect(settled).not.toHaveBeenCalled();
      expect(getCrisisNotice()?.hotline).toBe(kind === "lexical" ? "KR_119" : "KR_109");
      expect(h.scope.finish).toHaveBeenCalledTimes(1);
      expect(h.scope.setTurns).not.toHaveBeenCalled();
      expect(h.scope.setCoverage).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).not.toHaveBeenCalled();
      dismissCrisisNotice(getCrisisNotice()!.id);
    } finally {
      auditDone.resolve(); await pending;
    }
    expect(getCrisisNotice()).toBeNull();
    expect(h.scope.finish).toHaveBeenCalledTimes(1);
    expect(mockCrisis).toHaveBeenCalledTimes(1);
  });

  test.each(["B", "ABA"])("%s during the real audit clears root and adds no late UI or resend", async change => {
    const h = setup();
    h.scope.nextProbe.mockImplementation((...args) => nextProbe(...args as Parameters<typeof nextProbe>));
    const started = deferred<void>(); const done = deferred<void>();
    mockAudit.mockImplementation(() => { started.resolve(); return done.promise; });
    mockInvoke.mockResolvedValue({ data: { text: "약을 이미 많이 먹었어요.", modelUsed: "offline-fixture" }, error: null });
    const pending = h.ask([], emptyCoverage()); await started.promise;
    expect(getCrisisNotice()?.hotline).toBe("KR_119");
    const busyCalls = h.scope.setBusy.mock.calls.slice();
    noteResolvedOwner(change === "B" ? "B" : null);
    if (change === "ABA") noteResolvedOwner("A");
    clearAccountTransition(currentAccountEpoch());
    done.resolve(); await pending;
    expect(getCrisisNotice()).toBeNull(); expect(h.scope.finish).toHaveBeenCalledTimes(1);
    expect(h.scope.setBusy.mock.calls).toEqual(busyCalls);
    expect(h.scope.setTurns).not.toHaveBeenCalled(); expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test.each(["subscriber", "audit"])("a failing %s keeps RED, permits the audit attempt and suppresses ordinary failure", async failure => {
    const h = setup();
    h.scope.nextProbe.mockImplementation((...args) => nextProbe(...args as Parameters<typeof nextProbe>));
    const started = deferred<void>(); const done = deferred<void>();
    mockAudit.mockImplementation(() => { started.resolve(); return done.promise; });
    mockInvoke.mockResolvedValue({ data: { text: "약을 이미 많이 먹었어요.", modelUsed: "offline-fixture" }, error: null });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const unsubscribe = failure === "subscriber"
      ? subscribeCrisisNotice(() => { throw new Error("fixture observer unavailable"); }) : () => {};
    const pending = h.ask([], emptyCoverage()); await started.promise;
    try {
      expect(h.scope.finish).toHaveBeenCalledTimes(1); expect(mockAudit).toHaveBeenCalledTimes(1);
      // A throwing subscriber is NOT evidence that a native dialog was shown.
      if (failure === "audit") done.reject(new Error("fixture audit unavailable")); else done.resolve();
      await pending;
      expect(h.scope.setTurns).not.toHaveBeenCalled(); expect(h.scope.setCoverage).not.toHaveBeenCalled();
      expect(h.scope.setNotice.mock.calls).toEqual([[null]]); expect(h.scope.readDayLimitRefusal).not.toHaveBeenCalled();
      expect(h.scope.finish).toHaveBeenCalledTimes(1);
      // Preserve the existing boundary error: a rejected audit rejects the
      // request before its event write; early guidance must still survive.
      expect(mockCrisis).toHaveBeenCalledTimes(failure === "audit" ? 0 : 1);
    } finally {
      unsubscribe(); done.resolve(); await pending; warn.mockRestore();
    }
  });

  test.each(["stopped", "unmounted"])("real early RED after %s reaches root without reopening the screen", async state => {
    const h = setup();
    h.scope.nextProbe.mockImplementation((...args) => nextProbe(...args as Parameters<typeof nextProbe>));
    const response = deferred<{ data: { text: string; modelUsed: string }; error: null }>();
    mockInvoke.mockReturnValue(response.promise);
    const pending = h.ask([], emptyCoverage());
    h.scope.ended.current = true;
    if (state === "unmounted") h.scope.mounted.current = false;
    response.resolve({ data: { text: "약을 이미 많이 먹었어요.", modelUsed: "offline-fixture" }, error: null });
    await pending;
    expect(getCrisisNotice()?.hotline).toBe("KR_119"); expect(h.scope.finish).not.toHaveBeenCalled();
    expect(h.scope.setBusy.mock.calls).toEqual([[true]]); expect(h.scope.setTurns).not.toHaveBeenCalled();
    expect(h.scope.setCoverage).not.toHaveBeenCalled();
  });

  // Probe does not gain a new signal/session API in S0-A. Exercise the existing
  // boundary cancellation contract directly; stop/Back remains unchanged.
  test.each(["before-classification", "after-confirmed"])("real boundary abort %s keeps the existing RED fence", async at => {
    setup(); const owner = captureAccountOwnerLease("A");
    const onCrisisDetected = jest.fn((hotline) => publishCrisisNotice(owner, hotline ?? "KR_109"));
    const controller = new AbortController();
    const response = deferred<{ data: { text: string; modelUsed: string }; error: null }>();
    const started = deferred<void>(); const done = deferred<void>();
    mockInvoke.mockReturnValue(response.promise);
    mockAudit.mockImplementation(() => { started.resolve(); return done.promise; });
    const outcome = callLlm({ userId: "A", locale: "ko", purpose: "interview_probe",
      user: "오늘 회의에서 동료와 계획을 이야기했어요.", onCrisisDetected, signal: controller.signal,
    }).then(value => ({ value }), error => ({ error }));
    if (at === "before-classification") controller.abort();
    response.resolve({ data: { text: "약을 이미 많이 먹었어요.", modelUsed: "offline-fixture" }, error: null });
    if (at === "after-confirmed") {
      await started.promise; expect(getCrisisNotice()?.hotline).toBe("KR_119");
      controller.abort(); done.resolve();
    }
    expect(await outcome).toMatchObject({ error: { name: "AbortError" } });
    expect(onCrisisDetected).toHaveBeenCalledTimes(at === "after-confirmed" ? 1 : 0);
    if (at === "before-classification") {
      expect(getCrisisNotice()).toBeNull(); expect(mockClassifySafety).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    } else expect(getCrisisNotice()?.hotline).toBe("KR_119");
  });
});
