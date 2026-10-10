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
if (run(`SELECT profile_import_attempt_count FROM public.users WHERE id='${owner}';`).trim() !== "2") {
  throw new Error("Concurrent identical retries must count both attempts");
}
// Include the first successful import: seven more retries leave one of ten slots.
for (let n = 0; n < 7; n++) {
  if (!/"status": "active"/.test(run(call(sameKey, "{}")))) throw new Error("Retry within quota failed");
}
const lastRetries = await Promise.all([concurrent(call(sameKey, "{}")), concurrent(call(sameKey, "{}"))]);
if (lastRetries.some((r) => r.status !== 0) || lastRetries.filter((r) => /"status": "active"/.test(r.stdout)).length !== 1
  || lastRetries.filter((r) => /PT429/.test(r.stdout) && /profile_import_daily_limit/.test(r.stdout)).length !== 1
  || run(`SELECT profile_import_attempt_count FROM public.users WHERE id='${owner}';`).trim() !== "10"
  || run(`SELECT count(*) FROM public.profile_context_imports WHERE user_id='${owner}';`).trim() !== "1") {
  throw new Error("Concurrent identical retries must use only the tenth slot and leave counter ten, batch one");
}
console.log("G4 retry concurrency passed: both initial calls counted; last slot 1 receipt / 1 PT429; counter 10, batch 1");
run(`UPDATE public.users SET profile_import_attempt_count=0 WHERE id='${owner}';`);
const edits = await Promise.all([
  concurrent(call("26100939-2000-4000-8000-000000000003", '{"occupation":"A"}')),
  concurrent(call("26100939-2000-4000-8000-000000000004", '{"occupation":"B"}')),
]);
if (edits.filter((r) => r.status === 0 && /"status": "active"/.test(r.stdout)).length !== 1 || edits.filter((r) => /PT409/.test(r.stdout)).length !== 1) {
  throw new Error("Concurrent profile edits did not produce one save and one CAS conflict: " + JSON.stringify(edits));
}
if (run(`SELECT count(*) FROM public.profile_context_imports WHERE user_id='${owner}';`).trim() !== "2") {
  throw new Error("Conflicting transaction left a partial batch");
}
run(`DELETE FROM auth.users WHERE id='${owner}';`);
console.log("profile_context_import concurrency passed: identical retry saves once; competing profile patches conflict atomically");

