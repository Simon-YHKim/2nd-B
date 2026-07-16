// Unit tests for the pure helper-key derivation in useResetPasswordForm. The
// updatePassword submit + deep-link recovery glue is thin React state exercised
// end-to-end in app/(auth)/reset-password.tsx.

// Import from the RN-free helper module (the hook statically imports expo-linking).
import { resetHelperKey, resetStep } from "../reset-password-helpers";

describe("resetHelperKey", () => {
  test("empty fields → default helper", () => {
    expect(resetHelperKey("", "")).toBe("resetPassword.passwordHelper");
  });

  test("password under 8 chars → too-short helper", () => {
    expect(resetHelperKey("abc", "")).toBe("resetPassword.passwordTooShort");
    expect(resetHelperKey("1234567", "1234567")).toBe("resetPassword.passwordTooShort");
  });

  test("8+ but confirm mismatches → mismatch helper", () => {
    expect(resetHelperKey("longenough", "longenoug")).toBe("resetPassword.passwordMismatch");
  });

  test("8+ and matching → default helper (submit-ready)", () => {
    expect(resetHelperKey("longenough", "longenough")).toBe("resetPassword.passwordHelper");
  });

  test("too-short takes precedence over a confirm mismatch", () => {
    // length check runs first: a 3-char password with a different confirm still
    // surfaces the too-short hint, not the mismatch.
    expect(resetHelperKey("abc", "xyz")).toBe("resetPassword.passwordTooShort");
  });
});

describe("resetStep (flow #5: request → verify → password → done)", () => {
  test("no session, nothing sent → request", () => {
    expect(resetStep({ userId: null, complete: false, codeSent: false })).toBe("request");
  });

  test("code sent, still no session → verify", () => {
    expect(resetStep({ userId: null, complete: false, codeSent: true })).toBe("verify");
  });

  test("a session always wins: verified code OR legacy mail link → password", () => {
    expect(resetStep({ userId: "u1", complete: false, codeSent: true })).toBe("password");
    // Mail-link fallback arrives WITHOUT the code path ever running.
    expect(resetStep({ userId: "u1", complete: false, codeSent: false })).toBe("password");
  });

  test("after the update, done regardless of how the session arrived", () => {
    expect(resetStep({ userId: "u1", complete: true, codeSent: true })).toBe("done");
    expect(resetStep({ userId: "u1", complete: true, codeSent: false })).toBe("done");
  });
});
