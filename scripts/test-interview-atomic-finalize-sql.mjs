// Dormant draft rehearsal only. Explicit disposable local Docker DB, no URLs,
// remote credentials, real safety/model calls, migration promotion or activation.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { spawn } from 'node:child_process';

const [container, database] = process.argv.slice(2);
if (!/^(?:polascope_[a-z0-9_]+|[a-f0-9]{64})$/.test(container ?? '') || !/^t16_finalize_test_[a-z0-9_]+$/.test(database ?? '')) {
  throw new Error('Use an explicit local Docker container and fresh t16_finalize_test_ database.');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const draft = 'db/migration-drafts/';
const up = read(`${draft}UNNUMBERED_interview_atomic_finalize.sql`);
const down = read(`${draft}rollback/UNNUMBERED_interview_atomic_finalize_down.sql`);
const s1 = read(`${draft}UNNUMBERED_interview_content_authority.sql`);
const regression = read(`${draft}tests/interview-atomic-finalize.sql`);
const sharedFixture = regression.split('BEGIN;')[1].split('-- END SHARED FIXTURE')[0];
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:PG|DOCKER_)/i.test(name)));
const socket = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
let checks = 0;
const pass = (name) => { checks++; process.stdout.write(`PASS ${name}\n`); };
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const last = (value) => value.trim().split(/\r?\n/).at(-1);
const response = (value) => JSON.parse(value.split(/\r?\n/).find((line) => line.startsWith('{')));
function start(sql, onReady = () => {}) {
  const child = spawn('docker', ['--host', socket, 'exec', '-i', container, 'psql', '-X', '--no-password', '-U', 'postgres',
    '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env, timeout: 30_000 });
  let out = ''; let err = ''; let ready = false;
  const done = new Promise((resolveResult, reject) => {
    child.stdout.on('data', (data) => {
      out += data;
      if (!ready && out.includes('FINALIZE_LOCK_READY')) { ready = true; onReady(); }
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
async function hold(prefix, suffix = 'COMMIT;', seconds = 1.5) {
  let signal;
  const ready = new Promise((resolveReady) => { signal = resolveReady; });
  const done = start(`BEGIN; ${prefix} SELECT 'FINALIZE_LOCK_READY'; SELECT pg_sleep(${seconds}); ${suffix}`, signal);
  await Promise.race([ready, done.then((result) => { throw new Error(`holder failed before marker: ${result.err}`); })]);
  return { done };
}
async function observeWait(label, event = 'transactionid') {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (last(await run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND application_name=${literal(label)} AND wait_event_type='Lock' AND wait_event=${literal(event)});`)) === 't') return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  assert.fail(`Did not observe actual ${event} lock wait: ${label}`);
}
function rejected(result, message, code = '42501') {
  assert.notEqual(result.code, 0); assert(result.err.includes(message), result.err); assert(result.err.includes(code), result.err);
}
const service = "SET ROLE service_role; SET request.jwt.claim.role='service_role';";
const id = (n, kind = 1) => `1a162601-0000-4000-800${kind}-${String(n).padStart(12, '0')}`;
const versions = readdirSync(resolve(root, 'db/migrations')).filter((file) => /^\d+_.*\.sql$/.test(file))
  .map((file) => file.split('_')[0]).filter((number) => Number(number) >= 147).sort();
assert.deepEqual((await run('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'))
  .split(/\r?\n/).filter((line) => /^\d+$/.test(line)), versions, 'Replay the complete numbered tree first');
assert.equal(last(await run(`SELECT to_regclass('public.interview_content_authority') IS NULL
  AND position('pg_try_advisory_xact_lock(' IN pg_get_functiondef('public.interview_account_erasure()'::regprocedure))>0
  AND position('pg_try_advisory_xact_lock_shared' IN pg_get_functiondef('public.interview_session_erasure()'::regprocedure))>0
  AND NOT has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE');`)), 't', 'fresh schema plus installed owner-lock floor');
pass('fresh complete numbered schema and actual erasure-lock preflight');
// Review #2618 r1: the down must restore the S1/legacy catalog exactly, not only drop the new
// objects. A fingerprint of both schemas S1/S2b touch (definitions incl. SECURITY DEFINER,
// volatility and SET search_path, owners, normalized ACLs, view bodies, columns, constraints,
// indexes, triggers incl. those on other schemas' tables that call these functions, RLS flags,
// policies) is taken with S1 alone and compared with the state after S2b up + down.
// Comments (pg_description) and default privileges are not part of it.
const FINGERPRINT_SQL = `
WITH s AS (SELECT oid, nspname FROM pg_namespace WHERE nspname IN ('public','interview_authority_private'))
SELECT kind||'|'||name||'|'||md5(detail) FROM (
 SELECT 'schema' AS kind, s.nspname AS name,
   pg_get_userbyid(n.nspowner)||'|'||coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(n.nspacl) a),'') AS detail
   FROM s JOIN pg_namespace n ON n.oid=s.oid
 UNION ALL
 SELECT 'function', s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||'|'||
   coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(p.proacl) a),'')
   FROM pg_proc p JOIN s ON s.oid=p.pronamespace WHERE p.prokind IN ('f','p')
 UNION ALL
 SELECT CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' ELSE 'table' END, s.nspname||'.'||c.relname,
   c.relkind::text||'|'||coalesce(CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) END,'')||'|'||
   pg_get_userbyid(c.relowner)||'|'||coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(c.relacl) a),'')||'|'||
   c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(array_to_string(c.reloptions, ','),'')||'|'||
   coalesce((SELECT string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||
       a.attidentity::text||':'||a.attgenerated::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||':'||
       coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(a.attacl) x),''), ';' ORDER BY a.attnum)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'')
   FROM pg_class c JOIN s ON s.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f','S')
 UNION ALL
 SELECT 'constraint', s.nspname||'.'||cl.relname||'.'||co.conname, pg_get_constraintdef(co.oid)||'|'||co.convalidated::text
   FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN s ON s.oid=cl.relnamespace
 UNION ALL
 SELECT 'index', s.nspname||'.'||i.relname, pg_get_indexdef(i.oid)
   FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN s ON s.oid=i.relnamespace
 UNION ALL
 SELECT 'trigger', n.nspname||'.'||cl.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
   FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
   JOIN pg_proc f ON f.oid=t.tgfoid
   WHERE NOT t.tgisinternal AND (cl.relnamespace IN (SELECT oid FROM s) OR f.pronamespace IN (SELECT oid FROM s))
 UNION ALL
 SELECT 'policy', schemaname||'.'||tablename||'.'||policyname,
   permissive||'|'||array_to_string(roles, ',')||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
   FROM pg_policies WHERE schemaname IN ('public','interview_authority_private')
) f ORDER BY 1;`;
const fingerprint = async () => (await run(FINGERPRINT_SQL)).split(/\r?\n/)
  .filter((line) => /^(schema|function|table|view|matview|constraint|index|trigger|policy)\|/.test(line));
const catalogDiff = (expected, actual) => {
  const want = new Set(expected); const got = new Set(actual);
  const name = (line) => line.split('|').slice(0, 2).join('|');
  return { missing: expected.filter((line) => !got.has(line)).map(name), extra: actual.filter((line) => !want.has(line)).map(name) };
};
// The four original 0225 controls, unchanged. Run in the S1 state after the S2b down and
// again with S2b applied, so a wrongly restored legacy function is exercised before the
// next up overwrites it.
async function original0225Controls(state) {
  await run(read('db/tests/interview_transcript_ledger_regression.sql'));
  await run(read('db/tests/interview_transcript_ledger_rollback.sql')
    .replace('\\ir ../migrations/rollback/0225_down.sql', () => read('db/migrations/rollback/0225_down.sql'))
    .replace('\\ir ../migrations/0225_interview_transcript_ledger.sql', () => read('db/migrations/0225_interview_transcript_ledger.sql')));
  pass(`unchanged original 0225 SQL regression and rollback/reapply (${state})`);
  // The original Python controls use host psql. Route their unchanged arguments
  // to this exact local Docker container, retaining application labels/options so
  // their pg_stat_activity assertions observe actual waits. No external DB env.
  const shimDir = mkdtempSync(join(tmpdir(), 't16-finalize-psql-'));
  try {
    writeFileSync(join(shimDir, 'psql'), `#!/bin/sh\nexec docker --host '${socket}' exec -i -e PGPASSWORD=postgres -e PGAPPNAME -e PGOPTIONS '${container}' psql -U postgres "$@"\n`, { mode: 0o700 });
    for (const file of ['interview_transcript_ledger_concurrency.py', 'interview_transcript_ledger_security.py']) {
      const result = await new Promise((resolveResult, reject) => {
        const child = spawn('python3', [resolve(root, `db/tests/${file}`), '--template', database],
          { env: { ...env, PATH: `${shimDir}:${env.PATH}` }, timeout: 180_000 });
        let out = ''; let err = '';
        child.stdout.on('data', (data) => { out += data; }); child.stderr.on('data', (data) => { err += data; });
        child.on('error', reject); child.on('close', (code) => resolveResult({ code, out, err }));
      });
      process.stdout.write(result.out); assert.equal(result.code, 0, result.err || result.out);
    }
  } finally { rmSync(shimDir, { recursive: true, force: true }); }
  pass(`unchanged original 0225 Python concurrency/security controls (${state})`);
}

await run(`BEGIN;${s1}COMMIT;`);
const s1Catalog = await fingerprint();
assert(s1Catalog.length > 100, `catalog fingerprint read only ${s1Catalog.length} objects`);
await run(`BEGIN;${up}COMMIT;`);
const s2bDiff = catalogDiff(s1Catalog, await fingerprint());
assert(s2bDiff.missing.length + s2bDiff.extra.length > 0, 'the fingerprint must see S2b change the catalog');
assert(s2bDiff.missing.some((name) => name.startsWith('function|public.commit_interview_session(')),
  'the fingerprint must see S2b replace a legacy function body');
await run(down);
const downDiff = catalogDiff(s1Catalog, await fingerprint());
assert.deepEqual(downDiff, { missing: [], extra: [] }, 'S2b down must restore the exact S1/legacy catalog');
pass(`S2b down restores the exact S1/legacy catalog (${s1Catalog.length} objects: definitions, owners, ACLs, views, columns, constraints, indexes, triggers, policies)`);
await run(read(`${draft}tests/interview-atomic-finalize-rollback.sql`));
await original0225Controls('S1 state after the S2b down');
await run(`BEGIN;${up}COMMIT;BEGIN;${up}COMMIT;`);
pass('repeated S2b apply after the down');
await original0225Controls('S2b re-applied');
await run(regression);
await run(read(`${draft}tests/interview-atomic-finalize-erasure.sql`).replace('/* FINALIZE_FIXTURE */', () => sharedFixture));
pass('actual-role atomic receipt/fault/legacy/r1-q5 and real FK erasure lifecycle SQL');

// Load the actual frozen S2a code, including its real title renderer. Transform
// TS parameter properties using Node 24, without copying the implementation.
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url.startsWith(pathToFileURL(`${root}/`).href) && url.endsWith('.ts')) {
    return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }), shortCircuit: true };
  }
  return nextLoad(url, context);
} });
const { digestInterviewFinalizePacket, canonicalInterviewFinalizePacket, parseInterviewFinalizePacket, renderInterviewFinalizeRecord } =
  await import(pathToFileURL(resolve(root, 'supabase/functions/_shared/interview-finalize-packet.ts')).href);
hooks.deregister();
const basePacket = { v: 1, intent: { requestId: id(1, 5), sessionId: id(1, 7), draftId: id(1, 4), revision: 7, contentGeneration: id(1, 8) },
  ruleSet: 'r0', period: 'now', conversationLocale: 'en', uiLanguage: 'es', growthOrigin: false,
  turns: [{ n: 1, scene: 1, role: 'interviewer', text: 'Q?', layer: 'fact', origin: 'fixed', askKind: 'seed', openerUnedited: null, state: null },
    { n: 2, scene: 1, role: 'user', text: 'My own answer.', layer: 'fact', origin: 'user', askKind: null, openerUnedited: false, state: 'judged' }] };
const golden = structuredClone(basePacket);
golden.intent = { requestId: '22222222-2222-4222-8222-222222222222', sessionId: '33333333-3333-4333-8333-333333333333',
  draftId: '44444444-4444-4444-8444-444444444444', revision: 7, contentGeneration: '55555555-5555-4555-8555-555555555555' };
golden.ruleSet = 'r1-q5'; golden.turns[1].text = 'A!';
const goldenOwner = '11111111-1111-4111-8111-111111111111';
const goldenHash = '06ae245e7f9a56a8b8f5494adfcef49cd5be600cbd2ad81ce1749aa7e36c2ce1';
assert.equal(await digestInterviewFinalizePacket(golden, goldenOwner), goldenHash);
assert.equal(response(await run(`SELECT interview_authority_private.finalize_packet('${goldenOwner}',${json(golden)});`)).digest, goldenHash);
for (const text of ['A!', '한국어\n답', 'e\u0301', 'é', '👩🏽‍💻 / 🇰🇷', 'क्‍ष', 'a;b:c|N;T;', '\tline\r\nnext', '"\\end', 'a'.repeat(8000)]) {
  const packet = structuredClone(basePacket); packet.turns[1].text = text;
  const expected = await digestInterviewFinalizePacket(packet, id(1));
  const actual = response(await run(`SELECT interview_authority_private.finalize_packet('${id(1)}',${json(packet)});`));
  assert.equal(actual.digest, expected); assert.equal(actual.body, renderInterviewFinalizeRecord(packet, 'Star').body);
  assert.deepEqual(actual.packet, parseInterviewFinalizePacket(packet));
}
const ko = structuredClone(basePacket); ko.conversationLocale = 'ko'; ko.uiLanguage = 'ko';
const upper = structuredClone(ko); for (const key of ['requestId', 'sessionId', 'draftId', 'contentGeneration']) upper.intent[key] = upper.intent[key].toUpperCase();
const trailing = structuredClone(ko); trailing.turns.push({ ...trailing.turns[0], n: 3 });
const maxRevision = structuredClone(ko); maxRevision.intent.revision = Number.MAX_SAFE_INTEGER;
for (const packet of [ko, upper, trailing, maxRevision]) {
  const actual = response(await run(`SELECT interview_authority_private.finalize_packet('${id(1)}',${json(packet)});`));
  assert.equal(actual.digest, await digestInterviewFinalizePacket(packet, id(1)));
  assert.equal(actual.body, renderInterviewFinalizeRecord(packet, 'Star').body);
}
assert(canonicalInterviewFinalizePacket(basePacket, id(1)).startsWith('T16-FINALIZE-PACKET/1\n'));
for (const mutate of [p => { delete p.turns[1].openerUnedited; }, p => { p.turns[1].text = ''; },
  p => { p.turns[1].origin = 'fixed'; }, p => { p.intent.revision = 0; }, p => { p.safe = true; },
  p => { p.turns = [p.turns[0]]; }, p => { p.turns[1].scene = 0; }, p => { p.turns[1].text = 'x'.repeat(8001); }]) {
  const packet = structuredClone(basePacket); mutate(packet);
  assert.throws(() => parseInterviewFinalizePacket(packet));
  rejected(await start(`SELECT interview_authority_private.finalize_packet('${id(1)}',${json(packet)});`), 'invalid_packet', '22023');
}
const boundary = structuredClone(basePacket);
boundary.turns = Array.from({ length: 33 }, (_, index) => ({ ...basePacket.turns[1], n: index + 1, text: 'x'.repeat(8000) }));
const excess = Buffer.byteLength(JSON.stringify(boundary)) - 262144;
assert(excess > 0 && excess < 8000);
boundary.turns[32].text = 'x'.repeat(8000 - excess);
assert.equal(Buffer.byteLength(JSON.stringify(boundary)), 262144);
assert.equal(response(await run(`SELECT interview_authority_private.finalize_packet('${id(1)}',${json(boundary)});`)).digest,
  await digestInterviewFinalizePacket(boundary, id(1)));
boundary.turns[32].text += 'x';
assert.throws(() => parseInterviewFinalizePacket(boundary), /packet_too_large/);
rejected(await start(`SELECT interview_authority_private.finalize_packet('${id(1)}',${json(boundary)});`), 'packet_too_large', '22023');
pass('actual S2a vs PostgreSQL canonical/body parity, Unicode and malformed packet boundaries');

async function fixture(n) {
  await run(`INSERT INTO auth.users(id,email) VALUES('${id(n)}','finalize-race-${n}@example.invalid');
    INSERT INTO public.users(id,email,birth_date,locale) VALUES('${id(n)}','finalize-race-${n}@example.invalid','1990-01-01','en');
    INSERT INTO auth.sessions(id,user_id) VALUES('${id(n, 2)}','${id(n)}');`);
  const work = response(await run(`${service} SELECT public.open_interview_work('${id(n)}','${id(n, 2)}',clock_timestamp()+interval '1 hour',
    '${id(n, 3)}','${id(n, 4)}','now','en','es',false);`));
  const packet = structuredClone(basePacket); packet.intent = { requestId: id(n, 5), sessionId: work.workId, draftId: id(n, 4), revision: 7, contentGeneration: work.generation };
  const digest = await digestInterviewFinalizePacket(packet, id(n));
  const artifact = { v: 1, source: 'server-c9-render-domain-v1', ownerId: id(n), workId: work.workId, requestId: id(n, 5), contentGeneration: work.generation,
    snapshotDigest: digest, ruleSet: work.ruleSet, decision: 'clear', summary: renderInterviewFinalizeRecord(packet, 'Star').summary, domainTag: 'domain:collect' };
  await run(`${service} SELECT public.reserve_interview_save('${id(n)}','${id(n, 2)}',clock_timestamp()+interval '1 hour',
    '${work.workId}','${work.generation}','${id(n, 5)}',7,decode('${digest}','hex'),'${id(n, 4)}','now','en','es',false);`);
  return { n, work, packet, artifact };
}
const finish = (f, expiry = "clock_timestamp()+interval '1 hour'") => `SELECT public.finalize_interview_save('${id(f.n)}','${id(f.n, 2)}',${expiry},${json(f.packet)},${json(f.artifact)});`;
const lookup = (f) => `SELECT public.lookup_interview_save('${id(f.n)}','${id(f.n, 2)}',clock_timestamp()+interval '1 hour','${f.work.workId}','${id(f.n, 5)}');`;
const wipe = (f) => `SELECT public.begin_interview_content_wipe('${id(f.n)}','${id(f.n, 2)}',clock_timestamp()+interval '1 hour','${id(f.n, 9)}','${f.work.generation}','records-v1');`;
const noCommit = async (f) => assert.equal(last(await run(`SELECT NOT EXISTS(SELECT 1 FROM public.records WHERE user_id='${id(f.n)}')
 AND (SELECT save_state='reserved' AND commit_receipt IS NULL FROM public.interview_work_contracts WHERE session_id='${f.work.workId}');`)), 't');
async function probe(f, audit = f.n) {
  await run(`INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,purpose,event_source)
    VALUES('${id(audit, 6)}','${id(f.n)}','p','o','synthetic-local',false,'green',1,'interview_probe','server_verified');`);
  const query = `SELECT public.record_interview_work_verdict('${id(f.n)}','${id(f.n, 2)}',clock_timestamp()+interval '1 hour','${f.work.generation}',
    '${id(audit, 6)}','${f.work.workId}','now','en',1,1,2,'fact','seed','pass','fact','credited',true,'r0','claude',false,0,2,
    encode(sha256(convert_to('${f.work.workId}:2:My own answer.','UTF8')),'hex'));`;
  assert.equal(last(await run(`${service}${query}`)), 'recorded');
}
const same = await fixture(101);
let holder = await hold(`${service}${finish(same)}`);
let pending = start(`SET application_name='finalize_same_key';${service}${finish(same)}`);
await observeWait('finalize_same_key');
let [result, held] = await Promise.all([pending, holder.done]);
assert.equal(result.code, 0, result.err); assert.equal(held.code, 0, held.err);
assert.deepEqual(response(result.out).receipt, response(held.out).receipt);
assert.deepEqual(response(await run(`${service}${lookup(same)}`)).receipt, response(result.out).receipt);
assert.equal(last(await run(`SELECT count(*)=1 FROM public.records WHERE user_id='${id(101)}';`)), 't');
pass('two simultaneous same-intent saves plus lost-ACK lookup return one immutable receipt');

const conflict = await fixture(102);
holder = await hold(`${service}${finish(conflict)}`);
const changed = structuredClone(conflict); changed.packet.turns[1].text = 'different body';
pending = start(`SET application_name='finalize_conflict';${service}${finish(changed)}`);
await observeWait('finalize_conflict');
[result, held] = await Promise.all([pending, holder.done]);
rejected(result, 'binding_conflict', '22023'); assert.equal(held.code, 0, held.err);
pass('concurrent changed payload cannot acquire the original committed request');

for (const first of ['wipe', 'save']) {
  const f = await fixture(first === 'wipe' ? 103 : 104);
  holder = await hold(`${service}${first === 'wipe' ? wipe(f) : finish(f)}`);
  pending = start(`SET application_name='finalize_wipe_${first}';${service}${first === 'wipe' ? finish(f) : wipe(f)}`);
  await observeWait(`finalize_wipe_${first}`, 'advisory');
  [result, held] = await Promise.all([pending, holder.done]);
  assert.equal(result.code, 0, result.err); assert.equal(held.code, 0, held.err);
  if (first === 'wipe') { assert.equal(response(result.out).state, 'closed'); await noCommit(f); }
  else { assert.equal(response(result.out).state, 'barrier_committed'); assert.equal(response(await run(`${service}${lookup(f)}`)).state, 'committed'); }
}
pass('wipe/save both lock orders preserve generation fence and committed fact');

for (const [offset, kind] of ['owner', 'work', 'session-key', 'session-row', 'verdict', 'coverage'].entries()) {
  const f = await fixture(110 + offset);
  if (['verdict', 'coverage'].includes(kind)) await probe(f);
  if (kind === 'coverage') await run(`INSERT INTO public.interview_coverage(user_id,period,layer,answers) VALUES('${id(f.n)}','now','fact',3);`);
  const lock = {
    owner: `SELECT pg_advisory_xact_lock(hashtextextended('${id(f.n)}',260913));`,
    work: `SELECT 1 FROM public.interview_work_contracts WHERE session_id='${f.work.workId}' FOR UPDATE;`,
    'session-key': `SELECT pg_advisory_xact_lock(hashtextextended('interview_session:${f.work.workId}',0));`,
    'session-row': `SELECT 1 FROM public.interview_sessions WHERE id='${f.work.workId}' FOR UPDATE;`,
    verdict: `SELECT 1 FROM public.interview_probe_verdicts WHERE session_id='${f.work.workId}' FOR UPDATE;`,
    coverage: `SELECT 1 FROM public.interview_coverage WHERE user_id='${id(f.n)}' FOR UPDATE;`,
  }[kind];
  holder = await hold(lock);
  pending = start(`SET application_name='finalize_expiry_${offset}';${service}${finish(f, "clock_timestamp()+interval '500 milliseconds'")}`);
  await observeWait(`finalize_expiry_${offset}`, ['owner', 'session-key'].includes(kind) ? 'advisory' : 'transactionid');
  [result, held] = await Promise.all([pending, holder.done]);
  rejected(result, 'live_session_required'); assert.equal(held.code, 0, held.err); await noCommit(f);
  if (kind === 'coverage') assert.equal(last(await run(`SELECT answers FROM public.interview_coverage WHERE user_id='${id(f.n)}';`)), '3');
}
pass('Auth expiry after actual owner/work/session/verdict/coverage waits rolls back every partial effect');

const stale = await fixture(120); await probe(stale);
await run(`UPDATE public.interview_sessions SET last_seen_at=clock_timestamp()-interval '6 hours'+interval '1 second' WHERE id='${stale.work.workId}';`);
holder = await hold(`SELECT 1 FROM public.interview_probe_verdicts WHERE session_id='${stale.work.workId}' FOR UPDATE;`, 'COMMIT;', 2);
pending = start(`SET application_name='finalize_idle_expiry';${service}${finish(stale)}`);
await observeWait('finalize_idle_expiry');
[result, held] = await Promise.all([pending, holder.done]);
rejected(result, 'session_expired'); assert.equal(held.code, 0, held.err); await noCommit(stale);
pass('six-hour original activity boundary is checked again after a core row wait');

const revoked = await fixture(121);
holder = await hold(`SELECT 1 FROM public.interview_work_contracts WHERE session_id='${revoked.work.workId}' FOR UPDATE;`,
  `UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id='${id(121)}'; COMMIT;`);
pending = start(`SET application_name='finalize_live_auth';${service}${finish(revoked)}`);
await observeWait('finalize_live_auth');
[result, held] = await Promise.all([pending, holder.done]);
rejected(result, 'live_session_required'); assert.equal(held.code, 0, held.err); await noCommit(revoked);
pass('DB Auth state revalidated after work-row wait, independent of successful upstream Auth');

for (const [offset, table] of ['records', 'interview_transcripts', 'interview_transcript_turns', 'interview_sessions', 'public.users', 'auth.users'].entries()) {
  const f = await fixture(130 + offset); await run(`${service}${finish(f)}`);
  holder = await hold(`SELECT 1 FROM public.interview_work_contracts WHERE session_id='${f.work.workId}' FOR UPDATE;`);
  const qualified = table.includes('.') ? table : `public.${table}`;
  const key = table.includes('.') ? 'id' : table === 'interview_sessions' ? 'owner_id' : 'user_id';
  result = await start(`DELETE FROM ${qualified} WHERE ${key}='${id(f.n)}';`);
  rejected(result, 'work_busy_retry', '40001');
  held = await holder.done; assert.equal(held.code, 0, held.err);
  assert.equal(last(await run(`SELECT snapshot_digest IS NOT NULL AND session_state<>'erased' FROM public.interview_work_contracts WHERE session_id='${f.work.workId}';`)), 't');
}
pass('inverse record/head/turn/session/profile/Auth deletes fail NOWAIT before terminal/digest mutations');

const busyRecord = await fixture(140);
holder = await hold(`INSERT INTO public.records(user_id,kind,body,system_tags,client_request_id) VALUES('${id(140)}','audit_response','legacy',ARRAY['interview'],'interview:${busyRecord.work.workId}');`);
// An uncommitted conflicting unique key is not visible to SELECT. INSERT must
// still wait for its uniqueness outcome and roll back, never adopt that record.
pending = start(`SET application_name='finalize_unique_record';${service}${finish(busyRecord)}`);
await observeWait('finalize_unique_record');
[result, held] = await Promise.all([pending, holder.done]);
rejected(result, 'duplicate key', '23505'); assert.equal(held.code, 0, held.err);
assert.equal(last(await run(`SELECT save_state='reserved' AND commit_receipt IS NULL FROM public.interview_work_contracts WHERE session_id='${busyRecord.work.workId}';`)), 't');
pass('legacy record unique-key race cannot be adopted or partially commit a receipt');

const before = await run('SELECT row_to_json(w) FROM public.interview_work_contracts w ORDER BY session_id;');
result = await start(down); rejected(result, 'used_rollback_forbidden', '55000');
assert.equal(await run('SELECT row_to_json(w) FROM public.interview_work_contracts w ORDER BY session_id;'), before);
assert.equal(last(await run("SELECT to_regprocedure('public.finalize_interview_save(uuid,uuid,timestamptz,jsonb,jsonb)') IS NOT NULL;")), 't');
pass('used rollback refuses before any DDL or immutable receipt change');
process.stdout.write(`PASS ${checks} atomic-finalization groups; local synthetic service artifacts only, no caller activation\n`);
