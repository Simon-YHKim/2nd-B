import { readFileSync } from "node:fs";
import path from "node:path";

describe("sign-in password reset help state", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/(auth)/sign-in.tsx"), "utf8");

  test("reset confirmation is keyed to the email that actually received the link", () => {
    expect(source).toContain("const [resetEmailSentTo, setResetEmailSentTo] = useState<string | null>(null);");
    expect(source).toContain("const resetEmail = email.trim();");
    expect(source).toContain("setResetEmailSentTo(resetEmail);");
    expect(source).toContain('t("signIn.resetSentBody", { email: resetEmailSentTo })');
    expect(source).not.toContain('t("signIn.resetSentBody", { email: email.trim() })');
  });

  test("editing the email clears stale reset-sent state", () => {
    expect(source).toContain("if (resetEmailSentTo && value.trim() !== resetEmailSentTo)");
    expect(source).toContain("setResetEmailSentTo(null);");
    expect(source).not.toContain("resetEmailSent, setResetEmailSent");
  });
});
