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
}
