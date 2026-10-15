import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vm from "node:vm";
import * as ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, currentAccountOwner, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice } from "../../lib/safety/crisis-notice";

import { beginAccountSessionLease } from "../../lib/auth/account-session-lease";

const source = ts.createSourceFile("call-reflection.tsx", readFileSync(join(process.cwd(), "src/app/call-reflection.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "CallReflection")!;
const compiled = ts.transpileModule(screen.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "h" } }).outputText;
const A = "594cf7fa-d5de-4003-8153-deae0091ce4b";
const B = "694cf7fa-d5de-4003-8153-deae0091ce4b";
type Tree = { type: string; props: Record<string, any>; children: unknown[] };
type Effect = { deps: unknown[]; cleanup?: () => void };
type Reply = { text: string; safety: { zone: string; crisisRouting?: { hotline: string } } };
const green = (text: string): Reply => ({ text, safety: { zone: "green" } });
const red = (): Reply => ({ text: "never show", safety: { zone: "red", crisisRouting: { hotline: "KR_109" } } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function nodes(tree: unknown): Tree[] {
  if (!tree || typeof tree !== "object" || !("children" in tree)) return [];
  const node = tree as Tree;
  return [node, ...node.children.flat(Infinity).flatMap(nodes)];
}
async function flush() { for (let i = 0; i < 24; i++) await Promise.resolve(); }

beforeEach(() => {
  noteResolvedOwner(null);
  noteResolvedOwner("owner-A");
  clearAccountTransition(currentAccountEpoch());
  const notice = getCrisisNotice();
  if (notice) dismissCrisisNotice(notice.id);
});

// The real component and JSX run with a small hook host. Promise I/O is
// controlled; layout effects are flushed before the next painted tree.
function harness() {
  const slots: any[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: (() => void)[] = [];
  let layouts: (() => void)[] = [];
  let params: Record<string, unknown> = { sharedMedia: A, from: "share" };
  const requests: ReturnType<typeof deferred<Reply>>[] = [];
  const writes: ReturnType<typeof deferred<{ followup?: { zone: string }; crisisHotline?: string }>>[] = [];
  const effect = (queue: (() => void)[], callback: () => (() => void) | void, deps: unknown[]) => {
    const index = cursor++;
    const old = slots[index] as Effect | undefined;
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      queue.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
    }
  };
  const scope = {
    h: (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props: props ?? {}, children }),
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next: unknown) => {
        const value = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
      }];
    },
    useRef: (initial: unknown) => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect: (callback: () => void, deps: unknown[]) => effect(effects, callback, deps),
    useLayoutEffect: (callback: () => void, deps: unknown[]) => effect(layouts, callback, deps),
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "ko" } }),
    uiLocaleFor: () => "ko", CALL_REFLECTION_COPY: { ko: {} },
    useAuth: () => ({ userId: "owner-A", isMinor: false, loading: false, hasProfile: true }),
    useProgression: () => ({ tier: "free" }), useLocalSearchParams: () => params,
    sharedMediaToken: (value: unknown) => typeof value === "string" ? value : null,
    sharedMediaError: (value: unknown) => typeof value === "string" ? value : null,
    carriesShareMarker: () => true, discardSharedMedia: jest.fn(), resolveJurisdiction: () => ({ country: "KR" }),
    captureAccountOwnerLease, publishCrisisNotice, AbortController,
    beginAccountSessionLease,
    takeSharedMedia: jest.fn(async () => ({ uri: "file:///owned", mimeType: "audio/mp4", size: 200, release: async () => undefined })),
    pickAudioFile: jest.fn(async () => null), recordingUriToBase64: jest.fn(async () => ({ base64: "audio" })),
    transcribeAudio: jest.fn(() => { const item = deferred<Reply>(); requests.push(item); return item.promise; }),
    createRecord: jest.fn(() => { const item = deferred<{ followup?: { zone: string }; crisisHotline?: string }>(); writes.push(item); return item.promise; }),
    releasePickedFile: async () => undefined, isAudioMime: () => true, MAX_AUDIO_FILE_BYTES: 3_000_000,
    isAbortError: (error: Error) => error.name === "AbortError", hotlineFor: () => "KR_109",
    router: { setParams: jest.fn((next) => { params = { ...params, ...next }; dirty = true; }), back: jest.fn(), push: jest.fn() },
    composeStructured: () => ({}), s: new Proxy({}, { get: () => ({}) }), m3: { color: {} }, console,
  };
  for (const name of ["DeepSpaceScreen", "View", "RNText", "MdButton", "PixelGlyph", "CrisisRouter", "DeepSpaceLoader", "ScrollView", "Redirect"]) Object.assign(scope, { [name]: name });
  vm.createContext(scope);
  vm.runInContext(compiled, scope);
  function render(): Tree {
    let tree!: Tree;
    let renders = 0;
    do {
      dirty = false; cursor = 0; effects = []; layouts = [];
      tree = (scope as any).CallReflection({ country: "KR" });
      layouts.forEach((run) => run()); effects.forEach((run) => run());
      if (++renders > 10) throw new Error("render loop");
    } while (dirty);
    return tree;
  }
  function button(label: string): Tree { const found = nodes(render()).find((node) => node.type === "MdButton" && node.props.label === label); if (!found) throw new Error(`Missing button ${label}`); return found; }
  return {
    scope, requests, writes, render, button,
    unmount: () => { for (const slot of slots) if (slot?.cleanup) slot.cleanup(); },
    receive: (token: string | null, error?: string) => { params = { sharedMedia: token ?? undefined, sharedMediaError: error, from: "share" }; return render(); },
    labels: () => nodes(render()).filter((node) => node.type === "MdButton").map((node) => node.props.label),
    text: () => JSON.stringify(render()),
    async send() { button("sharedMedia.audioSend").props.onPress(); await flush(); render(); },
  };
}

