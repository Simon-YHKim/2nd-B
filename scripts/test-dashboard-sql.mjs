// Explicit disposable loopback DB only; no remote URL or ambient PG settings.
// node scripts/test-dashboard-sql.mjs 55443 dashboard_test_w1
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  // R2271-03: keep the first transaction open until pg_blocking_pids proves
  // the other connection is waiting on it. No sleep-duration inference.
  async function lockedOverlap(first, second, label) {
    const heldName = `dashboard_note_${label}_held`;
    const waitingName = `dashboard_note_${label}_waiting`;
    const child = spawn('psql', args, { env, windowsHide: true, timeout: 15_000 });
    let output = ''; let error = ''; let markReady;
    const ready = new Promise((resolveReady) => { markReady = resolveReady; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.split(/\r?\n/).includes('NOTE_LOCK_HELD')) markReady(true);
    });
    child.stderr.on('data', (chunk) => { error += chunk; });
    const closed = new Promise((resolveClose) => {
      child.on('error', (err) => { error += err.message; markReady(false); resolveClose(-1); });
      child.on('close', (code) => { markReady(false); resolveClose(code); });
    });
    child.stdin.write(`SET application_name='${heldName}'; BEGIN; SET LOCAL request.jwt.claim.role='service_role';
      ${first}\n\\echo NOTE_LOCK_HELD\n`);
    let waiter;
    try {
      if (!await ready) throw new Error(`First connection failed: ${label}: ${error}`);
      // Capture rejection immediately, even while the observer is polling.
      waiter = run(`SET application_name='${waitingName}'; BEGIN; SET LOCAL request.jwt.claim.role='service_role'; ${second} COMMIT;`)
        .then((value) => ({ value }), (failure) => ({ failure }));
      const deadline = Date.now() + 5_000;
      let blocked = false;
      while (Date.now() < deadline) {
        blocked = (await run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity a,pg_stat_activity b
          WHERE a.application_name='${waitingName}' AND b.application_name='${heldName}'
            AND a.wait_event_type='Lock' AND b.pid=ANY(pg_blocking_pids(a.pid)));`)).trim() === 't';
        if (blocked) break;
        await new Promise((done) => setTimeout(done, 20));
      }
      if (!blocked) throw new Error(`R2271-03 expected lock wait: ${label}`);
      child.stdin.end('COMMIT;\n');
      if (await closed !== 0) throw new Error(`First commit failed: ${label}: ${error}`);
      const result = await waiter;
      if (result.failure) throw result.failure;
      return [output, result.value];
    } finally {
      if (!child.stdin.writableEnded) child.stdin.end('ROLLBACK;\n');
      await closed;
      if (waiter) await waiter;
    }
  }
  let noteAssertions = 0;
  const noteAssert = (ok, label) => {
    if (!ok) throw new Error(`R2271-03 ${label}`);
    noteAssertions++;
  };
  let noteScenario = 0;
  for (const edit of ['delete', 'title']) for (const first of ['open', 'edit']) {
    const subject = `00000000-0000-0000-0000-00000000006${++noteScenario}`;
    const spare = `10000000-0000-0000-0000-00000000006${noteScenario}`;
    await run(`SET request.jwt.claim.role='service_role';
      INSERT INTO auth.users(id) VALUES('${subject}'); INSERT INTO public.users(id) VALUES('${subject}');
      INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read'),('${spare}','${subject}','Write');
      SELECT public.dashboard_generation_request('${subject}','open','Asia/Seoul','ko');`);
    const id = (await run(`SELECT id FROM public.dashboard_generation_runs WHERE user_id='${subject}';`)).trim();
    await run(`SET request.jwt.claim.role='service_role';
      SELECT public.dashboard_generation_dispatch('${subject}','${id}');
      SELECT public.dashboard_generation_finish('${subject}','${id}',
        jsonb_build_object('line','Read today.','slot','morning','basis_refs',jsonb_build_array(
          jsonb_build_object('kind','routine','id','${subject}')),'reminder_suggestions','[]'::jsonb));
      INSERT INTO public.ops_routine_logs(routine_id,user_id,completed_on)
        VALUES('${subject}','${subject}',(now() AT TIME ZONE 'Asia/Seoul')::date);`);
    const open = `SELECT public.dashboard_generation_request('${subject}','open','Asia/Seoul','ko');`;
    const change = edit === 'delete' ? `DELETE FROM public.ops_routines WHERE id='${subject}';`
      : `UPDATE public.ops_routines SET title='Walk' WHERE id='${subject}';`;
    const label = `${edit}_${first}`;
    const outcomes = await lockedOverlap(first === 'open' ? open : change, first === 'open' ? change : open, label);
    noteAssert(true, `${label} waited on held transaction`);
    const response = JSON.parse(outcomes[first === 'open' ? 0 : 1].split(/\r?\n/).find((line) => line.startsWith('{')));
    noteAssert(first === 'open' ? response.kind === 'ready' && response.previous === true && response.value.line === 'Read today.'
      : response.kind === 'waiting' && !('previous' in response), `${label} serialized response`);
    noteAssert((await run(`SELECT status='failed' AND output IS NULL FROM public.dashboard_generation_runs WHERE id='${id}';`)).trim() === 't',
      `${label} committed invalidation`);
    const after = JSON.parse((await run(`SET request.jwt.claim.role='service_role'; ${open}`)).split(/\r?\n/).find((line) => line.startsWith('{')));
    noteAssert(after.kind === 'waiting' && !('previous' in after), `${label} post-commit read`);
    console.log(`Last-note concurrency: ${label} lock wait, response, invalidation, post-commit read passed.`);
  }
  // Executor probe: after waiting, LIMIT 1 can continue to the older candidate
  // if it remains valid. Real routine invalidation clears ALL owner outputs.
  const probeOwner = '00000000-0000-0000-0000-000000000061';
  await run(`INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,created_at,expires_at)
    SELECT '${probeOwner}','daily_note',key,'x',repeat('a',64),'ready',
      jsonb_build_object('line',line,'slot','morning','basis_refs',jsonb_build_array(jsonb_build_object(
        'kind','routine','id','10000000-0000-0000-0000-000000000061')),'reminder_suggestions','[]'::jsonb),created,now()+interval '1 day'
      FROM (VALUES('probe-old','older',now()-interval '1 minute'),('probe-new','newer',now())) v(key,line,created);`);
  const [, reevaluated] = await lockedOverlap(
    `UPDATE public.dashboard_generation_runs SET status='failed',output=NULL WHERE user_id='${probeOwner}' AND request_key='probe-new';`,
    `SELECT public.dashboard_generation_request('${probeOwner}','open','Asia/Seoul','ko');`, 'limit_reevaluation');
  const rechecked = JSON.parse(reevaluated.split(/\r?\n/).find((line) => line.startsWith('{')));
  noteAssert(rechecked.kind === 'ready' && rechecked.previous === true && rechecked.value.line === 'older',
    'LIMIT 1 continues to an older still-valid candidate after recheck');
  console.log(`Last-note concurrency assertions passed: ${noteAssertions}. LIMIT recheck selects older when still valid; owner invalidation returns no note.`);

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
  for (const writer of ['prefs', 'service']) for (const first of ['finish', 'withdraw']) {
    const subject = `00000000-0000-0000-0000-00000000004${++scenario}`;
    const serviceWrite = (action) => `SELECT public.write_llm_service_consent('${subject}','service-v4',
      public.llm_service_consent_status_v4('${subject}')->>'change_token','${action}',
      '${action === 'grant' ? '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}' : '{}'}','ko');`;
    await run(`SET request.jwt.claim.role='service_role';
      INSERT INTO auth.users(id) VALUES('${subject}'); INSERT INTO public.users(id) VALUES('${subject}');
      INSERT INTO public.ops_routines(id,user_id,title) VALUES('${subject}','${subject}','Read'); ${serviceWrite('grant')}`);
    const claim = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_request('${subject}','open','Asia/Seoul','ko')->>'id';`);
    const id = claim.split(/\r?\n/).find((line) => /^[a-f0-9-]{36}$/.test(line));
    if (!id) throw new Error('Real consent grant did not allow claim');
    const accepted = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_attempt('${subject}','${id}','claude-sonnet-5','low','abcd',false);`);
    if (!accepted.split(/\r?\n/).includes('t')) throw new Error('Real consent dispatch denied');
    const finish = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_finish('${subject}','${id}','{"line":"late"}');`;
    const withdraw = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; ${writer === 'service'
      ? serviceWrite('revoke') : `UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id='${subject}';`}`;
    await overlap(`${first === 'finish' ? finish : withdraw} SELECT pg_sleep(0.8); COMMIT;`,
      `${first === 'finish' ? withdraw : finish} COMMIT;`, `${writer}_${first}`);
    if ((await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${subject}' AND (output IS NOT NULL OR status<>'failed');`)).trim() !== '0') {
      throw new Error(`Real writer withdrawal race survived: ${writer}/${first}`);
    }
    const result = await run(`SET request.jwt.claim.role='service_role'; SELECT public.dashboard_generation_audit_result('${subject}','${id}','dcba','consent_withheld',12,'green',10);`);
    if (!result.split(/\r?\n/).includes('t')) throw new Error('Real revoke lost completed audit');
  }
  console.log('Actual consent contract: grant/revoke writer and privacy withdrawal vs finish, four races passed.');

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
