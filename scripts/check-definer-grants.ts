// check:definer-grants -- guards the Supabase "auto-grant footgun".
//
// Supabase configures `ALTER DEFAULT PRIVILEGES` so every newly created function
// is auto-GRANTed EXECUTE to `anon` + `authenticated`. Because of that:
//   1. `REVOKE EXECUTE ... FROM PUBLIC` is NOT sufficient -- it leaves the
//      explicit `anon` grant in place (documented in db/migrations/0036, 0082).
//   2. A new SECURITY DEFINER RPC is anon-callable the moment it is created
//      unless the SAME migration explicitly `REVOKE ... FROM anon`.
//
// This bit the repo twice already (grant_reward_credits_ssv in 0079/0082 was
// anon-callable = a monetization bypass) and a 2026-07-26 prod audit found
// award_xp + bump_chat_usage still anon-EXECUTE. 0098 fixes those two; this lint
// stops the next one from slipping in.
//
// Two rules:
//   A (ALL migrations): no explicit `GRANT EXECUTE ON FUNCTION ... TO anon|public`.
//      An explicit anon/public grant on a function is the smell itself.
//      The hash-pinned public signup-contract metadata migration below is the
//      sole reviewed exception; it does not return account data or grant consent.
//   B (migrations numbered >= BASELINE): any file that CREATEs a SECURITY DEFINER
//      function must ALSO contain a `REVOKE EXECUTE ON FUNCTION ... FROM anon`
//      in the same file. Historical migrations (< BASELINE) are grandfathered --
//      prod state was audited correct on 2026-07-26 (only the two 0098 fixes).
//
// Escape hatch: a file that legitimately adds a trigger-only DEFINER function
// (never exposed as an RPC, so no grant to revoke) may add the marker comment
//   -- definer-grants-lint: trigger-only <reason>
// to opt out of rule B. Use sparingly and say why.

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "db", "migrations");

// Rule B applies from this migration number onward (>= 96). Migrations before it
// are grandfathered against the audited-correct prod grant state (2026-07-26).
// New migrations at/after the baseline (main's 0097_ugc_block_report and this
// branch's 0098) both comply -- each revokes anon in-file.
const BASELINE = 96;

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const errors: string[] = [];

// Rule A: explicit GRANT ... TO anon|public on a function anywhere.
const grantToAnonPublic =
  /grant\s+execute\s+on\s+function[\s\S]*?\bto\s+[^;]*\b(anon|public)\b/i;

// Rule B helpers.
const hasSecurityDefiner = /\bsecurity\s+definer\b/i;
// Accept both `REVOKE EXECUTE ...` and `REVOKE ALL ...` (0056 uses ALL) FROM anon.
const revokesFromAnon =
  /revoke\s+(all|execute)\s+on\s+function[\s\S]*?\bfrom\s+[^;]*\banon\b/i;
const triggerOnlyOptOut = /--\s*definer-grants-lint:\s*trigger-only/i;

// Reviewed 2026-09-25: public.signup_consent_contract_status() has no arguments,
// returns only four policy/revision strings and two readiness booleans, and its
// STABLE SQL body reads contract metadata and the confirmation trigger catalog.
// Pin the ENTIRE reviewed migration, including its resolver/trigger revokes,
// rather than trusting a function name or a comment claiming it is read-only.
// Only checkout line endings and outer whitespace are normalized; SQL literal
// contents, the body, schema, return shape, search_path, and grants stay pinned.
// A future body/contract/migration change requires a new security review before
// changing this digest. Never compute the expected digest from the current draft.
const REVIEWED_SIGNUP_METADATA_SHA256 =
  "aa0fa63f8d81b21d8a5c4658250d2528c7897ebadf769cf5d9588166fc4472c7";
const REVIEWED_SIGNUP_METADATA_GRANT =
  "GRANT EXECUTE ON FUNCTION public.signup_consent_contract_status() TO anon, authenticated;";
