import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { createWeatherHandler } from './handler.ts';

// NOAA bulk has no API key. Default OFF; activation is an explicit operational setting.
const url = Deno.env.get('SUPABASE_URL') ?? '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
Deno.serve(createWeatherHandler({
  enabled: Deno.env.get('WEATHER_SERVICE_ENABLED') === 'true',
  userAgent: Deno.env.get('WEATHER_USER_AGENT') ?? '',
  async authenticate(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  async rpc(name, args) { return await admin.rpc(name, args); },
  fetch: globalThis.fetch,
}));