// G4-03: real independent transactions compete for the last slot in each limit.
const largeDocument = {
  ...JSON.parse(document),
  sources: Array.from({ length: 100 }, (_, n) => ({ id: `s${n}`, kind: "chat_excerpt", speaker: "user",
    conversation_id: null, message_id: null, label: null, occurred_at: null, excerpt: "界".repeat(300) })),
  items: Array.from({ length: 50 }, (_, n) => ({ ...JSON.parse(document).items[0], id: `i${n}`,
    statement: "界".repeat(800), evidence_ids: [`s${n * 2}`, `s${n * 2 + 1}`] })),
};
for (const limit of ["daily", "active", "storage"]) {
  run(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','g4-race@example.invalid',now());
    INSERT INTO public.users(id,email,birth_date) VALUES('${owner}','g4-race@example.invalid','1990-01-01');`);
  const doc = limit === "storage" ? JSON.stringify(largeDocument) : document;
  const confirmed = limit === "storage" ? `{${largeDocument.items.map((i) => i.id).join(",")}}` : "{i1}";
  const quotaCall = () => `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${owner}';
    SELECT public.apply_profile_context_import(gen_random_uuid(),$document$${doc}$document$,'${confirmed}','{}',0);
    SELECT pg_sleep(0.1); COMMIT;`;
  const bytes = Number(run(`SELECT octet_length($document$${doc}$document$::jsonb::text)+2+512;`).trim());
  const initial = limit === "daily" ? 9 : limit === "active" ? 19 : Math.floor(2097152 / bytes) - 1;
  if (limit === "storage" && (initial < 1 || initial >= 19)) throw new Error("Storage fixture cannot isolate byte cap");
  for (let n = 0; n < initial; n++) {
    if (limit !== "daily") run(`UPDATE public.users SET profile_import_attempt_count=0 WHERE id='${owner}';`);
    if (!/"status": "active"/.test(run(quotaCall()))) throw new Error(`${limit} fixture import failed`);
  }
  if (limit !== "daily") run(`UPDATE public.users SET profile_import_attempt_count=0 WHERE id='${owner}';`);
  const raced = await Promise.all([concurrent(quotaCall()), concurrent(quotaCall())]);
  if (raced.some((r) => r.status !== 0) || raced.filter((r) => /"status": "active"/.test(r.stdout)).length !== 1
    || raced.filter((r) => r.stdout.includes(`profile_import_${limit}_limit`) && /PT429/.test(r.stdout)).length !== 1) {
    throw new Error(`${limit} concurrent cap failed: ${JSON.stringify(raced)}`);
  }
  if (Number(run(`SELECT count(*) FROM public.profile_context_imports WHERE user_id='${owner}';`).trim()) !== initial + 1) {
    throw new Error(`${limit} concurrent cap saved excess content`);
  }
  run(`DELETE FROM auth.users WHERE id='${owner}';`);
  console.log(`G4 ${limit} concurrency passed: 1 accepted, 1 PT429; ${initial + 1} batches`);
}

// A source DELETE starts with a source tuple lock; the internal withdrawal must
// not wait for an owner lock held by another writer (owner->source ordering).
run(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','g4-lock@example.invalid',now());
  INSERT INTO public.users(id,email,birth_date) VALUES('${owner}','g4-lock@example.invalid','1990-01-01');`);
const lockedReceipt = JSON.parse(run(call("26101042-2000-4000-8000-000000000001", '{"occupation":"Imported"}'))
  .split(/\r?\n/).find((line) => line.startsWith("{")));
// Wait for a lock-acquired signal, not a guessed timer, before the other session.
let acquired;
let rejectReady;
const ready = new Promise((resolveReady, reject) => { acquired = resolveReady; rejectReady = reject; });
const holder = spawn("psql", args, { env, windowsHide: true, timeout: 15_000 });
let holderError = "";
holder.stderr.on("data", (chunk) => { holderError += chunk; });
let holderOutput = "";
holder.stdout.on("data", (chunk) => {
  holderOutput += chunk.toString();
  if (holderOutput.includes("g4_owner_locked")) acquired();
});
holder.on("error", rejectReady);
holder.on("close", () => rejectReady(new Error("Owner-lock holder exited before readiness")));
const held = new Promise((resolveHeld, reject) => {
  holder.on("error", reject);
  holder.on("close", (code) => code === 0 ? resolveHeld() : reject(new Error(holderError)));
});
holder.stdin.write(`BEGIN; SELECT id FROM public.users WHERE id='${owner}' FOR UPDATE; SELECT 'g4_owner_locked';\n`);
await ready;
const deletion = await concurrent(`BEGIN; SET LOCAL statement_timeout='2s'; DELETE FROM public.sources WHERE id='${lockedReceipt.source_id}'; COMMIT;`);
holder.stdin.end("COMMIT;\n");
await held;
if (deletion.status === 0 || !/55P03/.test(deletion.stderr)) throw new Error("Source erasure did not fail atomically on competing owner lock");
if (run(`SELECT status FROM public.profile_context_imports WHERE id='${lockedReceipt.id}';`).trim() !== "active") {
  throw new Error("Contended source erasure partially withdrew the batch");
}
run(`DELETE FROM public.sources WHERE id='${lockedReceipt.source_id}';`);
if (run(`SELECT profile_details FROM public.users WHERE id='${owner}';`).trim() !== "{}") throw new Error("Source erasure retry did not restore");
run(`DELETE FROM auth.users WHERE id='${owner}';`);
console.log("G4 erasure contention passed: retryable 55P03, no partial deletion, retry restores");

// Operational down stops only new imports and preserves restoration access.
run(`BEGIN;
  CREATE TEMP TABLE g4_validator_before AS SELECT
    pg_get_functiondef('public.validate_profile_import_document(jsonb,text[])'::regprocedure) AS definition;
  ${readFileSync(resolve(root, "db/migrations/rollback/0242_down.sql"), "utf8")}
  DO $$ BEGIN
    IF has_function_privilege('authenticated','public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint)','EXECUTE')
      OR NOT has_function_privilege('authenticated','public.withdraw_profile_context_import(uuid)','EXECUTE')
      OR NOT has_function_privilege('authenticated','public.save_profile_details_revision(jsonb,bigint)','EXECUTE') THEN
      RAISE EXCEPTION 'G4 down permissions incorrect'; END IF;
    IF has_function_privilege('anon','public.validate_profile_import_document(jsonb,text[])','EXECUTE')
      OR has_function_privilege('authenticated','public.validate_profile_import_document(jsonb,text[])','EXECUTE')
      OR has_function_privilege('service_role','public.validate_profile_import_document(jsonb,text[])','EXECUTE')
      OR pg_get_functiondef('public.validate_profile_import_document(jsonb,text[])'::regprocedure)
        IS DISTINCT FROM (SELECT definition FROM g4_validator_before) THEN
      RAISE EXCEPTION 'G4 down must retain the all-item validator and private ACL'; END IF;
  END $$; ROLLBACK;`);
console.log("G4 operational rollback passed: apply disabled, withdrawal/save and private all-item validator retained");

// 0242 alone enforces confirmation. Partial IDs from the old main client are
// intentionally rejected during the approved apply-to-merge transition.
const compatibilityDocument = JSON.stringify({
  ...JSON.parse(document),
  sources: [{ id: "s", kind: "chat_excerpt", speaker: "user", conversation_id: null,
    message_id: null, label: null, occurred_at: null, excerpt: "Synthetic user excerpt." }],
  items: [
    { ...JSON.parse(document).items[0], evidence_ids: ["s"] },
    { ...JSON.parse(document).items[0], id: "i2", reported_basis: "assistant_inference", evidence_ids: ["s"] },
  ],
});
const forgedDocument = JSON.stringify({
  ...JSON.parse(compatibilityDocument),
  sources: [{ ...JSON.parse(compatibilityDocument).sources[0], excerpt: "Hello" }],
  items: [{ ...JSON.parse(compatibilityDocument).items[0], statement: "I own a bakery in Paris." }],
});
const confirmationFailures = [];
for (const [label, doc, confirmed, accepted] of [
  ["old-client partial IDs rejected", compatibilityDocument, "{i2}", false],
  ["all item IDs accepted", compatibilityDocument, "{i1,i2}", true],
  ["forged provenance with empty IDs rejected", forgedDocument, "{}", false],
]) {
  try {
    run(`BEGIN;
      INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','g4-confirm@example.invalid',now());
      INSERT INTO public.users(id,email,birth_date) VALUES('${owner}','g4-confirm@example.invalid','1990-01-01');
      SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${owner}';
      DO $$ DECLARE result jsonb; BEGIN
        result:=public.apply_profile_context_import(gen_random_uuid(),$document$${doc}$document$,'${confirmed}','{}',0);
        IF ${accepted ? "result->>'status' IS DISTINCT FROM 'active'" : "result->>'code' IS DISTINCT FROM '22023' OR result->>'message' IS DISTINCT FROM 'profile_import_confirmation'"}
          THEN RAISE EXCEPTION 'G4 0242 confirmation: ${label}'; END IF;
        IF (SELECT count(*) FROM public.profile_context_imports WHERE user_id=auth.uid())<>${accepted ? 1 : 0} THEN
          RAISE EXCEPTION 'G4 0242 confirmation left incorrect batch count'; END IF;
        IF has_function_privilege('authenticated','public.validate_profile_import_document(jsonb,text[])','EXECUTE') THEN
          RAISE EXCEPTION 'G4 0242 internal validator must remain private'; END IF;
      END $$;
      ROLLBACK;`);
    console.log(`G4 0242 confirmation passed: ${label}`);
  } catch (error) {
    confirmationFailures.push(String(error));
  }
}
if (confirmationFailures.length) throw new Error(confirmationFailures.join("\n"));
console.log("G4 single-step confirmation passed: 3/3, only 0242 applied, no draft");
