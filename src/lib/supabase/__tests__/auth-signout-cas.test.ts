const clearAccountScopedLocalNotifications = jest.fn<Promise<void>, [string, unknown?]>(
  async () => undefined,
);
const migrateLegacyRoutineNotifications = jest.fn<Promise<void>, []>(async () => undefined);

jest.mock("../../ops/reminders", () => ({
  clearAccountScopedLocalNotifications: (
    ownerId: string,
    options?: unknown,
  ) => clearAccountScopedLocalNotifications(ownerId, options),
  migrateLegacyRoutineNotifications: () => migrateLegacyRoutineNotifications(),
}));

import { finalizeDeletedAccountSession, signOut } from "../auth";
import { __setSupabaseClientForTests } from "../client";

const A_ACCESS_TOKEN = "test-access-token-owner-a";
const B_ACCESS_TOKEN = "test-access-token-owner-b";

type TestSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string };
};

const SESSION_A: TestSession = {
  access_token: A_ACCESS_TOKEN,
  refresh_token: "test-refresh-token-owner-a",
  user: { id: "account-a" },
};

const SESSION_B: TestSession = {
  access_token: B_ACCESS_TOKEN,
  refresh_token: "test-refresh-token-owner-b",
  user: { id: "account-b" },
};

function installCrossTabSwapHarness() {
  let currentSession: TestSession | null = SESSION_A;
  let persistedSession: TestSession | null = SESSION_A;
  const revokedTokens: string[] = [];

  const getSession = jest.fn(async () => ({
    data: { session: currentSession },
    error: null,
  }));
  const sharedSignOut = jest.fn(async () => {
    // This is the auth-js 2.106.1 TOCTOU: after the wrapper's final read,
    // signOut takes its own lock and reads the now-current B session.
    currentSession = SESSION_B;
    persistedSession = SESSION_B;
    revokedTokens.push(B_ACCESS_TOKEN);
    persistedSession = null;
    return { error: null };
  });
  const capturedTokenSignOut = jest.fn(async (accessToken: string) => {
    // The same cross-tab swap happens at the destructive boundary. A safe
    // implementation must keep using the already-captured A credential and
    // must not clear the shared storage that now belongs to B.
    currentSession = SESSION_B;
    persistedSession = SESSION_B;
    revokedTokens.push(accessToken);
    return { data: null, error: null };
  });

  __setSupabaseClientForTests({
    auth: {
      getSession,
      signOut: sharedSignOut,
      admin: { signOut: capturedTokenSignOut },
    },
  } as unknown as Parameters<typeof __setSupabaseClientForTests>[0]);

  return {
    capturedTokenSignOut,
    getPersistedSession: () => persistedSession,
    revokedTokens,
    sharedSignOut,
  };
}

describe("cross-tab sign-out owner fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAccountScopedLocalNotifications.mockResolvedValue(undefined);
    migrateLegacyRoutineNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __setSupabaseClientForTests(null);
  });

  test.each(["global", "local"] as const)(
    "%s sign-out revokes only captured A and fails safely without clearing B",
    async (scope) => {
      const harness = installCrossTabSwapHarness();

      await expect(signOut(scope)).rejects.toMatchObject({
        name: "AuthSignOutSafetyError",
        code: "auth_local_clear_unavailable",
      });

      expect(harness.capturedTokenSignOut).toHaveBeenCalledWith(A_ACCESS_TOKEN, scope);
      expect(harness.capturedTokenSignOut).not.toHaveBeenCalledWith(B_ACCESS_TOKEN, scope);
      expect(harness.sharedSignOut).not.toHaveBeenCalled();
      expect(harness.revokedTokens).toEqual([A_ACCESS_TOKEN]);
      expect(harness.getPersistedSession()).toBe(SESSION_B);
    },
  );

  test("terminal deletion returns owner-changed without clearing a late B session", async () => {
    const harness = installCrossTabSwapHarness();
    const beforeSignOut = jest.fn();

    await expect(finalizeDeletedAccountSession(
      "account-a",
      () => true,
      beforeSignOut,
    )).resolves.toBe("owner-changed");

    expect(harness.capturedTokenSignOut).toHaveBeenCalledWith(A_ACCESS_TOKEN, "local");
    expect(harness.capturedTokenSignOut).not.toHaveBeenCalledWith(B_ACCESS_TOKEN, "local");
    expect(harness.sharedSignOut).not.toHaveBeenCalled();
    expect(harness.revokedTokens).toEqual([A_ACCESS_TOKEN]);
    expect(harness.getPersistedSession()).toBe(SESSION_B);
    expect(beforeSignOut).not.toHaveBeenCalled();
  });

  test("an unavailable captured-token revoke fails closed without shared sign-out", async () => {
    const sharedSignOut = jest.fn();
    const getSession = jest.fn(async () => ({
      data: { session: SESSION_A },
      error: null,
    }));

    __setSupabaseClientForTests({
      auth: { getSession, signOut: sharedSignOut },
    } as unknown as Parameters<typeof __setSupabaseClientForTests>[0]);

    await expect(signOut("local")).rejects.toMatchObject({
      name: "AuthSignOutSafetyError",
      code: "auth_captured_revoke_unavailable",
    });
    expect(sharedSignOut).not.toHaveBeenCalled();
  });

  test("a thrown captured-token revoke is sanitized and never falls back to shared sign-out", async () => {
    const sharedSignOut = jest.fn();
    const capturedTokenSignOut = jest.fn(async () => {
      throw new Error("opaque upstream failure");
    });
    const getSession = jest.fn(async () => ({
      data: { session: SESSION_A },
      error: null,
    }));

    __setSupabaseClientForTests({
      auth: {
        getSession,
        signOut: sharedSignOut,
        admin: { signOut: capturedTokenSignOut },
      },
    } as unknown as Parameters<typeof __setSupabaseClientForTests>[0]);

    await expect(signOut("global")).rejects.toMatchObject({
      name: "AuthSignOutSafetyError",
      code: "auth_captured_revoke_failed",
    });
    expect(capturedTokenSignOut).toHaveBeenCalledWith(A_ACCESS_TOKEN, "global");
    expect(sharedSignOut).not.toHaveBeenCalled();
  });
});
