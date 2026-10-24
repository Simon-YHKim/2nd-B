// Loopback disposable PG only. Never loads dotenv or accepts a remote DB URL.
// Local: node scripts/test-deletion-receipt-terminal.mjs 55764 t04_arbitration_test_terminal_local --fixture
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
const read = (file) => readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n');
const draft = 'db/migration-drafts/UNNUMBERED_account_deletion_receipt_terminal.sql';
const upFile = read(draft);
const up = upFile.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
const arbitration = read('db/migration-drafts/UNNUMBERED_account_deletion_receipt_arbitration.sql');
const arbitrationDown = read('db/migration-drafts/rollback/UNNUMBERED_account_deletion_receipt_arbitration_down.sql')
  .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
const downFile = read(draft.replace('UNNUMBERED_', 'rollback/UNNUMBERED_').replace('.sql', '_down.sql'));
// Sandbox mutations inside caller-owned transactions; separately test the actual standalone down.
const down = downFile.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
const base = read('db/migration-drafts/UNNUMBERED_account_deletion_receipt_contract.sql');
const regression = read('db/migration-drafts/tests/account-deletion-receipt-terminal.sql');
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
  await ok('\\i db/migration-drafts/tests/account-deletion-receipt-arbitration-bootstrap.sql');
}
await ok(`BEGIN; ${base} COMMIT;`);
const ledgers='SELECT row_to_json(r) FROM deletion_receipt_private.accepted_requests r ORDER BY owner_id,request_id; SELECT row_to_json(t) FROM public.account_deletion_tombstones t ORDER BY user_id;';
// Include definitions, ACL, columns/defaults, constraints, indexes and both ledgers.
// A failed installation must leave all of them byte-for-byte unchanged.
const installSnapshot = `SELECT jsonb_build_object(
  'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='deletion_receipt_private' OR p.proname IN ('begin_account_deletion_receipt','lookup_account_deletion_receipt')),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t),
  'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid='deletion_receipt_private.accepted_requests'::regclass),
  'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid='deletion_receipt_private.accepted_requests'::regclass),
  'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.conrelid='deletion_receipt_private.accepted_requests'::regclass),
  'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid='deletion_receipt_private.accepted_requests'::regclass),
  'table_acl',(SELECT relacl FROM pg_class WHERE oid='deletion_receipt_private.accepted_requests'::regclass),
  'schema_acl',(SELECT nspacl FROM pg_namespace WHERE nspname='deletion_receipt_private'));
  ${ledgers}`;
let orderProbes = 0;
async function refuseUnchanged(name, setup, sql, message) {
  const before = await ok(installSnapshot);
  await rejected(`BEGIN; ${setup} ${sql}`, message);
  assert.equal(await ok(installSnapshot), before, `${name}: state changed after refusal`);
  // Remove this guard in the exact historical state just tested. The same
  // rejection assertion must fail, not a connection/syntax/other SQL error.
  const changed = sql.replace(new RegExp(`RAISE EXCEPTION USING ERRCODE\\s*=\\s*'55000', MESSAGE\\s*=\\s*'${message}';`), 'NULL;');
  assert.notEqual(changed,sql,`missing refusal mutation ${name}`);
  await assert.rejects(rejected(`BEGIN; ${setup} ${changed}`,message), /Expected rejection/);
  assert.equal(await ok(installSnapshot),before,`${name}: mutation escaped rollback`);
  orderProbes++; console.log(`KILLED refusal ${name}`);
}
await refuseUnchanged('terminal without arbitration', '', up, 'receipt_terminal_requires_arbitration');
await ok(`BEGIN; ${arbitration} COMMIT;`);
for (const [trigger, table] of [
  ['receipt_admission_arbitration','deletion_receipt_private.accepted_requests'],
  ['legacy_admission_arbitration','public.account_deletion_tombstones'],
]) {
  await refuseUnchanged(`terminal missing ${trigger}`, `DROP TRIGGER ${trigger} ON ${table};`, up,
    'receipt_terminal_requires_arbitration');
  await refuseUnchanged(`terminal disabled ${trigger}`, `ALTER TABLE ${table} DISABLE TRIGGER ${trigger};`, up,
    'receipt_terminal_requires_arbitration');
}
const existingSnapshot = `SELECT jsonb_build_object('routines',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage')
  AND p.proname NOT IN ('begin_account_deletion_receipt','lookup_account_deletion_receipt')),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t));`;
const existing = await ok(existingSnapshot);
await ok(upFile);
await ok(upFile);
await refuseUnchanged('arbitration after terminal', '', arbitration, 'receipt_arbitration_terminal_already_installed');
// Either durable terminal marker independently prevents downgrading guards.
await refuseUnchanged('arbitration with column marker only',
  'ALTER TABLE deletion_receipt_private.accepted_requests DROP CONSTRAINT receipt_terminal_shape;', arbitration,
  'receipt_arbitration_terminal_already_installed');
await refuseUnchanged('arbitration with constraint marker only',
  'ALTER TABLE deletion_receipt_private.accepted_requests RENAME COLUMN admission_expires_at TO hidden_expiry;', arbitration,
  'receipt_arbitration_terminal_already_installed');
