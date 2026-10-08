import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createDashboardHandler } from './handler.ts';
import { createBoardProvider } from './provider.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const rpc = (name: string, args: Record<string, unknown>) => admin.rpc(name, args);
const schedulerSecret = Deno.env.get('DASHBOARD_CRON_SECRET') ?? '';
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const handler = createDashboardHandler({
  enabled: Deno.env.get('DASHBOARD_GENERATION_ENABLED') === 'true',
  authenticate: async (request) => {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!token || token === serviceKey) return null;
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  isScheduler: async (request) => {
    // Gateway JWT + two server secrets. No client flag grants scheduler rights.
    if (request.headers.get('authorization') !== `Bearer ${serviceKey}` || schedulerSecret.length < 32) return false;
    const candidate = request.headers.get('x-dashboard-cron') ?? '';
    if (candidate.length > 512) return false;
    const [a, b] = await Promise.all([sha256(candidate), sha256(schedulerSecret)]);
    return a.reduce((difference, byte, i) => difference | (byte ^ b[i]), 0) === 0;
  },
  rpc,
  generate: createBoardProvider({
    // Exact Sonnet model ID is an operator setting after the model-change review.
    model: Deno.env.get('DASHBOARD_SONNET_MODEL') ?? '', apiKey: (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim(),
    rpc, fetch,
    audit: async (row) => {
      try { const result = await admin.from('ai_audit_log').insert(row); return !result.error; }
      catch { return false; }
    },
  }),
});
Deno.serve(handler);