// The public DEFINER RPC calls signup_consent_contract(text) with its owner's
// rights even when that resolver is SECURITY INVOKER. Keeping the helper private
// does not stop it leaking records through the public RPC if its body changes.
// The confirmation trigger function also determines confirmation_ready. Protect
// all three names; historical definitions are accepted only at their exact
// original path AND content, so replaying an old definition later is not allowed.
const REVIEWED_SIGNUP_DEPENDENCY_HISTORY: Readonly<Record<string, string>> = {
  "0086_require_email_confirmation.sql": "0c3ca2e97508337c07ee6483a011b6e8262f81b161b7d2873487cee8c2402569",
  "0148_verified_email_signup_consent_ledger.sql": "49a2283b26f40a7ee6c656293e92a5d8a43ea7a54f4e02efb5a3d5a8533c658f",
  "0149_atomic_complete_profile_signup_consent.sql": "02b6006e0c7ce2fc9dfe548df45afc33bc4d32ee22f6032652dc53a908a7bafb",
  "0150_signup_consent_contract_20260902.sql": "db19e01c85e63ace98e093e60aac30cb0122e8e72d2b2699776ad4119472de42",
};
const changesSignupMetadataDependency =
  /\b(?:create(?:\s+or\s+replace)?|alter|drop)\s+(?:function|routine)\s+(?:if\s+exists\s+)?(?:(?:public|"public")\s*\.\s*)?"?(?:signup_consent_contract_status|signup_consent_contract|complete_verified_email_signup)"?\s*\(/i;

function normalizedSqlSha256(sql: string): string {
  const normalized = sql.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function migrationNumber(filename: string): number {
  const m = /^(\d+)/.exec(filename);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

// Strip SQL comments before keyword matching so a comment that merely MENTIONS
// "security definer" / "grant ... anon" (e.g. a migration documenting that it is
// invoker-rights) is not a false positive, and a REVOKE written only in a comment
// is not a false pass. (Line `--` inside a string literal is rare here and not
// security-relevant to these keyword checks.) The trigger-only opt-out marker is a
// comment BY DESIGN, so it is matched against the original text, not this.
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

for (const file of files) {
  const full = join(MIGRATIONS, file);
  const sql = readFileSync(full, "utf8");
  const code = stripSqlComments(sql);
  const rel = relative(ROOT, full);
  const sqlSha256 = normalizedSqlSha256(sql);
  const reviewedSignupMetadata = sqlSha256 === REVIEWED_SIGNUP_METADATA_SHA256;
  const reviewedDependencyHistory = sqlSha256 === REVIEWED_SIGNUP_DEPENDENCY_HISTORY[file];

  // CREATE OR REPLACE retains old EXECUTE grants. Once this RPC is public, a
  // later dependency replacement/ALTER must not evade review by omitting GRANT.
  // History pins never exempt Rule A or Rule B below.
  if (!reviewedSignupMetadata && !reviewedDependencyHistory && changesSignupMetadataDependency.test(code)) {
    errors.push(`${rel}: unreviewed change to the public signup metadata dependency; ` +
      `review its complete SQL before changing the pinned metadata migration digest.`);
  }

  // Rule A -- all migrations.
  // Remove exactly the reviewed single-function grant, never all grants in a
  // named file. PUBLIC, overloads, other functions/roles, and altered SQL fail.
  const grantCode = reviewedSignupMetadata
    ? code.replace(REVIEWED_SIGNUP_METADATA_GRANT, " ")
    : code;
  if (grantToAnonPublic.test(grantCode)) {
    errors.push(
      `${rel}: explicit GRANT EXECUTE ... TO anon/public on a function. ` +
        `Remove it; rely on default privileges + an explicit REVOKE FROM anon.`,
    );
  }

  // Rule B -- new migrations only.
  if (migrationNumber(file) >= BASELINE && hasSecurityDefiner.test(code)) {
    if (!revokesFromAnon.test(code) && !triggerOnlyOptOut.test(sql)) {
      errors.push(
        `${rel}: creates a SECURITY DEFINER function but has no ` +
          `REVOKE EXECUTE ON FUNCTION ... FROM anon in the same file. ` +
          `Supabase auto-grants anon EXECUTE, so REVOKE FROM PUBLIC alone is ` +
          `NOT enough. Add the FROM anon revoke (or the trigger-only opt-out ` +
          `marker if it is never exposed as an RPC).`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    "SECURITY FAIL  DEFINER-grant footgun (see db/migrations/0036, 0082):",
  );
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `SECURITY PASS  ${files.length} migrations: no unreviewed anon/public function grants; ` +
    `every DEFINER fn >= ${BASELINE} revokes anon`,
);
