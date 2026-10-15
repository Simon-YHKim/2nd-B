// Explicit disposable Docker PostgreSQL only; never accepts a URL or env DB.
// First replay .github/workflows/supabase-dry-run.yml's full schema + role floor.
// node scripts/test-deletion-receipt-sql.mjs polascope_local t04_receipt_test_schema
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const [container, database] = process.argv.slice(2);
if (!/^(?:polascope_[a-z0-9_]+|[a-f0-9]{64})$/.test(container ?? '') || !/^t04_receipt_test_[a-z0-9_]+$/.test(database ?? '')) {
  throw new Error('Use an explicit polascope_ local Docker container (or CI container ID) and disposable t04_receipt_test_ database.');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const up = readFileSync(resolve(root, 'db/migration-drafts/UNNUMBERED_account_deletion_receipt_contract.sql'), 'utf8');
const down = readFileSync(resolve(root, 'db/migration-drafts/rollback/UNNUMBERED_account_deletion_receipt_contract_down.sql'), 'utf8');
const regression = readFileSync(resolve(root, 'db/migration-drafts/tests/account-deletion-receipt-contract.sql'), 'utf8');
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:PG|DOCKER_)/i.test(name)));
const localDocker = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
let checks = 0;
function start(sql, onReady = () => {}) {
  const child = spawn('docker', ['--host', localDocker, 'exec', '-i', container, 'psql', '-X', '--no-password', '-U', 'postgres',
    '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], { env, timeout: 30_000 });
  let out = ''; let err = ''; let ready = false;
  const done = new Promise((resolveResult, reject) => {
    child.stdout.on('data', (data) => {
      out += data;
      if (!ready && out.includes('RECEIPT_LOCK_READY')) { ready = true; onReady(); }
    });
    child.stderr.on('data', (data) => { err += data; });
    child.on('error', reject);
    child.on('close', (code) => resolveResult({ code, out, err }));
  });
  child.stdin.end(`SET statement_timeout='12s'; SET lock_timeout='8s';\n${sql}`);
  return done;
}
async function run(sql) {
  const result = await start(sql);
  assert.equal(result.code, 0, result.err);
  return result.out.trim();
}
const pass = (name) => { checks++; process.stdout.write(`PASS ${name}\n`); };
const service = "SET ROLE service_role; SET request.jwt.claim.role='service_role';";
const subject = (n) => `de1e7104-0000-4000-8001-${String(n).padStart(12, '0')}`;
const session = (n) => `de1e7104-0000-4000-8002-${String(n).padStart(12, '0')}`;
const request = (n) => `de1e7104-0000-4000-8003-${String(n).padStart(12, '0')}`;
const begin = (n, key = n, issued = 'clock_timestamp()') => `SELECT public.begin_account_deletion_receipt(
  '${subject(n)}','${session(n)}',${issued},'${request(key)}','v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'));`;
const reply = (output) => JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith('{')));
async function fixture(n) {
  await run(`INSERT INTO auth.users(id,email) VALUES('${subject(n)}','receipt-race-${n}@example.invalid');
    INSERT INTO public.users(id,email,birth_date,locale) VALUES('${subject(n)}','receipt-race-${n}@example.invalid','1990-01-01','en');
    INSERT INTO auth.sessions(id,user_id) VALUES('${session(n)}','${subject(n)}');`);
}
async function behindLock(n, callback, prefix = '') {
  let releaseReady;
  const ready = new Promise((resolveReady) => { releaseReady = resolveReady; });
  const holder = start(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${subject(n)}',260913));
    ${prefix} SELECT 'RECEIPT_LOCK_READY'; SELECT pg_sleep(0.6); COMMIT;`, releaseReady);
  // Never leave a failed holder waiting forever for a marker.
  await Promise.race([ready, holder.then((result) => { throw new Error(`lock holder ended early: ${result.err}`); })]);
  const result = await callback();
  const held = await holder;
  assert.equal(held.code, 0, held.err);
  return result;
}
async function behindSessionLock(n, issued, whileBlocked = async () => {}) {
  let releaseReady;
  const ready = new Promise((resolveReady) => { releaseReady = resolveReady; });
  const holder = start(`BEGIN; SELECT 1 FROM auth.sessions WHERE id='${session(n)}' FOR UPDATE;
    SELECT 'RECEIPT_LOCK_READY'; SELECT pg_sleep(3); COMMIT;`, releaseReady);
  await Promise.race([ready, holder.then((result) => { throw new Error(`session holder ended early: ${result.err}`); })]);
  const label = `t04_receipt_session_${n}`;
  const pending = start(`SET application_name='${label}'; ${service} ${begin(n,n,issued)}`);
  let observed = false;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    observed = (await run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND application_name='${label}' AND wait_event_type='Lock' AND wait_event='transactionid');`)).endsWith('t');
    if (observed) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  assert(observed, 'begin must actually wait on the session transaction, not fail before the contested boundary');
  await whileBlocked();
  const [result, held] = await Promise.all([pending, holder]);
  assert.equal(held.code, 0, held.err);
  return result;
}

// Require the exact staged version set, not a hand-written partial schema.
const versions = readdirSync(resolve(root, 'db/migrations')).filter((f) => /^\d+_.*\.sql$/.test(f))
  .map((f) => f.split('_')[0]).filter((n) => Number(n) >= 147).sort();
const installed = (await run('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'))
  .split(/\r?\n/).filter((line) => /^\d+$/.test(line));
