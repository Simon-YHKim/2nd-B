import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { __setSupabaseClientForTests } from "../client";
import {
  completeNaverOAuth,
  consumeAuthCallbackUrl,
  reconcileAuthCallbackBootstrap,
  signInWithIdTokenProvider,
  verifyPasswordResetCode,
  verifySignUpCode,
} from "../auth";
import {
  __resetAuthStorageRuntimeForTests,
} from "../../auth/session-mutation";
import {
  AUTH_CALLBACK_QUARANTINE_KEY,
  __resetRecoveryProofStorageQueueForTests,
  createAuthCallbackQuarantine,
  createRecoveryPending,
  createRecoveryProof,
  LEGACY_RECOVERY_PENDING_KEY,
  LEGACY_RECOVERY_PROOF_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  type RecoveryPending,
} from "../../auth/recovery-proof-store";

type AuthMock = {
  exchangeCodeForSession?: jest.Mock;
  setSession?: jest.Mock;
  getSession?: jest.Mock;
  signOut?: jest.Mock;
  signInWithIdToken?: jest.Mock;
  verifyOtp?: jest.Mock;
};

type ClientMock = {
  auth: AuthMock;
  functions?: { invoke: jest.Mock };
};

function accessToken(userId: string, sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

function session(userId: string, sessionId: string) {
  return {
    access_token: accessToken(userId, sessionId),
    user: { id: userId },
  };
}

function installClient(auth: AuthMock, functions?: ClientMock["functions"]): void {
  __setSupabaseClientForTests({ auth, functions } as never);
}

function installLockedWebStorage(
  values: Map<string, string> = new Map(),
  rejectSet?: (key: string) => boolean,
): Map<string, string> {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://example.test", pathname: "/" },
      sessionStorage: { removeItem: jest.fn() },
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (rejectSet?.(key)) throw new Error("callback quarantine storage unavailable");
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: async <T>(
          name: string,
          _options: { mode: "exclusive" },
          callback: (lock: { name: string; mode: "exclusive" }) => Promise<T>,
        ) => callback({ name, mode: "exclusive" }),
      },
    },
  });
  return values;
}

