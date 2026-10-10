// Explicit disposable loopback DB only; no remote URL or ambient PG settings.
// node scripts/test-dashboard-sql.mjs 55443 dashboard_test_w1
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDashboardLeaseSql } from './test-dashboard-lease-sql.mjs';
const [port, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? '') || +port > 65535 || !/^dashboard_test[a-z0-9_]*$/.test(database ?? '')) throw new Error('Explicit disposable local DB required');
const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '../db/tests/dashboard_generation_bootstrap.sql');
const consentSql = readFileSync(resolve(dirname(fixture), '../migrations/0193_effective_llm_consent_current_contract.sql'), 'utf8');
const invalidation = consentSql.slice(consentSql.indexOf('CREATE FUNCTION public.llm_consent_relevant_prefs('),
  consentSql.indexOf('-- A private, read-only decision'));
if (!invalidation.includes('CREATE TRIGGER invalidate_llm_consent_event')) throw new Error('Missing actual consent invalidator');
const sql = readFileSync(fixture, 'utf8').replace('-- @LOAD_CONSENT_INVALIDATION@', () => invalidation)
  .replace(/^\\ir (.+)$/gm, (_, path) => `\\ir '${resolve(dirname(fixture), path).replaceAll('\\', '/')}'`);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key) || key === 'PGPASSWORD'));
