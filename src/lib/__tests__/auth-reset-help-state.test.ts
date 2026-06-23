import { readFileSync } from "node:fs";
import path from "node:path";

// The stateful reset-help logic moved into the shared useSignInForm hook (the
// legacy + deep-space sign-in screens share one source). Legacy UI track removed
// 2026-06-23: src/app/(auth)/sign-in.tsx is now a thin wrapper, so the rendered
// reset-sent copy now lives in the canonical deep-space sign-in screen
// (DeepSpaceSignInScreen in src/screens/deepspace/DeepSpaceDesignScreens.tsx),
// where it uses the namespaced t("auth:signIn.resetSentBody", ...) key. Behavior
// is unchanged — these pins follow the code to its new home.
describe("sign-in password reset help state", () => {
  const screen = readFileSync(
    path.join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
    "utf8",
  );
  const hook = readFileSync(path.join(process.cwd(), "src/lib/auth/useSignInForm.ts"), "utf8");

  test("reset confirmation is keyed to the email that actually received the link", () => {
    expect(hook).toContain("const [resetEmailSentTo, setResetEmailSentTo] = useState<string | null>(null);");
    expect(hook).toContain("const resetEmail = email.trim();");
    expect(hook).toContain("setResetEmailSentTo(resetEmail);");
    expect(screen).toContain('t("auth:signIn.resetSentBody", { email: resetEmailSentTo })');
    expect(screen).not.toContain('t("auth:signIn.resetSentBody", { email: email.trim() })');
  });

  test("editing the email clears stale reset-sent state", () => {
    // The hook's setEmail wrapper retires the stale "reset sent" pin when the
    // address changes (prev-based form, same behavior as the old inline guard).
    expect(hook).toContain("prev && value.trim() !== prev");
    expect(hook).toContain("setResetEmailSentTo((prev) =>");
    expect(hook).not.toContain("resetEmailSent, setResetEmailSent");
  });
});
