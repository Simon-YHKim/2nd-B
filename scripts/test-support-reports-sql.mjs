// Local PostgreSQL only; creates no database and never loads environment files.
// Usage: node scripts/test-support-reports-sql.mjs 55453 t53_support_test_races
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const [port, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? '') || !/^t53_support_test_[a-z0-9_]+$/.test(database ?? '')) {
  throw new Error('Expected a localhost port and disposable t53_support_test_* database');
}
const args = ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'];
const exec = (sql, file) => {
  const r = spawnSync('psql', file ? [...args, '-f', file] : args, { input: sql, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
exec(undefined, 'db/migration-drafts/tests/support-reports-setup.sql');
exec(`INSERT INTO auth.users VALUES ('a0000000-0000-4000-8000-000000000001');
INSERT INTO public.users VALUES ('a0000000-0000-4000-8000-000000000001',1980);`);
const call = (key) => `SELECT public.submit_support_report('${key}','bug','race',
  '{"app_version":"1.0","screen_path":"/support","locale":"en"}','support-v1');`;
const role = `SET ROLE authenticated; SET request.jwt.claim.sub='a0000000-0000-4000-8000-000000000001';`;
const one = '10000000-0000-4000-8000-000000000001';
const two = '20000000-0000-4000-8000-000000000002';

async function race(secondKey) {
  const first = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = ''; let errors = ''; let second;
  let resolveSecond;
  const secondDone = new Promise(r => { resolveSecond = r; });
  first.stdout.on('data', data => {
    out += data;
    if (!second && out.includes('T53_LOCKED')) {
      second = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; let error = '';
      second.stdout.on('data', d => { output += d; });
      second.stderr.on('data', d => { error += d; });
      second.on('close', code => resolveSecond({ code, output, error }));
      second.stdin.end(`${role}\n${call(secondKey)}`);
    }
  });
  first.stderr.on('data', data => { errors += data; });
  const closed = new Promise(r => first.on('close', r));
  first.stdin.end(`BEGIN; ${role}\n${call(one)}\n\\echo T53_LOCKED\nSELECT pg_sleep(1); COMMIT;`);
  assert.equal(await closed, 0, errors);
  assert.ok(second, 'first writer never reached its locked marker');
  return { out, second: await secondDone };
}

const duplicate = await race(one);
assert.equal(duplicate.second.code, 0, duplicate.second.error);
assert.equal(exec('SELECT count(*) FROM public.support_reports'), '1');
const receipt = exec('SELECT id FROM public.support_reports');
assert.ok(duplicate.out.includes(receipt) && duplicate.second.output.includes(receipt));
console.log('PASS concurrent same request: one receipt, one row');

// Only disposable fixture rows are reset. Production database names are refused.
for (const [name, count, age] of [['minute', 1, '0 seconds'], ['day', 9, '2 hours']]) {
  exec(`TRUNCATE public.support_reports;
    INSERT INTO public.support_reports(user_id,request_id,kind,body,metadata,consent_version,created_at)
    SELECT 'a0000000-0000-4000-8000-000000000001',gen_random_uuid(),'bug','seed',
    '{"app_version":"1.0","screen_path":"/support","locale":"en"}'::jsonb,'support-v1',clock_timestamp()-interval '${age}'
    FROM generate_series(1,${count});`);
  const result = await race(two);
  assert.notEqual(result.second.code, 0, `${name}: second writer passed quota`);
  assert.match(result.second.error, /support_rate_limited/);
  assert.equal(exec('SELECT count(*) FROM public.support_reports'), String(count + 1));
  console.log(`PASS concurrent ${name} last slot: exactly one accepted`);
}
