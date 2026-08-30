// Unit tests for the pure helper-key derivation in useResetPasswordForm. The
// updatePassword submit + deep-link recovery glue is thin React state exercised
// end-to-end in app/(auth)/reset-password.tsx.

// Import from the RN-free helper module (the hook statically imports expo-linking).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  enqueueRecoveryOperation,
  nextRecoveryProof,
  resetActionAvailability,
  resetExitLocked,
  resetHelperKey,
  resetStep,
} from "../reset-password-helpers";
import { createRecoveryProof } from "../recovery-proof-store";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");
const resetScreenSource = read("src/screens/deepspace/dds-auth-screens.tsx");
const resetHookSource = read("src/lib/auth/useResetPasswordForm.ts");
const authContextSource = read("src/lib/auth/AuthContext.tsx");
const navTabsSource = read("src/lib/nav/tabs.ts");
const rootLayoutSource = read("src/app/_layout.tsx");
const completionToastSource = read("src/components/deepspace/CompletionToast.tsx");
const resetRouteSource = read("src/app/(auth)/reset-password.tsx");
const resetPixelClaySource = resetScreenSource.slice(resetScreenSource.indexOf("function ResetAction"));
const resetActionSource = resetScreenSource.slice(
  resetScreenSource.indexOf("function ResetAction"),
  resetScreenSource.indexOf("function ResetField"),
);

function recoverySession(userId: string, sessionId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return { user: { id: userId }, access_token: `header.${payload}.signature` };
}

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
  test("normal session without recovery proof, nothing sent → request", () => {
    expect(resetStep({ recoveryActive: false, complete: false, codeSent: false })).toBe(
      "request",
    );
  });

  test("code sent, recovery not active → verify", () => {
    expect(resetStep({ recoveryActive: false, complete: false, codeSent: true })).toBe(
      "verify",
    );
  });

  test("verified recovery proof, not a generic session, opens password", () => {
    expect(resetStep({ recoveryActive: true, complete: false, codeSent: true })).toBe(
      "password",
    );
    expect(resetStep({ recoveryActive: true, complete: false, codeSent: false })).toBe(
      "password",
    );
  });

  test("after the update, done regardless of how the session arrived", () => {
    expect(resetStep({ recoveryActive: true, complete: true, codeSent: true })).toBe("done");
    expect(resetStep({ recoveryActive: false, complete: true, codeSent: false })).toBe("done");
  });
});

