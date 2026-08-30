// Unit tests for the pure helper-key derivation in useResetPasswordForm. The
// updatePassword submit + deep-link recovery glue is thin React state exercised
// end-to-end in app/(auth)/reset-password.tsx.

// Import from the RN-free helper module (the hook statically imports expo-linking).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resetHelperKey, resetStep } from "../reset-password-helpers";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");
const resetScreenSource = read("src/screens/deepspace/dds-auth-screens.tsx");
const resetPixelClaySource = resetScreenSource.slice(resetScreenSource.indexOf("const RESET_STARS"));

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

describe("PIXEL-CLAY reset-password presenter", () => {
  test("keeps every shared-hook phase and handler wired", () => {
    expect(resetPixelClaySource).toContain("} = useResetPasswordForm();");
    expect(resetPixelClaySource).toContain('step === "request" || step === "verify"');
    expect(resetPixelClaySource).toContain('step === "password"');
    expect(resetPixelClaySource).toContain('step === "done"');
    expect(resetPixelClaySource).toContain("void handleSendCode()");
    expect(resetPixelClaySource).toContain("void handleVerifyCode()");
    expect(resetPixelClaySource).toContain("void handleSubmit()");
    expect(resetPixelClaySource).toContain("toast.message");
    expect(resetPixelClaySource).not.toContain("setComplete(");
  });

  test("preserves keyboard relay, validation copy, and real navigation effects", () => {
    expect(resetPixelClaySource).toContain("confirmRef.current?.focus()");
    expect(resetPixelClaySource).toContain("helperDanger && resetStyles.helperDanger");
    expect(resetPixelClaySource).toContain('router.replace("/sign-in")');
    expect(resetPixelClaySource).toContain('router.replace("/")');
    expect(resetPixelClaySource).toContain('accessibilityState={{ disabled, busy }}');
  });

  test("does not expose a sign-in escape after the recovery session is active", () => {
    expect(resetPixelClaySource).toContain('step === "request" || step === "verify" ? (');
    expect(resetPixelClaySource).toContain('Platform.OS !== "android"');
    expect(resetPixelClaySource).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(resetPixelClaySource).toContain('navigation.setOptions({ gestureEnabled: step !== "password" })');
    expect(resetPixelClaySource).toContain('navigation.addListener("beforeRemove"');
    expect(resetPixelClaySource).toContain("event.preventDefault()");
    expect(resetPixelClaySource).toContain('} else if (step === "done") {');
    expect(resetPixelClaySource).toContain('router.replace("/")');
  });

  test("uses the paired high-contrast error container roles for danger toasts", () => {
    expect(resetPixelClaySource).toContain(
      'toast.tone === "danger" ? m3.color.errorContainer : m3.color.surfaceContainerHigh',
    );
    expect(resetPixelClaySource).toContain(
      "toastDanger: { color: m3.color.onErrorContainer }",
    );
  });

  test("uses the reset-only PIXEL-CLAY shell instead of the rounded mascot card", () => {
    expect(resetPixelClaySource).toContain("<ResetPasswordShell>");
    expect(resetPixelClaySource).toContain("<PixelSurface");
    expect(resetPixelClaySource).toContain("borderRadius: m3.shape.none");
    expect(resetPixelClaySource).not.toContain("<SecondbHead");
    expect(resetPixelClaySource).not.toContain("<RadialGradient");
    expect(resetPixelClaySource).not.toContain("<Card>");
  });

  test("keeps recovery-only capture explicitly unmeasurable", () => {
    const routes = JSON.parse(read("design/pixel_clay_260825/data/app-routes.json")) as {
      unmeasurable?: Record<string, { route?: string; needs?: string }>;
      unmapped?: Record<string, unknown>;
    };
    expect(routes.unmeasurable?.pwreset?.route).toBe("/reset-password");
    expect(routes.unmeasurable?.pwreset?.needs).toContain("recovery");
    expect(routes.unmapped?.pwreset).toBeUndefined();
  });
});