const result = spawnSync('psql', ['-X', '--no-password', '-h', '127.0.0.1', '-p', port, '-U', 'dashboard_local', '-d', database, '-v', 'ON_ERROR_STOP=1'], {
  input: sql, encoding: 'utf8', env, windowsHide: true, timeout: 60_000,
});
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const args = ['-X', '--no-password', '-h', '127.0.0.1', '-p', port, '-U', 'dashboard_local', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'];
  const run = (input) => new Promise((resolveResult, reject) => {
    const child = spawn('psql', args, { env, windowsHide: true, timeout: 15_000 });
    let output = ''; let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolveResult(output) : reject(new Error(error)));
    child.stdin.end(input);
  });
  const owner = '00000000-0000-0000-0000-000000000010';
  await run(`INSERT INTO auth.users(id) VALUES('${owner}'); INSERT INTO public.users(id) VALUES('${owner}');
    INSERT INTO public.ops_routines(id,user_id,title) VALUES('${owner}','${owner}','Read');`);
  const sql = `BEGIN; SET LOCAL request.jwt.claim.role='service_role';
    SELECT public.dashboard_generation_request('${owner}','open','Asia/Seoul','ko')->>'kind'; SELECT pg_sleep(0.2); COMMIT;`;
  const concurrent = await Promise.all([run(sql), run(sql)]);
  const outcomes = concurrent.flatMap((output) => output.split(/\r?\n/).filter((line) => ['claimed', 'busy'].includes(line))).sort();
  if (JSON.stringify(outcomes) !== '["busy","claimed"]') throw new Error('Concurrent claim regression');
  const count = await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${owner}';`);
  if (count.trim() !== '1') throw new Error('Duplicate attempt ledger');
  console.log('Concurrent sessions: one claim, one busy, one attempt.');

  const runId = (await run(`SELECT id FROM public.dashboard_generation_runs WHERE user_id='${owner}';`)).trim();
  const attempt = `BEGIN; SET LOCAL request.jwt.claim.role='service_role';
    SELECT public.dashboard_generation_audit_attempt('${owner}','${runId}','claude-sonnet-5','low','abcd',false);
    SELECT pg_sleep(0.1); COMMIT;`;
  const dispatches = (await Promise.all([run(attempt), run(attempt)])).flatMap((out) => out.split(/\r?\n/).filter((v) => ['t', 'f'].includes(v))).sort();
  if (JSON.stringify(dispatches) !== '["f","t"]') throw new Error('Audited dispatch duplicated');
  const completion = `SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_result('${owner}','${runId}','dcba','completed',12,'green',10);`;
  await Promise.all([run(completion), run(completion)]);
  if ((await run(`SELECT count(*) FROM public.ai_audit_log WHERE id='${runId}';`)).trim() !== '1') throw new Error('Audit replay duplicated');
  console.log('Concurrent audit: one dispatch, one attempt row, idempotent completions.');

  // Start the second transaction only when the first holds its locks and is
  // sleeping. Real separate connections, not Promise ordering assumptions.
  async function overlap(first, second, label) {
    const pending = run(`SET application_name='dashboard_g2w1_${label}'; ${first}`);
    const deadline = Date.now() + 5_000;
    let held = false;
    while (Date.now() < deadline) {
      held = (await run(`SELECT count(*) FROM pg_stat_activity WHERE application_name='dashboard_g2w1_${label}' AND wait_event='PgSleep';`)).trim() === '1';
      if (held) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    if (!held) { await pending; throw new Error('Concurrency barrier missed'); }
    await Promise.all([pending, run(second)]);
  }
  for (const first of ['finish', 'withdraw']) {
    const subject = `00000000-0000-0000-0000-00000000001${first === 'finish' ? '1' : '2'}`;
    await run(`INSERT INTO auth.users(id) VALUES('${subject}'); INSERT INTO public.users(id) VALUES('${subject}');
      INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read');`);
    const claim = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_request('${subject}','open','Asia/Seoul','ko')->>'id';`);
    const id = claim.split(/\r?\n/).find((line) => /^[a-f0-9-]{36}$/.test(line));
    await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_dispatch('${subject}','${id}');`);
    const finish = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_finish('${subject}','${id}','{"line":"late"}');`;
    // The event path includes 0193's real user -> receipt lock order.
    const withdraw = `BEGIN; INSERT INTO public.consent_changes(user_id,pref_key,event_type) VALUES('${subject}','recommendations','revoke');`;
    await overlap(`${first === 'finish' ? finish : withdraw} SELECT pg_sleep(0.8); COMMIT;`,
      `${first === 'finish' ? withdraw : finish} COMMIT;`, first);
    if ((await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${subject}' AND (output IS NOT NULL OR status<>'failed');`)).trim() !== '0') {
      throw new Error(`Withdrawal race survived: ${first}`);
    }
  }
  console.log('Concurrent withdrawal/finish: both lock orders close output without deadlock.');

  const recoveryOwner = '00000000-0000-0000-0000-000000000080';
  await run(`INSERT INTO auth.users(id) VALUES('${recoveryOwner}'); INSERT INTO public.users(id) VALUES('${recoveryOwner}');
    INSERT INTO public.ops_routines(id,user_id,title) VALUES('${recoveryOwner}','${recoveryOwner}','Read');`);
  const recover = `SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_request_v2('${recoveryOwner}','open','Asia/Seoul','ko');`;
  const firstLease = JSON.parse((await run(recover)).split(/\r?\n/).find((line) => line.startsWith('{')));
  await run(`UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '4 minutes' WHERE id='${firstLease.id}';`);
  const recoveries = (await Promise.all([run(recover), run(recover)]))
    .map((out) => JSON.parse(out.split(/\r?\n/).find((line) => line.startsWith('{'))));
  if (JSON.stringify(recoveries.map((r) => r.kind).sort()) !== '["busy","claimed"]') throw new Error('Concurrent recovery duplicated');
  const recovered = recoveries.find((r) => r.kind === 'claimed');
  const dispatchLease = (token) => `SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_attempt_v2(
    '${recoveryOwner}','${recovered.id}','claude-sonnet-5','low','abcd',false,'${token}');`;
  const leaseDispatches = (await Promise.all([run(dispatchLease(firstLease.lease_token)), run(dispatchLease(recovered.lease_token))]))
    .map((out) => out.split(/\r?\n/).find((v) => ['t', 'f'].includes(v)));
  if (JSON.stringify(leaseDispatches) !== '["f","t"]') throw new Error('Stale lease won concurrent dispatch');
  if ((await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${recoveryOwner}';`)).trim() !== '1'
    || (await run(`SELECT count(*) FROM public.ai_audit_log WHERE user_id='${recoveryOwner}';`)).trim() !== '2') throw new Error('Recovery audit 1:1 lost');
  console.log('Concurrent recovery: one replacement, stale dispatch refused, two leases/two audit rows.');

  // At N-1 attempts, two different recoverable keys compete for the LAST
  // allowance. A same-key busy result alone cannot prove quota serialization.
  const quotaOwner = '00000000-0000-0000-0000-000000000081';
  await run(`INSERT INTO auth.users(id) VALUES('${quotaOwner}'); INSERT INTO public.users(id) VALUES('${quotaOwner}');
    INSERT INTO public.ops_routines(id,user_id,title) VALUES('${quotaOwner}','${quotaOwner}','Read');`);
  const claimJson = async (input) => JSON.parse((await run(`SET request.jwt.claim.role='service_role'; ${input}`))
    .split(/\r?\n/).find((line) => line.startsWith('{')));
  const quotaRequest = (zone) => `SELECT public.dashboard_generation_request_v2('${quotaOwner}','open','${zone}','ko');`;
  const quotaA = await claimJson(quotaRequest('UTC'));
  // Choose a timezone whose slot differs from UTC at the current fixture time.
  const quotaZone = (await run(`SELECT name FROM pg_timezone_names WHERE
    (CASE WHEN extract(hour FROM now() AT TIME ZONE name)>=20 OR extract(hour FROM now() AT TIME ZONE name)<6 THEN 'evening'
      WHEN extract(hour FROM now() AT TIME ZONE name)>=13 THEN 'midday' ELSE 'morning' END)<>'${quotaA.slot}' LIMIT 1;`)).trim();
  const quotaB = await claimJson(quotaRequest(quotaZone));
  if (quotaA.kind !== 'claimed' || quotaB.kind !== 'claimed' || quotaA.id === quotaB.id) throw new Error('Quota race fixture');
  await run(`SET request.jwt.claim.role='service_role';
    SELECT public.dashboard_generation_finish_v2('${quotaOwner}','${quotaA.id}',NULL,'${quotaA.lease_token}');
    SELECT public.dashboard_generation_finish_v2('${quotaOwner}','${quotaB.id}',NULL,'${quotaB.lease_token}');`);
  const quotaResults = await Promise.all([claimJson(quotaRequest('UTC')), claimJson(quotaRequest(quotaZone))]);
  if (JSON.stringify(quotaResults.map((r) => r.kind).sort()) !== '["claimed","limited"]'
    || (await run(`SELECT count(*) FROM public.ai_audit_log WHERE user_id='${quotaOwner}';`)).trim() !== '3') {
    throw new Error('Concurrent retries exceeded daily allowance');
  }
  const limitedIndex = quotaResults.findIndex((r) => r.kind === 'limited');
  const limitedClaim = [quotaA, quotaB][limitedIndex];
  if ((await run(`SELECT lease_token FROM public.dashboard_generation_runs WHERE id='${limitedClaim.id}';`)).trim() !== limitedClaim.lease_token) {
    throw new Error('Limited retry replaced lease');
  }
  console.log('Concurrent retry quota: distinct keys at N-1 yield claimed + limited, three audits, limited lease unchanged.');

  // Hold A's user lock until B is visibly waiting, run C while A still holds
  // the lock, then release A. No timing/sleep assumption determines the race.
  async function acrossUserLock(subject, operation, during, label) {
    const holder = spawn('psql', args, { env, windowsHide: true, timeout: 15_000 });
    let holderError = '';
    holder.stdout.resume(); holder.stderr.on('data', (chunk) => { holderError += chunk; });
    const held = new Promise((resolveHeld, reject) => {
      holder.on('error', reject);
      holder.on('close', (code) => code === 0 ? resolveHeld() : reject(new Error(holderError)));
    });
    // Observe failures immediately even while polling another connection.
    held.catch(() => {});
    const app = `dashboard_fix1_${label}`;
    const waitFor = async (query) => {
      const deadline = Date.now()+5_000;
      while (Date.now()<deadline) {
        if ((await run(query)).trim() === '1') return;
        await new Promise((done) => setTimeout(done, 20));
      }
      throw new Error(`Lock barrier missed: ${label}`);
    };
    let blocked;
    try {
      holder.stdin.write(`SET application_name='${app}_a'; BEGIN; SELECT 1 FROM public.users WHERE id='${subject}' FOR UPDATE;\n`);
      await waitFor(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}_a' AND state='idle in transaction';`);
      blocked = run(`SET application_name='${app}_b'; SET request.jwt.claim.role='service_role'; ${operation}`);
      blocked.catch(() => {});
      await waitFor(`SELECT count(*) FROM pg_stat_activity b WHERE b.application_name='${app}_b' AND b.wait_event_type='Lock'
        AND EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.application_name='${app}_a' AND a.pid=ANY(pg_blocking_pids(b.pid)));`);
      await run(during);
    } finally {
      holder.stdin.end('COMMIT;\n');
      await held;
      if (blocked) await blocked;
    }
  }
  for (const [index, state] of ['eligible', 'withdrawn', 'token-mismatch'].entries()) {
    const subject = `00000000-0000-0000-0000-00000000008${index+2}`;
    await run(`INSERT INTO auth.users(id) VALUES('${subject}'); INSERT INTO public.users(id) VALUES('${subject}');
      INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read');`);
    const request = `SELECT public.dashboard_generation_request_v2('${subject}','open','UTC','ko');`;
    const claim = await claimJson(request);
    if (claim.kind !== 'claimed') throw new Error('Heartbeat race fixture');
    if (state === 'withdrawn') await run(`UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id='${subject}';`);
    if (state === 'token-mismatch') await run(`UPDATE public.dashboard_generation_runs SET consent_token=repeat('b',64) WHERE id='${claim.id}';`);
    await run(`UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';`);
    await acrossUserLock(subject,
      `SELECT public.dashboard_generation_finish_v2('${subject}','${claim.id}',NULL,'${claim.lease_token}');`,
      'SELECT public.purge_dashboard_generation();', `finish_${state.replace('-', '_')}`);
    const expected = state === 'eligible' ? 'pre_dispatch_failed' : 'failed';
    if ((await run(`SELECT status FROM public.dashboard_generation_runs WHERE id='${claim.id}';`)).trim() !== expected) {
      throw new Error(`Heartbeat recovery misclassified finish: ${state}`);
    }
    if (state === 'withdrawn') await run(`UPDATE public.users SET privacy_prefs='{"recommendations":true}' WHERE id='${subject}';`);
    if ((await claimJson(request)).kind !== (state === 'eligible' ? 'claimed' : 'waiting')) throw new Error(`Heartbeat recovery retry: ${state}`);
  }
  console.log('Three-session heartbeat recovery: eligible finish recovers; withdrawal and token mismatch remain terminal (3/3).');

  // The same guard must read freshness after a wait for request and paid
  // dispatch. A fresh pre-lock value must not authorize either when C expires it.
  for (const [index, action] of ['request', 'dispatch'].entries()) {
    const subject = `00000000-0000-0000-0000-00000000008${index+5}`;
    await run(`SELECT public.purge_dashboard_generation(); INSERT INTO auth.users(id) VALUES('${subject}');
      INSERT INTO public.users(id) VALUES('${subject}'); INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read');`);
    const request = `SELECT public.dashboard_generation_request_v2('${subject}','open','UTC','ko');`;
    const claim = action === 'dispatch' ? await claimJson(request) : null;
    await acrossUserLock(subject, claim
      ? `SELECT public.dashboard_generation_audit_attempt_v2('${subject}','${claim.id}','claude-sonnet-5','low','abcd',false,'${claim.lease_token}');`
      : request,
    "UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';", action);
    if ((await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${subject}'${claim ? " AND dispatched_at IS NOT NULL" : ''};`)).trim() !== '0') {
      throw new Error(`Pre-lock heartbeat authorized ${action}`);
    }
  }
  await run('SELECT public.purge_dashboard_generation();');
  console.log('Post-lock freshness: request and paid dispatch refuse a heartbeat expired during the user-lock wait (2/2).');

  await testDashboardLeaseSql({ run, overlap });

  // Replace decision stubs with the actual current consent functions. Only
  // surrounding auth/profile tables remain the disposable fixture. This tests
  // the service writer's record -> provenance -> receipt update transaction.
  function definition(file, name) {
    const source = readFileSync(resolve(dirname(fixture), `../migrations/${file}`), 'utf8');
    const start = source.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`));
    const end = source.indexOf('\nREVOKE ', start);
    if (start < 0 || end < 0) throw new Error(`Missing consent function ${name}`);
    return source.slice(start, end).replace(/^CREATE FUNCTION/, 'CREATE OR REPLACE FUNCTION');
  }
  const current = '0215_consent_email_v9_20261006.sql';
  await run(`CREATE FUNCTION public.billing_request_role() RETURNS text LANGUAGE sql AS $$
      SELECT current_setting('request.jwt.claim.role',true) $$;
    ${definition(current, 'signup_consent_contract')}
    ${definition(current, 'capture_llm_consent_provenance')}
    CREATE TRIGGER capture_llm_consent_provenance_after_insert AFTER INSERT ON public.consent_records
      FOR EACH ROW EXECUTE FUNCTION public.capture_llm_consent_provenance();
    ${definition(current, 'llm_consent_current_decision')}
    ${definition('0193_effective_llm_consent_current_contract.sql', 'effective_llm_consent_snapshot_v2')}
    ${definition('0194_llm_service_consent_management.sql', 'llm_service_consent_status')}
    ${definition('0210_polascope_consent_20260928.sql', 'llm_service_consent_status_v2')}
    ${definition(current, 'llm_service_consent_status_v4')}
    ${definition(current, 'write_llm_service_consent')}`);
  let scenario = 0;
  for (const protocol of ['', '_v2']) for (const writer of ['prefs', 'service']) for (const first of ['finish', 'withdraw']) {
    const subject = `00000000-0000-0000-0000-00000000004${++scenario}`;
    const serviceWrite = (action) => `SELECT public.write_llm_service_consent('${subject}','service-v4',
      public.llm_service_consent_status_v4('${subject}')->>'change_token','${action}',
      '${action === 'grant' ? '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}' : '{}'}','ko');`;
    await run(`SET request.jwt.claim.role='service_role';
      INSERT INTO auth.users(id) VALUES('${subject}'); INSERT INTO public.users(id) VALUES('${subject}');
      INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read'); ${serviceWrite('grant')}`);
    const claim = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_request${protocol}('${subject}','open','Asia/Seoul','ko');`);
    const reservation = JSON.parse(claim.split(/\r?\n/).find((line) => line.startsWith('{')));
    const id = reservation.id;
    const leaseArg = protocol ? `,'${reservation.lease_token}'` : '';
    if (!id) throw new Error('Real consent grant did not allow claim');
    const accepted = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_attempt${protocol}('${subject}','${id}','claude-sonnet-5','low','abcd',false${leaseArg});`);
    if (!accepted.split(/\r?\n/).includes('t')) throw new Error('Real consent dispatch denied');
    const finish = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_finish${protocol}('${subject}','${id}','{"line":"late"}'${leaseArg});`;
    const withdraw = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; ${writer === 'service'
      ? serviceWrite('revoke') : `UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id='${subject}';`}`;
    await overlap(`${first === 'finish' ? finish : withdraw} SELECT pg_sleep(0.8); COMMIT;`,
      `${first === 'finish' ? withdraw : finish} COMMIT;`, `${writer}_${first}${protocol}`);
    if ((await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${subject}' AND (output IS NOT NULL OR status<>'failed');`)).trim() !== '0') {
      throw new Error(`Real writer withdrawal race survived: ${writer}/${first}`);
    }
    const result = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_result${protocol}('${subject}','${id}','dcba','consent_withheld',12,'green',10${leaseArg});`);
    if (!result.split(/\r?\n/).includes('t')) throw new Error('Real revoke lost completed audit');
    if (protocol) {
      // Result retries must retain evidence while the actual consent writer
      // holds its user/receipt/run locks; exercise both acquisition orders.
      const audit = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_result_v2('${subject}','${id}','dcba','consent_withheld',12,'green',10${leaseArg});`;
      const grant = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; ${serviceWrite('grant')}`;
      await overlap(`${first === 'finish' ? audit : grant} SELECT pg_sleep(0.8); COMMIT;`,
        `${first === 'finish' ? grant : audit} COMMIT;`, `audit_${writer}_${first}`);
      if ((await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE id='${id}' AND (status<>'failed' OR output IS NOT NULL);`)).trim() !== '0') throw new Error('Regrant reopened dispatched lease');
    }
  }
  console.log('Actual consent contract: eight v1/v2 withdrawal/finish races and four v2 writer/audit-result races passed.');

  // Daybreak r1 finding 1: repairs that leave the current grant intact must
  // preserve the entire ready row. EXPLAIN also proves no-op UPDATE hooks skip
  // execution, independently of the invalidator's eligibility predicate.
  const repairFailures = [];
  for (const [index, repair] of ['receipt-noop', 'record-noop', 'historical-record'].entries()) {
    const subject = `00000000-0000-0000-0000-00000000005${index + 1}`;
    const grant = `SELECT public.write_llm_service_consent('${subject}','service-v4',
      public.llm_service_consent_status_v4('${subject}')->>'change_token','grant',
      '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}','ko');`;
    await run(`SET request.jwt.claim.role='service_role';
      INSERT INTO auth.users(id) VALUES('${subject}'); INSERT INTO public.users(id) VALUES('${subject}');
      INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read'); ${grant} ${grant}`);
    const claim = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_request('${subject}','open','Asia/Seoul','ko')->>'id';`);
    const id = claim.split(/\r?\n/).find((line) => /^[a-f0-9-]{36}$/.test(line));
    if (!id) throw new Error(`Repair fixture claim failed: ${repair}`);
    await run(`SET request.jwt.claim.role='service_role';
      SELECT public.dashboard_generation_dispatch('${subject}','${id}');
      SELECT public.dashboard_generation_finish('${subject}','${id}','{"line":"keep current slot"}');`);
    const snapshot = `SELECT row_to_json(g) FROM public.dashboard_generation_runs g WHERE id='${id}';`;
    const before = JSON.parse(await run(snapshot));
    if (before.status !== 'ready' || before.output?.line !== 'keep current slot') throw new Error(`Repair fixture not ready: ${repair}`);
    const decision = `SELECT row_to_json(c) FROM public.llm_consent_current_decision('${subject}') c;`;
    const beforeDecision = await run(decision);
    const update = repair === 'receipt-noop'
      ? `UPDATE public.llm_consent_receipts SET state_revision=state_revision WHERE user_id='${subject}'`
      : repair === 'record-noop'
        ? `UPDATE public.consent_records SET llm_processing_ack=llm_processing_ack WHERE user_id='${subject}'`
        : `UPDATE public.consent_records SET llm_processing_ack=false WHERE id=(
            SELECT consent_record_id FROM public.llm_consent_receipts WHERE user_id='${subject}' ORDER BY receipt_order ASC LIMIT 1)`;
    const [explain] = JSON.parse(await run(`EXPLAIN (ANALYZE, FORMAT JSON) ${update};`));
    if (beforeDecision !== await run(decision)) throw new Error(`Repair fixture changed current consent: ${repair}`);
    const calls = (explain.Triggers ?? []).filter((trigger) => trigger['Trigger Name'].startsWith('dashboard_'))
      .reduce((sum, trigger) => sum + trigger.Calls, 0);
    if (JSON.stringify(before) !== JSON.stringify(JSON.parse(await run(snapshot)))) repairFailures.push(`${repair}: ready/output changed`);
    if (repair.endsWith('-noop') && calls !== 0) repairFailures.push(`${repair}: no-op invalidator ran`);
    if (repair === 'historical-record' && calls !== 1) repairFailures.push(`${repair}: repair did not exercise invalidator`);
    // Each control then actually loses eligibility: token change, denied
    // current record, or a recommendation revoke after the run was created.
    const latest = `SELECT consent_record_id FROM public.llm_consent_receipts WHERE user_id='${subject}' ORDER BY receipt_order DESC LIMIT 1`;
    await run(repair === 'receipt-noop'
      ? `UPDATE public.llm_consent_receipts SET state_revision=state_revision+1 WHERE consent_record_id=(${latest});`
      : repair === 'record-noop'
        ? `UPDATE public.consent_records SET llm_processing_ack=false WHERE id=(${latest});`
        : `INSERT INTO public.consent_changes(user_id,pref_key,event_type) VALUES('${subject}','recommendations','revoke');`);
    const closed = JSON.parse(await run(snapshot));
    if (closed.status !== 'failed' || closed.output !== null) repairFailures.push(`${repair}: actual withdrawal survived`);
  }
  if (repairFailures.length) throw new Error(`Consent repair regression: ${repairFailures.join('; ')}`);
  console.log('Consent repairs: receipt no-op, record no-op, historical record preserve current consent and ready/output (3/3).');
  console.log('Consent repair controls: token change, current record denial, recommendation revoke close output (3/3).');
}
