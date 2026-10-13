// Z18 (A-Z first-use check, Simon 2026-10-13: "the code entry and send again only").
// After the form is sent, the sign-up screen showed the code card and, under it, the whole form
// again (2200px of scroll at 390x844, measured on 8081 on 2026-10-14). The code step is now drawn
// on its own, and it can ask for the mail again, which sign-up could not do before.
// Source contracts and pure reads: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readResendSignUpError,
  resendCooldownAfter,
  resendWaitSeconds,
  SIGN_UP_RESEND_COOLDOWN_SECONDS,
} from "../sign-up-resend";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

describe("what the server's answer to a resend means", () => {
  it("reads the seconds out of the interval refusal", () => {
    expect(resendWaitSeconds("For security purposes, you can only request this after 37 seconds.")).toBe(37);
    expect(resendWaitSeconds("you can only request this after 1 second")).toBe(1);
    expect(resendWaitSeconds("Email rate limit exceeded")).toBeUndefined();
    expect(resendWaitSeconds("after 0 seconds")).toBeUndefined();
    expect(resendWaitSeconds(undefined)).toBeUndefined();
  });

  it("treats too soon and too many as wait, with the number when there is one", () => {
    expect(readResendSignUpError({ status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 37 seconds." }))
      .toEqual({ ok: false, reason: "wait", seconds: 37 });
    // The project's hourly mail limit carries no number.
    expect(readResendSignUpError({ status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" }))
      .toEqual({ ok: false, reason: "wait" });
    expect(readResendSignUpError({ status: 429 })).toEqual({ ok: false, reason: "wait" });
    expect(readResendSignUpError({ code: "over_request_rate_limit" })).toEqual({ ok: false, reason: "wait" });
  });

  it("treats everything else as failed, without saying why", () => {
    expect(readResendSignUpError({ status: 500, code: "unexpected_failure", message: "Error sending confirmation email" })).toEqual({ ok: false, reason: "failed" });
    expect(readResendSignUpError({ status: 400, code: "validation_failed" })).toEqual({ ok: false, reason: "failed" });
    expect(readResendSignUpError({})).toEqual({ ok: false, reason: "failed" });
    // A message that merely mentions seconds is not a refusal to wait out.
    expect(readResendSignUpError({ status: 500, message: "timed out after 30 seconds" })).toEqual({ ok: false, reason: "failed" });
  });

  it("keeps the button off for the server's number, the usual wait otherwise, and not at all after a failure", () => {
    expect(resendCooldownAfter({ ok: true })).toBe(SIGN_UP_RESEND_COOLDOWN_SECONDS);
    expect(resendCooldownAfter({ ok: false, reason: "wait", seconds: 37 })).toBe(37);
    expect(resendCooldownAfter({ ok: false, reason: "wait" })).toBe(SIGN_UP_RESEND_COOLDOWN_SECONDS);
    expect(resendCooldownAfter({ ok: false, reason: "failed" })).toBe(0);
  });
});

describe("the resend call is not a second sign-up", () => {
  const auth = read("src/lib/supabase/auth.ts");
  const fn = auth.slice(auth.indexOf("export async function resendSignUpCode"), auth.indexOf("// Supabase Auth \"Require current password"));

  it("asks the auth server to resend the signup mail for the address, and nothing else", () => {
    expect(fn).toMatch(/supabase\.auth\.resend\(\{\s*type: "signup",\s*email: email\.trim\(\),\s*options: \{ emailRedirectTo: authRedirectTo\("\/sign-up"\) \},\s*\}\)/);
    // No birth date, no consent choices, no password: those went out once, at submit.
    expect(fn).not.toMatch(/signUp\(|signup_consent|signup_birth_date|password/);
  });

  it("hands back a result for every outcome, so the screen has one path", () => {
    expect(fn).toContain("return error ? readResendSignUpError(error) : { ok: true };");
    expect(fn).toMatch(/catch \{\s*return \{ ok: false, reason: "failed" \};\s*\}/);
  });
});

describe("the code step is drawn on its own", () => {
  const screen = read("src/screens/deepspace/dds-sign-up-screen.tsx");
  const start = screen.indexOf("  if (confirmSentTo !== null) {\n    return (");
  const end = screen.indexOf("  return (\n    <PixelGateShell", start);
  const step = screen.slice(start, end);
  const form = screen.slice(end);

  it("returns before the form", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("shows the top bar, the hero, the code card and the notice", () => {
    for (const piece of ["{topBar}", "{hero}", "{notice}", 't("auth:signUp.confirmSentTitle")', 't("auth:signUp.confirmCodeLabel")', 't("auth:signUp.confirmCodeVerify")']) {
      expect(step).toContain(piece);
    }
  });

  it("does not draw the form, the consent block, the providers, the footer or Submit", () => {
    for (const piece of ["<ConsentBlock", "<BirthDateField", "<ProviderButton", "<FooterLink", "handleSubmit", 't("auth:signUp.email")', 't("auth:signUp.password")', "existingAccountHelp"]) {
      expect(step).not.toContain(piece);
    }
    // They are all still in the form branch.
    for (const piece of ["<ConsentBlock", "<BirthDateField", "<ProviderButton", "<FooterLink", "onPress={() => void handleSubmit()}"]) {
      expect(form).toContain(piece);
    }
    expect(form).not.toContain('t("auth:signUp.confirmSentTitle")');
  });

  it("has two actions in the card: confirm the code, and send it again", () => {
    expect(step.split("<PixelPressable").length - 1).toBe(2);
    expect(step).toContain("onPress={() => void handleVerifyConfirmCode()}");
    expect(step).toContain("onPress={() => void handleResendConfirmCode()}");
    expect(step).toContain("disabled={!canResendConfirmCode}");
    // One label, no arrow: centred like [Confirm code] above it (8081, 2026-10-14: it sat on the left).
    expect(step).toContain("contentStyle={styles.resendContent}");
    expect(screen).toContain('resendContent: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },');
  });

  // The button's text counts down every second. Read out each second it would drown the screen
  // reader, so only the message is a live region and the wait is a hint, read on focus.
  it("keeps the ticking button out of the announced message", () => {
    const live = step.indexOf('accessibilityLiveRegion="polite"');
    const liveEnd = step.indexOf("</View>", live);
    expect(live).toBeGreaterThan(-1);
    const announced = step.slice(live, liveEnd);
    expect(announced).toContain('t("auth:signUp.confirmSentTitle")');
    expect(announced).toContain('t("auth:signUp.confirmSentBody", { email: confirmSentTo })');
    expect(announced).not.toContain("<PixelPressable");
    expect(announced).not.toContain("<TextInput");
    expect(step.split("accessibilityLiveRegion").length - 1).toBe(1);
    expect(step).toContain('accessibilityLabel={t("auth:signUp.confirmCodeResend")}');
    expect(step).toContain("accessibilityHint={confirmResendSeconds > 0 ? resendLabel : undefined}");
  });

  it("labels send again by its state: sending, counting down, ready", () => {
    expect(screen).toContain(
      [
        "  const resendLabel = confirmResending",
        '    ? t("auth:resetPassword.sending")',
        "    : confirmResendSeconds > 0",
        '      ? t("auth:resetPassword.resendWait", { seconds: confirmResendSeconds })',
        '      : t("auth:signUp.confirmCodeResend");',
      ].join("\n"),
    );
  });

  it("the arrow goes back to the form from the code step, and to sign-in from the form", () => {
    expect(screen).toContain(
      [
        "          if (confirmSentTo !== null) {",
        "            if (canLeaveGate()) leaveConfirmStep();",
        "            return;",
        "          }",
        '          if (canLeaveGate()) router.push("/");',
      ].join("\n"),
    );
    // A resend in flight holds the arrow like every other write on this screen.
    expect(screen).toContain("const actionBusy = submitting || oauthSubmitting || confirmVerifying || confirmResending;");
  });
});

describe("the code step's copy", () => {
  const KEYS = ["confirmCodeResend", "confirmCodeResent", "confirmCodeResendFailed", "confirmBackToForm"] as const;

  it.each(["en", "ko", "es", "pt", "id"])("%s carries the four strings, and the two shared with the reset screen", (lng) => {
    const auth = JSON.parse(read(`locales/${lng}/auth.json`)) as { signUp: Record<string, string>; resetPassword: Record<string, string> };
    for (const key of KEYS) {
      expect((auth.signUp[key] ?? "").length).toBeGreaterThan(0);
      expect(auth.signUp[key]).not.toContain("—");
    }
    expect(auth.resetPassword.resendWait).toContain("{{seconds}}");
    expect((auth.resetPassword.sending ?? "").length).toBeGreaterThan(0);
  });

  it("Korean uses the screen's own word for the code", () => {
    const ko = (JSON.parse(read("locales/ko/auth.json")) as { signUp: Record<string, string> }).signUp;
    expect(ko.confirmCodeResend).toBe("확인 코드 다시 보내기");
    expect(ko.confirmCodeResent).toBe("확인 코드를 다시 보냈습니다. 메일함을 확인해 주세요.");
    expect(ko.confirmCodeResendFailed).toBe("확인 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(ko.confirmBackToForm).toBe("가입 정보 입력으로 돌아가기");
  });

  it("neither result line says anything about the address or an account", () => {
    for (const lng of ["en", "ko", "es", "pt", "id"]) {
      const signUp = (JSON.parse(read(`locales/${lng}/auth.json`)) as { signUp: Record<string, string> }).signUp;
      for (const key of ["confirmCodeResent", "confirmCodeResendFailed"] as const) {
        expect(signUp[key]).not.toMatch(/\{\{|account|계정|cuenta|conta|akun|registered|가입/i);
      }
    }
  });
});