test("the installed router reuses the route key for a second external share", () => {
  const { getActionFromState } = require("expo-router/build/react-navigation/core/getActionFromState");
  const { StackRouter } = require("expo-router/build/react-navigation/routers/StackRouter");
  const options = { routeNames: ["call-reflection"], routeParamList: {}, routeGetIdList: {} };
  const router = StackRouter({});
  let state = router.getInitialState(options);
  state.routes[0].params = { sharedMedia: A };
  const key = state.routes[0].key;
  const action = getActionFromState({ routes: [{ name: "call-reflection", params: { sharedMedia: B, from: "share" } }] });
  state = router.getStateForAction(state, action, options);
  expect(action.type).toBe("NAVIGATE");
  expect(state.routes[state.index].key).toBe(key);
});

test("B during A transcription cancels A, displays B's explicit action, and rejects late A green", async () => {
  const h = harness(); await h.send();
  const oldSignal = (h.scope.transcribeAudio.mock.calls[0] as unknown as [{ session: { signal: AbortSignal } }])[0].session.signal;
  h.receive(B);
  expect(oldSignal.aborted).toBe(true);
  expect(h.labels()).toContain("sharedMedia.audioSend");
  expect(h.scope.transcribeAudio).toHaveBeenCalledTimes(1); // receiving B does not transmit it
  await h.send();
  expect(h.scope.transcribeAudio).toHaveBeenCalledTimes(2);
  h.requests[0].resolve(green("OLD_A")); await flush();
  expect(h.text()).not.toContain("OLD_A");
  expect(h.labels()).not.toContain("callReflection.approve");
  h.requests[1].resolve(green("NEW_B")); await flush();
  expect(h.text()).toContain("NEW_B");
  expect(h.labels()).toContain("callReflection.approve");
});

test("ACK keeps A's review; a new share during review discards that review and stale approval", async () => {
  const h = harness(); await h.send(); h.requests[0].resolve(green("OLD_A")); await flush();
  expect(h.text()).toContain("OLD_A");
  const approveA = h.button("callReflection.approve").props.onPress;
  h.receive(B);
  expect(h.labels()).toContain("sharedMedia.audioSend");
  expect(h.text()).not.toContain("OLD_A");
  approveA(); await flush();
  expect(h.scope.createRecord).not.toHaveBeenCalled();
});

test("B during an already approved A save cannot be replaced by A's late navigation", async () => {
  const h = harness(); await h.send(); h.requests[0].resolve(green("OLD_A")); await flush();
  h.button("callReflection.approve").props.onPress(); await flush();
  expect(h.scope.createRecord).toHaveBeenCalledTimes(1);
  h.receive(B); h.writes[0].resolve({}); await flush();
  expect(h.labels()).toContain("sharedMedia.audioSend");
  expect(h.scope.router.push).not.toHaveBeenCalled();
  expect(h.scope.createRecord).toHaveBeenCalledTimes(1);
});

