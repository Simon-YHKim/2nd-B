// Production workflow helper. Credentials stay in memory and never enter logs.
const ref = process.env.PROJECT_REF ?? '';
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
if (!/^[a-z0-9]{20}$/.test(ref) || !token) throw new Error('dashboard_operator_credentials_required');
const api = `https://api.supabase.com/v1/projects/${ref}`;
async function management(path, init = {}) {
  const response = await fetch(api + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  if (!response.ok) throw new Error(`dashboard_management_${response.status}`);
  return response;
}
const mode = process.argv[2];
if (mode === 'configure') {
  const enabled = process.env.DASHBOARD_ENABLED;
  const model = process.env.DASHBOARD_MODEL;
  const cron = process.env.DASHBOARD_CRON_SECRET ?? '';
  if (!['true', 'false'].includes(enabled) || model !== 'claude-sonnet-5' || cron.length < 32) throw new Error('dashboard_configuration_invalid');
  if (enabled === 'true') {
    const retention = await (await management('/database/query', { method: 'POST',
      body: JSON.stringify({ query: 'SELECT public.dashboard_generation_retention_ready() AS ready;' }),
    })).json();
    if (!Array.isArray(retention) || retention.length !== 1 || retention[0]?.ready !== true) {
      throw new Error('dashboard_retention_unavailable');
    }
    const response = await fetch(`https://api.anthropic.com/v1/models/${model}`, {
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || (await response.json()).id !== model) throw new Error('dashboard_model_unavailable');
  }
  await management('/secrets', { method: 'POST', body: JSON.stringify([
    { name: 'DASHBOARD_GENERATION_ENABLED', value: enabled },
    { name: 'DASHBOARD_SONNET_MODEL', value: model },
    { name: 'DASHBOARD_CRON_SECRET', value: cron },
  ]) });
  console.log(`Dashboard Edge enabled=${enabled}; model=${model}.`);
} else if (mode === 'hourly') {
  // Do not duplicate the existing service credential in another repository secret.
  const keys = await (await management('/api-keys')).json();
  const key = Array.isArray(keys) ? keys.find((entry) => entry.name === 'service_role')?.api_key : null;
  if (typeof key !== 'string' || !key) throw new Error('dashboard_service_key_unavailable');
  process.env.DASHBOARD_SUPABASE_URL = `https://${ref}.supabase.co`;
  process.env.DASHBOARD_SERVICE_ROLE_KEY = key;
  await import('./run-dashboard-hourly.mjs');
} else throw new Error('dashboard_operator_mode_invalid');
