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
    const toast = "{toast ? <SignUpToast message={toast.message} tone={toast.tone} /> : null}";
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
