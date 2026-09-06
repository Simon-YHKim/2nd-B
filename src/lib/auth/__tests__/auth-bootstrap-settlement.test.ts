// AUTH-01 regression coverage for the AuthProvider startup settlement.
//
// WHY THIS FILE EXISTS. The provider used to sit on `loading:true` forever when
// both recovery markers read clean and empty and getSession never answered.
// Every existing auth test passed through that regression because they exercise
// pure helpers and source contracts, never the async orchestration that ends
// the boot wait. So these tests drive the REAL executor AuthProvider calls
// (`settleAuthBootstrap` from ../bootstrap-outcome) with fake timers and mocked
// session/storage collaborators. There is no copied test-only bootstrap here:
// if the production branch stops publishing, these fail.
//
// SCOPE LIMIT, stated rather than papered over: the repo's jest setup is
// `testEnvironment: "node"` with no renderer installed (react-test-renderer and
// @testing-library/* are absent, and installing through the shared
// node_modules junction is forbidden), so these tests execute the provider's
// startup orchestration and its publication calls, not a mounted React tree.
// The provider-to-executor wiring and the screen-to-state wiring are asserted
// separately below against the real sources.
//
// No live auth, no service probing, no resource-exhaustion input, no payloads.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  boundedSessionLoad,
  classifyBootstrapOutcome,
  classifyRefreshOutcome,
  settleAuthBootstrap,
  type SessionLoadOutcome,
} from "../bootstrap-outcome";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const TIMEOUT_MS = 8000;
type TestSession = { user: { id: string } };
const SESSION: TestSession = { user: { id: "user-1" } };
const TIMED_OUT: SessionLoadOutcome<TestSession> = {
  ok: false,
  error: new Error("Auth session hydration timed out"),
};

