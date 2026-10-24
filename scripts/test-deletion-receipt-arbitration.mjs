// Loopback disposable PG only. Never loads dotenv or accepts a remote DB URL.
// Local: node scripts/test-deletion-receipt-arbitration.mjs 55484 t04_arbitration_test_local --fixture
// CI: same runner without --fixture, on a fresh clone of the full current schema.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [port, database, mode] = process.argv.slice(2);
assert(/^\d{4,5}$/.test(port ?? '') && Number(port) <= 65535 && Number(port) > 0
  && /^t04_arbitration_test_[a-z0-9_]+$/.test(database ?? '')
  && (mode === undefined || mode === '--fixture'), 'Use a loopback port and disposable t04_arbitration_test_* database');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const draft = 'db/migration-drafts/UNNUMBERED_account_deletion_receipt_arbitration.sql';
const up = read(draft);
const downFile = read(draft.replace('UNNUMBERED_', 'rollback/UNNUMBERED_').replace('.sql', '_down.sql'));
// Sandbox mutations inside caller-owned transactions; separately test the actual standalone down.
const down = downFile.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
const base = read('db/migration-drafts/UNNUMBERED_account_deletion_receipt_contract.sql');
const regression = read('db/migration-drafts/tests/account-deletion-receipt-arbitration.sql');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key) || key === 'PGPASSWORD'));
const args = (db) => ['-X', '--no-password', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', db,
  '-Atq', '-v', 'ON_ERROR_STOP=1'];
function connection(db = database) {
  const child = spawn('psql', args(db), { env, cwd: root, timeout: 30_000 });
  let out = ''; let err = ''; const waiters = new Map();
  const done = new Promise((resolveResult, reject) => {
    child.stdout.on('data', data => {
      out += data;
      for (const [marker, resolveMarker] of waiters) {
        if (out.split(/\r?\n/).includes(marker)) { waiters.delete(marker); resolveMarker(); }
      }
    });
    child.stderr.on('data', data => { err += data; });
    child.on('error', reject);
    child.on('close', code => resolveResult({ code, out: out.trim(), err }));
  });
  child.stdin.write("SET statement_timeout='15s'; SET lock_timeout='12s';\n");
  return {
    done,
    send: sql => child.stdin.write(`${sql}\n`),
    end: sql => child.stdin.end(sql),
    async marker(marker) {
      if (out.split(/\r?\n/).includes(marker)) return;
      await Promise.race([
        new Promise(resolveMarker => waiters.set(marker, resolveMarker)),
        done.then(result => { throw new Error(`Missing ${marker}: ${result.err}`); }),
      ]);
    },
  };
}
async function run(sql, db = database) {
  const c = connection(db); c.end(sql); return c.done;
}
async function ok(sql, db = database) {
  const r = await run(sql, db); assert.equal(r.code, 0, r.err); return r.out;
}
async function rejected(sql, message) {
  const r = await run(sql); assert.notEqual(r.code, 0, `Expected rejection: ${message}`);
  assert(r.err.includes(message), r.err);
}
let groups = 0;
const pass = name => { groups++; console.log(`PASS ${name}`); };
const service = "SET ROLE service_role; SET request.jwt.claim.role='service_role';";
const owner = n => `de1e7104-0000-4000-9101-${String(n).padStart(12, '0')}`;
const session = n => `de1e7104-0000-4000-9102-${String(n).padStart(12, '0')}`;
const begin = n => `SELECT public.begin_account_deletion_receipt('${owner(n)}','${session(n)}',clock_timestamp(),
  '${owner(n)}','v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'));`;
const legacy = (n, wrapper = false) => `SELECT public.${wrapper ? 'verify_account_deletion_session' : 'begin_account_deletion'}(
  '${owner(n)}','${session(n)}',clock_timestamp());`;
const directReceipt = n => `INSERT INTO deletion_receipt_private.accepted_requests
  (owner_id,session_id,request_id,key_version,lookup_hash,recovery_hash)
  VALUES('${owner(n)}','${session(n)}','${owner(n)}','v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'));`;
const directFence = n => `INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES('${owner(n)}','${session(n)}');`;
async function fixture(n) {
  await ok(`INSERT INTO auth.users(id,email) VALUES('${owner(n)}','arb-${n}@example.invalid');
    INSERT INTO public.users(id,email,birth_date,locale) VALUES('${owner(n)}','arb-${n}@example.invalid','1990-01-01','en');
    INSERT INTO auth.sessions(id,user_id) VALUES('${session(n)}','${owner(n)}');`);
}