describe("recovery proof and exit lock", () => {
  test("only PASSWORD_RECOVERY creates proof and account changes clear it", () => {
    const u1 = recoverySession("u1", "session-a");
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    expect(nextRecoveryProof(null, "SIGNED_IN", u1)).toBeNull();
    expect(nextRecoveryProof(null, "INITIAL_SESSION", u1)).toBeNull();
    expect(nextRecoveryProof(null, "PASSWORD_RECOVERY", u1)).toMatchObject({
      userId: "u1",
      sessionId: "session-a",
    });
    expect(nextRecoveryProof(proof, "TOKEN_REFRESHED", u1)).toBe(proof);
    expect(nextRecoveryProof(proof, "SIGNED_IN", recoverySession("u1", "session-b"))).toBeNull();
    expect(nextRecoveryProof(proof, "SIGNED_IN", recoverySession("u2", "session-c"))).toBeNull();
    expect(nextRecoveryProof(proof, "SIGNED_OUT", null)).toBeNull();
  });

  test("locks pending and active recovery, but not ordinary or completed sessions", () => {
    expect(
      resetExitLocked({ recoveryPending: true, recoveryActive: false, complete: false }),
    ).toBe(true);
    expect(
      resetExitLocked({ recoveryPending: false, recoveryActive: true, complete: false }),
    ).toBe(true);
    expect(
      resetExitLocked({ recoveryPending: false, recoveryActive: false, complete: false }),
    ).toBe(false);
    expect(
      resetExitLocked({ recoveryPending: false, recoveryActive: true, complete: true }),
    ).toBe(false);
  });

  test("pending work disables every competing reset action", () => {
    const ready = {
      emailValid: true,
      codeValid: true,
      passwordsValid: true,
      recoveryActive: true,
      recoveryPending: false,
      sendSubmitting: false,
      submitting: false,
      resendSeconds: 0,
    };
    expect(resetActionAvailability(ready)).toEqual({
      canSendCode: true,
      canVerify: true,
      canSubmit: true,
    });
    expect(
      resetActionAvailability({ ...ready, recoveryPending: true }),
    ).toEqual({ canSendCode: false, canVerify: false, canSubmit: false });
    expect(
      resetActionAvailability({ ...ready, sendSubmitting: true }),
    ).toEqual({ canSendCode: false, canVerify: false, canSubmit: false });
    expect(
      resetActionAvailability({ ...ready, submitting: true }),
    ).toEqual({ canSendCode: false, canVerify: false, canSubmit: false });
  });

  test("serializes every session-changing recovery operation", async () => {
    const queue = { current: Promise.resolve() };
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = enqueueRecoveryOperation(queue, async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
      return "first";
    });
    const second = enqueueRecoveryOperation(queue, async () => {
      order.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
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
    expect(resetPixelClaySource).toContain("void handleCancelRecovery()");
    expect(resetPixelClaySource).toContain("toast.message");
    expect(resetPixelClaySource).not.toContain("setComplete(");
  });

  test("preserves keyboard relay, validation copy, and real navigation effects", () => {
    expect(resetPixelClaySource).toContain("confirmRef.current?.focus()");
    expect(resetPixelClaySource).toContain("helperDanger && resetStyles.helperDanger");
    expect(resetPixelClaySource).toContain('const exitHref = userId ? "/" : "/sign-in"');
    expect(resetPixelClaySource).toContain("router.replace(exitHref)");
    expect(resetPixelClaySource).toContain('router.replace("/")');
    expect(resetActionSource).toContain('accessibilityState={{ busy }}');
    expect(resetActionSource).toContain("disabled={disabled}");
    expect(resetActionSource).toContain("accessibilityHint={hint}");
  });

  test("uses one proven-recovery lock for Back, gesture, and route removal", () => {
    expect(resetScreenSource).toContain(
      'import { usePreventRemove } from "expo-router/react-navigation";',
    );
    expect(resetPixelClaySource).toContain("usePreventRemove(exitLocked");
    expect(resetPixelClaySource).toContain('Platform.OS !== "android"');
    expect(resetPixelClaySource).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(resetPixelClaySource).toContain("if (exitLocked) return true");
    expect(resetPixelClaySource).toContain("gestureEnabled: !exitLocked");
    expect(resetPixelClaySource).toContain("headerBackButtonMenuEnabled: false");
    expect(resetPixelClaySource).not.toContain('navigation.addListener("beforeRemove"');
    expect(navTabsSource).toContain('"/reset-password"');
    expect(completionToastSource).toContain(
      'pathname !== "/reset-password"',
    );
  });

  test("accepts only explicit recovery provenance and freezes mutually exclusive work", () => {
    expect(authContextSource).toContain("nextRecoveryProof(");
    expect(authContextSource).toContain("recoveryUserId");
    expect(authContextSource).toContain("recoverySessionId");
    expect(authContextSource).toContain("loadRecoveryProof()");
    expect(authContextSource).toContain("persistRecoveryProof(");
    expect(authContextSource).toContain("recoveryProofMatchesSession(");
    expect(authContextSource).toContain('window.addEventListener("storage"');
    expect(authContextSource).toContain("recoveryPendingGlobal");
    expect(authContextSource).toContain("activateRecoverySession");
    expect(authContextSource).toContain("completeRecovery");
    expect(resetHookSource).toContain("recoveryUserId === userId");
    expect(resetHookSource).toContain("useLinkingURL()");
    expect(resetHookSource).toContain("clearInitialURL()");
    expect(resetHookSource).toContain("isPasswordRecoveryCallbackUrl(deepLinkUrl)");
    expect(resetHookSource).toContain("expectedRecoveryUserId");
    expect(resetHookSource).toMatch(
      /updatePassword\([\s\S]{0,160}?expectedRecoveryUserId,[\s\S]{0,80}?expectedRecoverySessionId/,
    );
    expect(resetHookSource).toContain("const nativeRecoveryLinkWaiting =");
    expect(resetHookSource).toContain("consumedUrlRef.current !== deepLinkUrl");
    expect(resetHookSource).toContain("recoveryOperationQueueRef");
    expect(resetHookSource).toContain("enqueueRecoveryOperation(");
    expect(resetHookSource).toContain("requestId === recoveryConsumeGenerationRef.current");
    expect(resetHookSource).toContain("await activateRecoverySession(verified)");
    expect(resetHookSource).toContain(
      "await completeRecovery(expectedRecoveryUserId, expectedRecoverySessionId)",
    );
    expect(resetHookSource).toContain("authSnapshotRef.current");
    expect(resetHookSource).toContain("previousRecoveryOwnerRef.current");
    expect(resetHookSource).toContain('await signOut("local")');
    expect(resetHookSource).toMatch(
      /const callback = await consumeAuthCallbackUrl\(deepLinkUrl\);[\s\S]{0,900}?catch \(error\) \{[\s\S]{0,500}?await signOut\("local"\);[\s\S]{0,200}?await clearRecoveryPending\(\);/,
    );
    expect(resetHookSource).toContain("setCancelled(true)");
    expect(resetHookSource).toContain("const step = resetStep({ recoveryActive, complete, codeSent })");
    expect(resetHookSource).not.toContain("const step = resetStep({ userId");
    expect(rootLayoutSource.indexOf("void initAnalytics();")).toBeGreaterThan(
      rootLayoutSource.indexOf("function AnalyticsConsentSync"),
    );
    expect(rootLayoutSource).toContain(
      "if (loading || recoveryUserId || recoveryPendingGlobal) return;",
    );
    expect(rootLayoutSource).toContain("if (!recoveryReady) return <InlineLoader />;");
    expect(rootLayoutSource).toContain(
      'if ((recoveryUserId || recoveryPendingGlobal) && pathname !== "/reset-password")',
    );
    expect(resetRouteSource).toContain("recoverySafetyPinsPixelClay");

    expect(resetPixelClaySource).toContain(
      "editable={!sendSubmitting && !recoveryPending}",
    );
    expect(resetPixelClaySource).toContain(
      "editable={recoveryActive && !recoveryPending && !submitting}",
    );
  });

  test("uses the paired high-contrast error container roles for danger toasts", () => {
    expect(resetPixelClaySource).toContain(
      'toast.tone === "danger" ? m3.color.errorContainer : m3.color.surfaceContainerHigh',
    );
    expect(resetPixelClaySource).toContain(
      "toastDanger: { color: m3.color.onErrorContainer }",
    );
  });

  test("uses the shared PIXEL-CLAY gate shell instead of a local shell clone", () => {
    expect(resetScreenSource).toContain(
      'import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";',
    );
    expect(resetPixelClaySource).toContain(
      "<PixelGateShell contentContainerStyle={resetStyles.scroll}>",
    );
    expect(resetPixelClaySource).toContain("<PixelSurface");
    expect(resetPixelClaySource).toContain("borderRadius: m3.shape.none");
    expect(resetScreenSource).not.toContain("const RESET_STARS");
    expect(resetScreenSource).not.toContain("function ResetPasswordBackdrop");
    expect(resetScreenSource).not.toContain("function ResetPasswordShell");
    expect(resetPixelClaySource).not.toContain("<SecondbHead");
    expect(resetPixelClaySource).not.toContain("<RadialGradient");
    expect(resetPixelClaySource).not.toContain("<Card>");
  });

  test("delegates press state to PixelPressable while preserving gate CTA semantics", () => {
    expect(resetActionSource).toContain("<PixelPressable");
    expect(resetActionSource).toContain("fullWidth");
    expect(resetActionSource).toContain("background={background}");
    expect(resetActionSource).toContain('variant={disabled ? "inset" : "bevel"}');
    expect(resetActionSource).not.toContain("<Pressable");
    expect(resetActionSource).not.toContain("useState");
    expect(resetActionSource).not.toContain("onPressIn");
    expect(resetActionSource).not.toContain("onPressOut");
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