await refuseUnchanged('arbitration down before terminal down', '', arbitrationDown, 'receipt_arbitration_terminal_requires_retirement');
pass('installation/reapplication/rollback order refusals preserve complete catalog and both ledgers');
assert.equal(await ok(existingSnapshot), existing, 'existing routines/triggers changed');
await ok(regression);
pass('terminal states, independent evidence, ACL, expiry release, retention, replay and legacy invariants');

const policy = JSON.parse(read('db/migration-drafts/account-deletion-receipt-data-policy.json'));
const columns = JSON.parse(await ok(`SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns
  WHERE table_schema='deletion_receipt_private' AND table_name='accepted_requests';`));
assert.deepEqual(columns, Object.keys(policy.columns).sort(), 'every private column needs erasure/export classification');
pass('private schema catalog matches erasure/export policy for every column');
await rejected(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${up}`, 'receipt_terminal_requires_read_committed');

for (let n=1; n<=10; n++) await fixture(n);
const operation = n => `(SELECT operation_id FROM deletion_receipt_private.accepted_requests WHERE owner_id='${owner(n)}')`;
const transition = (n, action, execution = owner(n)) => `SELECT deletion_receipt_private.transition_request(
  ${operation(n)},'${owner(n)}','${execution}','${action}');`;
const state = n => `SELECT phase FROM deletion_receipt_private.accepted_requests WHERE owner_id='${owner(n)}';`;
// Trusted test controller needs table reads to discover the operation, while the
// service-only function still verifies its claim. Actual service ACL is tested above.
const trusted = "SET request.jwt.claim.role='service_role';";
async function waitForBlock(label) {
  const deadline=Date.now()+8000;
  while (Date.now()<deadline) {
    if (await ok(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity f JOIN pg_stat_activity l
      ON l.pid=ANY(pg_blocking_pids(f.pid)) WHERE f.datname=current_database()
      AND f.application_name='${label}' AND l.application_name='t04_terminal_leader');`) === 't') return;
    await new Promise(r=>setTimeout(r,40));
  }
  throw new Error(`No actual blocking observed: ${label}`);
}
let races=0;
async function race(n, first, second, commit, error, holdMs = 0) {
  const leader=connection();
  try {
    leader.send(`SET application_name='t04_terminal_leader'; BEGIN; ${trusted} ${first} SELECT 'HELD';`);
    await leader.marker('HELD');
    const follower=run(`SET application_name='t04_terminal_follower_${n}'; ${trusted} ${second}`);
    await waitForBlock(`t04_terminal_follower_${n}`);
    if (holdMs) await new Promise(resolveHold => setTimeout(resolveHold, holdMs));
    leader.end(commit?'COMMIT;':'ROLLBACK;'); assert.equal((await leader.done).code,0);
    const result=await follower;
    if (error) { assert.notEqual(result.code,0); assert(result.err.includes(error),result.err); }
    else assert.equal(result.code,0,result.err);
    races++;
  } finally { leader.end(); await leader.done; }
}
for (let n=1;n<=5;n++) await ok(`${service} ${begin(n)}`);
await race(1,transition(1,'failed'),legacy(1),true);
await race(2,transition(2,'abandoned'),legacy(2,true),true);
await race(3,transition(3,'failed'),legacy(3),false,'receipt_request_in_progress');
await race(4,transition(4,'start'),legacy(4),true,'receipt_request_in_progress');
await race(5,transition(5,'start'),transition(5,'failed'),true,'receipt_execution_unresolved');
pass('five observed terminal/start versus legacy/cancel lock schedules');

function expiringReceipt(n, seconds) {
  return directReceipt(n).replace('(owner_id,session_id,request_id,key_version,lookup_hash,recovery_hash)',
    '(owner_id,session_id,request_id,key_version,lookup_hash,recovery_hash,admission_expires_at)')
    .replace("decode(repeat('cd',32),'hex'));",`decode(repeat('cd',32),'hex'),clock_timestamp()+interval '${seconds} seconds');`);
}
await ok(expiringReceipt(6,0.6));
await race(6,`SELECT pg_advisory_xact_lock(hashtextextended('${owner(6)}',260913));`,
  transition(6,'start'),true,undefined,700);
assert.equal(await ok(state(6)),'abandoned');
await ok(`${service} ${legacy(6)}`);
// A reserved execution stays unresolved after its admission TTL; no timer releases it.
await ok(`${expiringReceipt(7,0.4)} ${trusted} ${transition(7,'start')} SELECT pg_sleep(0.5);`);
await rejected(`${service} ${legacy(7)}`,'receipt_request_in_progress');
assert.equal(await ok(state(7)),'executing');
pass('post-lock expiry prevents late start; elapsed executing remains unresolved');

for (const n of [8,9]) {
  await ok(expiringReceipt(n,0.4));
  await race(n,`${transition(n,'start')} SELECT pg_sleep(0.5);`,
    'SELECT deletion_receipt_private.purge_terminal_requests();',n===8);
  assert.equal(await ok(state(n)),n===8?'executing':'abandoned');
}
await ok(expiringReceipt(10,0.05));
await ok('SELECT pg_sleep(0.1);');
await race(10,'SELECT deletion_receipt_private.purge_terminal_requests();',transition(10,'start'),true);
assert.equal(await ok(state(10)),'abandoned');
pass('purge versus start commit/rollback and reverse order preserve exclusive admission');