test("a late red save keeps guidance above B without navigating away from B", async () => {
  const h = harness(); await h.send(); h.requests[0].resolve(green("OLD_A")); await flush();
  h.button("callReflection.approve").props.onPress(); await flush(); h.receive(B);
  h.writes[0].resolve({ followup: { zone: "red" }, crisisHotline: "KR_109" }); await flush();
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(h.labels()).toContain("sharedMedia.audioSend");
  expect(h.scope.router.push).not.toHaveBeenCalled();
});

test("A's late cleanup cannot clear B's pending-copy spinner or allow a second B copy", async () => {
  const h = harness(); await h.send(); h.receive(B);
  const copy = deferred<Awaited<ReturnType<typeof h.scope.takeSharedMedia>>>();
  h.scope.takeSharedMedia.mockReturnValueOnce(copy.promise);
  await h.send(); h.requests[0].resolve(green("OLD_A")); await flush();
  expect(h.button("sharedMedia.audioSend").props.disabled).toBe(true);
  h.button("sharedMedia.audioSend").props.onPress(); await flush();
  expect(h.scope.takeSharedMedia).toHaveBeenCalledTimes(2);
  copy.resolve({ uri: "file:///owned", mimeType: "audio/mp4", size: 200, release: async () => undefined });
  await flush(); h.requests[1].resolve(green("NEW_B")); await flush();
  expect(h.text()).toContain("NEW_B");
});

test("the same error after a manual file choice is a new delivery, not an old result", async () => {
  const h = harness(); h.receive(null, "multiple");
  h.scope.pickAudioFile.mockResolvedValueOnce({ uri: "file:///manual", mimeType: "audio/mp4", size: 200, name: "manual", textContent: null } as never);
  h.button("file.pick").props.onPress(); h.render(); await flush();
  h.requests[0].resolve(green("MANUAL_A")); await flush();
  expect(h.text()).toContain("MANUAL_A");
  h.receive(null, "multiple");
  expect(h.text()).not.toContain("MANUAL_A");
  expect(h.text()).toContain("sharedMedia.multiple");
});

test("an error delivery replaces an older result without transmitting or saving", async () => {
  const h = harness(); await h.send(); h.requests[0].resolve(green("OLD_A")); await flush();
  h.receive(null, "multiple");
  expect(h.text()).not.toContain("OLD_A");
  expect(h.text()).toContain("sharedMedia.multiple");
  expect(h.scope.transcribeAudio).toHaveBeenCalledTimes(1);
  expect(h.scope.createRecord).not.toHaveBeenCalled();
});

test("late A red after B reaches app guidance and never becomes B's transcript", async () => {
  const h = harness(); await h.send(); h.receive(B); h.requests[0].resolve(red()); await flush();
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(h.text()).not.toContain("never show");
  expect(h.labels()).toContain("sharedMedia.audioSend");
});

test("an already visible crisis notice survives receiving B", async () => {
  const h = harness(); await h.send(); h.requests[0].resolve(red()); await flush(); h.receive(B);
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(nodes(h.render()).find((node) => node.type === "CrisisRouter")?.props.visible).toBe(false);
});

test.each(["B", "ABA"])("late A red after account %s does not reach another epoch", async (transition) => {
  const h = harness(); await h.send(); h.receive(B);
  noteResolvedOwner(transition === "B" ? "owner-B" : null);
  if (transition === "ABA") noteResolvedOwner("owner-A");
  clearAccountTransition(currentAccountEpoch());
  h.requests[0].resolve(red()); await flush();
  expect(getCrisisNotice()).toBeNull();
  expect(h.scope.createRecord).not.toHaveBeenCalled();
});

