// Native Clarity is session-replay on a product whose minor policy is still an
// open decision, and whose vendor bars under-18 audiences outright. So the gate
// is the feature: what follows is mostly about what must NOT start.
//
// The web loader's own comment says the reason it has to be so careful is that
// Clarity "has no pause/stop command", making injection irreversible for the
// page lifetime. The RN SDK does have pause/resume and records a screen name we
// choose instead of a URL we cannot hide, so native is held to the stricter
// standard the web could only approximate.

import {
  clarityAction,
  syncNativeClarity,
  hasNativeClarityModule,
  __setClarityApiForTests,
  __setClarityModuleLookupForTests,
  __setClarityImporterForTests,
  __flushClarityForTests,
  __resetClarityForTests,
  __clarityStateForTests,
  type ClarityApi,
  type ClarityDecision,
} from "../clarity-native";

const decision = (over: Partial<ClarityDecision> = {}): ClarityDecision => ({
  enabled: true,
  route: "/settings",
  allowedRoute: true,
  projectId: "xnzm86icuz",
  ...over,
});

const fresh = { initialized: false, capturing: false };
const running = { initialized: true, capturing: true };
const paused = { initialized: true, capturing: false };

describe("nothing starts capture without the full conjunction", () => {
  test.each([
    ["consent withdrawn", { enabled: false }],
    ["a screen off the allow-list", { allowedRoute: false }],
    ["a build with no project id", { projectId: undefined }],
    ["an empty project id", { projectId: "" }],
  ])("%s does not start", (_label, over) => {
    expect(clarityAction(decision(over), fresh)).toBe("none");
  });

  test("all four together is what starts it", () => {
    expect(clarityAction(decision(), fresh)).toBe("start");
  });
});

describe("leaving an allowed screen pauses, it does not coast", () => {
  test("a disallowed screen pauses a running session", () => {
    // This is the case the web version cannot do at all. Once injected there,
    // later navigation is recorded regardless.
    expect(clarityAction(decision({ allowedRoute: false }), running)).toBe("pause");
  });

  test("returning to an allowed screen resumes rather than re-initializing", () => {
    // initialize() cannot be undone; calling it twice is not a reset.
    expect(clarityAction(decision(), paused)).toBe("resume");
  });

  test("already running on an allowed screen does nothing", () => {
    expect(clarityAction(decision(), running)).toBe("none");
  });

  test("pausing something that never started is not an action", () => {
    // Guards against a stream of no-op native calls on every navigation of
    // every un-consented session, which is most sessions.
    expect(clarityAction(decision({ enabled: false }), fresh)).toBe("none");
  });
});

describe("revocation stops it", () => {
  test("consent withdrawn mid-session pauses", () => {
    expect(clarityAction(decision({ enabled: false }), running)).toBe("pause");
  });

  test("and it stays paused while revoked, even on an allowed screen", () => {
    expect(clarityAction(decision({ enabled: false }), paused)).toBe("none");
  });
});

describe("the missing native module must not throw", () => {
  // The SDK builds `new NativeEventEmitter(NativeModules.ClarityEmitter)` at
  // module scope. Against a binary built before this package landed that
  // constructs an emitter around undefined during the import - a cold-start
  // crash, reachable by OTA, which is exactly what reaches older binaries.
  test("the probe reports absence instead of raising", () => {
    expect(hasNativeClarityModule(() => null)).toBe(false);
    expect(
      hasNativeClarityModule(() => {
        throw new Error("TurboModuleRegistry exploded");
      }),
    ).toBe(false);
  });

  test("presence is reported too, so the guard is not a constant false", () => {
    expect(hasNativeClarityModule(() => ({}))).toBe(true);
  });
});

