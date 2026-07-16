import { __setSupabaseClientForTests } from "../client";
import {
  buildNativeNaverCallbackUrl,
  consumeAuthCallbackUrl,
  isNativeNaverCallbackState,
  sendPasswordResetEmail,
  updatePassword,
} from "../auth";

type MockSupabaseAuth = {
  resetPasswordForEmail: jest.Mock;
  updateUser: jest.Mock;
  setSession?: jest.Mock;
  exchangeCodeForSession?: jest.Mock;
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
      setSession: jest.fn().mockResolvedValue({ error: null }),
    };
    installClient(auth);

    await consumeAuthCallbackUrl(
      "secondb:///reset-password#access_token=at-1&refresh_token=rt-1&type=recovery",
    );

    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "at-1", refresh_token: "rt-1" });
  });

  test("consumeAuthCallbackUrl exchanges a PKCE code when present", async () => {
    const auth: MockSupabaseAuth = {
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn().mockResolvedValue({ error: null }),
    };
    installClient(auth);

    await consumeAuthCallbackUrl("secondb:///reset-password?code=pkce-code-1");

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code-1");
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