// Real boundary + real safety classifier + real owner/session leases. Only the
// external proxy/model/audit I/O is controlled; these tests never call a model.
const mockBoundaryInvoke = jest.fn();
const mockBoundaryAudit = jest.fn();
const mockClassifierAudit = jest.fn();
const mockDirectGenerate = jest.fn();
const mockBoundaryEnv = { EXPO_PUBLIC_SUPABASE_URL: "https://example.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "synthetic", EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true, EXPO_PUBLIC_USE_VERTEX: false };
jest.mock("../../lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: require("../../lib/auth/account-epoch").currentAccountOwner() }, access_token: "synthetic-captured-token" } }, error: null }) } }) }));
jest.mock("../../lib/supabase/captured-session-client", () => ({ invokeFunctionWithCapturedSession: (...args: unknown[]) => mockBoundaryInvoke(...args) }));
jest.mock("../../lib/llm/audit-write-outbox", () => ({ enqueueAuditWrite: (...args: unknown[]) => mockBoundaryAudit(...args) }));
jest.mock("../../lib/supabase/audit", () => ({ insertAiAuditLog: (...args: unknown[]) => mockClassifierAudit(...args) }));
jest.mock("../../lib/env", () => ({ getEnv: () => mockBoundaryEnv }));
jest.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: (...args: unknown[]) => mockDirectGenerate(...args) }; } }));

function actualBoundary(h: ReturnType<typeof harness>, transcript = "약을 이미 많이 먹었어") {
  const actual = jest.requireActual<typeof import("../../lib/llm/boundary")>("../../lib/llm/boundary");
  mockBoundaryEnv.EXPO_PUBLIC_USE_VERTEX = false;
  mockBoundaryAudit.mockReset().mockResolvedValue(undefined);
  mockClassifierAudit.mockReset().mockResolvedValue(undefined);
  mockBoundaryInvoke.mockReset().mockImplementation(async (_fn, _token, input) => ({ data: { text: input.body.purpose === "safety_classify" ? JSON.stringify({ zone: "green", triggers: [], confidence: 0.9 }) : transcript, audited: true }, error: null }));
  h.scope.transcribeAudio.mockImplementation(((input: Parameters<typeof actual.transcribeAudio>[0]) => actual.transcribeAudio(input)) as never);
  return actual;
}