if (mode === '--fixture') {
  await ok(`CREATE DATABASE ${database};`, 'postgres');
  // psql resolves these includes from this explicit cwd, not from an env URL.
  await ok('\\i db/migration-drafts/tests/account-deletion-receipt-arbitration-bootstrap.sql');
}
await ok(`BEGIN; ${base} COMMIT;`);
await ok(read('db/migration-drafts/tests/account-deletion-receipt-contract.sql'));
pass('existing accepted-only behavioral SQL regression before arbitration');
// Preserve every pre-existing public routine and trigger, including 0192/0225
// and Storage in CI. The local fixture only provides 0192 and small DB tables.
const existingSnapshot = `SELECT jsonb_build_object('routines',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage')),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t
    WHERE t.tgname NOT IN ('receipt_admission_arbitration','legacy_admission_arbitration')));`;
const existing = await ok(existingSnapshot);
await ok(`BEGIN; ${up} COMMIT;`);
await ok(`BEGIN; ${up} COMMIT;`);
assert.equal(await ok(existingSnapshot), existing, 'existing routines or triggers changed');
await ok(regression);
pass('repeat apply, ACL/RLS, both entrypoints, same-owner exclusion, other owner, immutable bindings, no deletion/completion');
await rejected(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${up}`, 'receipt_arbitration_requires_read_committed');
await rejected(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${down}`, 'receipt_arbitration_requires_read_committed');

// Empty pre-activation rollback is reversible and preserves the base contract.
await ok(downFile);
const noArbitration = `SELECT to_regprocedure('deletion_receipt_private.guard_legacy_admission()') IS NULL
  AND to_regprocedure('deletion_receipt_private.guard_receipt_admission()') IS NULL
  AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('receipt_admission_arbitration','legacy_admission_arbitration'));`;
assert.equal(await ok(noArbitration), 't');
await ok(`BEGIN; ${up} COMMIT;`);
assert.equal(await ok(existingSnapshot), existing);
pass('empty rollback/reapply preserves existing routines and triggers');

