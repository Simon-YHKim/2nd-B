import { readFileSync } from "node:fs";
import { join } from "node:path";

// A-Z first-use check, round 1 (Rufus, 2026-10-13). A first-time user read the dots in the
// password box as a saved password, saw the sign-up failure flash past below the button, and
// was told the minimum age three times. Source contracts: render tests are blocked here.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");
const signIn = read("src/screens/deepspace/dds-sign-in-screen.tsx");

describe("Z4: an empty password box looks empty", () => {
  test.each([["sign-in", signIn], ["sign-up", signUp]])("%s has no dots as a placeholder", (_name, screen) => {
    expect(screen).not.toContain("••••");
    // The box keeps its spoken name; only the fake value went.
    expect(screen).toContain("secureTextEntry");
  });
});

describe("Z2: the result of submitting shows right above the button", () => {
  test("the toast is drawn once, before the submit button", () => {
    // The element gained an onLayout (2026-10-13: it keeps the button on screen when the notice
    // appears), so this looks for the element, not for one exact line.
    const toast = "<SignUpToast\n";
    expect(signUp.split(toast)).toHaveLength(2);
    const submit = signUp.indexOf('accessibilityLabel={t("auth:signUp.submit")}');
    expect(signUp.indexOf(toast)).toBeGreaterThan(0);
    expect(signUp.indexOf(toast)).toBeLessThan(submit);
    // Nothing follows the button inside the shell.
    expect(signUp).toMatch(/<\/PixelPressable>\s*<\/PixelGateShell>/);
  });
});

describe("Z8: the minimum age is said where the birth date is entered", () => {
  test("the copy under the title is gone; the field helper and the check row stay", () => {
    expect(signUp).not.toContain('t("deepspace:auth.ageNotice"');
    expect(signUp).not.toContain("styles.ageNotice");
    expect(signUp.match(/minAge=\{minConsentAge\}/g)?.length).toBeGreaterThanOrEqual(1);
    expect(signUp).toContain('t("auth:signUp.checkAge", { minAge: minConsentAge })');
  });
});

// Simon 2026-10-13 (Q-261013-02, Q-261013-03): the sign-in title no longer assumes a returning
// user, and the sign-in screen offers the same social providers as sign-up.
describe("Z3: the sign-in title fits a first-time user", () => {
  test.each([["en", "Sign in"], ["ko", "로그인"], ["es", "Iniciar sesión"], ["pt", "Entrar"], ["id", "Masuk"]])("%s", (lng, title) => {
    const auth = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { auth: Record<string, string> }).auth;
    expect(auth.signInTitle).toBe(title);
    // The lead under it is the hero line and stays.
    expect(auth.signInLead.length).toBeGreaterThan(20);
  });
});

describe("Z9: sign-in offers what sign-up offers", () => {
  const providers = read("src/lib/auth/auth-providers.ts");
  const listed = (source: string, name: string) =>
    [...(source.match(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]+)\\]`))?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]);

  test("the sign-in list is the shared provider list, in order", () => {
    expect(listed(signIn, "SIGN_IN_PROVIDERS")).toEqual(listed(providers, "SUPABASE_OAUTH_PROVIDERS"));
    expect(listed(signIn, "SIGN_IN_PROVIDERS")).toContain("kakao");
    // Still filtered by what is switched on, exactly like sign-up.
    expect(signIn).toContain("visibleProviders.includes(provider)");
  });

  test.each(["en", "ko", "es", "pt", "id"])("%s has a sign-in label for every provider", (lng) => {
    const auth = JSON.parse(read(`locales/${lng}/auth.json`)) as { signIn: Record<string, string>; signUp: Record<string, string> };
    for (const key of ["continueWithGoogle", "continueWithApple", "continueWithKakao", "continueWithFacebook", "continueWithGithub"]) {
      expect(typeof auth.signIn[key]).toBe("string");
    }
    // Same sentence as the other sign-in buttons ("Continue with ..."), not the sign-up wording.
    expect(auth.signIn.continueWithKakao).toBe(auth.signIn.continueWithGoogle.replace("Google", "Kakao"));
    expect(auth.signIn.continueWithFacebook).toBe(auth.signIn.continueWithGoogle.replace("Google", "Facebook"));
  });
});

// A-Z round 2 (Z18) and the reset screen's share of Z4: a code box showing "000000" and
// password boxes showing dots read as already filled in.
describe("Z18: code and password boxes show no made-up value", () => {
  const reset = read("src/screens/deepspace/dds-auth-screens.tsx");
  test.each([["sign-up", signUp], ["sign-in", signIn], ["reset", reset]])("%s", (_name, screen) => {
    expect(screen).not.toContain('placeholder="000000"');
    expect(screen).not.toContain("••••");
  });
});