describe("actual transcription boundary cancellation", () => {
  const serverSafety = process.env.EXPO_PUBLIC_SERVER_SAFETY;
  beforeEach(() => { process.env.EXPO_PUBLIC_SERVER_SAFETY = "true"; });
  afterEach(() => {
    if (serverSafety === undefined) delete process.env.EXPO_PUBLIC_SERVER_SAFETY;
    else process.env.EXPO_PUBLIC_SERVER_SAFETY = serverSafety;
    mockBoundaryEnv.EXPO_PUBLIC_USE_VERTEX = false;
  });

  test.each([false, true])("confirmed RED is visible before audit, with B redelivery=%s", async (receiveB) => {
    const h = harness(); actualBoundary(h); const audit = deferred<void>();
    mockBoundaryAudit.mockReturnValueOnce(audit.promise);
    await h.send();
    expect(mockBoundaryAudit).toHaveBeenCalledWith(expect.objectContaining({ kind: "ai_audit_log", payload: expect.objectContaining({ safetyZone: "red" }) }), expect.anything());
    const early = getCrisisNotice(); expect(early?.hotline).toBe("KR_119");
    if (receiveB) h.receive(B);
    audit.resolve(); await flush();
    expect(getCrisisNotice()).toBe(early); // one sink, one delivery, no duplicate final reply
    expect(nodes(h.render()).find((node) => node.type === "CrisisRouter")?.props.visible).toBe(false);
    if (receiveB) expect(h.labels()).toContain("sharedMedia.audioSend");
    expect(h.scope.createRecord).not.toHaveBeenCalled();
  });

  test.each([false, true])("dismissed early RED is not reopened by final reply or B=%s", async (receiveB) => {
    const h = harness(); actualBoundary(h); const audit = deferred<void>(); mockBoundaryAudit.mockReturnValueOnce(audit.promise);
    await h.send(); dismissCrisisNotice(getCrisisNotice()!.id);
    if (receiveB) {
      h.receive(B);
      mockBoundaryInvoke.mockResolvedValueOnce({ data: { text: "NEW_B ordinary transcript", audited: true }, error: null });
      await h.send();
    }
    audit.resolve(); await flush();
    expect(getCrisisNotice()).toBeNull();
    if (receiveB) expect(h.text()).toContain("NEW_B ordinary transcript");
    expect(h.text()).not.toContain("약을 이미 많이 먹었어");
  });

  test("lexical 109 RED is announced before a delayed semantic classification", async () => {
    const h = harness(); actualBoundary(h, "죽고 싶어요"); const semantic = deferred<unknown>();
    const previous = mockBoundaryInvoke.getMockImplementation()!;
    mockBoundaryInvoke.mockImplementation((fn, token, input) => input.body.purpose === "safety_classify" ? semantic.promise : previous(fn, token, input));
    await h.send();
    expect(getCrisisNotice()?.hotline).toBe("KR_109");
    expect(mockBoundaryAudit).not.toHaveBeenCalled();
    h.receive(B); semantic.resolve({ data: { text: JSON.stringify({ zone: "green", confidence: 0.9 }) }, error: null }); await flush();
    expect(getCrisisNotice()?.hotline).toBe("KR_109");
    expect(h.labels()).toContain("sharedMedia.audioSend");
  });

  test.each(["B", "ABA", "unmount", "share"])("unclassified output after %s is still fenced", async (change) => {
    const h = harness(); actualBoundary(h); const proxy = deferred<unknown>(); mockBoundaryInvoke.mockReturnValueOnce(proxy.promise);
    await h.send();
    if (change === "share") h.receive(B);
    else if (change === "unmount") h.unmount();
    else { noteResolvedOwner(change === "B" ? "owner-B" : null); if (change === "ABA") noteResolvedOwner("owner-A"); clearAccountTransition(currentAccountEpoch()); }
    proxy.resolve({ data: { text: "약을 이미 많이 먹었어", audited: true }, error: null }); await flush();
    expect(getCrisisNotice()).toBeNull();
    expect(mockBoundaryAudit).not.toHaveBeenCalled();
  });

  test.each(["B", "ABA", "unmount"])("an already confirmed notice follows account ownership across %s", async (change) => {
    const h = harness(); actualBoundary(h); const audit = deferred<void>(); mockBoundaryAudit.mockReturnValueOnce(audit.promise);
    await h.send(); expect(getCrisisNotice()?.hotline).toBe("KR_119");
    if (change === "unmount") h.unmount();
    else { noteResolvedOwner(change === "B" ? "owner-B" : null); if (change === "ABA") noteResolvedOwner("owner-A"); clearAccountTransition(currentAccountEpoch()); }
    audit.resolve(); await flush();
    if (change === "unmount") expect(getCrisisNotice()?.hotline).toBe("KR_119");
    else expect(getCrisisNotice()).toBeNull();
  });

  test("consent rejection cannot publish a notice or reach another model", async () => {
    const h = harness(); actualBoundary(h);
    mockBoundaryInvoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error: "consent_required" }), { status: 403 }) } });
    const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try { await h.send(); expect(getCrisisNotice()).toBeNull(); expect(mockBoundaryInvoke).toHaveBeenCalledTimes(1); expect(mockBoundaryAudit).not.toHaveBeenCalled(); } finally { warning.mockRestore(); }
  });

  test("semantic-only direct classifier RED notifies before its own audit await", async () => {
    const h = harness(); actualBoundary(h, "A neutral fixture with no lexical crisis marker");
    mockBoundaryEnv.EXPO_PUBLIC_USE_VERTEX = true;
    const audit = deferred<void>(); mockClassifierAudit.mockReturnValueOnce(audit.promise);
    mockDirectGenerate.mockResolvedValueOnce({ text: JSON.stringify({ zone: "red", triggers: ["active_ideation"], confidence: 0.99 }) });
    await h.send();
    expect(mockClassifierAudit).toHaveBeenCalledWith(expect.objectContaining({ safetyZone: "red", purpose: "safety_classify" }), expect.any(String), expect.anything());
    expect(getCrisisNotice()?.hotline).toBe("KR_109");
    h.receive(B); audit.resolve(); await flush(); expect(getCrisisNotice()?.hotline).toBe("KR_109");
  });

  test("observer failure cannot skip audits or alter the standard red return", async () => {
    const h = harness(); const actual = actualBoundary(h);
    const pending = beginAccountSessionLease(currentAccountOwner()!); const session = await pending.authenticate();
    const observer = jest.fn(() => { throw new Error("synthetic UI observer failure"); });
    try {
      const result = await actual.transcribeAudio({ userId: session.userId, session, base64: "audio", mimeType: "audio/mp4", locale: "ko", onCrisisDetected: observer });
      expect(observer).toHaveBeenCalledTimes(1); expect(observer).toHaveBeenCalledWith("KR_119");
      expect(result.safety.zone).toBe("red");
      expect(mockBoundaryAudit.mock.calls.map(([entry]) => entry.kind)).toEqual(["ai_audit_log", "crisis_event"]);
    } finally { pending.release(); }
  });
});
