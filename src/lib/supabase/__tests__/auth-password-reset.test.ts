import { __setSupabaseClientForTests } from "../client";
import {
  AuthSessionOwnerChangedError,
  authCallbackType,
  buildNativeNaverCallbackUrl,
  cancelRecoverySession,
  consumeAuthCallbackUrl,
  consumeCurrentWebAuthCallback,
  failClosedRecoverySession,
  isPasswordRecoveryCallbackUrl,
  isNativeNaverCallbackState,
  passwordUpdateFailure,
  sendPasswordResetEmail,
  signOutAuthCallbackSession,
  signOutRecoverySession,
  updatePassword,
  updatePasswordForRecovery,
  verifyPasswordResetCode,
} from "../auth";
import { __resetAuthStorageRuntimeForTests } from "../../auth/session-mutation";
import {
  AUTH_CALLBACK_QUARANTINE_KEY,
  __resetRecoveryProofStorageQueueForTests,
  createAuthCallbackQuarantine,
  createRecoveryProof,
  loadRecoveryPending,
  persistRecoveryPending,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  settleRecoveryPublicationExpected,
  type RecoveryPending,
  type RecoveryProof,
} from "../../auth/recovery-proof-store";
import { classifyBootstrapOutcome } from "../../auth/bootstrap-outcome";

type MockSupabaseAuth = {
  resetPasswordForEmail: jest.Mock;
  updateUser: jest.Mock;
  setSession?: jest.Mock;
  exchangeCodeForSession?: jest.Mock;
  getSession?: jest.Mock;
  verifyOtp?: jest.Mock;
  signOut?: jest.Mock;
};

function setWebLocation(pathname: string): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://example.com", pathname } },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {},
  });
}

function clearWebLocation(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
}

function setWebCallbackLocation(href: string): jest.Mock {
  const parsed = new URL(href);
  const replaceState = jest.fn();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href,
        origin: parsed.origin,
        pathname: parsed.pathname,
      },
      history: { state: null, replaceState },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {},
  });
  return replaceState;
}

function installClient(auth: MockSupabaseAuth): void {
  __setSupabaseClientForTests({ auth } as unknown as Parameters<typeof __setSupabaseClientForTests>[0]);
}

