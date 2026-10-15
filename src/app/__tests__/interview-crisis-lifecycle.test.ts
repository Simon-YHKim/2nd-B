import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice, subscribeCrisisNotice } from "../../lib/safety/crisis-notice";
import { emptyCoverage, nextProbe } from "../../lib/interview/probe";
import { callLlm } from "../../lib/llm/boundary";
import type { CrisisObserver } from "../../lib/llm/types";
import type { HotlineId } from "../../lib/safety/lexicon";

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

function setup(resetOwner = true) {
  if (resetOwner) {
    noteResolvedOwner(null);
    noteResolvedOwner("A");
    clearAccountTransition(currentAccountEpoch());
  }
  const old = getCrisisNotice();
  if (old) dismissCrisisNotice(old.id);
  let settle!: (value: { zone: string; hotline?: HotlineId }) => void;
  let reject!: (error: Error) => void;
  const request = new Promise<{ zone: string; hotline?: HotlineId }>((yes, no) => { settle = yes; reject = no; });
  const ended = { current: false };
  const mounted = { current: true };
  const scope = {
    userId: "A", period: "work", locale: "ko", isMinor: false, concreteOnly: false,
    ended, mounted, captureAccountOwnerLease, publishCrisisNotice,
    interviewInstance: { current: 1 }, probeRequest: { current: 0 }, turnsOwnerRef: { current: [] as unknown[] },
    nextMove: jest.fn(() => ({ kind: "drill", layer: "fact" })),
    entriesOf: jest.fn(() => []), nextProbe: jest.fn((..._args: unknown[]) => request),
    hotlineFor: () => "KR_109", t: (key: string) => key,
    setBusy: jest.fn(), setNotice: jest.fn(), setDone: jest.fn(), setPendingLayer: jest.fn(), setOpeners: jest.fn(),
    setTurns: jest.fn(), setCoverage: jest.fn(), setStuckStreak: jest.fn(), confirmedAnswer: jest.fn(), incrementCoverage: jest.fn(),
    readDayLimitRefusal: jest.fn(async () => false), setDayLimited: jest.fn(), finish: jest.fn(),
  };
  scope.finish = jest.fn(callback("finish", scope));
  return { scope, settle, reject, ask: callback("ask", scope) };
}

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

test("an older ordinary request cannot settle a newer pending request", async () => {
  const h = setup(); const first = h.ask([], {}); const secondResult = deferred<{ zone: string }>();
  h.scope.nextProbe.mockImplementationOnce(() => secondResult.promise);
  const second = h.ask([], {}); h.settle({ zone: "green" }); await first;
  expect(h.scope.finish).not.toHaveBeenCalled(); expect(h.scope.setBusy.mock.calls).toEqual([[true], [true]]);
  secondResult.resolve({ zone: "red" }); await second;
  expect(h.scope.finish).toHaveBeenCalledTimes(1);
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
