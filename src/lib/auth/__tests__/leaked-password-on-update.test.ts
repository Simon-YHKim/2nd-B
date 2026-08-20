// D-3: leaked passwords are refused on every path that sets one.
//
// The check already existed and was already wired into sign-up
// (signUpWithEmail). What it was NOT wired into was updatePassword, which is
// the shared choke point for the settings change AND the forgot-password
// reset. So anyone who had already registered could walk a breached password
// in through either one, which made the sign-up gate mostly decorative for
// exactly the population it was supposed to protect.
//
// Putting it in updatePassword rather than in the two forms is the point: one
// choke point cannot be half-wired, and a third caller added later inherits it
// without anyone remembering to.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BreachedPasswordError, passwordUpdateFailure } from "@/lib/supabase/auth";

const CR = String.fromCharCode(13);
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").split(CR).join("");

const AUTH = read("src/lib/supabase/auth.ts");
const CHANGE_FORM = read("src/lib/auth/useChangePasswordForm.ts");
const RESET_FORM = read("src/lib/auth/useResetPasswordForm.ts");

describe("the check sits at the choke point", () => {
  test("updatePassword refuses a breached password before calling GoTrue", () => {
    const fn = AUTH.slice(AUTH.indexOf("export async function updatePassword("));
    const check = fn.indexOf("isPasswordBreached(password)");
    const call = fn.indexOf("supabase.auth.updateUser");
    expect(check).toBeGreaterThan(-1);
    // Before, not after: a refused password must never reach the server.
    expect(check).toBeLessThan(call);
  });

  test("sign-up still has its own check", () => {
    // Sign-up does not go through updatePassword, so it needs its own. Losing
    // this while adding the other would be a silent downgrade.
    expect(AUTH).toContain("if (await isPasswordBreached(args.password)) throw new BreachedPasswordError();");
  });

  test("the forms do NOT each re-implement it", () => {
    // Two copies of a security check drift. The forms only render the outcome.
    expect(CHANGE_FORM).not.toContain("isPasswordBreached");
    expect(RESET_FORM).not.toContain("isPasswordBreached");
  });
});

describe("the refusal is legible, not a generic server error", () => {
  test("passwordUpdateFailure recognises it by type", () => {
    // It is thrown before any request, so it carries no GoTrue `code`. Falling
    // through to "unknown" would show "could not update your password", which
    // reads as our server being broken.
    expect(passwordUpdateFailure(new BreachedPasswordError())).toBe("breached_password");
  });

  test("GoTrue codes still map as they did", () => {
    for (const code of [
      "current_password_required",
      "current_password_invalid",
      "reauthentication_needed",
      "weak_password",
    ]) {
      expect(passwordUpdateFailure({ code })).toBe(code);
    }
    expect(passwordUpdateFailure({ code: "reauthentication_not_valid" })).toBe("reauthentication_needed");
    expect(passwordUpdateFailure(new Error("boom"))).toBe("unknown");
    expect(passwordUpdateFailure(null)).toBe("unknown");
  });

  test("both forms show the breached copy", () => {
    for (const form of [CHANGE_FORM, RESET_FORM]) {
      expect(form).toContain('failure === "breached_password"');
      expect(form).toContain('t("errors.breachedPassword")');
    }
  });

  test("the copy exists in every shipped locale", () => {
    for (const loc of ["en", "ko", "es", "id", "pt"]) {
      const json = JSON.parse(read(`locales/${loc}/auth.json`)) as { errors?: Record<string, string> };
      expect(json.errors?.breachedPassword).toBeTruthy();
    }
  });
});

describe("it fails open, and that is deliberate", () => {
  test("a network failure does not block the change", () => {
    // A password you cannot change is worse than a weak one you can. The
    // length floor and GoTrue's own checks still apply either way.
    const fn = AUTH.slice(
      AUTH.indexOf("export async function isPasswordBreached("),
      AUTH.indexOf("// birthDate format"),
    );
    expect(fn).toMatch(/catch \{\s*\n\s*return false;/);
    expect(fn).toMatch(/if \(!res\.ok\) return false;/);
  });

  test("only the first five hex characters leave the device", () => {
    const fn = AUTH.slice(AUTH.indexOf("export async function isPasswordBreached("));
    expect(fn).toContain("const prefix = hex.slice(0, 5);");
    expect(fn).toContain("api.pwnedpasswords.com/range/${prefix}");
    // The full hash must not appear in the request.
    expect(fn).not.toMatch(/range\/\$\{hex\}/);
    // Padding masks how many results the prefix really had.
    expect(fn).toContain('"Add-Padding": "true"');
  });

  test("a zero-count suffix is not treated as a breach", () => {
    // Padded responses carry decoy rows ending in :0. Counting those would
    // reject arbitrary passwords for no reason.
    const fn = AUTH.slice(AUTH.indexOf("export async function isPasswordBreached("));
    expect(fn).toContain('!line.trim().endsWith(":0")');
  });
});