function accessToken(userId: string, sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

function installLockedWebStorage(
  values: Map<string, string> = new Map(),
): Map<string, string> {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
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

async function createOwnedRecoveryPending(
  values: Map<string, string> = new Map(),
): Promise<RecoveryPending> {
  installLockedWebStorage(values);
  return persistRecoveryPending();
}

describe("password reset helpers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    __setSupabaseClientForTests(null);
    __resetAuthStorageRuntimeForTests();
    __resetRecoveryProofStorageQueueForTests();
    clearWebLocation();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  test("sendPasswordResetEmail points recovery links at the reset-password route", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn(),
    };
    installClient(auth);
    setWebLocation("/2nd-B/sign-in");

    await sendPasswordResetEmail("  simon@example.com  ");

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("simon@example.com", {
      redirectTo: "https://example.com/2nd-B/reset-password",
    });
  });

  test("updatePassword delegates to Supabase Auth updateUser", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn().mockResolvedValue({ error: null }),
    };
    installClient(auth);

    await updatePassword("new-password-123");

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
  });

  test("rejects intercepted recovery bearer tokens even on the exact native route", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-u1", "recovery-session-1"),
            user: { id: "recovery-u1" },
          },
          user: { id: "recovery-u1" },
        },
        error: null,
      }),
    };
    installClient(auth);
    const pending = await createOwnedRecoveryPending();

    await expect(
      consumeAuthCallbackUrl(
        "secondbrain:///reset-password#access_token=at-1&refresh_token=rt-1&type=recovery",
        pending,
      ),
    ).rejects.toThrow(/PKCE/i);

    expect(auth.setSession).not.toHaveBeenCalled();
  });

  test("rejects attacker-owned implicit tokens on the native sign-up route", async () => {
    const attackerSession = {
      access_token: accessToken("attacker", "attacker-session"),
      user: { id: "attacker" },
    };
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn().mockResolvedValue({
        data: { session: attackerSession, user: attackerSession.user },
        error: null,
      }),
    };
    installClient(auth);
    installLockedWebStorage();

    await expect(
      consumeAuthCallbackUrl(
        "secondb:///sign-up#access_token=attacker-at&refresh_token=attacker-rt&type=signup",
      ),
    ).rejects.toThrow(/PKCE/i);

    expect(auth.setSession).not.toHaveBeenCalled();
  });

  test("rejects owned implicit recovery tokens outside the reset-password route", async () => {
    const recoverySession = {
      access_token: accessToken("recovery-u1", "recovery-session-1"),
      user: { id: "recovery-u1" },
    };
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn().mockResolvedValue({
        data: { session: recoverySession, user: recoverySession.user },
        error: null,
      }),
    };
    installClient(auth);
    const pending = await createOwnedRecoveryPending();

    await expect(
      consumeAuthCallbackUrl(
        "secondb:///oauth-callback#access_token=recovery-at&refresh_token=recovery-rt&type=recovery",
        pending,
      ),
    ).rejects.toThrow(/PKCE/i);

    expect(auth.setSession).not.toHaveBeenCalled();
  });

  test("a stale recovery A sign-out never removes the newer recovery B session", async () => {
    __resetAuthStorageRuntimeForTests();
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const auth: MockSupabaseAuth & { signOut: jest.Mock; getSession: jest.Mock } = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-user", "recovery-session-b"),
            user: { id: "recovery-user" },
          },
        },
        error: null,
      }),
      signOut,
    };
    installClient(auth);

    await expect(
      signOutRecoverySession(
        { userId: "recovery-user", sessionId: "recovery-session-a" },
        "local",
      ),
    ).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(signOut).not.toHaveBeenCalled();
  });

  test("failed callback A cleanup never removes a replacement B session", async () => {
    __resetAuthStorageRuntimeForTests();
    const callbackA = {
      access_token: accessToken("recovery-user", "callback-session-a"),
      user: { id: "recovery-user" },
    };
    const currentB = {
      access_token: accessToken("recovery-user", "callback-session-b"),
      user: { id: "recovery-user" },
    };
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const auth: MockSupabaseAuth & { signOut: jest.Mock; getSession: jest.Mock } = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: { session: callbackA, user: callbackA.user, redirectType: "recovery" },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({ data: { session: currentB }, error: null }),
      signOut,
    };
    installClient(auth);
    const pending = await createOwnedRecoveryPending();
    const callback = await consumeAuthCallbackUrl(
      "secondb:///reset-password?code=pkce-a",
      pending,
    );

    await expect(signOutAuthCallbackSession(callback, "local")).rejects.toBeInstanceOf(
      AuthSessionOwnerChangedError,
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  test("manual web callback rejects and scrubs implicit recovery credentials", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-web", "recovery-web-session"),
            user: { id: "recovery-web" },
          },
          user: { id: "recovery-web" },
        },
        error: null,
      }),
    };
    installClient(auth);
    const replaceState = setWebCallbackLocation(
      "https://example.com/2nd-B/reset-password#access_token=at-web&refresh_token=rt-web&type=recovery&keep=1",
    );

    await expect(consumeCurrentWebAuthCallback()).rejects.toThrow(/PKCE/i);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledTimes(1);
    const scrubbed = String(replaceState.mock.calls[0]?.[2]);
    expect(scrubbed).not.toMatch(/access_token|refresh_token|type=recovery/);
    expect(scrubbed).toContain("keep=1");
  });

  test("manual Supabase callback handling never consumes the dedicated Naver route", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    };
    installClient(auth);
    const replaceState = setWebCallbackLocation(
      "https://example.com/2nd-B/oauth-callback?code=naver-code-without-state&error=provider_error",
    );

    await expect(consumeCurrentWebAuthCallback()).resolves.toBeNull();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("consumeAuthCallbackUrl exchanges a PKCE code when present", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("pkce-u1", "pkce-session-1"),
            user: { id: "pkce-u1" },
          },
          user: { id: "pkce-u1" },
          redirectType: "recovery",
        },
        error: null,
      }),
    };
    installClient(auth);
    const pending = await createOwnedRecoveryPending();

    const callback = await consumeAuthCallbackUrl(
      "secondb:///reset-password?code=pkce-code-1",
      pending,
    );

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code-1");
    expect(callback).toMatchObject({
      userId: "pkce-u1",
      sessionId: "pkce-session-1",
      type: "recovery",
      recoveryProof: { pendingOwnerNonce: pending.ownerNonce },
    });
  });

  test("does not trust a caller-supplied recovery type for PKCE provenance", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("ordinary-u1", "ordinary-session-1"),
            user: { id: "ordinary-u1" },
          },
          user: { id: "ordinary-u1" },
          redirectType: null,
        },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    };
    installClient(auth);
    const pending = await createOwnedRecoveryPending();

    await expect(
      consumeAuthCallbackUrl(
        "secondb:///reset-password?code=ordinary-code&type=recovery",
        pending,
      ),
    ).rejects.toThrow("not issued for recovery");
  });

  test("recognizes only an explicit recovery callback type", () => {
    expect(authCallbackType("secondb:///reset-password#type=recovery&access_token=x")).toBe(
      "recovery",
    );
    expect(authCallbackType("secondb:///reset-password?code=pkce-code-1")).toBeNull();
    expect(authCallbackType("secondb:///oauth-callback#type=signup")).toBe("signup");
  });

  test("routes exact reset PKCE, error, and legacy-token inputs through recovery handling", () => {
    expect(isPasswordRecoveryCallbackUrl("secondbrain://reset-password?code=pkce-code-1")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain:///reset-password?code=pkce-code-1")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://oauth-callback?code=pkce-code-1")).toBe(false);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://reset-password#type=recovery&access_token=x")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://reset-password#error_code=otp_expired")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://oauth-callback#type=recovery")).toBe(false);
  });

  test("re-checks the recovery owner immediately before updating a password", async () => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof({
      userId: "recovery-user",
      sessionId: "recovery-session",
    });
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn().mockResolvedValue({
        data: { user: { id: "recovery-user" } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: "other-user" } } },
        error: null,
      }),
    };
    installClient(auth);

    await expect(
      updatePasswordForRecovery("new-password-123", proof),
    ).rejects.toThrow("operation changed");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  test("updates only when the live recovery owner still matches", async () => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof({
      userId: "recovery-user",
      sessionId: "recovery-session",
    });
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn().mockResolvedValue({
        data: { user: { id: "recovery-user" } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-user", "recovery-session"),
            user: { id: "recovery-user" },
          },
        },
        error: null,
      }),
    };
    installClient(auth);

    await updatePasswordForRecovery("new-password-123", proof);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
  });

  test("binds update and durable proof clear to one recovery operation", async () => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof({
      userId: "recovery-user",
      sessionId: "recovery-session",
    });
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn().mockResolvedValue({
        data: { user: { id: "recovery-user" } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-user", "recovery-session"),
            user: { id: "recovery-user" },
          },
        },
        error: null,
      }),
    };
    installClient(auth);

    await updatePasswordForRecovery("new-password-123", proof);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
  });

  test("rejects the same user when a different session owns recovery", async () => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof({
      userId: "recovery-user",
      sessionId: "recovery-session",
    });
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-user", "ordinary-session"),
            user: { id: "recovery-user" },
          },
        },
        error: null,
      }),
    };
    installClient(auth);

    await expect(
      updatePasswordForRecovery("new-password-123", proof),
    ).rejects.toThrow("operation changed");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  test.each([
    [
      "submit",
      (proof: RecoveryProof) => updatePasswordForRecovery("new-password-123", proof),
    ],
    ["cancel", (proof: RecoveryProof) => cancelRecoverySession(proof)],
    ["fail-closed", (proof: RecoveryProof) => failClosedRecoverySession(proof)],
  ])(
    "stale same-session recovery A %s cannot mutate after B publishes",
    async (_operation, act) => {
      const values = new Map<string, string>();
      installLockedWebStorage(values);
      const proofA = createRecoveryProof(
        { userId: "recovery-user", sessionId: "shared-session" },
        "11111111-1111-4111-8111-111111111111",
      );
      const proofB = createRecoveryProof(
        { userId: "recovery-user", sessionId: "shared-session" },
        "22222222-2222-4222-8222-222222222222",
      );
      proofB.issuedAt = proofA.issuedAt;
      values.set(RECOVERY_PROOF_KEY, JSON.stringify(proofB));
      const updateUser = jest.fn();
      const signOut = jest.fn();
      const getSession = jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-user", "shared-session"),
            user: { id: "recovery-user" },
          },
        },
        error: null,
      });
      const auth: MockSupabaseAuth & { getSession: jest.Mock; signOut: jest.Mock } = {
        resetPasswordForEmail: jest.fn(),
        updateUser,
        getSession,
        signOut,
      };
      installClient(auth);
      jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

      await expect(act(proofA)).rejects.toThrow();

      expect(updateUser).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
      expect(getSession).not.toHaveBeenCalled();
      expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proofB);
      expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
    },
  );

  test.each([
    [
      "submit",
      (proof: RecoveryProof) => updatePasswordForRecovery("new-password-123", proof),
    ],
    ["cancel", (proof: RecoveryProof) => cancelRecoverySession(proof)],
    ["fail-closed", (proof: RecoveryProof) => failClosedRecoverySession(proof)],
  ])("a newer pending callback blocks recovery %s before any auth side effect", async (_operation, act) => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof(
      { userId: "recovery-user", sessionId: "shared-session" },
      "11111111-1111-4111-8111-111111111111",
    );
    const pendingB: RecoveryPending = {
      issuedAt: "2026-09-13T05:00:00.000Z",
      ownerNonce: "22222222-2222-4222-8222-222222222222",
    };
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(pendingB));
    const getSession = jest.fn();
    const updateUser = jest.fn();
    const signOut = jest.fn();
    installClient({
      resetPasswordForEmail: jest.fn(),
      getSession,
      updateUser,
      signOut,
    });
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(act(proof)).rejects.toThrow("operation changed");

    expect(getSession).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proof);
    expect(JSON.parse(values.get(RECOVERY_PENDING_KEY) ?? "{}")).toEqual(pendingB);
  });

  test.each([
    [
      "submit",
      (proof: RecoveryProof) => updatePasswordForRecovery("new-password-123", proof),
    ],
    ["cancel", (proof: RecoveryProof) => cancelRecoverySession(proof)],
    ["fail-closed", (proof: RecoveryProof) => failClosedRecoverySession(proof)],
  ])("a newer callback quarantine blocks recovery %s before any auth side effect", async (_operation, act) => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof(
      { userId: "recovery-user", sessionId: "shared-session" },
      "11111111-1111-4111-8111-111111111111",
    );
    const quarantineB = createAuthCallbackQuarantine("ordinary");
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    values.set(AUTH_CALLBACK_QUARANTINE_KEY, JSON.stringify(quarantineB));
    const getSession = jest.fn();
    const updateUser = jest.fn();
    const signOut = jest.fn();
    installClient({
      resetPasswordForEmail: jest.fn(),
      getSession,
      updateUser,
      signOut,
    });
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(act(proof)).rejects.toThrow("operation changed");

    expect(getSession).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proof);
    expect(JSON.parse(values.get(AUTH_CALLBACK_QUARANTINE_KEY) ?? "{}")).toEqual(quarantineB);
  });

  test.each([
    ["cancel", (proof: RecoveryProof) => cancelRecoverySession(proof)],
    ["fail-closed", (proof: RecoveryProof) => failClosedRecoverySession(proof)],
  ])("exact recovery %s signs out locally and clears its proof", async (_operation, act) => {
    const values = installLockedWebStorage();
    const proof = createRecoveryProof(
      { userId: "recovery-user", sessionId: "shared-session" },
      "11111111-1111-4111-8111-111111111111",
    );
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    const session = {
      access_token: accessToken("recovery-user", "shared-session"),
      user: { id: "recovery-user" },
    };
    const signOut = jest.fn().mockResolvedValue({ error: null });
    installClient({
      resetPasswordForEmail: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }),
      updateUser: jest.fn(),
      signOut,
    });

    await expect(act(proof)).resolves.toBeUndefined();

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
  });

  test("completeRecovery(A) leaves an in-memory B operation published", () => {
    const proofA = createRecoveryProof(
      { userId: "recovery-user", sessionId: "shared-session" },
      "11111111-1111-4111-8111-111111111111",
    );
    const proofB = createRecoveryProof(
      { userId: "recovery-user", sessionId: "shared-session" },
      "22222222-2222-4222-8222-222222222222",
    );
    proofB.issuedAt = proofA.issuedAt;

    expect(settleRecoveryPublicationExpected(proofB, proofA)).toEqual({
      completed: false,
      proof: proofB,
    });
  });

  test("verifyPasswordResetCode returns the recovery session owner", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      verifyOtp: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: accessToken("recovery-u2", "recovery-session-2"),
            user: { id: "recovery-u2" },
          },
          user: { id: "recovery-u2" },
        },
        error: null,
      }),
    };
    installClient(auth);
    const values = new Map<string, string>();
    const pending = await createOwnedRecoveryPending(values);

    await expect(verifyPasswordResetCode(" simon@example.com ", " 123456 ", pending)).resolves.toMatchObject({
      userId: "recovery-u2",
      sessionId: "recovery-session-2",
      pendingOwnerNonce: pending.ownerNonce,
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      email: "simon@example.com",
      token: "123456",
    });
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("rejects explicit recovery credentials off the reset route before session mutation", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn(),
    };
    installClient(auth);

    await expect(
      consumeAuthCallbackUrl(
        "secondbrain:///oauth-callback#access_token=at&refresh_token=rt&type=recovery",
      ),
    ).rejects.toThrow("owned pending marker");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  test("proof-write plus local sign-out failure retains the restart fence", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const values = new Map<string, string>();
    let rejectProofWrite = false;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (rejectProofWrite && key === RECOVERY_PROOF_KEY) {
            throw new Error("proof storage unavailable");
          }
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
    const session = {
      access_token: accessToken("recovery-u3", "recovery-session-3"),
      user: { id: "recovery-u3" },
    };
    const signOut = jest.fn().mockResolvedValue({ error: new Error("remote sign-out failed") });
    const auth: MockSupabaseAuth & { getSession: jest.Mock; signOut: jest.Mock } = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      verifyOtp: jest.fn().mockResolvedValue({
        data: { session, user: session.user },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }),
      signOut,
    };
    installClient(auth);
    const pending = await persistRecoveryPending();
    rejectProofWrite = true;

    await expect(
      verifyPasswordResetCode("simon@example.com", "123456", pending),
    ).rejects.toThrow("proof storage unavailable");

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(warn).toHaveBeenCalledWith(
      "[auth] recovery sign-out failed; phase=transaction-finalize",
    );
    await expect(loadRecoveryPending()).resolves.toEqual(pending);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(
      classifyBootstrapOutcome({
        sessionKnown: true,
        hasProof: false,
        proofMatchesSession: true,
        recoveryPendingOnDisk: true,
        markersReadable: true,
      }),
    ).toEqual({ kind: "recovery-locked", reason: "pending" });
  });

  test("consumeAuthCallbackUrl surfaces provider error codes", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn(),
    };
    installClient(auth);
    const values = new Map<string, string>();
    const pending = await createOwnedRecoveryPending(values);

    await expect(
      consumeAuthCallbackUrl(
        "secondb:///reset-password#error_code=otp_expired&error_description=Link+expired",
        pending,
      ),
    ).rejects.toThrow();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });
});

