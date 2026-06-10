import { __setSupabaseClientForTests } from "../client";
import { sendPasswordResetEmail, updatePassword } from "../auth";

type MockSupabaseAuth = {
  resetPasswordForEmail: jest.Mock;
  updateUser: jest.Mock;
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
});
