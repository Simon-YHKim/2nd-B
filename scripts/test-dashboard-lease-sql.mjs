// Called by the disposable loopback SQL runner. Real Edge and PostgreSQL;
// only vendor I/O and the explicitly injected RPC failures are replaced.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as zod from 'zod';

export async function testDashboardLeaseSql({ run, overlap }) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const map = JSON.parse(readFileSync(resolve(root, 'supabase/functions/import_map.json'), 'utf8')).imports;
  const modules = new Map();
  function edge(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('exports', 'require', code)(exports, (specifier) => {
      if (specifier === 'zod') return zod;
      const target = resolve(dirname(file), specifier);
      if (target.endsWith('.ts')) return edge(target);
      const entry = Object.entries(map).find(([key]) => resolve(root, 'supabase/functions', key) === target);
      if (!entry) throw new Error(`Missing Deno mapping: ${specifier}`);
      return edge(resolve(root, 'supabase/functions', entry[1]));
    });
    return exports;
  }
  const { createBoardProvider } = edge(resolve(root, 'supabase/functions/dashboard-generate/provider.ts'));
  const { createDashboardHandler } = edge(resolve(root, 'supabase/functions/dashboard-generate/handler.ts'));
  const quote = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  const rpc = async (name, args) => {
    if (!/^dashboard_generation_[a-z_0-9]+$/.test(name) || Object.keys(args).some((k) => !/^p_[a-z_]+$/.test(k))) throw new Error('Unexpected fixture RPC');
    const sqlArgs = Object.entries(args).map(([k, v]) => `${k}=>${quote(typeof v === 'object' && v !== null ? JSON.stringify(v) : v)}`).join(',');
    const out = await run(`SET request.jwt.claim.role='service_role'; SELECT to_json(public.${name}(${sqlArgs}));`);
    return { data: JSON.parse(out.split(/\r?\n/).find((line) => /^(?:\{|true$|false$)/.test(line))) };
  };
  const setup = async (n, title = 'Read') => {
    const owner = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    await run(`SELECT public.purge_dashboard_generation(); INSERT INTO auth.users(id) VALUES('${owner}');
      INSERT INTO public.users(id) VALUES('${owner}'); INSERT INTO public.ops_routines(id,user_id,title) VALUES('${owner}','${owner}',${quote(title)});`);
    return owner;
  };
  const request = (owner) => rpc('dashboard_generation_request_v2', { p_user_id: owner, p_action: 'open', p_timezone: 'UTC', p_locale: 'ko' });
  const fail = (mode) => {
    if (mode === 'throw') throw new Error('synthetic RPC failure');
    return mode === 'error' ? { error: true } : { data: false };
  };
  let n = 300;
  for (const stage of ['audit', 'terminal', 'begin']) for (const failure of ['error', 'false', 'throw']) {
    const owner = await setup(++n, 'I want\nto die.');
    let fetches = 0; let finishes = 0; let classifications = 0; let claim;
    const io = async (name, args) => {
      if (name === 'dashboard_generation_finish_v2') finishes++;
      if (name === 'dashboard_generation_begin_classification_v2') {
        classifications++;
        if (stage === 'begin') { await rpc(name, args); return fail(failure); } // committed, lost ACK
      }
      if (name === 'dashboard_generation_audit_attempt_v2') return fail(failure);
      if (stage === 'terminal' && name === 'dashboard_generation_block_v2') return fail(failure);
      const response = await rpc(name, args);
      if (name === 'dashboard_generation_request_v2' && response.data.kind === 'claimed') claim = response.data;
      return response;
    };
    const generate = createBoardProvider({ model: 'claude-sonnet-5', apiKey: 'fixture-key', rpc: io,
      fetch: async () => { fetches++; throw new Error('Vendor I/O forbidden'); } });
    const handler = createDashboardHandler({ enabled: true, authenticate: async () => owner, isScheduler: async () => false, rpc: io, generate });
    const send = () => handler(new Request('https://fixture.invalid/dashboard', { method: 'POST',
      body: JSON.stringify({ action: 'open', timeZone: 'UTC', locale: 'ko' }) }));
    if ((await (await send()).json()).kind !== 'unavailable' || !claim) throw new Error(`Red fixture failed: ${stage}/${failure}`);
    await run(`UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '4 minutes' WHERE id='${claim.id}';`);
    for (let retry = 0; retry < 2; retry++) {
      if ((await (await send()).json()).kind !== 'waiting') throw new Error(`Red failure reopened key: ${stage}/${failure}`);
    }
    const expectedModel = stage === 'audit' ? 'dashboard+crisis' : 'dashboard+classifying';
    const evidence = await run(`SELECT count(*) FROM public.ai_audit_log WHERE user_id='${owner}' AND id='${claim.lease_token}'
      AND model_used='${expectedModel}' AND outbox_event_id='dashboard:${claim.id}:${claim.lease_token}';`);
    if (fetches !== 0 || finishes !== 0 || classifications !== 1 || evidence.trim() !== '1'
      || (await run(`SELECT count(*) FROM public.ai_audit_log WHERE user_id='${owner}';`)).trim() !== '1') {
      throw new Error(`Red failure changed evidence/model/finish: ${stage}/${failure}`);
    }
  }
  console.log('Real Edge + DB: audit/terminal/begin error,false,throw (9/9), repeat key waiting, one audit, zero fetch/ordinary finish.');

  // A real expiry refusal is different from a lost ACK: no phase ever began.
  // Observe the actual classifier entry points, and forbid all subsequent I/O.
  const safety = edge(resolve(root, 'supabase/functions/_shared/llm-input-safety.ts'));
  const common = edge(resolve(root, 'supabase/functions/_shared/llm-proxy-common.ts'));
  const classify = safety.hasRedZoneInput; const crisis = common.hasCrisisTerm;
  for (const mode of ['expired','unconfirmed','deleted','tombstone','suspended','minor','birth-date','recommendations','consent','token']) for (const title of ['Read', 'I want\nto die.']) {
    const subject = await setup(++n, title);
    let initial; let auditBefore; let runBefore; let classifications = 0; let fetches = 0;
    const calls = [];
    safety.hasRedZoneInput = (...args) => { classifications++; return classify(...args); };
    common.hasCrisisTerm = (...args) => { classifications++; return crisis(...args); };
    try {
      const io = async (name, args) => {
        calls.push(name);
        if (!['dashboard_generation_request_v2', 'dashboard_generation_begin_classification_v2'].includes(name)) {
          throw new Error(`Expired begin attempted downstream I/O: ${name}`);
        }
        const response = await rpc(name, args);
        if (name === 'dashboard_generation_request_v2') {
          initial = response.data;
          const change = {
            expired: `UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '3 minutes' WHERE id='${initial.id}';`,
            unconfirmed: `UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${subject}';`,
            deleted: `UPDATE auth.users SET deleted_at=now() WHERE id='${subject}';`,
            tombstone: `INSERT INTO public.account_deletion_tombstones VALUES('${subject}');`,
            suspended: `UPDATE public.users SET account_status='suspended' WHERE id='${subject}';`,
            minor: `UPDATE public.users SET minor_tier='minor_self' WHERE id='${subject}';`,
            'birth-date': `UPDATE public.users SET birth_date=current_date WHERE id='${subject}';`,
            recommendations: `UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id='${subject}';`,
            consent: `UPDATE public.users SET test_consent=false WHERE id='${subject}';`,
            token: `UPDATE public.users SET test_token=repeat('b',64) WHERE id='${subject}';`,
          }[mode];
          await run(`${change} UPDATE public.dashboard_generation_runs SET status='pending' WHERE id='${initial.id}';`);
          runBefore = await run(`SELECT row_to_json(g) FROM public.dashboard_generation_runs g WHERE id='${initial.id}';`);
          auditBefore = await run(`SELECT row_to_json(a) FROM public.ai_audit_log a WHERE id='${initial.lease_token}';`);
        }
        return response;
      };
      const generate = createBoardProvider({ model: 'claude-sonnet-5', apiKey: 'fixture-key', rpc: io,
        fetch: async () => { fetches++; throw new Error('Vendor I/O forbidden'); } });
      const handler = createDashboardHandler({ enabled: true, authenticate: async () => subject, isScheduler: async () => false, rpc: io, generate });
      const response = await handler(new Request('https://fixture.invalid/dashboard', { method: 'POST',
        body: JSON.stringify({ action: 'open', timeZone: 'UTC', locale: 'ko' }) }));
      if ((await response.json()).kind !== 'unavailable' || classifications !== 0 || fetches !== 0
        || JSON.stringify(calls) !== JSON.stringify(['dashboard_generation_request_v2', 'dashboard_generation_begin_classification_v2'])
        || runBefore !== await run(`SELECT row_to_json(g) FROM public.dashboard_generation_runs g WHERE id='${initial.id}';`)
        || auditBefore !== await run(`SELECT row_to_json(a) FROM public.ai_audit_log a WHERE id='${initial.lease_token}';`)) {
        throw new Error(`Begin ${mode} changed evidence or reached classifier/model/finish/block`);
      }
      const { data: renewed } = mode === 'expired' ? await request(subject) : { data: null };
      if (renewed && (renewed.kind !== 'claimed' || renewed.id !== initial.id || renewed.lease_token === initial.lease_token)) throw new Error('Expired Edge refusal prevented recovery');
    } finally { safety.hasRedZoneInput = classify; common.hasCrisisTerm = crisis; }
  }
  console.log('Begin eligibility/expiry real Edge + DB: 10 conditions x green/red inputs (20/20), classifier/fetch/downstream RPC 0, unchanged run/audit, same-key recovery.');

  for (const first of ['begin', 'retry']) {
    const subject = await setup(++n);
    const { data: initial } = await request(subject);
    await run(`UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '3 minutes' WHERE id='${initial.id}';`);
    const begin = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; DO $$ BEGIN
      IF public.dashboard_generation_begin_classification_v2('${subject}','${initial.id}','${initial.lease_token}') IS DISTINCT FROM false
        THEN RAISE EXCEPTION 'expired begin won classification race'; END IF; END $$;`;
    const retry = `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; DO $$ BEGIN
      IF public.dashboard_generation_request_v2('${subject}','open','UTC','ko')->>'kind' IS DISTINCT FROM 'claimed'
        THEN RAISE EXCEPTION 'expired begin blocked retry race'; END IF; END $$;`;
    await overlap(`${first === 'begin' ? begin : retry} SELECT pg_sleep(2); COMMIT;`,
      `${first === 'begin' ? retry : begin} COMMIT;`, `expired_${first}`, true);
    const row = JSON.parse((await run(`SELECT row_to_json(g) FROM public.dashboard_generation_runs g WHERE user_id='${subject}';`)).trim());
    if (row.id !== initial.id || row.lease_token === initial.lease_token || row.status !== 'pending' || row.dispatched_at !== null
      || (await run(`SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id='${subject}';`)).trim() !== '1'
      || (await run(`SELECT count(*) FROM public.ai_audit_log WHERE user_id='${subject}';`)).trim() !== '2'
      || (await run(`SELECT model_used FROM public.ai_audit_log WHERE id='${initial.lease_token}';`)).trim() !== 'dashboard+pre_dispatch_failed'
      || (await run(`SELECT model_used FROM public.ai_audit_log WHERE id='${row.lease_token}';`)).trim() !== 'dashboard+attempt'
      || (await request(subject)).data.kind !== 'busy') throw new Error('Expired begin race lost single replacement/audit lineage');
    if (!(await rpc('dashboard_generation_begin_classification_v2', { p_user_id: subject, p_run_id: row.id, p_lease_token: row.lease_token })).data) {
      throw new Error('Fresh race survivor cannot start classification');
    }
  }
  console.log('Expired begin/retry two connections: both lock waits observed (2/2), one fresh lease, two audit rows, fresh begin succeeds.');

  // A successful red audit whose ACK is lost is still a terminal 1-row audit.
  const owner = await setup(++n);
  const { data: claim } = await request(owner);
  const leaseArgs = { p_user_id: owner, p_run_id: claim.id, p_lease_token: claim.lease_token };
  await rpc('dashboard_generation_begin_classification_v2', leaseArgs);
  await rpc('dashboard_generation_audit_attempt_v2', { ...leaseArgs, p_model: 'claude-sonnet-5', p_effort: 'low', p_prompt_hash: 'abcd', p_crisis: true });
  const before = await run(`SELECT row_to_json(a) FROM public.ai_audit_log a WHERE id='${claim.lease_token}';`);
  await rpc('dashboard_generation_block_v2', leaseArgs);
  await rpc('dashboard_generation_block_v2', leaseArgs);
  if (before !== await run(`SELECT row_to_json(a) FROM public.ai_audit_log a WHERE id='${claim.lease_token}';`)) throw new Error('Red terminal changed committed evidence');

  for (const first of ['retry', 'purge']) {
    const subject = await setup(++n);
    const { data: initial } = await request(subject);
    await run(`UPDATE public.dashboard_generation_runs SET created_at=now()-interval '49 hours',
      leased_at=now()-interval '49 hours' WHERE id='${initial.id}';`);
    const retry = `BEGIN; SET LOCAL request.jwt.claim.role='service_role';
      SELECT public.dashboard_generation_request_v2('${subject}','open','UTC','ko');`;
    const purge = 'BEGIN; SELECT public.purge_dashboard_generation();';
    await overlap(`${first === 'retry' ? retry : purge} SELECT pg_sleep(0.8); COMMIT;`,
      `${first === 'retry' ? purge : retry} COMMIT;`, `purge_${first}`);
    const row = JSON.parse((await run(`SELECT row_to_json(g) FROM public.dashboard_generation_runs g WHERE user_id='${subject}';`)).trim());
    if (!row || row.lease_token === initial.lease_token || (first === 'retry' && row.id !== initial.id)) throw new Error('Purge/retry lost fresh lease');
    const args = { p_user_id: subject, p_run_id: row.id, p_lease_token: row.lease_token };
    if (!(await rpc('dashboard_generation_audit_attempt_v2', { ...args, p_model: 'claude-sonnet-5', p_effort: 'low', p_prompt_hash: 'abcd', p_crisis: false })).data) throw new Error('Race survivor cannot dispatch');
    await run('SELECT public.purge_dashboard_generation();');
    if (!['busy', 'waiting'].includes((await request(subject)).data.kind)) throw new Error('Purge/retry repeated paid lease');
    if ((await run(`SELECT count(*) FROM public.ai_audit_log WHERE user_id='${subject}';`)).trim() !== '2') throw new Error('Purge/retry audit lineage');
  }
  console.log('Purge/retry two connections: both lock orders, one surviving current lease, dispatched key cannot reopen (2/2).');
}
