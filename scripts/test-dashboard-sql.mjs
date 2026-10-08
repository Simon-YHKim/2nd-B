// Explicit disposable loopback DB only; no remote URL or ambient PG settings.
// node scripts/test-dashboard-sql.mjs 55443 dashboard_test_w1
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const [port, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? '') || +port > 65535 || !/^dashboard_test[a-z0-9_]*$/.test(database ?? '')) throw new Error('Explicit disposable local DB required');
const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '../db/tests/dashboard_generation_bootstrap.sql');
const sql = readFileSync(fixture, 'utf8').replace(/^\\ir (.+)$/gm, (_, path) => `\\ir '${resolve(dirname(fixture), path).replaceAll('\\', '/')}'`);
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
}