assert.deepEqual(installed, versions, 'Replay current full schema first; stage ledger differs');
assert.equal(await run("SELECT has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE');"), 'SET\nSET\nf');
pass('current migration versions and content-wipe lock precondition');
await run(`BEGIN; ${up} COMMIT;`);
await run(`BEGIN; ${up} COMMIT;`);
await run(regression);
pass('repeat apply, real SET ROLE ACL, input/session/purpose/idempotency, no deletion and no false completion');

// Each run needs a fresh disposable DB; fixtures are deliberately left for review.
for (let n = 101; n <= 110; n++) await fixture(n);
const same = await behindLock(101, () => Promise.all([start(`${service} ${begin(101)}`), start(`${service} ${begin(101)}`)]));
assert(same.every((result) => result.code === 0));
assert.deepEqual(reply(same[0].out), reply(same[1].out));
pass('same-key concurrent begin returns one identical receipt');

const different = await behindLock(102, () => Promise.all([start(`${service} ${begin(102)}`), start(`${service} ${begin(102,202)}`)]));
assert.equal(different.filter((result) => result.code === 0).length, 1);
assert(different.find((result) => result.code !== 0).err.includes('receipt_request_in_progress'));
pass('different-key concurrent begin permits one owner operation');

const legacyFirst = await behindLock(103, () => start(`${service} ${begin(103)}`),
  `SET request.jwt.claim.role='service_role'; SELECT public.begin_account_deletion('${subject(103)}','${session(103)}',clock_timestamp());`);
assert.notEqual(legacyFirst.code, 0);
assert(legacyFirst.err.includes('receipt_legacy_fence_unresolved'));
pass('legacy-first fence rejects new begin after lock wait');

const newFirst = await behindLock(104, () => start(`${service} SELECT public.begin_account_deletion('${subject(104)}','${session(104)}',clock_timestamp());`),
  `SET request.jwt.claim.role='service_role'; ${begin(104)}`);
assert.equal(newFirst.code, 0, newFirst.err);
assert((await run(`SELECT r.phase || ':' || (t.user_id IS NOT NULL)::text FROM deletion_receipt_private.accepted_requests r
  LEFT JOIN public.account_deletion_tombstones t ON t.user_id=r.owner_id WHERE r.owner_id='${subject(104)}';`)).endsWith('accepted:true'));
pass('begin-first legacy race stays accepted, never adopted as completed (activation blocker)');

const removedSession = await behindLock(105, async () => {
  await run(`DELETE FROM auth.sessions WHERE id='${session(105)}';`);
  return start(`${service} ${begin(105)}`);
});
assert.notEqual(removedSession.code, 0);
assert(removedSession.err.includes('receipt_fresh_session_required'));
pass('session revoked during owner lock wait rejects begin');

const staleTime = (await run("SELECT quote_literal(clock_timestamp()-interval '4 minutes 59.8 seconds');")).split(/\r?\n/).at(-1);
const stale = await behindLock(106, () => start(`${service} ${begin(106,106,staleTime)}`));
assert.notEqual(stale.code, 0);
assert(stale.err.includes('receipt_fresh_session_required'));
pass('freshness uses clock after waiting, not statement/transaction start');

// R1 M1: the session row is the FINAL possible lock wait. The prior account
// boundary alone did not protect iat or Auth status while waiting here.
const sessionExpired = await behindSessionLock(108, "clock_timestamp()-interval '4 minutes 59 seconds'");
assert.notEqual(sessionExpired.code, 0, 'expired session-row wait must not accept a receipt');
assert(sessionExpired.err.includes('receipt_fresh_session_required'));
const softDeleted = await behindSessionLock(109, 'clock_timestamp()', async () => {
  await run(`UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id='${subject(109)}';`);
});
assert.notEqual(softDeleted.code, 0, 'soft-deleted Auth owner must not be accepted after session-row wait');
assert(softDeleted.err.includes('receipt_fresh_session_required'));
assert((await run(`SELECT NOT EXISTS(SELECT 1 FROM deletion_receipt_private.accepted_requests WHERE owner_id IN ('${subject(108)}','${subject(109)}'))
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id IN ('${subject(108)}','${subject(109)}'));`)).endsWith('t'));
pass('observed session-row wait rejects expired iat and soft-deleted Auth with no receipt or fence');

const sessionValid = await behindSessionLock(110, 'clock_timestamp()');
assert.equal(sessionValid.code, 0, sessionValid.err);
assert.deepEqual(reply(await run(`${service} ${begin(110)}`)), reply(sessionValid.out));
pass('valid session after observed row wait still accepts and replays the identical receipt');

const rolledBack = await run(`BEGIN; ${service} ${begin(107)} ROLLBACK;`);
const afterRollback = await run(`${service} ${begin(107)}`);
assert.notEqual(reply(rolledBack).receiptId, reply(afterRollback).receiptId);
pass('transaction rollback leaves no operation or fence');

const before = await run('SELECT row_to_json(r) FROM deletion_receipt_private.accepted_requests r ORDER BY owner_id;');
await run(down);
assert((await run("SELECT to_regprocedure('public.lookup_account_deletion_receipt(uuid,text,bytea)') IS NULL;")).endsWith('t'));
const disabled = await start(`${service} SELECT * FROM deletion_receipt_private.accepted_requests;`);
assert.notEqual(disabled.code, 0);
await run(`BEGIN; ${up} COMMIT;`);
assert.equal(await run('SELECT row_to_json(r) FROM deletion_receipt_private.accepted_requests r ORDER BY owner_id;'), before);
assert.deepEqual(reply(await run(`${service} ${begin(101)}`)), reply(same[0].out));
pass('pre-activation rollback closes helpers, preserves rows, reapply restores exact receipt');
process.stdout.write(`PASS ${checks} executed groups; external Auth/Storage operations and public endpoint tests: 0\n`);