/** Collaborator doubles standing in for the provider's real closures. */
function makeDeps(overrides: Partial<Parameters<typeof settleAuthBootstrap<TestSession>>[0]> = {}) {
  const calls = {
    resolveSession: [] as (string | null)[],
    publishSessionUnavailable: 0,
    recoveryReady: [] as boolean[],
    authEvents: [] as { event: string; session: TestSession | null }[],
    failClosed: [] as unknown[],
    storageFailures: [] as unknown[],
    clearedPending: 0,
  };
  const deps = {
    sessionKnown: false,
    hasProof: false,
    proofMatchesSession: true,
    recoveryPendingOnDisk: false,
    markersReadable: true,
    sessionForResolve: null as TestSession | null,
    sessionAnswered: false,
    rawSessionLoad: new Promise<SessionLoadOutcome<TestSession>>(() => {}),
    isCancelled: () => false,
    setRecoveryReady: (ready: boolean) => calls.recoveryReady.push(ready),
    resolveSession: (userId: string | null) => {
      calls.resolveSession.push(userId);
    },
    publishSessionUnavailable: () => {
      calls.publishSessionUnavailable += 1;
    },
    isRecoveryPendingInMemory: () => false,
    currentRecoveryProof: () => null as unknown,
    captureRecoverySnapshot: () => null as unknown,
    isRecoverySnapshotCurrent: () => true,
    handleStorageFailure: (error: unknown) => {
      calls.storageFailures.push(error);
    },
    failClosedRecovery: async (_proof: null, error: unknown) => {
      calls.failClosed.push(error);
      return true;
    },
    clearRecoveryPending: async () => {
      calls.clearedPending += 1;
    },
    handleAuthEvent: (event: "INITIAL_SESSION", session: TestSession | null) => {
      calls.authEvents.push({ event, session });
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("bounded session wait", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("an unanswered getSession falls back at exactly the timeout, not before", async () => {
    const never = new Promise<SessionLoadOutcome<TestSession>>(() => {});
    const bounded = boundedSessionLoad(never, TIMEOUT_MS, TIMED_OUT);

    let settled: SessionLoadOutcome<TestSession> | null = null;
    void bounded.then((v) => {
      settled = v;
    });

    jest.advanceTimersByTime(TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(settled).toBeNull();

    jest.advanceTimersByTime(1);
    await expect(bounded).resolves.toEqual(TIMED_OUT);
  });

  test("a rejected getSession falls back without waiting out the timer", async () => {
    const rejected = Promise.reject(new Error("network down"));
    await expect(boundedSessionLoad(rejected, TIMEOUT_MS, TIMED_OUT)).resolves.toEqual(TIMED_OUT);
  });

  test("an answered getSession wins and cancels the timer", async () => {
    const answered: SessionLoadOutcome<TestSession> = { ok: true, session: SESSION };
    await expect(boundedSessionLoad<SessionLoadOutcome<TestSession>>(Promise.resolve(answered), TIMEOUT_MS, TIMED_OUT)).resolves.toBe(
      answered,
    );
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("ordinary startup with no recovery markers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("an unanswered session ends the wait with a retryable error, not a spinner", async () => {
    // The exact AUTH-01 condition: both marker reads succeeded and are empty,
    // getSession never answers, no auth event arrives.
    const never = new Promise<SessionLoadOutcome<TestSession>>(() => {});
    const sessionResult = boundedSessionLoad(never, TIMEOUT_MS, TIMED_OUT);
    jest.advanceTimersByTime(TIMEOUT_MS);
    const settled = await sessionResult;
    expect(settled.ok).toBe(false);

    const { deps, calls } = makeDeps({
      sessionKnown: settled.ok,
      sessionAnswered: settled.ok,
      rawSessionLoad: never,
    });
    const outcome = settleAuthBootstrap(deps);

    expect(outcome).toEqual({ kind: "session-unavailable" });
    expect(calls.publishSessionUnavailable).toBe(1);
    // Never promoted to a trusted signed-out session.
    expect(calls.resolveSession).toEqual([]);
    // No recovery lock is in force, so readiness releases as before.
    expect(calls.recoveryReady).toEqual([true]);
  });

  test("a rejected session takes the same bounded exit", async () => {
    const rejected = Promise.reject(new Error("network down"));
    const raw = rejected.then(
      (v) => v as SessionLoadOutcome<TestSession>,
      (error): SessionLoadOutcome<TestSession> => ({ ok: false, error }),
    );
    const settled = await boundedSessionLoad(raw, TIMEOUT_MS, TIMED_OUT);
    expect(settled.ok).toBe(false);

    const { deps, calls } = makeDeps({ rawSessionLoad: raw });
    expect(settleAuthBootstrap(deps)).toEqual({ kind: "session-unavailable" });
    expect(calls.publishSessionUnavailable).toBe(1);
    expect(calls.resolveSession).toEqual([]);
  });

  test("a late session answer still reconciles after the error state is shown", async () => {
    let answer: (v: SessionLoadOutcome<TestSession>) => void = () => {};
    const raw = new Promise<SessionLoadOutcome<TestSession>>((r) => {
      answer = r;
    });

    const { deps, calls } = makeDeps({ rawSessionLoad: raw });
    expect(settleAuthBootstrap(deps)).toEqual({ kind: "session-unavailable" });
    expect(calls.publishSessionUnavailable).toBe(1);

    answer({ ok: true, session: SESSION });
    await raw;
    await Promise.resolve();

    expect(calls.authEvents).toEqual([{ event: "INITIAL_SESSION", session: SESSION }]);
    expect(calls.recoveryReady).toEqual([true, true]);
  });

  test("a late answer is dropped once the provider effect is cancelled", async () => {
    let answer: (v: SessionLoadOutcome<TestSession>) => void = () => {};
    const raw = new Promise<SessionLoadOutcome<TestSession>>((r) => {
      answer = r;
    });
    const { deps, calls } = makeDeps({ rawSessionLoad: raw, isCancelled: () => true });
    settleAuthBootstrap(deps);

    answer({ ok: true, session: SESSION });
    await raw;
    await Promise.resolve();

    expect(calls.authEvents).toEqual([]);
  });
});

describe("recovery cases stay locked", () => {
  test("a persisted proof with an unknown session publishes nothing", () => {
    const { deps, calls } = makeDeps({
      hasProof: true,
      proofMatchesSession: false,
      rawSessionLoad: Promise.resolve(TIMED_OUT),
    });
    expect(settleAuthBootstrap(deps)).toEqual({ kind: "recovery-locked", reason: "proof" });
    expect(calls.publishSessionUnavailable).toBe(0);
    expect(calls.resolveSession).toEqual([]);
  });

  test("an unresolved pending marker with an unknown session stays locked and not ready", () => {
    const { deps, calls } = makeDeps({
      recoveryPendingOnDisk: true,
      rawSessionLoad: Promise.resolve(TIMED_OUT),
    });
    expect(settleAuthBootstrap(deps)).toEqual({ kind: "recovery-locked", reason: "pending" });
    expect(calls.publishSessionUnavailable).toBe(0);
    expect(calls.resolveSession).toEqual([]);
    // The global lock must NOT release while a pending recovery is unproven.
    expect(calls.recoveryReady).toEqual([false]);
  });

  test("an unreadable marker store stays locked and publishes nothing here", () => {
    const { deps, calls } = makeDeps({
      markersReadable: false,
      rawSessionLoad: Promise.resolve(TIMED_OUT),
    });
    expect(settleAuthBootstrap(deps)).toEqual({
      kind: "recovery-locked",
      reason: "unreadable-markers",
    });
    expect(calls.publishSessionUnavailable).toBe(0);
    expect(calls.resolveSession).toEqual([]);
  });

  test("a late session arriving while recovery is pending fails closed", async () => {
    let answer: (v: SessionLoadOutcome<TestSession>) => void = () => {};
    const raw = new Promise<SessionLoadOutcome<TestSession>>((r) => {
      answer = r;
    });
    const { deps, calls } = makeDeps({
      recoveryPendingOnDisk: true,
      rawSessionLoad: raw,
      isRecoveryPendingInMemory: () => true,
    });
    settleAuthBootstrap(deps);

    answer({ ok: true, session: SESSION });
    await raw;
    await Promise.resolve();

    expect(calls.failClosed).toHaveLength(1);
    expect(calls.authEvents).toEqual([]);
  });

  test("a late NULL session while recovery is pending clears the provisional lock", async () => {
    let answer: (v: SessionLoadOutcome<TestSession>) => void = () => {};
    const raw = new Promise<SessionLoadOutcome<TestSession>>((r) => {
      answer = r;
    });
    const { deps, calls } = makeDeps({
      recoveryPendingOnDisk: true,
      rawSessionLoad: raw,
      isRecoveryPendingInMemory: () => true,
    });
    settleAuthBootstrap(deps);

    answer({ ok: true, session: null });
    await raw;
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.clearedPending).toBe(1);
    expect(calls.failClosed).toEqual([]);
    expect(calls.authEvents).toEqual([{ event: "INITIAL_SESSION", session: null }]);
  });
});

describe("a classified session still resolves exactly as before", () => {
  test("a known session resolves its user", () => {
    const { deps, calls } = makeDeps({
      sessionKnown: true,
      sessionAnswered: true,
      sessionForResolve: SESSION,
      rawSessionLoad: Promise.resolve({ ok: true, session: SESSION }),
    });
    expect(settleAuthBootstrap(deps)).toEqual({ kind: "resolve" });
    expect(calls.resolveSession).toEqual(["user-1"]);
    expect(calls.publishSessionUnavailable).toBe(0);
  });

  test("a known ABSENT session resolves null, and is not the unavailable state", () => {
    const { deps, calls } = makeDeps({
      sessionKnown: true,
      sessionAnswered: true,
      sessionForResolve: null,
      rawSessionLoad: Promise.resolve({ ok: true, session: null }),
    });
    expect(settleAuthBootstrap(deps)).toEqual({ kind: "resolve" });
    expect(calls.resolveSession).toEqual([null]);
    expect(calls.publishSessionUnavailable).toBe(0);
  });

  test("classification never reports unavailable while any lock is in force", () => {
    for (const hasProof of [true, false]) {
      for (const recoveryPendingOnDisk of [true, false]) {
        for (const markersReadable of [true, false]) {
          const outcome = classifyBootstrapOutcome({
            sessionKnown: false,
            hasProof,
            proofMatchesSession: !hasProof,
            recoveryPendingOnDisk,
            markersReadable,
          });
          const locked = hasProof || recoveryPendingOnDisk || !markersReadable;
          expect(outcome.kind).toBe(locked ? "recovery-locked" : "session-unavailable");
        }
      }
    }
  });
});

describe("accessible retry", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a retry that also fails keeps the error state up", async () => {
    const never = new Promise<SessionLoadOutcome<TestSession>>(() => {});
    const bounded = boundedSessionLoad(never, TIMEOUT_MS, TIMED_OUT);
    jest.advanceTimersByTime(TIMEOUT_MS);
    expect(classifyRefreshOutcome(await bounded)).toEqual({
      userId: null,
      sessionUnavailable: true,
    });
  });

  test("a retry that succeeds clears the error and yields the user", async () => {
    const answered: SessionLoadOutcome<TestSession> = { ok: true, session: SESSION };
    const bounded = boundedSessionLoad<SessionLoadOutcome<TestSession>>(Promise.resolve(answered), TIMEOUT_MS, TIMED_OUT);
    expect(classifyRefreshOutcome(await bounded)).toEqual({
      userId: "user-1",
      sessionUnavailable: false,
    });
  });

  test("a retry answering NO session is a confirmed sign-out, not an error", async () => {
    const answered: SessionLoadOutcome<TestSession> = { ok: true, session: null };
    const bounded = boundedSessionLoad<SessionLoadOutcome<TestSession>>(Promise.resolve(answered), TIMEOUT_MS, TIMED_OUT);
    expect(classifyRefreshOutcome(await bounded)).toEqual({
      userId: null,
      sessionUnavailable: false,
    });
  });
});

