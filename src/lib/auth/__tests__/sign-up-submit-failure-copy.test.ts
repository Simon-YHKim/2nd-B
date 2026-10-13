import { readFileSync } from "node:fs";
import { join } from "node:path";

// Q-261013-76 (Simon, 2026-10-13): a refused sign-up used to say only "try again in a moment",
// which never works when the mailbox already has an account under another spelling of the
// address (Z97). The server still does not say why, so the notice shown when the submit fails
// now carries both next steps for every failure. It never states that an account exists.
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function errors(locale: string): Record<string, string> {
  const file = join(__dirname, "..", "..", "..", "..", "locales", locale, "auth.json");
  return JSON.parse(readFileSync(file, "utf8")).errors;
}

describe("the notice for a failed sign-up submit", () => {
  const hook = readFileSync(join(__dirname, "..", "useSignUpForm.ts"), "utf8");

  test("the submit failure uses its own sentence; the confirmation link failure keeps the short one", () => {
    expect(hook.match(/t\("errors\.signUpSubmitFailed"\)/g)).toHaveLength(1);
    expect(hook.match(/t\("errors\.signUpFailed"\)/g)).toHaveLength(1);
    const submit = hook.indexOf('t("errors.signUpSubmitFailed")');
    const marker = hook.indexOf('console.warn("[auth] sign-up failed")');
    expect(marker).toBeGreaterThan(submit);
    expect(marker - submit).toBeLessThan(160);
    const link = hook.indexOf('t("errors.signUpFailed")');
    expect(hook.indexOf("confirmation link consume failed")).toBeGreaterThan(link);
  });

  test.each(LOCALES)("%s has both sentences and they differ", (locale) => {
    const e = errors(locale);
    expect(e.signUpSubmitFailed.trim().length).toBeGreaterThan(e.signUpFailed.trim().length);
    expect(e.signUpSubmitFailed).not.toBe(e.signUpFailed);
  });

  test("the Korean sentence is the one that was decided, conditional and with both next steps", () => {
    const text = errors("ko").signUpSubmitFailed;
    expect(text).toBe(
      "가입에 실패했습니다. 전에 가입한 적이 있다면 그때 쓴 주소로 로그인해 주세요. 처음이라면 잠시 후 다시 시도해 주세요.",
    );
    expect(text).not.toMatch(/이미 가입된|계정이 있습니다/);
  });

  test("the English sentence stays conditional", () => {
    const text = errors("en").signUpSubmitFailed;
    expect(text).toMatch(/^Sign-up failed\. If you have signed up before, /);
    expect(text).not.toMatch(/already (exists|registered)/i);
  });
});
