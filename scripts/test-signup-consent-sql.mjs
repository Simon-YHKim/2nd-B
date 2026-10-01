// Disposable PostgreSQL only. Explicit loopback connection, no service defaults.
// node scripts/test-signup-consent-sql.mjs 55483 signup_local signup_test_ci
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [port, user, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535 ||
    !/^signup_[a-z0-9_]+$/.test(user ?? "") || !/^signup_test[a-z0-9_]*$/.test(database ?? "")) {
  throw new Error("Use an explicit disposable signup_test database and signup_ user on localhost.");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "db/tests/signup_consent_admob_bootstrap.sql");
const trigger = readFileSync(resolve(root, "db/migrations/0086_require_email_confirmation.sql"), "utf8")
  .match(/CREATE TRIGGER trg_complete_verified_email_signup\s[\s\S]*?EXECUTE FUNCTION public\.complete_verified_email_signup\(\);/)?.[0];
if (!trigger) throw new Error("Missing actual verified-email trigger wiring from 0086");
const sql = readFileSync(fixture, "utf8")
  .replace("-- @LOAD_VERIFIED_EMAIL_TRIGGER@", () => trigger)
  .replace(/^\\ir (.+)$/gm, (_match, path) => `\\ir '${resolve(dirname(fixture), path).replaceAll("\\", "/")}'`);
// PGHOSTADDR/PGSERVICE can override the apparent -h target. Retain only the
// password of the disposable local server; all connection coordinates are args.
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^PG/i.test(key) || key === "PGPASSWORD"));
const result = spawnSync("psql", ["-X", "--no-password", "-h", "127.0.0.1", "-p", port,
  "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"], {
  input: sql, encoding: "utf8", env, windowsHide: true, timeout: 60_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
