import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

/**
 * Edge-function JWT hardening guard.
 *
 * Root cause of the 2026-06-21 anon-key gap: the JWT parser was duplicated
 * inline across edge functions, and when gemini-proxy / rss-proxy were hardened
 * to require role==='authenticated', delete-account and export-account were
 * missed. verify_jwt=true only proves a token is VALID. The public anon key is
 * itself a valid token (role==='anon'), so any function that derives a user id
 * from a JWT sub MUST also require the 'authenticated' role, else an anon caller
 * reaches a privileged surface.
 *
 * This guard fails if any edge function that decodes a JWT and reads sub lacks
 * the 'authenticated' role gate, so the inline duplication cannot silently drift.
 */
const FUNCTIONS_DIR = resolve(__dirname, "../../../../supabase/functions");

// Strip comments so a comment that merely MENTIONS the role can never mask a
// missing code-level check. The [^:] guard keeps `https://` / `://` literals
// from being mistaken for line comments.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readFunctions(): { name: string; code: string }[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, file: join(FUNCTIONS_DIR, e.name, "index.ts") }))
    .filter(({ file }) => existsSync(file))
    .map(({ name, file }) => ({ name, code: stripComments(readFileSync(file, "utf8")) }));
}

// Derives a user identity from a JWT sub claim (directly, or via the
// userIdFromJwt / authenticatedUserIdFromJwt helper).
function derivesIdentityFromJwtSub(code: string): boolean {
  if (/function\s+(userIdFromJwt|authenticatedUserIdFromJwt)\s*\(/.test(code)) return true;
  return /JSON\.parse\(\s*atob\(/.test(code) && /\.sub\b/.test(code);
}

// Requires the 'authenticated' role, not merely a valid (possibly anon) token.
function requiresAuthenticatedRole(code: string): boolean {
  return /role\s*(===|!==)\s*['"]authenticated['"]/.test(code);
}

describe("edge function JWT hardening (reject the anon-key JWT)", () => {
  const fns = readFunctions();

  test("edge functions are present (path sanity)", () => {
    expect(fns.length).toBeGreaterThanOrEqual(5);
  });

  const jwtFns = fns.filter((f) => derivesIdentityFromJwtSub(f.code));

  test("detects every JWT-sub-trusting function (guard wiring sanity)", () => {
    expect(jwtFns.map((f) => f.name).sort()).toEqual(
      expect.arrayContaining([
        "delete-account",
        "export-account",
        "gemini-proxy",
        "rss-proxy",
      ])
    );
  });

  test.each(jwtFns.map((f) => f.name))(
    "%s requires role==='authenticated'",
    (name) => {
      const fn = jwtFns.find((f) => f.name === name)!;
      expect(requiresAuthenticatedRole(fn.code)).toBe(true);
    }
  );
});