describe("what actually reaches the SDK", () => {
  let calls: string[];
  let api: ClarityApi;

  beforeEach(() => {
    __resetClarityForTests();
    calls = [];
    api = {
      initialize: (id) => calls.push(`initialize:${id}`),
      pause: async () => (calls.push("pause"), true),
      resume: async () => (calls.push("resume"), true),
      consent: async (ads, analytics) => (calls.push(`consent:${ads}:${analytics}`), true),
      setCurrentScreenName: async (n) => (calls.push(`screen:${n}`), true),
    };
    __setClarityApiForTests(api);
    __setClarityModuleLookupForTests(() => ({}));
  });

  afterEach(() => {
    __setClarityApiForTests(null);
    __setClarityModuleLookupForTests(null);
    __resetClarityForTests();
  });

  test("a consented adult on an allowed screen starts with ads denied", async () => {
    syncNativeClarity(decision());
    await __flushClarityForTests();
    expect(calls).toEqual([
      "initialize:xnzm86icuz",
      "consent:false:true",
      "screen:/settings",
    ]);
    expect(__clarityStateForTests()).toEqual({ initialized: true, capturing: true });
  });

  test("ad storage is denied in every state, never merely absent", () => {
    // The product's consent is analytics-only. A true here would be a silent
    // widening of what the user agreed to.
    expect(calls.filter((c) => c.startsWith("consent:true"))).toEqual([]);
  });

  test("an un-consented session touches the SDK not at all", async () => {
    syncNativeClarity(decision({ enabled: false }));
    await __flushClarityForTests();
    expect(calls).toEqual([]);
  });

  test("navigating to a disallowed screen pauses and stops naming screens", async () => {
    syncNativeClarity(decision());
    await __flushClarityForTests();
    calls.length = 0;

    syncNativeClarity(decision({ route: "/record/abc123", allowedRoute: false }));
    await __flushClarityForTests();

    expect(calls).toEqual(["pause"]);
    // The identifier-bearing route must never be sent as a screen name.
    expect(calls.some((c) => c.includes("abc123"))).toBe(false);
    expect(__clarityStateForTests().capturing).toBe(false);
  });

  test("revocation withdraws the grant as well as pausing", async () => {
    syncNativeClarity(decision());
    await __flushClarityForTests();
    calls.length = 0;

    syncNativeClarity(decision({ enabled: false }));
    await __flushClarityForTests();

    // Order matters: withdraw, then stop. A paused-but-still-consented session
    // would misreport downstream.
    expect(calls).toEqual(["consent:false:false", "pause"]);
  });

  test("returning resumes without a second initialize", async () => {
    syncNativeClarity(decision());
    await __flushClarityForTests();
    syncNativeClarity(decision({ route: "/record/x", allowedRoute: false }));
    await __flushClarityForTests();
    calls.length = 0;

    syncNativeClarity(decision({ route: "/plans" }));
    await __flushClarityForTests();

    expect(calls).toEqual(["resume", "screen:/plans"]);
    expect(calls.filter((c) => c.startsWith("initialize"))).toEqual([]);
  });

  test("the same screen twice does not re-send the name", async () => {
    syncNativeClarity(decision());
    await __flushClarityForTests();
    calls.length = 0;
    syncNativeClarity(decision());
    await __flushClarityForTests();
    expect(calls).toEqual([]);
  });

  test("rapid navigation applies in order", async () => {
    // Serialized, or a pause can land after the resume that followed it and
    // leave capture running on a screen that denied it.
    syncNativeClarity(decision({ route: "/settings" }));
    syncNativeClarity(decision({ route: "/record/1", allowedRoute: false }));
    syncNativeClarity(decision({ route: "/plans" }));
    await __flushClarityForTests();
    expect(calls).toEqual([
      "initialize:xnzm86icuz",
      "consent:false:true",
      "screen:/settings",
      "pause",
      "resume",
      "screen:/plans",
    ]);
  });

  test("an SDK that throws does not propagate", async () => {
    __resetClarityForTests();
    __setClarityApiForTests({
      ...api,
      initialize: () => {
        throw new Error("native blew up");
      },
    });
    // Analytics must never be able to break a screen.
    expect(() => syncNativeClarity(decision())).not.toThrow();
    await expect(__flushClarityForTests()).resolves.toBeUndefined();
  });

  test("without the native module the import is NOT ATTEMPTED", async () => {
    // Asserting on state alone passed even with the probe deleted, because
    // jest resolves the package harmlessly. On a device it does not: the SDK
    // constructs a NativeEventEmitter around undefined while the module
    // evaluates. So the assertion has to be that the import never ran.
    __resetClarityForTests();
    __setClarityApiForTests(null);
    __setClarityModuleLookupForTests(() => null);
    let attempted = false;
    __setClarityImporterForTests(async () => {
      attempted = true;
      return {};
    });

    syncNativeClarity(decision());
    await __flushClarityForTests();

    expect(attempted).toBe(false);
    expect(__clarityStateForTests()).toEqual({ initialized: false, capturing: false });
    __setClarityImporterForTests(null);
  });

  test("with the native module present the import IS attempted", async () => {
    // Keeps the assertion above from being satisfied by an import that never
    // happens under any condition.
    __resetClarityForTests();
    __setClarityApiForTests(null);
    __setClarityModuleLookupForTests(() => ({}));
    let attempted = false;
    __setClarityImporterForTests(async () => {
      attempted = true;
      return api;
    });

    syncNativeClarity(decision());
    await __flushClarityForTests();

    expect(attempted).toBe(true);
    __setClarityImporterForTests(null);
  });
});

// ── 네이티브 제품 분석 OFF-only 계약 (2026-09-02) ──────────────────────────
// 새 JS는 고지/처리 계약이 완성되기 전까지 Firebase와 Clarity에 OFF만 보낸다.
// Firebase OFF 시도는 Clarity bridge 상태와 무관하게 먼저 발행되어야 한다.
describe("네이티브 제품 분석은 OFF 결정만 발행한다", () => {
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "index.ts"),
    "utf8",
  ) as string;

  test("동의 동기화는 Firebase OFF를 먼저 발행하고 Clarity OFF를 뒤에 격리한다", () => {
    const start = src.indexOf("function syncNativeAnalyticsOff");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}", start));
    const firebaseOffAt = body.indexOf("startNativeAnalyticsOffAttempt()");
    const clarityOffAt = body.indexOf("syncNativeClarityOff()");
    expect(firebaseOffAt).toBeGreaterThan(-1);
    expect(clarityOffAt).toBeGreaterThan(firebaseOffAt);
    expect(body).not.toContain("await");
  });

  test("화면 이동도 Clarity OFF만 재확인하고 Firebase sync를 만들지 않는다", () => {
    const helperStart = src.indexOf("function syncNativeClarityOff");
    const helperBody = src.slice(helperStart, src.indexOf("\n}", helperStart));
    expect(helperBody).toContain("enabled: false");
    expect(helperBody).not.toContain("enabled: true");

    const captureStart = src.indexOf("export function captureEvent");
    const routeBody = src.slice(captureStart, src.indexOf("// Re-check", captureStart));
    expect(routeBody).toContain("syncNativeClarityOff()");
    expect(routeBody).not.toContain("syncNativeAnalyticsOff");
  });
});
