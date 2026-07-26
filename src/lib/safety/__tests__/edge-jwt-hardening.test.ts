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

// Shared plumbing module: claude-proxy / openai-proxy IMPORT userIdFromJwt from
// here instead of defining it inline. Before 2026-07-26 this guard only scanned
// each function's index.ts for a DEFINITION, so the two importing proxies were
// structurally invisible to it and their role check rested on untested code.
const SHARED_FILE = join(FUNCTIONS_DIR, "_shared", "llm-proxy-common.ts");
const sharedCode = stripComments(readFileSync(SHARED_FILE, "utf8"));

function importsSharedJwtHelper(code: string): boolean {
  return /import\s*\{[^}]*\buserIdFromJwt\b[^}]*\}\s*from\s*['"][^'"]*llm-proxy-common(\.ts)?['"]/.test(
    code,
  );
}

// Derives a user identity from a JWT sub claim (directly, via a local
// userIdFromJwt / authenticatedUserIdFromJwt helper, or via the shared import).
function derivesIdentityFromJwtSub(code: string): boolean {
  if (/function\s+(userIdFromJwt|authenticatedUserIdFromJwt)\s*\(/.test(code)) return true;
  if (importsSharedJwtHelper(code)) return true;
  return /JSON\.parse\(\s*atob\(/.test(code) && /\.sub\b/.test(code);
}

// Requires the 'authenticated' role, not merely a valid (possibly anon) token.
// For functions that import the shared helper, the role gate lives in the
// shared module — accept it there, but only because the test below pins it.
function requiresAuthenticatedRole(code: string): boolean {
  if (/role\s*(===|!==)\s*['"]authenticated['"]/.test(code)) return true;
  return importsSharedJwtHelper(code) && /role\s*(===|!==)\s*['"]authenticated['"]/.test(sharedCode);
}

describe("edge function JWT hardening (reject the anon-key JWT)", () => {
  const fns = readFunctions();

  test("edge functions are present (path sanity)", () => {
    expect(fns.length).toBeGreaterThanOrEqual(5);
  });

  test("shared llm-proxy-common userIdFromJwt requires role==='authenticated'", () => {
    expect(/function\s+userIdFromJwt\s*\(/.test(sharedCode)).toBe(true);
    expect(/role\s*(===|!==)\s*['"]authenticated['"]/.test(sharedCode)).toBe(true);
  });

  const jwtFns = fns.filter((f) => derivesIdentityFromJwtSub(f.code));

  test("detects every JWT-sub-trusting function (guard wiring sanity)", () => {
    expect(jwtFns.map((f) => f.name).sort()).toEqual(
      expect.arrayContaining([
        "claude-proxy",
        "delete-account",
        "export-account",
        "gemini-proxy",
        "openai-proxy",
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