describe("durable auth callback quarantine", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    __setSupabaseClientForTests(null);
    __resetAuthStorageRuntimeForTests();
    __resetRecoveryProofStorageQueueForTests();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  test("a failed quarantine write prevents PKCE exchange", async () => {
    installLockedWebStorage(new Map(), (key) => key === AUTH_CALLBACK_QUARANTINE_KEY);
    const exchangeCodeForSession = jest.fn();
    installClient({ exchangeCodeForSession });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///oauth-return?code=ordinary-pkce"),
    ).rejects.toThrow("quarantine storage unavailable");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("implicit recovery tokens are rejected before quarantine or setSession", async () => {
    const values = new Map<string, string>();
    const pending = createRecoveryPending();
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
    installLockedWebStorage(values, (key) => key === AUTH_CALLBACK_QUARANTINE_KEY);
    const setSession = jest.fn();
    installClient({ setSession });

    await expect(
      consumeAuthCallbackUrl(
        "secondbrain:///reset-password#access_token=opaque-a&refresh_token=opaque-r&type=recovery",
        pending,
      ),
    ).rejects.toThrow(/PKCE/i);

    expect(setSession).not.toHaveBeenCalled();
  });

  test("a failed quarantine write prevents recovery-code verifyOtp", async () => {
    const values = new Map<string, string>();
    const pending = createRecoveryPending();
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
    installLockedWebStorage(values, (key) => key === AUTH_CALLBACK_QUARANTINE_KEY);
    const verifyOtp = jest.fn();
    installClient({ verifyOtp });

    await expect(
      verifyPasswordResetCode("person@example.test", "123456", pending),
    ).rejects.toThrow("quarantine storage unavailable");

    expect(verifyOtp).not.toHaveBeenCalled();
  });

  test("a failed quarantine write prevents sign-up verifyOtp", async () => {
    installLockedWebStorage(new Map(), (key) => key === AUTH_CALLBACK_QUARANTINE_KEY);
    const verifyOtp = jest.fn();
    installClient({ verifyOtp });

    await expect(
      verifySignUpCode("person@example.test", "123456"),
    ).rejects.toThrow("quarantine storage unavailable");

    expect(verifyOtp).not.toHaveBeenCalled();
  });

  test("a failed quarantine write prevents native social signInWithIdToken", async () => {
    installLockedWebStorage(new Map(), (key) => key === AUTH_CALLBACK_QUARANTINE_KEY);
    const signInWithIdToken = jest.fn();
    installClient({ signInWithIdToken });

    await expect(
      signInWithIdTokenProvider("google", "opaque-provider-token"),
    ).rejects.toThrow("quarantine storage unavailable");

    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  test("a failed quarantine write prevents Naver magic-link verifyOtp", async () => {
    installLockedWebStorage(new Map(), (key) => key === AUTH_CALLBACK_QUARANTINE_KEY);
    const verifyOtp = jest.fn();
    const invoke = jest.fn().mockResolvedValue({
      data: { token_hash: "opaque-token-hash" },
      error: null,
    });
    installClient({ verifyOtp }, { invoke });

    await expect(
      completeNaverOAuth(
        { code: "opaque-naver-code", state: "expected-state" },
        "expected-state",
      ),
    ).rejects.toThrow("quarantine storage unavailable");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  test("an ordinary PKCE callback clears only its exact quarantine", async () => {
    const values = installLockedWebStorage();
    const established = session("ordinary-user", "ordinary-session");
    const exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: established, user: established.user, redirectType: null },
      error: null,
    });
    installClient({ exchangeCodeForSession });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///oauth-return?code=ordinary-pkce"),
    ).resolves.toMatchObject({
      userId: "ordinary-user",
      sessionId: "ordinary-session",
      type: null,
    });

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(false);
  });

  test("stale callback A cleanup preserves a newer callback B quarantine", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const values = installLockedWebStorage();
    const callbackA = session("user-a", "session-a");
    const liveB = session("user-b", "session-b");
    const quarantineB = createAuthCallbackQuarantine("ordinary");
    const exchangeCodeForSession = jest.fn().mockImplementation(async () => {
      expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(true);
      values.set(AUTH_CALLBACK_QUARANTINE_KEY, JSON.stringify(quarantineB));
      return {
        data: { session: callbackA, user: callbackA.user, redirectType: null },
        error: null,
      };
    });
    const signOut = jest.fn();
    installClient({
      exchangeCodeForSession,
      getSession: jest.fn().mockResolvedValue({ data: { session: liveB }, error: null }),
      signOut,
    });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///oauth-return?code=callback-a"),
    ).rejects.toThrow("quarantine owner changed");

    expect(signOut).not.toHaveBeenCalled();
    expect(JSON.parse(values.get(AUTH_CALLBACK_QUARANTINE_KEY) ?? "null")).toEqual(
      quarantineB,
    );
  });

  test("recovery hands proof, pending, and quarantine ownership off exactly", async () => {
    const values = installLockedWebStorage();
    const pending: RecoveryPending = createRecoveryPending();
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
    const established = session("recovery-user", "recovery-session");
    installClient({
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: { session: established, user: established.user, redirectType: "recovery" },
        error: null,
      }),
    });

    const callback = await consumeAuthCallbackUrl(
      "secondbrain:///reset-password?code=recovery-pkce",
      pending,
    );

    const proof = JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "null");
    expect(callback.recoveryProof).toEqual(proof);
    expect(proof.pendingOwnerNonce).toBe(pending.ownerNonce);
    expect(proof.callbackOwnerNonce).toMatch(/^[0-9a-f-]{36}$/i);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(false);
  });

  test("recovery exchange plus sign-out failure keeps its restart quarantine", async () => {
    const warnings: unknown[][] = [];
    jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args);
    });
    const values = new Map<string, string>();
    installLockedWebStorage(values, (key) => key === RECOVERY_PROOF_KEY);
    const pending = createRecoveryPending();
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
    const established = session("recovery-user", "recovery-session");
    const exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: established, user: established.user, redirectType: "recovery" },
      error: null,
    });
    const signOut = jest.fn().mockResolvedValue({ error: new Error("local clear failed") });
    installClient({
      exchangeCodeForSession,
      getSession: jest.fn().mockResolvedValue({ data: { session: established }, error: null }),
      signOut,
    });

    await expect(
      consumeAuthCallbackUrl(
        "secondbrain:///reset-password?code=recovery-pkce",
        pending,
      ),
    ).rejects.toThrow("quarantine storage unavailable");

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(true);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    const logged = JSON.stringify(warnings);
    expect(logged).not.toContain("recovery-pkce");
    expect(logged).not.toContain(pending.ownerNonce);
  });

  test("a migrated v1 dual snapshot signs out its exact live owner before cleanup", async () => {
    const values = installLockedWebStorage();
    const established = session("legacy-user", "legacy-session");
    const proof = createRecoveryProof({ userId: "legacy-user", sessionId: "legacy-session" });
    values.set(LEGACY_RECOVERY_PROOF_KEY, JSON.stringify(proof));
    values.set(
      LEGACY_RECOVERY_PENDING_KEY,
      JSON.stringify({ issuedAt: "2026-09-13T00:00:00.000Z" }),
    );
    const signOut = jest.fn().mockResolvedValue({ error: null });
    installClient({
      getSession: jest.fn().mockResolvedValue({ data: { session: established }, error: null }),
      signOut,
    });

    await expect(reconcileAuthCallbackBootstrap(established)).resolves.toEqual({
      kind: "cleared",
    });

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(values.has(LEGACY_RECOVERY_PROOF_KEY)).toBe(false);
    expect(values.has(LEGACY_RECOVERY_PENDING_KEY)).toBe(false);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("a v1 dual snapshot retains exact migrated markers when local sign-out fails", async () => {
    const values = installLockedWebStorage();
    const established = session("legacy-user", "legacy-session");
    const proof = createRecoveryProof({ userId: "legacy-user", sessionId: "legacy-session" });
    values.set(LEGACY_RECOVERY_PROOF_KEY, JSON.stringify(proof));
    values.set(
      LEGACY_RECOVERY_PENDING_KEY,
      JSON.stringify({ issuedAt: "2026-09-13T00:00:00.000Z" }),
    );
    const signOut = jest.fn().mockResolvedValue({ error: new Error("local clear failed") });
    installClient({
      getSession: jest.fn().mockResolvedValue({ data: { session: established }, error: null }),
      signOut,
    });

    await expect(reconcileAuthCallbackBootstrap(established)).resolves.toMatchObject({
      kind: "retryable",
    });

    expect(values.has(RECOVERY_PROOF_KEY)).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);

    signOut.mockResolvedValue({ error: null });
    await expect(reconcileAuthCallbackBootstrap(established)).resolves.toEqual({
      kind: "cleared",
    });
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("a mismatched v2 pair with no live session is cleared by exact CAS", async () => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof(
      { userId: "user-a", sessionId: "session-a" },
      "11111111-1111-4111-8111-111111111111",
    );
    const pending: RecoveryPending = {
      ownerNonce: "22222222-2222-4222-8222-222222222222",
      issuedAt: "2026-09-13T00:00:00.000Z",
    };
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
    const signOut = jest.fn();
    installClient({ signOut });

    await expect(reconcileAuthCallbackBootstrap(null)).resolves.toEqual({ kind: "cleared" });

    expect(signOut).not.toHaveBeenCalled();
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("a mismatched v2 live pair stays retryable until owner-bound sign-out succeeds", async () => {
    const values = installLockedWebStorage();
    const established = session("user-a", "session-a");
    const proof = createRecoveryProof(
      { userId: "user-a", sessionId: "session-a" },
      "11111111-1111-4111-8111-111111111111",
    );
    const pending: RecoveryPending = {
      ownerNonce: "22222222-2222-4222-8222-222222222222",
      issuedAt: "2026-09-13T00:00:00.000Z",
    };
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
    const localClearError = new Error("local clear failed");
    const signOut = jest.fn().mockResolvedValue({ error: localClearError });
    installClient({
      getSession: jest.fn().mockResolvedValue({ data: { session: established }, error: null }),
      signOut,
    });

    await expect(reconcileAuthCallbackBootstrap(established)).resolves.toEqual({
      kind: "retryable",
      error: localClearError,
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);

    signOut.mockResolvedValue({ error: null });
    await expect(reconcileAuthCallbackBootstrap(established)).resolves.toEqual({
      kind: "cleared",
    });
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("AuthContext exposes exact reconciliation retry without publishing the session", () => {
    const source = readFileSync(
      resolve(__dirname, "../../auth/AuthContext.tsx"),
      "utf8",
    );
    const bootstrapRetry = source.slice(
      source.indexOf('if (reconciliation.kind === "retryable")'),
      source.indexOf('if (reconciliation.kind === "cleared")'),
    );
    const refresh = source.slice(
      source.indexOf("const refresh = useCallback"),
      source.indexOf("const value = useMemo<AuthContextValue>"),
    );

    expect(bootstrapRetry).toContain("callbackReconciliationBlockedRef.current = true");
    expect(bootstrapRetry).toContain("isEncryptedStorageRecoveryRequired(reconciliation.error)");
    expect(bootstrapRetry).toContain("publishRecoveryProof(null)");
    expect(bootstrapRetry).toContain("publishSessionUnavailable()");
    expect(bootstrapRetry).not.toContain("resolveSession(session");
    expect(refresh).toContain("await reconcileAuthCallbackBootstrap(probed.session)");
    expect(refresh).toContain("isEncryptedStorageRecoveryRequired(reconciliation.error)");
    expect(refresh).toContain("sessionUnavailable: true");
  });
});
