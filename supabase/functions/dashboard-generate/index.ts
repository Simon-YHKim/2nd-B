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
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer \S+$/.test(authorization) || authorization.length > 8_192) return false;
    if (schedulerSecret.length < 32) {
      console.warn('dashboard_scheduler_missing_cron'); return false;
    }
    const candidate = request.headers.get('x-dashboard-cron') ?? '';
    if (candidate.length > 512) return false;
    const [a, b] = await Promise.all([sha256(candidate), sha256(schedulerSecret)]);
    const matches = a.reduce((difference, byte, i) => difference | (byte ^ b[i]), 0) === 0;
    if (!matches) { console.warn('dashboard_scheduler_cron_mismatch'); return false; }
    if (authorization === `Bearer ${serviceKey}`) return true;
    // Management API and Edge may expose different valid service credentials.
    // Prove the presented token's role through PostgREST instead of trusting
    // a decoded JWT or silently substituting the admin client's authority.
    // This read-only RPC is granted only to service_role and checks JWT role.
    try {
      const caller = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      });
      const proof = await caller.rpc('dashboard_generation_due', { p_after: null }).abortSignal(AbortSignal.timeout(5_000));
      return !proof.error && Array.isArray(proof.data);
    } catch { return false; }
  },
  rpc,
  generate: createBoardProvider({
    // Exact Sonnet model ID is an operator setting after the model-change review.
    model: Deno.env.get('DASHBOARD_SONNET_MODEL') ?? '', apiKey: (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim(),
    rpc, fetch,
  }),
});
Deno.serve(handler);