for (let n = 1; n <= 12; n++) await fixture(n);
async function waitForBlock(label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await ok(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity f JOIN pg_stat_activity l
      ON l.pid=ANY(pg_blocking_pids(f.pid)) WHERE f.datname=current_database()
      AND f.application_name='${label}' AND l.application_name='t04_arb_leader');`) === 't') return;
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error(`No actual blocking observed: ${label}`);
}
async function race(n, first, second, commit, expectedError) {
  const leader = connection();
  leader.send(`SET application_name='t04_arb_leader'; BEGIN; ${first} SELECT 'ARB_HELD';`);
  try {
    await leader.marker('ARB_HELD');
    const follower = run(`SET application_name='t04_arb_follower_${n}'; ${second}`);
    await waitForBlock(`t04_arb_follower_${n}`);
    leader.end(commit ? 'COMMIT;' : 'ROLLBACK;');
    assert.equal((await leader.done).code, 0);
    const result = await follower;
    if (expectedError) {
      assert.notEqual(result.code, 0); assert(result.err.includes(expectedError), result.err);
    } else assert.equal(result.code, 0, result.err);
    assert.equal(await ok(`SELECT NOT EXISTS(SELECT 1 FROM deletion_receipt_private.accepted_requests r
      JOIN public.account_deletion_tombstones t ON t.user_id=r.owner_id WHERE r.owner_id='${owner(n)}');`), 't');
  } finally { leader.end(); await leader.done; }
}
await race(1, `${service} ${begin(1)}`, `${service} ${legacy(1)}`, true, 'receipt_request_in_progress');
await race(2, `${service} ${begin(2)}`, `${service} ${legacy(2, true)}`, true, 'receipt_request_in_progress');
await race(3, `${service} ${legacy(3)}`, `${service} ${begin(3)}`, true, 'receipt_legacy_fence_unresolved');
await race(4, `${service} ${legacy(4, true)}`, `${service} ${begin(4)}`, true, 'receipt_legacy_fence_unresolved');
pass('four actual blocked schedules: new/legacy first through both legacy entrypoints');
await race(5, `${service} ${begin(5)}`, `${service} ${legacy(5)}`, false);
await race(6, `${service} ${legacy(6)}`, `${service} ${begin(6)}`, false);
pass('two actual blocked schedules: rolled-back winner permits opposite admission');
await race(7, directReceipt(7), directFence(7), true, 'receipt_request_in_progress');
await race(8, directFence(8), directReceipt(8), true, 'receipt_legacy_fence_unresolved');
pass('two actual blocked schedules: direct trusted writers obey the same owner lock');
const unrelatedLeader = connection();
try {
  unrelatedLeader.send(`BEGIN; ${service} ${begin(12)} SELECT 'OTHER_OWNER_HELD';`);
  await unrelatedLeader.marker('OTHER_OWNER_HELD');
  await ok(`SET lock_timeout='500ms'; ${service} ${legacy(9)}`);
} finally { unrelatedLeader.end('ROLLBACK;'); await unrelatedLeader.done; }
const receipt = await ok(`${service} ${begin(1)}`);
assert.equal(await ok(`${service} ${begin(1)}`), receipt);
await ok(`${service} ${legacy(9)}`);
assert.equal(await ok(`${service} ${begin(1)}`), receipt);
pass('identical receipt retry and other-owner legacy admission remain available');

for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
  await rejected(`BEGIN ISOLATION LEVEL ${isolation}; ${service} ${begin(10)}`, 'receipt_admission_requires_read_committed');
  await rejected(`BEGIN ISOLATION LEVEL ${isolation}; ${service} ${legacy(10)}`, 'receipt_admission_requires_read_committed');
}
pass('both admissions refuse transaction snapshots that can predate lock waits');
const ledgers = 'SELECT row_to_json(r) FROM deletion_receipt_private.accepted_requests r ORDER BY owner_id; SELECT row_to_json(t) FROM public.account_deletion_tombstones t ORDER BY user_id;';
const beforeRollback = await ok(ledgers);
await rejected(`BEGIN; ${down} COMMIT;`, 'receipt_arbitration_rollback_requires_empty_ledger');
assert.equal(await ok(ledgers), beforeRollback);
await rejected(`${service} ${legacy(1)}`, 'receipt_request_in_progress');
const plain = await run(`\\set ON_ERROR_STOP off
${downFile}`);
assert.equal(plain.code, 0, plain.err);
assert(plain.err.includes('receipt_arbitration_rollback_requires_empty_ledger'), plain.err);
assert.equal(await ok(ledgers), beforeRollback);
await rejected(`${service} ${legacy(1)}`, 'receipt_request_in_progress');
pass('nonempty rollback refuses even with default psql error handling and preserves both guards');

const conflict = `BEGIN; ALTER TABLE deletion_receipt_private.accepted_requests DISABLE TRIGGER receipt_admission_arbitration;
  ALTER TABLE public.account_deletion_tombstones DISABLE TRIGGER legacy_admission_arbitration;
  ${directReceipt(11)} ${directFence(11)} `;
await rejected(conflict + up, 'receipt_arbitration_reconciliation_required');
assert.equal(await ok(ledgers), beforeRollback);
pass('install refuses pre-existing dual ownership and rolls back without adopting a fence');

// DDL must never queue ACCESS EXCLUSIVE behind a reader (and stall later readers).
for (const table of ['deletion_receipt_private.accepted_requests', 'public.account_deletion_tombstones']) {
  const reader = connection();
  try {
    reader.send(`BEGIN; SELECT count(*) FROM ${table}; SELECT 'READER_HELD';`);
    await reader.marker('READER_HELD');
    for (const source of [up, downFile]) {
      const r = await run(`BEGIN; SET lock_timeout='500ms'; ${source}`);
      assert.notEqual(r.code, 0);
      assert(r.err.includes('could not obtain lock on relation'), r.err);
    }
    await ok(`SET lock_timeout='500ms'; SELECT count(*) FROM ${table};`);
  } finally { reader.end('ROLLBACK;'); await reader.done; }
}
pass('up/down fail NOWAIT behind either reader without queuing DDL');

// Execute SQL mutants in rolled-back transactions, not string-presence tests.
const mutants = [
  ['legacy receipt exclusion', up.replace('WHERE r.owner_id = NEW.user_id', 'WHERE false')],
  ['new fence exclusion', up.replace('WHERE t.user_id = NEW.owner_id', 'WHERE false')],
  ['legacy owner binding', up.replace("TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id", 'false')],
  ['new owner binding', up.replace("TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id", 'false')],
  ['helper ACL', up.replace('FROM PUBLIC, anon, authenticated, service_role;', 'FROM anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION deletion_receipt_private.guard_legacy_admission() TO service_role;')],
];
let killed = 0;
for (const [name, sql] of mutants) {
  assert.notEqual(sql, up, `mutation anchor missing: ${name}`);
  const r = await run(`BEGIN; ${sql}\n${regression}`);
  assert.notEqual(r.code, 0, `SURVIVED ${name}`);
  assert(/expected error|trigger helper exposed/.test(r.err), `unrelated mutant failure: ${r.err}`);
  killed++; console.log(`KILLED ${name}`);
}
function mutateAfter(source, marker, old, replacement) {
  const start = source.indexOf(marker); assert(start >= 0, `missing marker ${marker}`);
  const index = source.indexOf(old, start); assert(index >= 0, `missing mutation anchor ${old}`);
  return source.slice(0, index) + replacement + source.slice(index + old.length);
}
const isolationCheck = "pg_catalog.current_setting('transaction_isolation') <> 'read committed'";
for (const [marker, call] of [['AS $receipt_guard$', begin(10)], ['AS $legacy_guard$', legacy(10)]]) {
  try {
    await ok(`BEGIN; ${mutateAfter(up, marker, isolationCheck, 'false')} COMMIT;`);
    const r = await run(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${service} ${call} ROLLBACK;`);
    assert.equal(r.code, 0, r.err); // Baseline rejected these exact calls above.
    killed++; console.log(`KILLED snapshot isolation ${marker}`);
  } finally { await ok(`BEGIN; ${up} COMMIT;`); }
}
for (const [marker, source] of [['DO $preflight$', up], ['DO $rollback_guard$', down]]) {
  // Both installers must reject a stale transaction snapshot before inspecting
  // either ledger. Temporarily empty only this disposable transaction for down.
  const empty = source === down ? 'DELETE FROM deletion_receipt_private.accepted_requests;' : '';
  const r = await run(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${empty}
    ${mutateAfter(source, marker, isolationCheck, 'false')} ROLLBACK;`);
  assert.equal(r.code, 0, r.err); killed++; console.log(`KILLED installer snapshot ${marker}`);
}
for (const [column, first, second] of [
  ['user_id', directReceipt(12), directFence(12)],
  ['owner_id', directFence(12), directReceipt(12)],
]) {
  const lock = `PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.${column}::text, 260913));`;
  const noLock = up.replace(lock, 'NULL;'); assert.notEqual(noLock, up);
  const leader = connection();
  try {
    await ok(`BEGIN; ${noLock} COMMIT;`);
    leader.send(`BEGIN; ${first} SELECT 'MUTANT_HELD';`);
    await leader.marker('MUTANT_HELD');
    // Canonical SQL blocked on this boundary above. Without its lock the other
    // row is admitted while the winner is uncommitted. Roll both rows back.
    const r = await run(`BEGIN; SET lock_timeout='500ms'; ${second} ROLLBACK;`);
    assert.equal(r.code, 0, r.err);
    killed++; console.log(`KILLED owner advisory lock ${column}`);
  } finally {
    leader.end('ROLLBACK;'); await leader.done;
    await ok(`BEGIN; ${up} COMMIT;`);
  }
}
const noPreflight = up.replace('ON t.user_id = r.owner_id', 'ON false');
assert.notEqual(noPreflight, up);
assert.equal((await run(conflict + noPreflight + 'ROLLBACK;')).code, 0);
killed++; console.log('KILLED existing conflict preflight');
const noRollbackGuard = down.replace('IF EXISTS (SELECT 1 FROM deletion_receipt_private.accepted_requests)', 'IF false');
assert.notEqual(noRollbackGuard, down);
assert.equal((await run(`BEGIN; ${noRollbackGuard} ROLLBACK;`)).code, 0);
killed++; console.log('KILLED nonempty rollback guard');
// Review lows: each failure must be witnessed by the actual post-down catalog.
const receiptResidue = down.replace('DROP TRIGGER IF EXISTS receipt_admission_arbitration ON deletion_receipt_private.accepted_requests;', '')
  .replace('DROP FUNCTION IF EXISTS deletion_receipt_private.guard_receipt_admission();', '');
const residueResult = await ok(`BEGIN; DELETE FROM deletion_receipt_private.accepted_requests; ${receiptResidue} ${noArbitration} ROLLBACK;`);
assert.equal(residueResult, 'f');
killed++; console.log('KILLED receipt trigger/function rollback residue');
// Missing standalone transaction reproduced with default psql error handling.
const unwrapped = await run(`\\set ON_ERROR_STOP off
${down}`);
assert.equal(unwrapped.code,0);
assert.equal(await ok(noArbitration),'t'); // Canonical plain down kept both guards above.
killed++; console.log('KILLED down missing standalone transaction');
await ok(`BEGIN; ${up} COMMIT;`);
for (const [name, source] of [['reapply',up],['down',down]]) {
  const reader=connection();
  try {
    reader.send("BEGIN; SELECT count(*) FROM public.account_deletion_tombstones; SELECT 'LOCK_MUTANT_HELD';");
    await reader.marker('LOCK_MUTANT_HELD');
    const weak=source.replace('ACCESS EXCLUSIVE MODE NOWAIT','SHARE ROW EXCLUSIVE MODE NOWAIT');
    const r=await run(`BEGIN; SET lock_timeout='300ms'; DELETE FROM deletion_receipt_private.accepted_requests; ${weak}`);
    assert.notEqual(r.code,0); assert(r.err.includes('canceling statement due to lock timeout'),r.err);
    killed++; console.log(`KILLED ${name} lock escalation wait`);
  } finally { reader.end('ROLLBACK;'); await reader.done; }
}
assert.equal(await ok(ledgers), beforeRollback);
assert.equal(await ok(existingSnapshot), existing);
console.log(`PASS ${groups} groups; 8 observed blocking schedules; SQL mutants killed ${killed}/${mutants.length + 12}; external Auth/Storage calls 0`);
