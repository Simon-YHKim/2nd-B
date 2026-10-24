// Disposable local Docker PG only. Replay the complete dry-run workflow first.
// node scripts/test-records-embedding-consent-sql.mjs polascope_embed_261019 embed_consent_test_local
// No URL, .env, provider, account login or network-exposed PostgreSQL connection.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const [container, database, mode] = process.argv.slice(2);
if (!/^(?:polascope_[a-z0-9_]+|[a-f0-9]{64})$/.test(container ?? '')
    || !/^embed_consent_test_[a-z0-9_]+$/.test(database ?? '')
    || (mode !== undefined && !['--contracts-only', '--skip-performance'].includes(mode))) {
  throw new Error('Explicit local polascope_ Docker container (or CI ID), disposable embed_consent_test_ DB only.');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const up = read('db/migrations/0263_records_embedding_consent_guard.sql');
// Test-only structure reset, never a deployable rollback. The DB checks itself;
// the caller owns the transaction and verifies the ledger/other objects survive.
const dropTestObjects = `DO $local$ BEGIN
  IF current_database() !~ '^embed_consent_test_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'disposable embedding test database required';
  END IF;
END $local$;
DROP TRIGGER zz_records_embedding_write_guard ON public.records;
DROP TRIGGER zz_records_embedding_delete_guard ON public.records;
DROP TRIGGER zz_records_embedding_consent_changed ON public.users;
DROP TRIGGER zz_records_embedding_consent_cas ON public.users;
DROP FUNCTION public.guard_record_embedding_write();
DROP FUNCTION public.guard_record_embedding_delete();
DROP FUNCTION public.clear_record_embeddings_on_privacy_change();
DROP FUNCTION public.guard_records_embedding_consent();`;
const regression = read('db/tests/records_embedding_consent_regression.sql');
const cleanup = read('db/ops/records_embedding_cleanup_batch.sql');
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:PG|DOCKER_)/i.test(name)));
const socket = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
let checks = 0;
const pass = (label) => { checks++; process.stdout.write(`PASS ${label}\n`); };
function start(sql, { hold = false, timeout = 45_000, targetDatabase = database } = {}) {
  const child = spawn('docker', ['--host', socket, 'exec', '-i', container, 'psql', '-X', '--no-password',
    '-U', 'postgres', '-d', targetDatabase, '-Atq', '-v', 'ON_ERROR_STOP=1'], { env, timeout });
  let out = ''; let err = ''; let readyResolve; let readyReject;
  const ready = new Promise((yes, no) => { readyResolve = yes; readyReject = no; });
  // Ordinary (non-holder) clients do not consume ready.
  ready.catch(() => {});
  const done = new Promise((yes, no) => {
    child.stdout.on('data', (data) => { out += data; if (out.includes('EMBED_READY')) readyResolve(); });
    child.stderr.on('data', (data) => { err += data; });
    child.on('error', (error) => { readyReject(error); no(error); });
    child.on('close', (code) => { readyReject(new Error(`holder exited: ${err}`)); yes({ code, out: out.trim(), err }); });
  });
  child.stdin.on('error', () => {});
  const input = `SET statement_timeout='20s'; SET lock_timeout='15s';\n${sql}\n`;
  if (hold) child.stdin.write(`${input}SELECT 'EMBED_READY';\n`);
  else child.stdin.end(input);
  return { done, ready, finish: (sql = 'COMMIT;') => child.stdin.end(`${sql}\n`) };
}
async function run(sql, opts) {
  const result = await start(sql, opts).done;
  assert.equal(result.code, 0, result.err);
  return result.out;
}
const id = (n) => `ec026300-0000-4000-8001-${String(n).padStart(12, '0')}`;
const rid = (n) => `ec026300-0000-4000-8002-${String(n).padStart(12, '0')}`;
const vec = 'array_fill(0.1::real, ARRAY[768])::public.vector';
const on = (n) => `UPDATE public.users SET privacy_prefs=privacy_prefs || jsonb_build_object(
  'records_embedding',true,'records_embedding_enable_revision',
  COALESCE((privacy_prefs->>'records_embedding_revision')::bigint,0)+1)
  || CASE WHEN privacy_prefs ? 'records_embedding_recovery' THEN jsonb_build_object(
    'records_embedding_enable_recovery',privacy_prefs->'records_embedding_recovery') ELSE '{}'::jsonb END
  WHERE id='${id(n)}';`;
