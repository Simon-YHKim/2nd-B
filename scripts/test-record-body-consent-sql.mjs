// Fresh local PostgreSQL only; never reads .env or uses connection defaults.
// node scripts/test-record-body-consent-sql.mjs PORT record_read_local record_read_test
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const [port, user, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535 ||
  !/^record_read_[a-z0-9_]+$/.test(user ?? "") || !/^record_read_test[a-z0-9_]*$/.test(database ?? "")) {
  throw new Error("Explicit loopback record_read_ user and empty record_read_test database required");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const include = path => read(path).replace(/^\\ir (.+)\r?$/gm, (_match, relative) =>
  include(resolve(dirname(resolve(root, path)), relative.trim())));
const trigger = read("db/migrations/0086_require_email_confirmation.sql")
  .match(/CREATE TRIGGER trg_complete_verified_email_signup\s[\s\S]*?EXECUTE FUNCTION public\.complete_verified_email_signup\(\);/)?.[0];
const role = read("db/migrations/0118_billing_refund_reconciliation.sql")
  .match(/CREATE OR REPLACE FUNCTION public\.billing_request_role\(\)[\s\S]*?\$\$;/)?.[0];
const tombstone = read("db/migrations/0192_account_deletion_completion_fence.sql")
  .match(/CREATE TABLE IF NOT EXISTS public\.account_deletion_tombstones \([\s\S]*?\n\);/)?.[0];
if (!trigger || !role || !tombstone) throw new Error("Actual consent helpers missing");
const base = include("db/tests/signup_consent_admob_bootstrap.sql")
  .replace("^signup_test[a-z0-9_]*$", "^record_read_test[a-z0-9_]*$")
  .replace("^signup_[a-z0-9_]+$", "^record_read_[a-z0-9_]+$")
  .replace("-- @LOAD_VERIFIED_EMAIL_TRIGGER@", () => trigger);
const migrations = ["0193_effective_llm_consent_current_contract", "0194_llm_service_consent_management",
  "0203_signup_consent_privacy_20260928", "0208_signup_consent_privacy_20260929",
  "0210_polascope_consent_20260928", "0215_consent_email_v9_20261006", "0262_consent_email_v10_20261018"];
const sql = `${base}\nBEGIN;
  ALTER TABLE public.users ADD COLUMN privacy_prefs jsonb NOT NULL DEFAULT '{}';
  ${include("db/migrations/0062_consent_changes.sql")}
  ${role}
  ${tombstone}
  ${migrations.map(name => include(`db/migrations/${name}.sql`)).join("\n")}
  ${read("db/migration-drafts/UNNUMBERED_record_body_consent.sql")}
  COMMIT;
  ${read("db/migration-drafts/tests/record-body-consent.sql")}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const result = spawnSync("psql", ["-X", "--no-password", "-h", "127.0.0.1", "-p", port,
  "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"], {
  input: sql, encoding: "utf8", env, windowsHide: true, timeout: 60_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
