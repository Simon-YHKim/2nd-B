// Judge-rehearsal follow-ups (260717). Finding #1: the mandatory
// email-confirmation step (0086) was announced by a two-word toast reusing
// signIn.resetSentTitle -- a judge could read it as a failed submit. Finding
// #3: the loading gate's tap-to-enter hint was hardcoded Korean, the ONLY
// Korean surface an English-locale judge hits. These pin both fixes at the
// source level (render tests are blocked in this repo; recapture CI covers
// render).

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("sign-up confirm wall (judge-rehearsal #1)", () => {
  test("confirmationRequired raises the persistent card state, not the reset-title toast", () => {
    const hook = read("src/lib/auth/useSignUpForm.ts");
    const branch = hook.slice(hook.indexOf('"confirmationRequired"'), hook.indexOf('"confirmationRequired"') + 400);
    expect(branch).toContain("setConfirmSentTo(email)");
    expect(branch).not.toContain("resetSentTitle");
    // Stale-state hygiene: editing the address or landing the confirmation
    // link must clear the card.
    expect(hook).toContain("setConfirmSentTo((prev) => (prev ? null : prev))");
  });

  test("the sign-up screen renders the card with the target address", () => {
    const screen = read("src/screens/deepspace/dds-auth-screens.tsx");
    expect(screen).toContain('t("auth:signUp.confirmSentTitle")');
    expect(screen).toContain('t("auth:signUp.confirmSentBody", { email: confirmSentTo })');
  });

  test("every locale carries the confirm-sent copy naming {{email}}", () => {
    for (const locale of LOCALES) {
      const auth = JSON.parse(read(`locales/${locale}/auth.json`)) as {
        signUp: { confirmSentTitle?: string; confirmSentBody?: string };
      };
      expect(auth.signUp.confirmSentTitle ?? "").not.toHaveLength(0);
      expect(auth.signUp.confirmSentBody ?? "").toContain("{{email}}");
      expect(auth.signUp.confirmSentBody).not.toMatch(/—/);
    }
  });
});

describe("sign-up confirm code (deliverability P1, 260718)", () => {
  // Root cause, A/B-verified on 2026-07-18: Gmail spam-buckets any mail that
  // carries a *.supabase.co auth link (same sender + auth stack, the link
  // alone flips inbox -> spam), silently burying every confirmation mail.
  // These pins keep the confirmation path link-free end to end.
  test("the confirmation template is code-only: token present, no link, wired in config", () => {
    const tpl = read("supabase/templates/confirmation.html");
    expect(tpl).toContain("{{ .Token }}");
    expect(tpl).not.toMatch(/ConfirmationURL|supabase\.co|href=/);
    const config = read("supabase/config.toml");
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
  });

  test("verifySignUpCode verifies the mailed token as a signup OTP", () => {
    const auth = read("src/lib/supabase/auth.ts");
    const fn = auth.slice(auth.indexOf("export async function verifySignUpCode"));
    expect(fn).toContain('verifyOtp({ type: "signup"');
  });

  test("the hook settles the session before tearing the card down", () => {
    const hook = read("src/lib/auth/useSignUpForm.ts");
    const fn = hook.slice(hook.indexOf("const handleVerifyConfirmCode"));
    expect(fn).toContain("verifySignUpCode(");
    expect(fn.indexOf("refresh()")).toBeGreaterThan(-1);
    expect(fn.indexOf("refresh()")).toBeLessThan(fn.indexOf("setConfirmSentTo(null)"));
  });

  test("the confirm card renders the code input and verify button", () => {
    const screen = read("src/screens/deepspace/dds-auth-screens.tsx");
    expect(screen).toContain('t("auth:signUp.confirmCodeLabel")');
    expect(screen).toContain('t("auth:signUp.confirmCodeHint")');
    expect(screen).toContain('t("auth:signUp.confirmCodeVerify")');
  });

  test("every locale carries the confirm-code copy, em-dash free", () => {
    for (const locale of LOCALES) {
      const auth = JSON.parse(read(`locales/${locale}/auth.json`)) as {
        signUp: Record<string, string | undefined>;
      };
      for (const key of ["confirmCodeLabel", "confirmCodeHint", "confirmCodeVerify", "confirmCodeInvalid"] as const) {
        expect(auth.signUp[key] ?? "").not.toHaveLength(0);
        expect(auth.signUp[key]).not.toMatch(/—/);
      }
      // The card body now names the code (not the retired link) and still
      // carries the address interpolation the #1047 pin requires.
      expect(auth.signUp.confirmSentBody ?? "").toContain("{{email}}");
    }
  });
});

describe("loading gate i18n (judge-rehearsal #3)", () => {
  test("LoadingScreen carries no hardcoded gate/a11y Korean literals", () => {
    const screen = read("src/components/ui/LoadingScreen.tsx");
    expect(screen).toContain('t("loadingGate.hint")');
    expect(screen).not.toMatch(/탭해서 두번째|두 번 탭하면|불러오는 중"/);
  });

  test("every locale carries the six loadingGate keys", () => {
    for (const locale of LOCALES) {
      const common = JSON.parse(read(`locales/${locale}/common.json`)) as {
        loadingGate?: Record<string, string>;
      };
      for (const key of ["hint", "open", "opening", "loading", "enterHint", "skipHint"]) {
        expect(common.loadingGate?.[key] ?? "").not.toHaveLength(0);
      }
    }
  });
});