const off = (n) => `UPDATE public.users SET privacy_prefs='{"records_embedding":false}' WHERE id='${id(n)}';`;
const insert = (n, record = n) => `INSERT INTO public.records(id,user_id,kind,body,embedding,embedding_model)
  VALUES('${rid(record)}','${id(n)}','note','fixture',${vec},'model-a');`;
async function fixture(n) {
  await run(`INSERT INTO auth.users(id,email) VALUES('${id(n)}','embed-race-${n}@example.invalid');
    INSERT INTO public.users(id,email,birth_date,locale,privacy_prefs)
    VALUES('${id(n)}','embed-race-${n}@example.invalid','1990-01-01','en','{}'); ${on(n)}`);
}
async function empty(n) {
  assert.equal(await run(`SELECT NOT EXISTS(SELECT 1 FROM public.records WHERE user_id='${id(n)}'
    AND (embedding IS NOT NULL OR embedding_model IS NOT NULL));`), 't');
}
async function observeWait(label) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    if ((await run(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE datname=current_database()
      AND application_name='${label}' AND wait_event_type='Lock');`)) === 't') return;
    await new Promise((yes) => setTimeout(yes, 25));
  }
  throw new Error(`No observed lock wait: ${label}`);
}
async function race(holderSql, waiterSql, label, expectedError) {
  const holder = start(`BEGIN; ${holderSql}`, { hold: true });
  try {
    await holder.ready;
    const waiter = start(`SET application_name='${label}'; ${waiterSql}`);
    try { await observeWait(label); }
    finally { holder.finish(); }
    const results = await Promise.all([holder.done, waiter.done]);
    assert.equal(results[0].code, 0, results[0].err);
    if (expectedError) {
      assert.notEqual(results[1].code, 0, 'stale unmarked enable reported success');
      assert(results[1].err.includes(expectedError), results[1].err);
    } else assert.equal(results[1].code, 0, results[1].err);
  } finally { holder.finish(); await holder.done; }
}

const versions = readdirSync(resolve(root, 'db/migrations')).filter((f) => /^\d+_.*\.sql$/.test(f))
  .map((f) => f.split('_')[0]).filter((n) => Number(n) >= 147).sort();
assert.deepEqual((await run('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;')).split(/\r?\n/), versions,
  'Replay the current full schema first, not a hand-built partial schema');
assert.equal(await run("SELECT relforcerowsecurity FROM pg_class WHERE oid='public.records'::regclass;"), 't');
await run(`BEGIN; ${up} COMMIT;`);
await run(`BEGIN; ${up} COMMIT;`);
await run(regression);
pass('full replay, repeat installation, SQL contract matrix, real roles/RLS, atomic failure, legacy provenance and trigger order');
for (const [tamper, message] of [
  ['ALTER TABLE public.records NO FORCE ROW LEVEL SECURITY;', '0263 unexpected users/records RLS state'],
  ['REVOKE SELECT ON public.users FROM authenticated;', '0263 required owner/client privileges missing'],
  ['GRANT EXECUTE ON FUNCTION public.guard_record_embedding_write() TO supabase_auth_admin;', '0263 unexpected non-owner function ACL'],
  ['GRANT EXECUTE ON FUNCTION public.guard_record_embedding_delete() TO supabase_auth_admin;', '0263 unexpected non-owner function ACL'],
]) {
  const rejected = await start(`BEGIN; ${tamper} ${up} COMMIT;`).done;
  assert.notEqual(rejected.code, 0);
  assert(rejected.err.includes(message), rejected.err);
}
assert.equal(await run("SELECT relforcerowsecurity FROM pg_class WHERE oid='public.records'::regclass;"), 't');
pass('bad FORCE RLS, missing client SELECT and unexpected ACL abort installation without partial state');
// Replace table-wide access with all other columns: each trial lacks exactly
// one required column privilege, rather than masking it with a table grant.
for (const [table, column, privilege] of [
  ['users', 'privacy_prefs', 'SELECT'],
  ['records', 'user_id', 'SELECT'],
  ['records', 'embedding', 'SELECT'],
  ['records', 'embedding', 'UPDATE'],
  ['records', 'embedding_model', 'UPDATE'],
]) {
  const others = await run(`SELECT string_agg(quote_ident(attname),',' ORDER BY attnum)
    FROM pg_attribute WHERE attrelid='public.${table}'::regclass
    AND attnum>0 AND NOT attisdropped AND attname<>'${column}';`);
  const rejected = await start(`BEGIN;
    REVOKE ${privilege} ON public.${table} FROM authenticated;
    REVOKE ${privilege} (${column}) ON public.${table} FROM authenticated;
    GRANT ${privilege} (${others}) ON public.${table} TO authenticated;
    DO $$ BEGIN IF has_column_privilege('authenticated','public.${table}','${column}','${privilege}') THEN
      RAISE EXCEPTION 'test privilege was not removed'; END IF; END $$;
    ${up} COMMIT;`).done;
  assert.notEqual(rejected.code, 0, `installation accepted missing ${table}.${column} ${privilege}`);
  assert(rejected.err.includes('0263 required owner/client privileges missing'), rejected.err);
  assert.equal(await run(`SELECT has_column_privilege('authenticated','public.${table}','${column}','${privilege}');`), 't');
  pass(`installation rejects missing ${table}.${column} ${privilege}; privileges roll back`);
}

// Use the executable cleanup, including its preflight, against one malformed
// binding at a time. Even an empty database must reject before a sweep starts.
for (const [table, trigger] of [
  ['users', 'zz_records_embedding_consent_changed'],
  ['users', 'zz_records_embedding_consent_cas'],
  ['records', 'zz_records_embedding_write_guard'],
  ['records', 'zz_records_embedding_delete_guard'],
]) {
  const definition = await run(`SELECT pg_get_triggerdef(oid) FROM pg_trigger
    WHERE tgrelid='public.${table}'::regclass AND tgname='${trigger}';`);
  const recreate = (definition) => `DROP TRIGGER ${trigger} ON public.${table}; ${definition};`;
  for (const [label, tamper] of [
    ['disabled', `ALTER TABLE public.${table} DISABLE TRIGGER ${trigger};`],
    ['name', `ALTER TRIGGER ${trigger} ON public.${table} RENAME TO wrong_embedding_trigger;`],
    ['function', recreate(definition.replace(/EXECUTE FUNCTION .*$/, 'EXECUTE FUNCTION public.set_updated_at()'))],
    ['event', recreate(definition.includes('INSERT OR UPDATE')
      ? definition.replace('INSERT OR UPDATE', 'UPDATE')
      : definition.replace(/BEFORE|AFTER/, (timing) => timing === 'BEFORE' ? 'AFTER' : 'BEFORE'))],
    ['WHEN', recreate(definition.includes(' WHEN ')
      ? definition.replace(/ WHEN .* EXECUTE/, ' WHEN (true) EXECUTE')
      : definition.replace(' EXECUTE', ' WHEN (true) EXECUTE'))],
    ['columns', recreate(definition.replace('UPDATE ON', 'UPDATE OF id ON'))],
  ]) {
    const rejected = await start(`BEGIN; ${tamper}\n\\set after_user ''\n${cleanup.replace('BEGIN;', '').replace('COMMIT;', 'ROLLBACK;')}`).done;
    assert.notEqual(rejected.code, 0, `cleanup accepted ${trigger} ${label}`);
    assert(rejected.err.includes('install and verify 0263 before cleanup'), rejected.err);
    assert(!rejected.out.split(/\r?\n/).some((line) => line.startsWith('{')), 'cleanup returned a batch result before rejecting');
  }
  assert.equal(await run(`SELECT pg_get_triggerdef(oid) FROM pg_trigger
    WHERE tgrelid='public.${table}'::regclass AND tgname='${trigger}' AND tgenabled='O';`), definition);
  pass(`cleanup rejects ${trigger}: disabled/name/function/event/WHEN/columns (6); bindings roll back`);
}
if (mode === '--contracts-only') process.exit(0);

for (let n = 101; n <= 110; n++) await fixture(n);
// Two sessions: pause a revocation before commit, then deliver the old full
// true object. The waiter must see the committed revision, not resurrect ON.
const snapshot = await run(`SELECT privacy_prefs::text FROM public.users WHERE id='${id(110)}';`);
await race(off(110), `UPDATE public.users SET privacy_prefs='${snapshot}'::jsonb WHERE id='${id(110)}';
  ${insert(110)}`, 'embed_stale_full_true', 'records_embedding_consent_conflict');
assert.equal(await run(`SELECT privacy_prefs->'records_embedding' FROM public.users WHERE id='${id(110)}';`), 'false');
await empty(110);
pass('two-session stale full true after withdrawal reports conflict and cannot restore consent or vectors');

// Even an intentional ON prepared before a later OFF -> OFF must conflict.
const expected = Number(await run(`SELECT privacy_prefs->>'records_embedding_revision' FROM public.users WHERE id='${id(110)}';`)) + 1;
const revoker110 = start(`BEGIN; ${off(110)}`, { hold: true });
try {
  await revoker110.ready;
  const pending = start(`SET application_name='embed_stale_cas'; UPDATE public.users SET privacy_prefs=
    '{"records_embedding":true,"records_embedding_enable_revision":${expected}}' WHERE id='${id(110)}';`);
  await observeWait('embed_stale_cas');
  revoker110.finish();
  assert.equal((await revoker110.done).code, 0);
  const rejected = await pending.done;
  assert.notEqual(rejected.code, 0);
  assert(rejected.err.includes('records_embedding_consent_conflict'), rejected.err);
} finally { revoker110.finish(); await revoker110.done; }
await run(on(110));
assert.equal(await run(`SELECT privacy_prefs->'records_embedding' FROM public.users WHERE id='${id(110)}';`), 'true');
pass('two-session stale explicit enable conflicts; fresh CAS enables after withdrawal');
await race(insert(101), off(101), 'embed_write_first');
await empty(101);
pass('write-first SHARE lock blocks withdrawal; committed late INSERT is cleared');
await run(insert(102));
await race(off(102), insert(102, 202), 'embed_revoke_first');
await empty(102);
pass('withdrawal-first blocks INSERT; post-wait current OFF clears candidate');
await race(`UPDATE public.users SET display_name='fixture' WHERE id='${id(103)}';`, insert(103), 'embed_profile_wait');
assert.equal(await run(`SELECT embedding IS NOT NULL FROM public.records WHERE id='${rid(103)}';`), 't');
pass('unrelated user UPDATE also serializes candidate writes');

await run(insert(104));
const writer = start(`BEGIN; SELECT 1 FROM public.records WHERE id='${rid(104)}' FOR UPDATE;`, { hold: true });
try {
  await writer.ready;
  const revoker = start(`SET application_name='embed_deadlock'; ${off(104)}`);
  await observeWait('embed_deadlock');
  writer.finish(`UPDATE public.records SET embedding=${vec},embedding_model='racing' WHERE id='${rid(104)}'; COMMIT;`);
  const results = await Promise.all([writer.done, revoker.done]);
  assert.equal(results.filter((r) => r.code !== 0 && r.err.includes('deadlock detected')).length, 1);
  assert.equal(results.filter((r) => r.code === 0).length, 1);
  assert.equal(await run(`SELECT (u.privacy_prefs->'records_embedding'='true'::jsonb) = (r.embedding IS NOT NULL)
    FROM public.users u JOIN public.records r ON r.user_id=u.id WHERE r.id='${rid(104)}';`), 't');
  await run(off(104)); await empty(104);
  pass('observed lock inversion deadlock rolls back one whole transaction; retry converges');
} finally { writer.finish('ROLLBACK;'); await writer.done; }

await fixture(113);
await run(`BEGIN; ${off(113)} ALTER TABLE public.records DISABLE TRIGGER zz_records_embedding_write_guard;
  ${insert(113)} ALTER TABLE public.records ENABLE TRIGGER zz_records_embedding_write_guard; COMMIT;`);
for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
  await run(on(105));
  for (const operation of [off(105), insert(105),
    `UPDATE public.records SET embedding=NULL,embedding_model=NULL WHERE user_id='${id(103)}';`,
    `UPDATE public.records SET embedding=NULL,embedding_model=NULL WHERE user_id='${id(113)}';`]) {
    const result = await start(`BEGIN ISOLATION LEVEL ${isolation}; ${operation} COMMIT;`).done;
    assert.notEqual(result.code, 0);
    assert(result.err.includes('records_embedding_requires_read_committed'), result.err);
  }
}
await run(`UPDATE public.records SET embedding=NULL,embedding_model=NULL WHERE user_id='${id(113)}';`);
await empty(113);
pass('non-READ-COMMITTED writes/withdrawals/complete-pair deletes reject stale snapshots');

// An old client pauses its whole-user NULL request after OFF. Another session
// re-enables and rebuilds before it arrives. The server must keep the new pair.
await run(`${insert(106)} ${off(106)}`);
const oldClear = start('BEGIN;', { hold: true });
try {
  await oldClear.ready;
  await run(`${on(106)} UPDATE public.records SET embedding=${vec},embedding_model='new-generation'
    WHERE id='${rid(106)}';`);
  oldClear.finish(`UPDATE public.records SET embedding=NULL,embedding_model=NULL
    WHERE user_id='${id(106)}' AND embedding IS NOT NULL; COMMIT;`);
  assert.equal((await oldClear.done).code, 0);
} finally { oldClear.finish('ROLLBACK;'); await oldClear.done; }
assert.equal(await run(`SELECT embedding=${vec} AND embedding_model='new-generation'
  FROM public.records WHERE id='${rid(106)}';`), 't');
pass('two-session delayed old whole-user NULL after re-enable preserves the new vector/model');
// A NULL candidate waits on a user UPDATE, then keeps the pair after ON commits.
// The OFF-to-ON case below isolates the delete guard's SHARE: the later write
// guard cannot mask a missing lock by waiting after an already-ON restoration.
await race(on(106), `UPDATE public.records SET embedding=NULL,embedding_model=NULL
  WHERE user_id='${id(106)}';`, 'embed_delete_wait');
assert.equal(await run(`SELECT embedding_model FROM public.records WHERE id='${rid(106)}';`), 'new-generation');
pass('complete-pair deletion waits for current user with SHARE before preserving ON');
await fixture(112);
await run(`BEGIN; ${off(112)} ALTER TABLE public.records DISABLE TRIGGER zz_records_embedding_write_guard;
  ${insert(112)} ALTER TABLE public.records ENABLE TRIGGER zz_records_embedding_write_guard; COMMIT;`);
await race(on(112), `UPDATE public.records SET embedding=NULL,embedding_model=NULL
  WHERE user_id='${id(112)}';`, 'embed_delete_off_to_on');
assert.equal(await run(`SELECT embedding IS NOT NULL AND embedding_model='model-a'
  FROM public.records WHERE id='${rid(112)}';`), 't');
pass('NULL deletion rechecks OFF-to-ON after actual SHARE wait, not the pre-lock snapshot');
await run(`UPDATE public.records SET embedding=${vec},embedding_model='new' WHERE id='${rid(106)}'; ${off(106)}`);
await empty(106);
pass('explicit false preference still withdraws and clears the pair atomically');

// Seed pre-install leftovers only: disabling the guard is confined to this test
// transaction. Two users prove that a zero-row locked batch advances the cursor.
await run(`BEGIN; ${off(107)} ${off(108)}
  ALTER TABLE public.records DISABLE TRIGGER zz_records_embedding_write_guard;
  ${insert(107)} ${insert(108)}
  INSERT INTO public.records(user_id,kind,body,embedding_model)
    SELECT '${id(108)}','note','historical half','orphan' FROM generate_series(1,501);
  ALTER TABLE public.records ENABLE TRIGGER zz_records_embedding_write_guard; COMMIT;`);
const batch = (cursor) => `\\set after_user '${cursor}'\n${cleanup}`;
const json = (out) => JSON.parse(out.split(/\r?\n/).find((line) => line.startsWith('{')));
const locked = start(`BEGIN; SELECT 1 FROM public.records WHERE id='${rid(107)}' FOR UPDATE;`, { hold: true });
try {
  await locked.ready;
  const zero = json(await run(batch('')));
  assert.deepEqual(zero, { next_user: id(107), cleared: 0, end_of_sweep: false });
  const next = json(await run(batch(zero.next_user)));
  assert.deepEqual(next, { next_user: id(108), cleared: 500, end_of_sweep: false });
  assert.equal(json(await run(batch(next.next_user))).end_of_sweep, true);
} finally { locked.finish(); await locked.done; }
assert.equal(json(await run(batch(''))).cleared, 1);
assert.equal(json(await run(batch(id(107)))).cleared, 2);
await empty(107); await empty(108);
pass('cleanup: <=500, zero-row locked user advances cursor, next sweep finishes skipped and remaining rows');

// Re-enable before cleanup selection: fresh allowed complete pairs must remain.
await run(`BEGIN; ${off(109)} ALTER TABLE public.records DISABLE TRIGGER zz_records_embedding_write_guard;
  ${insert(109)} ALTER TABLE public.records ENABLE TRIGGER zz_records_embedding_write_guard; COMMIT;`);
const toggler = start(`BEGIN; ${on(109)}`, { hold: true });
try {
  await toggler.ready;
  assert.equal(json(await run(batch(id(108)))).end_of_sweep, true);
} finally { toggler.finish(); await toggler.done; }
assert.equal(json(await run(batch(id(108)))).end_of_sweep, true);
assert.equal(await run(`SELECT embedding IS NOT NULL FROM public.records WHERE id='${rid(109)}';`), 't');
pass('cleanup skips locked user, rechecks current eligibility on next sweep after ON');

// F-09: legitimate cleanup while consent is ON. Keep the complete pair, clear
// the historical half pair. A blanket ON => reject NULL guard breaks this path.
await fixture(111);
await run(`BEGIN; ${insert(111)} ALTER TABLE public.records DISABLE TRIGGER zz_records_embedding_write_guard;
  INSERT INTO public.records(user_id,kind,body,embedding_model) VALUES('${id(111)}','note','half','orphan');
  ALTER TABLE public.records ENABLE TRIGGER zz_records_embedding_write_guard; COMMIT;`);
assert.equal(json(await run(batch(id(110)))).cleared, 1);
assert.equal(await run(`SELECT count(*) FROM public.records WHERE user_id='${id(111)}' AND embedding IS NOT NULL;`), '1');
assert.equal(await run(`SELECT privacy_prefs->'records_embedding' FROM public.users WHERE id='${id(111)}';`), 'true');
pass('normal ON cleanup clears historical half pair and preserves complete pair');

const otherTriggers = `SELECT tgrelid::regclass::text||':'||tgname||':'||tgfoid::text||':'||tgenabled::text
  FROM pg_trigger WHERE tgrelid IN ('public.users'::regclass,'public.records'::regclass)
  AND tgname NOT IN ('zz_records_embedding_write_guard','zz_records_embedding_delete_guard','zz_records_embedding_consent_changed','zz_records_embedding_consent_cas') ORDER BY 1;`;
const before = await run(otherTriggers);
const ledger = await run('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;');
await run(`BEGIN; ${dropTestObjects}
  DO $$ BEGIN IF to_regprocedure('public.guard_records_embedding_consent()') IS NOT NULL THEN
    RAISE EXCEPTION 'test DROP failed'; END IF; END $$;
  ROLLBACK;`);
assert.equal(await run("SELECT to_regprocedure('public.guard_records_embedding_consent()') IS NOT NULL;"), 't');
// Local container's postgres DB has a production-like name. The unchanged SQL
// must fail BEFORE any DROP; even an unexpectedly accepted call is rolled back.
const refused = await start(`BEGIN; ${dropTestObjects} ROLLBACK;`, { targetDatabase: 'postgres' }).done;
assert.notEqual(refused.code, 0);
assert(refused.err.includes('disposable embedding test database required'), `database fence must reject before DROP: ${refused.err}`);
await run(`BEGIN; ${dropTestObjects} ${up} COMMIT;`);
assert.equal(await run(otherTriggers), before);
assert.equal(await run('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'), ledger);
await run(regression);
pass('inline disposable DROP/reapply: caller rollback, DB-name refusal, unchanged ledger and other triggers');
if (mode === '--skip-performance') {
  process.stdout.write(`PASS ${checks} executed groups; performance skipped explicitly\n`);
  process.exit(0);
}

// Real indexes, all pre-existing triggers, and 768-dimensional vectors remain.
// Not a production latency claim. Fixtures are left in the disposable DB.
for (const count of [0, 1000, 10000, 100000]) {
  const n = 200000 + count;
  await fixture(n);
  await run(`SET statement_timeout='180s'; INSERT INTO public.records(user_id,kind,body,embedding,embedding_model)
    SELECT '${id(n)}','note','load fixture',${vec},'load-model' FROM generate_series(1,${count});`, { timeout: 200_000 });
  await run(`ANALYZE public.records;
    SELECT pg_stat_reset_single_function_counters('public.guard_record_embedding_write()'::regprocedure);
    SELECT pg_stat_reset_single_function_counters('public.guard_record_embedding_delete()'::regprocedure);
    SELECT pg_stat_reset_single_function_counters('public.set_updated_at()'::regprocedure);`);
  const result = await run(`SET track_functions='all'; BEGIN;
    CREATE TEMP TABLE embed_perf_start AS SELECT clock_timestamp() AS at, pg_current_wal_insert_lsn() AS lsn;
    ${off(n)}
    SELECT json_build_object('rows',${count},'withdraw_ms',round((extract(epoch FROM clock_timestamp()-s.at)*1000)::numeric,3),
      'wal_bytes',pg_wal_lsn_diff(pg_current_wal_insert_lsn(),s.lsn)) FROM embed_perf_start s;
    COMMIT; SELECT pg_stat_force_next_flush();`, { timeout: 45_000 });
  const metrics = json(result);
  const guardCalls = Number(await run("SELECT COALESCE((SELECT calls FROM pg_stat_user_functions WHERE funcid='public.guard_record_embedding_write()'::regprocedure),0);"));
  const updatedAtCalls = Number(await run("SELECT COALESCE((SELECT calls FROM pg_stat_user_functions WHERE funcid='public.set_updated_at()'::regprocedure),0);"));
  const deleteGuardCalls = Number(await run("SELECT COALESCE((SELECT calls FROM pg_stat_user_functions WHERE funcid='public.guard_record_embedding_delete()'::regprocedure),0);"));
  assert.equal(guardCalls, 0, 'NULL withdrawal must not invoke new write guard per row');
  assert.equal(deleteGuardCalls, count, 'complete-pair withdrawal checks the current OFF owner');
  assert.equal(updatedAtCalls, count + 1, 'existing record/user updated_at trigger still runs');
  await empty(n);
  process.stdout.write(`PERF ${JSON.stringify({ ...metrics, write_guard_calls: guardCalls, delete_guard_calls: deleteGuardCalls, updated_at_calls: updatedAtCalls })}\n`);
}
pass('0/1k/10k/100k real-index withdrawals: zero residuals, zero new write-guard calls');
process.stdout.write(`PASS ${checks} executed groups; production operations and model calls: 0\n`);