await refuseUnchanged('arbitration after retained and executing receipts', 'DELETE FROM public.account_deletion_tombstones;',
  arbitration, 'receipt_arbitration_terminal_already_installed');
await refuseUnchanged('terminal down with executing', '', down, 'receipt_terminal_rollback_execution_unresolved');
await rejected(`${service} ${legacy(4)}`,'receipt_request_in_progress');
// Complete the synthetic reservations before exercising a successful down.
for (const n of [4,5,7,8]) await ok(`${trusted}
  DELETE FROM public.users WHERE id='${owner(n)}'; DELETE FROM auth.users WHERE id='${owner(n)}';
  SELECT deletion_receipt_private.transition_request(${operation(n)},'${owner(n)}','${owner(n)}','completed',clock_timestamp(),true,true,true);`);
const before=await ok(ledgers);
await ok(downFile);
assert.equal(await ok(ledgers),before);
await rejected(`${service} ${begin(8)}`,'permission denied');
await rejected(`${service} SELECT deletion_receipt_private.transition_request('${owner(4)}','${owner(4)}',NULL,'failed');`,'permission denied');
// Revocation does not uninstall terminal. Its lookup still needs expiry/arbitration.
await refuseUnchanged('arbitration down after terminal down', 'DELETE FROM deletion_receipt_private.accepted_requests;',
  arbitrationDown, 'receipt_arbitration_terminal_requires_retirement');
await refuseUnchanged('arbitration reapply after terminal down', 'DELETE FROM deletion_receipt_private.accepted_requests;',
  arbitration, 'receipt_arbitration_terminal_already_installed');
await ok(upFile);
assert.equal(await ok(ledgers),before);
assert.equal(await ok(existingSnapshot),existing);
pass('down refuses executing; drained down preserves evidence/arbitration and reapply restores grants');

// Behavioral mutations execute actual altered SQL in rollback-only transactions.
const mutants=[
  ['legacy still blocks terminal', "r.phase IN ('accepted','executing')", 'true'],
  ['missing expiry release', "PERFORM deletion_receipt_private.expire_unstarted(NEW.user_id);", 'NULL;'],
  ['missing Auth observation', 'OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner_id)', ''],
  ['missing profile observation', 'OR EXISTS(SELECT 1 FROM public.users WHERE id=p_owner_id)', ''],
  ['missing raw observation', 'OR p_raw_empty IS DISTINCT FROM true', ''],
  ['missing photos observation', 'OR p_photos_empty IS DISTINCT FROM true', ''],
  ['missing drain evidence', 'OR p_writes_drained IS DISTINCT FROM true', ''],
  ['missing execution identity', "r.phase <> 'executing' OR p_execution_id IS DISTINCT FROM r.execution_id", "r.phase <> 'executing'"],
  ['no terminal immutability', "OLD.phase IN ('completed','failed','abandoned') AND NEW IS DISTINCT FROM OLD", 'false'],
  ['lookup uses recovery proof', 'r.lookup_hash = p_lookup_hash', 'r.recovery_hash = p_lookup_hash'],
  ['lookup skips expiry', 'PERFORM deletion_receipt_private.expire_unstarted(v_row.owner_id);', 'NULL;'],
  ['projection exposes owner', "'observations',r.observations", "'ownerId',r.owner_id,'observations',r.observations"],
  ['purge skips accepted expiry', 'PERFORM deletion_receipt_private.expire_unstarted(v_owner);', 'NULL;'],
  ['expiry restarts retention clock', "finished_at=admission_expires_at,\n    receipt_expires_at=admission_expires_at + interval '30 days'", "finished_at=v_now,\n    receipt_expires_at=v_now + interval '30 days'"],
  ['purge removes active', "phase IN ('completed','failed','abandoned') AND receipt_expires_at <= pg_catalog.clock_timestamp()", 'true'],
];
let killed=0;
for (const [name,from,to] of mutants) {
  const changed=up.replace(from,to); assert.notEqual(changed,up,`missing mutation ${name}`);
  const result=await run(`BEGIN; ${changed} ${regression}`);
  assert.notEqual(result.code,0,`SURVIVED ${name}`);
  assert(/expected error|blocks legacy|expiry not persisted|lookup omitted terminal|purged unexpired|receipt_request_in_progress|lookup expiry|projection keys|expired accepted purge/.test(result.err),
    `unrelated mutant failure ${name}: ${result.err}`);
  killed++; console.log(`KILLED ${name}`);
}
assert.equal(await ok(ledgers),before);
assert.equal(await ok(existingSnapshot),existing);
console.log(`PASS ${groups} groups; ${races} observed blocking schedules; SQL mutants killed ${killed + orderProbes}/${mutants.length + orderProbes}; order refusals ${orderProbes} with zero state changes; external Auth/Storage calls 0`);
