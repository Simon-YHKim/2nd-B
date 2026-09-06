import { readFileSync } from "node:fs";
import { join } from "node:path";

import { __setSupabaseClientForTests } from "../client";
import {
  authCallbackType,
  buildNativeNaverCallbackUrl,
  consumeAuthCallbackUrl,
  isPasswordBreached,
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

const originalFetch = global.fetch;
const GENERIC_CALLBACK_ERROR = "Authentication callback could not be completed.";

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
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("the shared Supabase client explicitly uses PKCE", () => {
    const source = readFileSync(join(__dirname, "..", "client.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

    expect(source).toMatch(/auth:\s*\{[\s\S]*?flowType:\s*"pkce"/);
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

  test("consumeAuthCallbackUrl rejects implicit token fragments without creating a session", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: jest.fn(),
    };
    installClient(auth);

    await expect(
      consumeAuthCallbackUrl(
        "secondbrain:///reset-password#access_token=at-1&refresh_token=rt-1&type=recovery",
      ),
    ).rejects.toThrow(GENERIC_CALLBACK_ERROR);

    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
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

    const callback = await consumeAuthCallbackUrl(
      "secondbrain:///reset-password?code=pkce-code-1",
    );

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code-1");
    expect(callback).toEqual({
      userId: "pkce-u1",
      sessionId: "pkce-session-1",
      type: "recovery",
    });
  });

  test("does not promote an ordinary PKCE exchange to recovery", async () => {
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
      consumeAuthCallbackUrl("secondbrain:///reset-password?code=ordinary-code"),
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

  test("consumeAuthCallbackUrl accepts the exact native sign-up callback route", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn().mockResolvedValue({ error: null }),
    };
    installClient(auth);

    await consumeAuthCallbackUrl("secondbrain:///sign-up?code=signup-code-1");

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("signup-code-1");
  });

  test.each([
    "secondb:///reset-password?code=pkce-code-1",
    "https://example.com/reset-password?code=pkce-code-1",
    "secondbrain://reset-password?code=pkce-code-1",
    "secondbrain:///oauth-callback?code=pkce-code-1",
    "secondbrain:///reset-password?code=one&code=two",
    "secondbrain:///reset-password?code=pkce-code-1&access_token=stolen",
    `secondbrain:///reset-password?code=${"a".repeat(2049)}`,
  ])("consumeAuthCallbackUrl rejects a non-canonical callback: %s", async (url) => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    };
    installClient(auth);

    await expect(consumeAuthCallbackUrl(url)).rejects.toThrow(GENERIC_CALLBACK_ERROR);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("consumeAuthCallbackUrl surfaces provider error codes", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn(),
    };
    installClient(auth);

    const error = await consumeAuthCallbackUrl(
      "secondbrain:///reset-password?error_code=otp_expired&error_description=secret-provider-detail",
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(GENERIC_CALLBACK_ERROR);
    expect((error as Error).message).not.toContain("secret-provider-detail");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  test("consumeAuthCallbackUrl does not surface a raw exchange error", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        error: new Error("verifier and provider detail that must stay internal"),
      }),
    };
    installClient(auth);

    const error = await consumeAuthCallbackUrl(
      "secondbrain:///reset-password?code=pkce-code-1",
    ).catch((caught: unknown) => caught);

    expect((error as Error).message).toBe(GENERIC_CALLBACK_ERROR);
    expect((error as Error).message).not.toContain("verifier");
  });

  test("the HIBP request aborts instead of waiting indefinitely", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }) as jest.MockedFunction<typeof fetch>;

    const result = isPasswordBreached("not-a-real-password");
    await Promise.resolve();
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5_001);

    await expect(result).resolves.toBe(false);
  });

  test("the HIBP check refuses an oversized response before reading its body", async () => {
    const text = jest.fn().mockResolvedValue("ignored");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "1048576" },
      text,
    }) as unknown as jest.MockedFunction<typeof fetch>;

    await expect(isPasswordBreached("not-a-real-password")).resolves.toBe(false);
    expect(text).not.toHaveBeenCalled();
  });
});

describe("Naver native OAuth bridge", () => {
  test("the retired native bridge never recognizes a state", () => {
    expect(isNativeNaverCallbackState(`native.${"a".repeat(64)}`)).toBe(false);
    expect(isNativeNaverCallbackState("native.abc123")).toBe(false);
    expect(isNativeNaverCallbackState("abc123")).toBe(false);
  });

  test("the retired native bridge cannot build a callback URL", () => {
    expect(() => buildNativeNaverCallbackUrl("?code=code-1&state=native.abc123")).toThrow(
      "Naver login is available on web only.",
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