describe("Naver native OAuth bridge", () => {
  test("the retired native bridge never recognizes a state", () => {
    expect(isNativeNaverCallbackState(`native.${"a".repeat(64)}`)).toBe(false);
    expect(isNativeNaverCallbackState("native.abc123")).toBe(false);
    expect(isNativeNaverCallbackState("abc123")).toBe(false);
  });

  test("never forwards a provider authorization code through a custom scheme", () => {
    expect(() => buildNativeNaverCallbackUrl("?code=code-1&state=native.abc123"))
      .toThrow("Naver login is available on web only.");
  });
});

// Supabase Auth turned on "Require current password when updating" (Email
// provider, 2026-08-10). Codes below were measured against the live project
// with the committed QA account on that date; the missing and the WRONG
// current-password cases return HTTP 400 with IDENTICAL message text and differ
// only by error_code, which is why the UI must never branch on the message.
// Also measured that day: a genuine recovery session updates the password with
// NO current_password and gets 200, so the toggle does not break "forgot
// password". The required/invalid branches exist for a future change screen and
// as insurance if that exemption ever moves.
describe("passwordUpdateFailure", () => {
  test.each([
    ["current_password_required", "current_password_required"],
    ["current_password_invalid", "current_password_invalid"],
    ["weak_password", "weak_password"],
    ["reauthentication_needed", "reauthentication_needed"],
    // auth-js exposes a second reauth code; both mean "sign in again".
    ["reauthentication_not_valid", "reauthentication_needed"],
  ])("maps %s", (code, expected) => {
    expect(passwordUpdateFailure({ code })).toBe(expected);
  });

  test("anything else stays unknown so the generic copy still shows", () => {
    expect(passwordUpdateFailure({ code: "otp_expired" })).toBe("unknown");
    expect(passwordUpdateFailure(new Error("boom"))).toBe("unknown");
    expect(passwordUpdateFailure(null)).toBe("unknown");
  });
});

describe("updatePassword current_password wiring", () => {
  test("omits current_password when the caller has none (recovery flow)", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    __setSupabaseClientForTests({ auth: { updateUser } } as never);
    await updatePassword("new-password-123");
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
  });

  test("sends it as a FIELD on UserAttributes, not a second argument", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    __setSupabaseClientForTests({ auth: { updateUser } } as never);
    await updatePassword("new-password-123", "old-password-123");
    expect(updateUser).toHaveBeenCalledWith({
      password: "new-password-123",
      current_password: "old-password-123",
    });
    expect(updateUser).toHaveBeenCalledTimes(1);
  });
});
