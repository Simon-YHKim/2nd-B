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

function migrationNumber(filename: string): number {
  const m = /^(\d+)/.exec(filename);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

for (const file of files) {
  const full = join(MIGRATIONS, file);
  const sql = readFileSync(full, "utf8");
  const rel = relative(ROOT, full);

  // Rule A -- all migrations.
  if (grantToAnonPublic.test(sql)) {
    errors.push(
      `${rel}: explicit GRANT EXECUTE ... TO anon/public on a function. ` +
        `Remove it; rely on default privileges + an explicit REVOKE FROM anon.`,
    );
  }

  // Rule B -- new migrations only.
  if (migrationNumber(file) >= BASELINE && hasSecurityDefiner.test(sql)) {
    if (!revokesFromAnon.test(sql) && !triggerOnlyOptOut.test(sql)) {
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
  `SECURITY PASS  ${files.length} migrations: no anon/public function grants; ` +
    `every DEFINER fn >= ${BASELINE} revokes anon`,
);
