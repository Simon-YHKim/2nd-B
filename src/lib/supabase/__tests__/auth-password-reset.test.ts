import { __setSupabaseClientForTests } from "../client";
import {
  authCallbackType,
  buildNativeNaverCallbackUrl,
  consumeAuthCallbackUrl,
  isPasswordRecoveryCallbackUrl,
  isNativeNaverCallbackState,
  passwordUpdateFailure,
  sendPasswordResetEmail,
  updatePassword,
  verifyPasswordResetCode,
} from "../auth";

type MockSupabaseAuth = {
  resetPasswordForEmail: jest.Mock;
  updateUser: jest.Mock;
  setSession?: jest.Mock;
  exchangeCodeForSession?: jest.Mock;
  getSession?: jest.Mock;
  verifyOtp?: jest.Mock;
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

function installClient(auth: MockSupabaseAuth): void {
  __setSupabaseClientForTests({ auth } as unknown as Parameters<typeof __setSupabaseClientForTests>[0]);
}

function accessToken(userId: string, sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

describe("password reset helpers", () => {
  afterEach(() => {
    __setSupabaseClientForTests(null);
    clearWebLocation();
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

  test("consumeAuthCallbackUrl turns recovery-link tokens into a session (A-1)", async () => {
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

    const callback = await consumeAuthCallbackUrl(
      "secondb:///reset-password#access_token=at-1&refresh_token=rt-1&type=recovery",
    );

    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "at-1", refresh_token: "rt-1" });
    expect(callback).toEqual({
      userId: "recovery-u1",
      sessionId: "recovery-session-1",
      type: "recovery",
    });
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

    const callback = await consumeAuthCallbackUrl("secondb:///reset-password?code=pkce-code-1");

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code-1");
    expect(callback).toEqual({
      userId: "pkce-u1",
      sessionId: "pkce-session-1",
      type: "recovery",
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
    };
    installClient(auth);

    await expect(
      consumeAuthCallbackUrl("secondb:///reset-password?code=ordinary-code&type=recovery"),
    ).resolves.toEqual({
      userId: "ordinary-u1",
      sessionId: "ordinary-session-1",
      type: null,
    });
  });

  test("recognizes only an explicit recovery callback type", () => {
    expect(authCallbackType("secondb:///reset-password#type=recovery&access_token=x")).toBe(
      "recovery",
    );
    expect(authCallbackType("secondb:///reset-password?code=pkce-code-1")).toBeNull();
    expect(authCallbackType("secondb:///oauth-callback#type=signup")).toBe("signup");
  });

  test("accepts only reset-route PKCE codes as provisional recovery callbacks", () => {
    expect(isPasswordRecoveryCallbackUrl("secondbrain://reset-password?code=pkce-code-1")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain:///reset-password?code=pkce-code-1")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://oauth-callback?code=pkce-code-1")).toBe(false);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://reset-password#type=recovery&access_token=x")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://reset-password#error_code=otp_expired")).toBe(true);
    expect(isPasswordRecoveryCallbackUrl("secondbrain://oauth-callback#type=recovery")).toBe(false);
  });

  test("re-checks the recovery owner immediately before updating a password", async () => {
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
      updatePassword("new-password-123", undefined, "recovery-user"),
    ).rejects.toThrow("session changed");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  test("updates only when the live recovery owner still matches", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn().mockResolvedValue({
        data: { user: { id: "recovery-user" } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: "recovery-user" } } },
        error: null,
      }),
    };
    installClient(auth);

    await updatePassword("new-password-123", undefined, "recovery-user");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
  });

  test("binds the password mutation to the recovery session_id before and after update", async () => {
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

    await updatePassword(
      "new-password-123",
      undefined,
      "recovery-user",
      "recovery-session",
    );
    expect(auth.getSession).toHaveBeenCalledTimes(2);
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  test("rejects the same user when a different session owns recovery", async () => {
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
      updatePassword(
        "new-password-123",
        undefined,
        "recovery-user",
        "recovery-session",
      ),
    ).rejects.toThrow("session changed");
    expect(auth.updateUser).not.toHaveBeenCalled();
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

    await expect(verifyPasswordResetCode(" simon@example.com ", " 123456 ")).resolves.toEqual({
      userId: "recovery-u2",
      sessionId: "recovery-session-2",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      email: "simon@example.com",
      token: "123456",
    });
  });

  test("consumeAuthCallbackUrl surfaces provider error codes", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn(),
    };
    installClient(auth);

    await expect(
      consumeAuthCallbackUrl(
        "secondb:///reset-password#error_code=otp_expired&error_description=Link+expired",
      ),
    ).rejects.toThrow();
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

describe("Naver native OAuth bridge", () => {
  test("recognizes only native-issued state values", () => {
    expect(isNativeNaverCallbackState("native.abc123")).toBe(true);
    expect(isNativeNaverCallbackState("abc123")).toBe(false);
  });

  test("forwards the provider callback query to the fixed app route", () => {
    expect(buildNativeNaverCallbackUrl("?code=code-1&state=native.abc123")).toBe(
      "secondbrain:///oauth-callback?code=code-1&state=native.abc123",
    );
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
