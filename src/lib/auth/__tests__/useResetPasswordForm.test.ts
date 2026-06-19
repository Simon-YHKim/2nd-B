// Unit tests for the pure helper-key derivation in useResetPasswordForm. The
// updatePassword submit + deep-link recovery glue is thin React state exercised
// end-to-end in app/(auth)/reset-password.tsx.

// Import from the RN-free helper module (the hook statically imports expo-linking).
import { resetHelperKey } from "../reset-password-helpers";

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
