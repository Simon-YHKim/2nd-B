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
