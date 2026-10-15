// Operator-only scheduler. No personal content or credentials printed.
// Retention runs even when generation is disabled. Its DB transaction also
// refreshes the heartbeat checked by every generation request and dispatch.
const base = new URL(process.env.DASHBOARD_SUPABASE_URL ?? '');
if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) || base.pathname !== '/') throw new Error('Invalid dashboard host');
const key = process.env.DASHBOARD_SERVICE_ROLE_KEY;
const cron = process.env.DASHBOARD_CRON_SECRET;
if (!key) throw new Error('Missing scheduler configuration');
const headers = { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json', ...(cron ? { 'x-dashboard-cron': cron } : {}) };
const purge = await fetch(new URL('/rest/v1/rpc/purge_dashboard_generation', base), {
  method: 'POST', headers, body: '{}', redirect: 'error', signal: AbortSignal.timeout(30_000),
});
if (!purge.ok) throw new Error('Dashboard retention unavailable');
if (process.env.DASHBOARD_GENERATION_ENABLED !== 'true') {
  console.log('Dashboard retention finished; generation disabled.');
  process.exit(0);
}
if (!cron || cron.length < 32) throw new Error('Missing scheduler configuration');
let cursor; let processed = 0;
const deadline = Date.now() + 50 * 60_000;
do {
  const response = await fetch(new URL('/functions/v1/dashboard-generate', base), {
    method: 'POST', headers, body: JSON.stringify({ action: 'hourly', ...(cursor ? { cursor } : {}) }),
    redirect: 'error', signal: AbortSignal.timeout(140_000),
  });
  if (!response.ok) throw new Error(`Dashboard batch unavailable (${response.status})`);
  const result = await response.json();
  if (result.kind !== 'batch' || !Number.isInteger(result.processed) || result.processed < 0 || result.processed > 10 ||
      (result.nextCursor !== null && (typeof result.nextCursor !== 'string' || !/^[0-9a-f-]{36}$/.test(result.nextCursor))) ||
      (cursor && result.nextCursor !== null && result.nextCursor <= cursor)) throw new Error('Invalid dashboard batch');
  processed += result.processed; cursor = result.nextCursor;
  if (cursor && Date.now() > deadline) throw new Error('Dashboard batch window elapsed');
} while (cursor);
console.log(`Dashboard hourly batch finished; processed=${processed}`);
