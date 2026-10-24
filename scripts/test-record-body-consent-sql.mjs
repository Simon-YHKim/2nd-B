// Fresh local PostgreSQL only; never reads .env or uses connection defaults.
// node scripts/test-record-body-consent-sql.mjs PORT record_read_local record_read_test
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

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
const draft = read("db/migration-drafts/UNNUMBERED_record_body_consent.sql");
const ownerPreflight = draft.match(/DO \$record_body_owner_preflight\$[\s\S]*?END \$record_body_owner_preflight\$;/)?.[0];
if (!ownerPreflight) throw new Error("T10 owner preflight missing");
const sql = `${base}\nBEGIN;
  ALTER TABLE public.users ADD COLUMN privacy_prefs jsonb NOT NULL DEFAULT '{}';
  ${include("db/migrations/0062_consent_changes.sql")}
  ${role}
  ${tombstone}
  ${migrations.map(name => include(`db/migrations/${name}.sql`)).join("\n")}
  ${include("db/migration-drafts/tests/record-body-compatibility-setup.sql")}
  ${draft}
  COMMIT;
  ${read("db/migration-drafts/tests/record-body-consent.sql").replace("-- @T10_OWNER_PREFLIGHT@",
    () => `SELECT pg_temp.expect_failure($preflight$${ownerPreflight}$preflight$,'record_body_server_writer_owner_not_ready');`)}`;
// Only a password for the explicitly selected loopback fixture may cross the boundary.
// Host, service, options, user and database defaults remain ignored.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key === "PGPASSWORD" || !/^PG/i.test(key)));
const args = ["-X", "--no-password", "-h", "127.0.0.1", "-p", port,
  "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"];
const result = spawnSync("psql", args, {
  input: sql, encoding: "utf8", env, windowsHide: true, timeout: 60_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// Real separate connections: deletion owns the exclusive 0192 fence first.
// Both RPCs must wait on that fence, then see the committed tombstone.
const subject = "66666666-6666-4666-8666-666666666666";
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
function connection() {
  const child = spawn("psql", [...args, "-A", "-t"], { env, windowsHide: true });
  const state = { child, output: "", exited: false, done: null };
  child.stdout.on("data", data => { state.output += data; });
  child.stderr.on("data", data => { state.output += data; });
  state.done = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", code => { state.exited = true; resolveDone(code); });
  });
  return state;
}
function query(input) {
  const reply = spawnSync("psql", [...args, "-A", "-t"], { input, encoding: "utf8", env, windowsHide: true, timeout: 5_000 });
  if (reply.error || reply.status !== 0) throw new Error(reply.stderr || "fixture query failed");
  return reply.stdout.trim();
}
for (const kind of ["writer", "snapshot"]) {
  const fence = connection();
  let probe;
  try {
    fence.child.stdin.write(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${subject}',260913)); SELECT 'T10_LOCKED';\n`);
    const deadline = Date.now() + 8_000;
    while (!fence.output.includes("T10_LOCKED") && !fence.exited && Date.now() < deadline) await delay(25);
    if (!fence.output.includes("T10_LOCKED")) throw new Error("deletion fence fixture did not start");
    probe = connection();
    const operation = kind === "writer" ? `
      SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL test.user_id='${subject}';
      DO $$ BEGIN
        BEGIN PERFORM public.set_record_body_consent(false,NULL,NULL,false,'en');
          RAISE EXCEPTION 'fenced writer accepted';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM<>'record_body_account_unavailable' THEN RAISE; END IF;
        END;
      END $$;` : `
      SET LOCAL request.jwt.claim.role='service_role';
      DO $$ BEGIN
        IF public.record_body_consent_snapshot('${subject}') IS DISTINCT FROM '{"allowed":false,"token":null}'::jsonb
          THEN RAISE EXCEPTION 'fenced snapshot accepted'; END IF;
      END $$;`;
    probe.child.stdin.end(`SET application_name='t10_fence_${kind}'; BEGIN; SET LOCAL statement_timeout='8s'; ${operation} COMMIT;`);
    let waiting = false;
    while (!probe.exited && Date.now() < deadline) {
      waiting = query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='t10_fence_${kind}' AND wait_event='advisory');`) === "t";
      if (waiting) break;
      await delay(25);
    }
    if (!waiting) throw new Error(`${kind} skipped deletion fence: ${probe.output}`);
    fence.child.stdin.end(`INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES('${subject}',gen_random_uuid()); COMMIT;`);
    if (await fence.done !== 0 || await probe.done !== 0) throw new Error(`${kind} deletion race failed: ${fence.output} ${probe.output}`);
    query(`DELETE FROM public.account_deletion_tombstones WHERE user_id='${subject}';`);
    process.stdout.write(`PASS: concurrent deletion fence serializes ${kind} before any receipt/profile access\n`);
  } finally {
    // Closing an incomplete session rolls back only this disposable fixture.
    if (!fence.exited) fence.child.kill();
    if (probe && !probe.exited) probe.child.kill();
    await Promise.allSettled([fence.done, ...(probe ? [probe.done] : [])]);
  }
}