describe("provider and screen wiring", () => {
  const AUTH = read("src/lib/auth/AuthContext.tsx");
  const SIGN_IN = read("src/screens/deepspace/dds-sign-in-screen.tsx");

  test("AuthProvider ends its bootstrap through the executor these tests drive", () => {
    // Without this, the suite above could pass against a module the provider
    // no longer calls — which is exactly how AUTH-01 survived its own tests.
    expect(AUTH).toContain("settleAuthBootstrap<Session, AuthRecoverySnapshot>({");
    expect(AUTH).toContain("publishSessionUnavailable,");
    expect(AUTH).toContain("markersReadable: markerResult.ok && pendingResult.ok,");
    expect(AUTH).toContain("sessionAnswered: sessionResult.ok,");
    expect(AUTH).toContain("handleStorageFailure: detectAuthStorageFailure,");
    // The old unbounded branch must not come back.
    expect(AUTH).not.toContain("if (sessionKnown && proofMatchesSession) {");
  });

  test("the unavailable publication masks identity without resolving owner-null", () => {
    const publish = AUTH.indexOf("function publishSessionUnavailable()");
    expect(publish).toBeGreaterThan(-1);
    const end = AUTH.indexOf("let supabase:", publish);
    const block = AUTH.slice(publish, end);
    expect(block).toContain("publishUnresolvedAuthState({");
    expect(block).not.toContain("noteResolvedOwner(");
    expect(block).toContain("sessionUnavailable: true,");
    expect(block).toContain("loading: false,");
  });

  test("strict storage unavailability has a distinct retry API and no destructive flag", () => {
    expect(AUTH).toContain("authStorageUnavailable: boolean;");
    expect(AUTH).toContain("retryAuthStorage: () => void;");
    const start = AUTH.indexOf("const detectAuthStorageFailure = useCallback");
    const end = AUTH.indexOf("const activateRecoverySession", start);
    const block = AUTH.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('kind === "recovery-required"');
    expect(block).toContain("setStorageRecoveryRequired(false);");
    expect(block).toContain("setAuthStorageUnavailable(true);");
    expect(block).not.toContain("signOutAuth(");
  });

  test("auth-storage retry invalidates the old epoch without clearing proof or pending", () => {
    const start = AUTH.indexOf("const retryAuthStorage = useCallback");
    const end = AUTH.indexOf("const recoverEncryptedStorage", start);
    const block = AUTH.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("authClientEpochRef.current = nextEpoch;");
    expect(block).toContain("setAuthClientEpoch(nextEpoch);");
    expect(block).not.toContain("publishRecoveryProof(null)");
    expect(block).not.toContain("clearRecoveryProof(");
    expect(block).not.toContain("clearRecoveryPending(");
    expect(block).not.toContain("noteResolvedOwner(");
  });

  test("the sign-in screen surfaces the state with an announced, labelled retry", () => {
    expect(SIGN_IN).toContain("const { sessionUnavailable, refresh } = useAuth();");
    expect(SIGN_IN).toContain("{sessionUnavailable ? (");
    expect(SIGN_IN).toContain('accessibilityRole="alert"');
    expect(SIGN_IN).toContain('accessibilityLiveRegion="assertive"');
    expect(SIGN_IN).toContain('t("auth:common.sessionUnavailable")');
    expect(SIGN_IN).toContain('accessibilityLabel={t("common:actions.retry")}');
    expect(SIGN_IN).toContain("onPress={() => void refresh()}");
  });

  test("FAR-02: recovery failure logs carry a stable phase, never the caught operand", () => {
    // Preventive, not an observed leak: these paths receive third-party error
    // objects. A recovery log call must take exactly one string literal.
    const sources = [AUTH, read("src/lib/auth/useResetPasswordForm.ts")];
    for (const src of sources) {
      const calls = src.match(/console\.(?:warn|log|error)\("\[auth\] recovery[^\n]*/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call).toMatch(/^console\.(?:warn|log|error)\("\[auth\] recovery[^"]*"\);$/);
        expect(call).toContain("phase=");
      }
    }
  });

  test("encrypted-storage failures lock before any fail-closed sign-out", () => {
    const failClosedStart = AUTH.indexOf("const failClosedRecovery = async");
    const failClosedEnd = AUTH.indexOf("const handleAuthEvent", failClosedStart);
    const failClosed = AUTH.slice(failClosedStart, failClosedEnd);
    const classify = failClosed.indexOf("detectAuthStorageFailure(error)");
    const signOut = failClosed.indexOf('signOutAuth("local")');

    expect(failClosedStart).toBeGreaterThan(-1);
    expect(classify).toBeGreaterThan(-1);
    expect(signOut).toBeGreaterThan(classify);
  });

  test("bootstrap classifies session and marker reads before ordinary recovery settlement", () => {
    const bootStart = AUTH.indexOf("void (async () => {");
    const settle = AUTH.indexOf("settleAuthBootstrap<Session, AuthRecoverySnapshot>({", bootStart);
    const boot = AUTH.slice(bootStart, settle);

    expect(boot).toContain("detectAuthStorageFailure(sessionResult.error)");
    expect(boot).toContain("detectAuthStorageFailure(markerResult.error)");
    expect(boot).toContain("detectAuthStorageFailure(pendingResult.error)");
    expect(boot).toContain("if (!isCurrentEffect()) return;");
  });

  test("the bootstrap outer catch classifies storage before local sign-out", () => {
    const catchStart = AUTH.indexOf("})().catch((error) => {");
    const effectCleanup = AUTH.indexOf("return () => {", catchStart);
    const block = AUTH.slice(catchStart, effectCleanup);
    const classify = block.indexOf("detectAuthStorageFailure(error)");
    const failClosed = block.indexOf("failClosedRecovery(recoveryProofRef.current, error)");

    expect(catchStart).toBeGreaterThan(-1);
    expect(classify).toBeGreaterThan(-1);
    expect(failClosed).toBeGreaterThan(classify);
  });

  test("all auth-storage entry points share the exact recovery classifier", () => {
    const activateStart = AUTH.indexOf("const activateRecoverySession = useCallback");
    const completeStart = AUTH.indexOf("const completeRecovery = useCallback", activateStart);
    const effectStart = AUTH.indexOf("useEffect(() => {", completeStart);
    const refreshStart = AUTH.indexOf("const refresh = useCallback", effectStart);
    const recoverStart = AUTH.indexOf("const recoverEncryptedStorage = useCallback", refreshStart);
    const activate = AUTH.slice(activateStart, completeStart);
    const complete = AUTH.slice(completeStart, effectStart);
    const effect = AUTH.slice(effectStart, refreshStart);
    const refresh = AUTH.slice(refreshStart, recoverStart);

    expect(activate).toContain("detectAuthStorageFailure(error)");
    expect(complete).toContain("detectAuthStorageFailure(error)");
    expect(refresh).toContain("detectAuthStorageFailure(probed.error)");
    expect(effect).toContain("void supabase.auth.getSession()");
    expect(effect).toContain("return failClosedRecovery(stored, error);");
    expect(effect).toContain("detectAuthStorageFailure(sessionResult.error)");
    expect(effect).toContain("detectAuthStorageFailure(markerResult.error)");
    expect(effect).toContain("detectAuthStorageFailure(pendingResult.error)");
  });

  test("a stale activate sign-out cannot clear proof after the client epoch changes", () => {
    const activateStart = AUTH.indexOf("const activateRecoverySession = useCallback");
    const activateEnd = AUTH.indexOf("const completeRecovery = useCallback", activateStart);
    const activate = AUTH.slice(activateStart, activateEnd);
    const signOut = activate.indexOf('await signOutAuth("local");');
    const snapshotGuard = activate.indexOf(
      "if (!isAuthRecoverySnapshotCurrent(activationSnapshot)) throw error;",
      signOut,
    );
    const clearProof = activate.indexOf("publishRecoveryProof(null);", snapshotGuard);

    expect(signOut).toBeGreaterThan(-1);
    expect(snapshotGuard).toBeGreaterThan(signOut);
    expect(clearProof).toBeGreaterThan(snapshotGuard);
    expect(AUTH).toContain("authClientEpochRef.current === snapshot.epoch");
    expect(AUTH).toContain("&& !storageRecoveryRequiredRef.current");
  });

  test("fresh-client bootstrap is the only path that releases recovery readiness", () => {
    const recoveryStart = AUTH.indexOf("const recoverEncryptedStorage = useCallback");
    const recoveryEnd = AUTH.indexOf("const value = useMemo", recoveryStart);
    const recovery = AUTH.slice(recoveryStart, recoveryEnd);

    expect(recovery).toContain("setRecoveryReady(false);");
    expect(recovery).not.toContain("setRecoveryReady(true);");
    expect(AUTH).toContain("const effectEpoch = authClientEpoch;");
    expect(AUTH).toContain("authClientEpochRef.current === effectEpoch");
  });
});
