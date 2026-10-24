import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { isSignUpRefusal, SIGN_UP_REFUSAL_MESSAGE } from "../sign-up-refusal";
import { submitSignUp, type SignUpFlowDeps } from "../sign-up-flow";

const refusal = { status: 403, code: "unknown", message: SIGN_UP_REFUSAL_MESSAGE };
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const deps = (error: unknown): SignUpFlowDeps => ({
  signUp: jest.fn().mockRejectedValue(error),
  recordConsent: jest.fn(), refreshAuth: jest.fn(), onEntered: jest.fn(),
  isAgeGateError: () => false, isBreachedPasswordError: () => false,
  isExistingAccountLikelyError: () => false,
});

test("only the exact explicit hook tuple selects the new notice", async () => {
  expect(isSignUpRefusal(refusal)).toBe(true);
  const d = deps(refusal);
  expect(await submitSignUp(d)).toEqual({ kind: "signupRefused" });
  expect(d.recordConsent).not.toHaveBeenCalled();
  expect(d.refreshAuth).not.toHaveBeenCalled();
  expect(d.onEntered).not.toHaveBeenCalled();
});

test.each([
  null, "polascope_signup_refused", {},
  { ...refusal, status: 500 }, { ...refusal, status: "403" },
  { ...refusal, status: 429 }, { ...refusal, code: undefined },
  { ...refusal, code: "unexpected_failure" }, { ...refusal, code: "user_already_exists" },
  { ...refusal, message: `${SIGN_UP_REFUSAL_MESSAGE} extra` },
  { status: 500, code: "unexpected_failure", message: "Database error saving new user" },
])("unrelated or incomplete errors stay generic: %j", async (error) => {
  expect(isSignUpRefusal(error)).toBe(false);
  expect((await submitSignUp(deps(error))).kind).toBe("failed");
});

test.each([
  { code: "unknown", message: SIGN_UP_REFUSAL_MESSAGE },
  { code: 403, error_code: "unknown", msg: SIGN_UP_REFUSAL_MESSAGE },
])("installed Supabase SDK decodes the upstream HTTP error shape: %j", async (body) => {
  // Synthetic HTTP only. Neither GoTrue nor a remote account is called here.
  const fetch = jest.fn(async () => new Response(JSON.stringify(body), {
    status: 403, headers: { "Content-Type": "application/json", "X-Supabase-Api-Version": "2024-01-01" },
  }));
  const client = createClient("https://fixture.invalid", "fixture-anon", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  const { error } = await client.auth.signUp({ email: "fixture@example.invalid", password: "fixture-password" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(isSignUpRefusal(error)).toBe(true);
});

test("the new notice is reachable only from the explicit branch and reuses the button's single alert", () => {
  const hook = read("src/lib/auth/useSignUpForm.ts");
  expect(hook).toMatch(/if \(result.kind === "signupRefused"\) \{\s*setToast\(\{ tone: "danger", message: t\("errors.signUpRefused"\) \}\);\s*return;/);
  expect(hook.match(/t\("errors.signUpRefused"\)/g)).toHaveLength(1);
  const screen = read("src/screens/deepspace/dds-sign-up-screen.tsx");
  expect(screen).not.toContain('t("auth:signUp.existingAccountTitle")');
  expect(screen).toMatch(/\{notice\}\s*<PixelPressable\s+variant=\{submitDisabled[\s\S]*?accessibilityLabel=\{t\("auth:signUp.submit"\)\}/);
  expect(read("src/lib/supabase/auth.ts")).toContain("if (signUpErr) throw signUpErr;");
});

test("approved Korean copy is verbatim and each language has the same refusal key", () => {
  const strings = ["ko", "en", "es", "pt", "id"].map(locale =>
    (JSON.parse(read(`locales/${locale}/auth.json`)).errors as Record<string, string>).signUpRefused);
  expect(strings[0]).toBe("이 주소로는 계정을 만들 수 없습니다.\n가입한 적이 있다면 그때 쓴 주소로 로그인해 주세요. 처음이라면 다른 이메일 주소를 써 주세요.");
  for (const value of strings) {
    expect(value.split("\n")).toHaveLength(2);
    expect(value).not.toMatch(/14|17|18|polascope_signup_refused|—/);
  }
});

test("login and reset keep generic notices and no longer log server-supplied error text", () => {
  const login = read("src/lib/auth/useSignInForm.ts");
  const reset = read("src/lib/auth/useResetPasswordForm.ts");
  expect(login).toContain('t("errors.signInFailed")');
  expect(login).toContain('t("errors.passwordResetFailed")');
  expect(reset).toContain('t("errors.passwordResetFailed")');
  for (const [source, label] of [
    [login, "signIn error"], [login, "password reset email error"],
    [reset, "reset code send error"], [reset, "reset code verify error"],
  ]) expect(source).toContain(`console.warn("[auth] ${label}");`);
  expect(login + reset).not.toContain("isSignUpRefusal");
});

test("the server draft cannot activate implicitly or replace the 0113 safety net", () => {
  const sql = read("db/migration-drafts/UNNUMBERED_before_user_created_signup.sql");
  expect(sql).toContain("enabled boolean NOT NULL DEFAULT false");
  expect(sql).toContain("IF v_enabled IS DISTINCT FROM true THEN RETURN '{}'::jsonb; END IF;");
  expect(sql.indexOf("v_window := date_bin")).toBeGreaterThan(sql.indexOf("WHERE singleton FOR UPDATE"));
  expect(sql).not.toMatch(/(?:CREATE OR REPLACE|ALTER|DROP) FUNCTION public\.(?:block_alias_duplicate_signup|email_canonical)/i);
  expect(sql).not.toMatch(/(?:DROP|ALTER|CREATE) TRIGGER/i);
  expect(sql).not.toMatch(/RAISE\s+(?:LOG|NOTICE|WARNING|EXCEPTION)/i);
  expect(sql).not.toMatch(/event\s*#>>\s*'[^']*(?:birth_date|user_metadata)/);
  expect(sql).toContain('"http_code":403,"message":"polascope_signup_refused"');
});
