// Explicit disposable local Docker PostgreSQL only. Reuse the full schema/role
// floor from supabase-dry-run.yml; never accepts credentials, a URL or an env DB.
// node scripts/test-interview-content-authority-sql.mjs polascope_local t16_authority_test_s1
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const [container, database] = process.argv.slice(2);
if (!/^(?:polascope_[a-z0-9_]+|[a-f0-9]{64})$/.test(container ?? '') || !/^t16_authority_test_[a-z0-9_]+$/.test(database ?? '')) {
  throw new Error('Use an explicit local polascope_ Docker container (or CI container ID) and fresh t16_authority_test_ database.');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const draft = 'db/migration-drafts/';
const up = read(`${draft}UNNUMBERED_interview_content_authority.sql`);
const down = read(`${draft}rollback/UNNUMBERED_interview_content_authority_down.sql`);
const candidate = JSON.parse(read(`${draft}interview-content-authority-erasure-entries.json`));
assert.deepEqual(Object.keys(candidate.tables).sort(), ['interview_content_authority', 'interview_content_wipes', 'interview_work_contracts']);
const candidateLiteral = `'${JSON.stringify(candidate).replaceAll("'", "''")}'::jsonb`;
const registry = read(`${draft}tests/interview-content-authority-erasure-registry.sql`)
  .replace('/* AUTHORITY_ERASURE_JSON */', candidateLiteral);
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:PG|DOCKER_)/i.test(name)));
const localDocker = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
let checks = 0;
const pass = (name) => { checks++; process.stdout.write(`PASS ${name}\n`); };
function start(sql, onReady = () => {}) {
  const child = spawn('docker', ['--host', localDocker, 'exec', '-i', container, 'psql', '-X', '--no-password', '-U', 'postgres',
    '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env, timeout: 30_000 });
  let out = ''; let err = ''; let ready = false;
  const done = new Promise((resolveResult, reject) => {
    child.stdout.on('data', (data) => {
      out += data;
      if (!ready && out.includes('AUTHORITY_LOCK_READY')) { ready = true; onReady(); }
    });
    child.stderr.on('data', (data) => { err += data; });
    child.on('error', reject);
    child.on('close', (code) => resolveResult({ code, out, err }));
  });
  child.stdin.end(`SET statement_timeout='12s'; SET lock_timeout='8s';\n${sql}`);
  return done;
}
async function run(sql) {
  const result = await start(sql); assert.equal(result.code, 0, result.err); return result.out.trim();
}
const last = (value) => value.split(/\r?\n/).at(-1);
const response = (value) => JSON.parse(value.split(/\r?\n/).find((line) => line.startsWith('{')));
const service = "SET ROLE service_role; SET request.jwt.claim.role='service_role';";
const id = (n, kind = 1) => `1a161601-0000-4000-800${kind}-${String(n).padStart(12, '0')}`;
const open = (n, key = n, expiry = "clock_timestamp()+interval '1 hour'") => `SELECT public.open_interview_work(
  '${id(n)}','${id(n, 2)}',${expiry},'${id(key, 3)}','${id(n, 4)}','now','en','es',false);`;
const reserve = (n, work, expiry = "clock_timestamp()+interval '1 hour'") => `SELECT public.reserve_interview_save(
  '${id(n)}','${id(n, 2)}',${expiry},'${work.workId}','${work.generation}','${id(n, 5)}',7,decode(repeat('ab',32),'hex'),
  '${id(n, 4)}','now','en','es',false);`;
const legacyClose = (n) => `SET ROLE authenticated; SET request.jwt.claim.sub='${id(n)}';
  SELECT public.close_interview_session('${id(n, 7)}','now','en','left',0,0);`;
const totals = (n) => `SELECT jsonb_build_array(
  (SELECT count(*) FROM public.interview_work_contracts WHERE owner_id='${id(n)}'),
  (SELECT count(*) FROM public.interview_sessions WHERE owner_id='${id(n)}'),
  (SELECT COALESCE(sum(created),0) FROM public.interview_session_starts WHERE owner_id='${id(n)}'));`;
async function fixture(n) {
  await run(`INSERT INTO auth.users(id,email) VALUES('${id(n)}','authority-race-${n}@example.invalid');
    INSERT INTO public.users(id,email,birth_date,locale) VALUES('${id(n)}','authority-race-${n}@example.invalid','1990-01-01','en');
    INSERT INTO auth.sessions(id,user_id) VALUES('${id(n, 2)}','${id(n)}');`);
}
async function hold(prefix, suffix = 'COMMIT;', seconds = 1.5) {
  let signal;
  const ready = new Promise((resolveReady) => { signal = resolveReady; });
  const done = start(`BEGIN; ${prefix} SELECT 'AUTHORITY_LOCK_READY'; SELECT pg_sleep(${seconds}); ${suffix}`, signal);
  await Promise.race([ready, done.then((result) => { throw new Error(`holder failed before marker: ${result.err}`); })]);
  return { done };
}
async function observeWait(label, event = 'advisory') {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (last(await run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND application_name='${label}' AND wait_event_type='Lock' AND wait_event='${event}');`)) === 't') return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  assert.fail(`Did not observe actual ${event} lock wait: ${label}`);
}
async function behindRow(n, rowSql, callback, mutateWhileWaiting = async () => {}) {
  const holder = await hold(rowSql, 'COMMIT;', 2);
  const label = `t16_authority_row_${n}`;
  const pending = start(`SET application_name='${label}'; ${service} ${callback()}`);
  await observeWait(label, 'transactionid');
  await mutateWhileWaiting();
  const [result, held] = await Promise.all([pending, holder.done]);
  assert.equal(held.code, 0, held.err); return result;
}
function rejected(result, message, state = '42501') {
  assert.notEqual(result.code, 0); assert(result.err.includes(message), result.err); assert(result.err.includes(state), result.err);
}

const versions = readdirSync(resolve(root, 'db/migrations')).filter((file) => /^\d+_.*\.sql$/.test(file))
  .map((file) => file.split('_')[0]).filter((number) => Number(number) >= 147).sort();
const installed = (await run('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'))
  .split(/\r?\n/).filter((line) => /^\d+$/.test(line));
assert.deepEqual(installed, versions, 'Replay the current complete migration tree/role floor first');
assert.equal(last(await run("SELECT has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE');")), 'f');
// Actual installed shipped writers, not a second implementation of their lock.
assert.equal(last(await run(`SELECT
  position('pg_advisory_xact_lock_shared' IN pg_get_functiondef('public.interview_account_writable(uuid)'::regprocedure))>0
  AND position('260913' IN pg_get_functiondef('public.interview_account_writable(uuid)'::regprocedure))>0
  AND position('pg_advisory_xact_lock_shared' IN pg_get_functiondef('public.assert_polaris_account_active(uuid)'::regprocedure))>0
  AND position('260913' IN pg_get_functiondef('public.assert_polaris_account_active(uuid)'::regprocedure))>0
  AND position('pg_try_advisory_xact_lock(' IN pg_get_functiondef('public.interview_account_erasure()'::regprocedure))>0
  AND position('pg_try_advisory_xact_lock_shared' IN pg_get_functiondef('public.interview_session_erasure()'::regprocedure))>0
  AND position('pg_try_advisory_xact_lock(' IN pg_get_functiondef('public.interview_session_erasure()'::regprocedure))>0
  AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosrc ~* 'INSERT[[:space:]]+INTO[[:space:]]+public.interview_sessions'
      AND (p.proname NOT IN ('record_interview_probe_verdict','close_interview_session','commit_interview_session')
        OR (position('interview_account_writable' IN p.prosrc)=0 AND position('assert_polaris_account_active' IN p.prosrc)=0)));`)), 't');
pass('complete migration ledger, locked erase RPC, actual shipped owner-lock graph');
await run(`BEGIN; ${up} COMMIT;`);
await run(down);
await run(read(`${draft}tests/interview-content-authority-rollback.sql`));
await run(`BEGIN; ${up} COMMIT;`);
await run(`BEGIN; ${up} COMMIT;`);
pass('empty exact down/up roundtrip and repeated draft apply');
const registryBefore = await run('SELECT row_to_json(r) FROM public.erasure_registry r ORDER BY table_name;');
await run(registry);
assert.equal(await run('SELECT row_to_json(r) FROM public.erasure_registry r ORDER BY table_name;'), registryBefore);
pass('exact erasure JSON against actual owner FK/FORCE RLS, production registry unchanged');
await run(read(`${draft}tests/interview-content-authority.sql`));
pass('real-role ACL/helper validation, 30/31/buckets/replay/reserve/barrier/cascade/failure atomicity SQL');

for (let n = 101; n <= 121; n++) await fixture(n);
let holder = await hold(`SELECT pg_advisory_xact_lock(hashtextextended('${id(101)}',260913));`);
let pending = [start(`${service} ${open(101)}`), start(`${service} ${open(101)}`)];
let results = await Promise.all(pending);
assert.equal((await holder.done).code, 0);
assert(results.every((result) => result.code === 0), JSON.stringify(results));
assert.deepEqual(response(results[0].out), response(results[1].out));
const sameKeyReceipt = response(results[0].out);
assert.equal(last(await run(totals(101))), '[1, 1, 1]');
pass('same-key concurrent open has one immutable work/session/start');

await run(`INSERT INTO public.interview_session_starts VALUES('${id(102)}',date_bin(interval '10 minutes',clock_timestamp(),timestamptz '2000-01-01'),29);`);
holder = await hold(`SELECT pg_advisory_xact_lock(hashtextextended('${id(102)}',260913));`);
results = await Promise.all([start(`${service} ${open(102)}`), start(`${service} ${open(102, 202)}`)]);
assert.equal((await holder.done).code, 0);
assert(results.every((result) => result.code === 0), JSON.stringify(results));
assert.deepEqual(results.map((result) => response(result.out).state).sort(), ['rate_limited', 'ready']);
assert.equal(last(await run(totals(102))), '[1, 1, 30]');
pass('count29 different concurrent keys admit exactly one, no counter overrun');

holder = await hold(`SET application_name='t16_open_holder'; ${service} ${open(103)}`, 'COMMIT;', 2);
pending = start(`SET application_name='t16_legacy_same'; ${legacyClose(103)}`);
await observeWait('t16_legacy_same');
assert.equal(response(await run(`${service} ${open(104)}`)).state, 'ready');
assert.equal(last(await run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='t16_open_holder' AND state='active');")), 't');
assert.equal((await pending).code, 0);
assert.equal((await holder.done).code, 0);
assert.equal(last(await run(totals(103))), '[1, 2, 2]');
pass('open EXCLUSIVE actually blocks same-owner shipped close; different owner proceeds');

await run(`INSERT INTO public.interview_session_starts VALUES('${id(105)}',date_bin(interval '10 minutes',clock_timestamp(),timestamptz '2000-01-01'),29);`);
holder = await hold(legacyClose(105), 'COMMIT;', 2);
pending = start(`SET application_name='t16_open_after_legacy'; ${service} ${open(105)}`);
await observeWait('t16_open_after_legacy');
const afterLegacy = await pending;
assert.equal(afterLegacy.code, 0, afterLegacy.err);
assert.equal(response(afterLegacy.out).state, 'rate_limited');
assert.equal((await holder.done).code, 0);
assert.equal(last(await run(totals(105))), '[0, 1, 30]');
pass('shipped close-first SHARED lock serializes cap before open admission');

const expiring = async () => last(await run("SELECT quote_literal(clock_timestamp()+interval '1 second');"));
let expiry = await expiring();
holder = await hold(`SELECT pg_advisory_xact_lock(hashtextextended('${id(106)}',260913));`, 'COMMIT;', 2);
pending = start(`SET application_name='t16_expiry_owner'; ${service} ${open(106, 106, expiry)}`);
await observeWait('t16_expiry_owner');
rejected(await pending, 'live_session_required');
assert.equal((await holder.done).code, 0);
assert.equal(last(await run(totals(106))), '[0, 0, 0]');
pass('expiry measured after observed owner wait; no work/session/count');

expiry = await expiring();
rejected(await behindRow(107, `SELECT 1 FROM auth.sessions WHERE id='${id(107, 2)}' FOR UPDATE;`,
  () => open(107, 107, expiry)), 'live_session_required');
assert.equal(last(await run(totals(107))), '[0, 0, 0]');
pass('expiry after observed Auth-session row wait rejects with zero mutations');
rejected(await behindRow(108, `SELECT 1 FROM auth.sessions WHERE id='${id(108, 2)}' FOR UPDATE;`,
  () => open(108), () => run(`UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id='${id(108)}';`)), 'live_session_required');
assert.equal(last(await run(totals(108))), '[0, 0, 0]');
pass('Auth soft delete during session-row wait is rechecked');
const validRow = await behindRow(109, `SELECT 1 FROM auth.sessions WHERE id='${id(109, 2)}' FOR UPDATE;`, () => open(109));
assert.equal(validRow.code, 0, validRow.err);
assert.equal(response(validRow.out).state, 'ready');
pass('valid Auth session after actual row wait still admits');

expiry = await expiring();
rejected(await behindRow(110, `SELECT 1 FROM auth.users WHERE id='${id(110)}' FOR UPDATE;`,
  () => open(110, 110, expiry)), 'live_session_required');
assert.equal(last(await run(totals(110))), '[0, 0, 0]');
pass('Auth FK target lock is acquired before final expiry/admission time');

const reserveWork = response(await run(`${service} ${open(111)}`));
expiry = await expiring();
rejected(await behindRow(111, `SELECT 1 FROM public.interview_work_contracts WHERE session_id='${reserveWork.workId}' FOR UPDATE;`,
  () => reserve(111, reserveWork, expiry)), 'live_session_required');
assert.equal(last(await run(`SELECT save_state FROM public.interview_work_contracts WHERE owner_id='${id(111)}';`)), 'none');
const reserveSession = response(await run(`${service} ${open(112)}`));
expiry = await expiring();
rejected(await behindRow(112, `SELECT 1 FROM public.interview_sessions WHERE id='${reserveSession.workId}' FOR UPDATE;`,
  () => reserve(112, reserveSession, expiry)), 'live_session_required');
assert.equal(last(await run(`SELECT save_state FROM public.interview_work_contracts WHERE owner_id='${id(112)}';`)), 'none');
pass('reserve rechecks expiry after work and interview-session row waits');

await run(`INSERT INTO public.interview_session_starts VALUES('${id(113)}',date_bin(interval '10 minutes',clock_timestamp()-interval '3 hours',timestamptz '2000-01-01'),1);`);
holder = await hold(`SELECT 1 FROM public.interview_session_starts WHERE owner_id='${id(113)}' FOR UPDATE;`);
rejected(await start(`${service} ${open(113)}`), 'busy_retry', '40001');
assert.equal((await holder.done).code, 0);
assert.equal(last(await run(totals(113))), '[0, 0, 1]');
pass('contended existing bucket uses NOWAIT/40001 with whole attempt rollback');

await run(`INSERT INTO public.interview_session_starts VALUES('${id(117)}',date_bin(interval '10 minutes',clock_timestamp()-interval '3 hours',timestamptz '2000-01-01'),1);`);
holder = await hold(`${service} SELECT public.sweep_interview_sessions(1);`);
rejected(await start(`${service} ${open(117)}`), 'busy_retry', '40001');
assert.equal((await holder.done).code, 0);
assert.equal(last(await run(totals(117))), '[0, 0, 0]');
assert.equal(response(await run(`${service} ${open(117)}`)).state, 'ready');
pass('actual shipped sweeper DELETE races via NOWAIT; explicit retry admits after old bucket pruning');

// Direct profile DELETE owns a row before owner lock. Shipped erasure hook must
// fail its inverse lock with 40001, allowing the valid waiting open to continue.
holder = await hold(`SELECT 1 FROM public.users WHERE id='${id(114)}' FOR UPDATE;`,
  `DELETE FROM public.users WHERE id='${id(114)}'; COMMIT;`, 2);
pending = start(`SET application_name='t16_profile_inverse'; ${service} ${open(114)}`);
await observeWait('t16_profile_inverse', 'transactionid');
rejected(await holder.done, 'busy_retry', '40001');
const inverse = await pending;
assert.equal(inverse.code, 0, inverse.err);
assert.equal(response(inverse.out).state, 'ready');
pass('actual profile DELETE inverse order retries without deadlock or partial deletion');

const inverseWork = response(await run(`${service} ${open(115)}`));
holder = await hold(`SELECT 1 FROM public.interview_sessions WHERE id='${inverseWork.workId}' FOR UPDATE;`,
  `DELETE FROM public.interview_sessions WHERE id='${inverseWork.workId}'; COMMIT;`, 2);
pending = start(`SET application_name='t16_session_inverse'; ${service} ${reserve(115, inverseWork)}`);
await observeWait('t16_session_inverse', 'transactionid');
rejected(await holder.done, 'busy_retry', '40001');
const inverseReserve = await pending;
assert.equal(inverseReserve.code, 0, inverseReserve.err);
assert.equal(response(inverseReserve.out).saveState, 'reserved');
pass('actual session DELETE inverse order retries while reserve retains one session');

// Wipe and reserve share the owner lock. Barrier-first leaves the save slot empty.
const wipeWork = response(await run(`${service} ${open(116)}`));
const wipeSql = `SELECT public.begin_interview_content_wipe('${id(116)}','${id(116, 2)}',clock_timestamp()+interval '1 hour',
  '${id(116, 6)}','${wipeWork.generation}','t16-barrier-v1');`;
holder = await hold(`${service} ${wipeSql}`, 'COMMIT;', 2);
pending = start(`SET application_name='t16_reserve_after_wipe'; ${service} ${reserve(116, wipeWork)}`);
await observeWait('t16_reserve_after_wipe');
const lateReserve = await pending;
assert.equal(lateReserve.code, 0, lateReserve.err);
assert.equal(response(lateReserve.out).state, 'closed');
assert.equal(response(lateReserve.out).saveState, 'none');
assert.equal((await holder.done).code, 0);
assert.equal(last(await run(totals(116))), '[1, 1, 1]');
pass('barrier first blocks late reserve with no deletion, recreation or false completion');

const sameWipeWork = response(await run(`${service} ${open(118)}`));
const sameWipe = `SELECT public.begin_interview_content_wipe('${id(118)}','${id(118, 2)}',clock_timestamp()+interval '1 hour',
  '${id(118, 6)}','${sameWipeWork.generation}','t16-barrier-v1');`;
holder = await hold(`SELECT pg_advisory_xact_lock(hashtextextended('${id(118)}',260913));`);
const concurrentWipes = await Promise.all([start(`${service} ${sameWipe}`), start(`${service} ${sameWipe}`)]);
assert.equal((await holder.done).code, 0);
assert(concurrentWipes.every((result) => result.code === 0), JSON.stringify(concurrentWipes));
assert.deepEqual(response(concurrentWipes[0].out), response(concurrentWipes[1].out));
assert.equal(last(await run(`SELECT revision FROM public.interview_content_authority WHERE owner_id='${id(118)}';`)), '1');
pass('concurrent same wipe key returns one barrier and generation transition');

const snapshot = `SELECT jsonb_build_object('authority',(SELECT jsonb_agg(to_jsonb(a) ORDER BY owner_id) FROM public.interview_content_authority a),
  'work',(SELECT jsonb_agg(to_jsonb(w) ORDER BY session_id) FROM public.interview_work_contracts w),
  'wipe',(SELECT jsonb_agg(to_jsonb(w) ORDER BY operation_id) FROM public.interview_content_wipes w));`;
const beforeDown = await run(snapshot);
rejected(await start(down), 'used_rollback_forbidden', '55000');
assert.equal(await run(snapshot), beforeDown);
await run(`BEGIN; ${up} COMMIT;`);
assert.equal(await run(snapshot), beforeDown);
assert.deepEqual(response(await run(`${service} ${open(101)}`)), sameKeyReceipt);
pass('used down refuses before DDL; all immutable rows and callable replay survive reapply');
process.stdout.write(`PASS ${checks} executed groups; production DB/API/model calls, numbered migrations, finalization and wipe executor: 0\n`);
