// Disposable loopback database only. Never consumes a remote database URL.
// node scripts/test-profile-import-sql.mjs 55449 profile_import_local profile_import_test_ci
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const [port, user, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535 ||
  !/^profile_import_[a-z0-9_]+$/.test(user ?? "") || !/^profile_import_test[a-z0-9_]*$/.test(database ?? "")) {
  throw new Error("Use an explicit disposable profile_import_test database and profile_import_ user on localhost.");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "db/tests/profile_context_import_bootstrap.sql");
const sql = readFileSync(fixture, "utf8").replace(/^\\ir (.+)$/gm,
  (_match, path) => `\\ir '${resolve(dirname(fixture), path).replaceAll("\\", "/")}'`);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key) || key === "PGPASSWORD"));
const args = ["-X", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", user, "-d", database,
  "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At"];
function run(input) {
  const result = spawnSync("psql", args, { input, encoding: "utf8", env, windowsHide: true, timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "profile import SQL failed");
  return result.stdout;
}
function concurrent(input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn("psql", args, { env, windowsHide: true, timeout: 30_000 });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => { resolveResult({ status, stdout, stderr }); });
    child.stdin.end(input);
  });
}
process.stdout.write(run(sql));

const owner = "26100939-2000-4000-8000-000000000001";
const document = JSON.stringify({
  format: "polascope.user-context", version: "1.0-draft",
  origin: { service: "unknown", model: null, exported_at: null },
  coverage: { accessed: [], unavailable: [], omissions: [], more_items: "unknown", account_completeness: "unknown" },
  sources: [], items: [{ id: "i1", category: "preference", statement: "Synthetic SQL race fixture.", reported_basis: "user_statement",
    evidence_ids: [], valid_time: { from: null, to: null, description: null }, conflicts_with: [] }],
});
run(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','profile-race@example.invalid',now());
INSERT INTO public.users(id,email,birth_date) VALUES('${owner}','profile-race@example.invalid','1990-01-01');`);
const call = (key, patch) => `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${owner}';
SELECT public.apply_profile_context_import('${key}',$document$${document}$document$,'{i1}','${patch}',0);
SELECT pg_sleep(0.25); COMMIT;`;
const sameKey = "26100939-2000-4000-8000-000000000002";
const retries = await Promise.all([concurrent(call(sameKey, "{}")), concurrent(call(sameKey, "{}"))]);
if (retries.some((r) => r.status !== 0)) throw new Error("Concurrent retry failed: " + retries.map((r) => r.stderr).join("\n"));
const receipts = retries.map((r) => JSON.parse(r.stdout.split(/\r?\n/).find((line) => line.startsWith("{"))));
if (receipts[0].id !== receipts[1].id || run(`SELECT count(*) FROM public.profile_context_imports WHERE user_id='${owner}';`).trim() !== "1") {
  throw new Error("Concurrent retry duplicated a batch");
}
const edits = await Promise.all([
  concurrent(call("26100939-2000-4000-8000-000000000003", '{"occupation":"A"}')),
  concurrent(call("26100939-2000-4000-8000-000000000004", '{"occupation":"B"}')),
]);
if (edits.filter((r) => r.status === 0).length !== 1 || edits.filter((r) => /PT409/.test(r.stderr)).length !== 1) {
  throw new Error("Concurrent profile edits did not produce one save and one CAS conflict: " + JSON.stringify(edits));
}
if (run(`SELECT count(*) FROM public.profile_context_imports WHERE user_id='${owner}';`).trim() !== "2") {
  throw new Error("Conflicting transaction left a partial batch");
}
run(`DELETE FROM auth.users WHERE id='${owner}';`);
console.log("profile_context_import concurrency passed: identical retry saves once; competing profile patches conflict atomically");
