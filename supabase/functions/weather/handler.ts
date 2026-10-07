// No logs, storage, coordinate cache, arbitrary upstream URL or forwarded IP.
import { readJsonObject, readBodyBytes } from '../_shared/request-json.ts';

const CONTRACT = 'weather-v1-261007';
const ORIGINS = new Set(['https://simon-yhkim.github.io', 'http://localhost:8081', 'http://localhost:8082', 'http://localhost:19006']);
const UPSTREAM = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
interface Dependencies {
  enabled: boolean;
  userAgent: string;
  authenticate(token: string): Promise<string | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }>;
  fetch: typeof fetch;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((key) => key in v);
const coarse = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max && Math.abs(v * 100 - Math.round(v * 100)) < 1e-8;

export function createWeatherHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers = {
      'content-type': 'application/json', 'cache-control': 'no-store', 'cdn-cache-control': 'no-store',
      'access-control-allow-origin': origin && ORIGINS.has(origin) ? origin : 'null',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin, authorization',
    };
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !ORIGINS.has(origin)) return reply({ error: 'origin' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply({ error: 'method' }, 405);
    const token = req.headers.get('authorization');
    if (!token?.startsWith('Bearer ') || token.length > 8192) return reply({ error: 'auth' }, 401);
    if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return reply({ error: 'body' }, 400);
    try {
      const body = await readJsonObject(req, 1024);
      if (body.contract !== CONTRACT) return reply({ error: 'contract' }, 409);
      const action = body.action;
      const writing = action === 'grant' || action === 'revoke';
      if (action === 'status') {
        if (!exact(body, ['action','contract'])) return reply({ error: 'body' }, 400);
      } else if (writing) {
        if (!exact(body, ['action','contract','revision','locale']) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 0 ||
            !['en','ko','es','pt','id'].includes(body.locale as string)) return reply({ error: 'body' }, 400);
      } else if (action === 'weather') {
        if (!exact(body, ['action','contract','place']) || !object(body.place) || !exact(body.place, ['latitude','longitude']) ||
            !coarse(body.place.latitude,90) || !coarse(body.place.longitude,180)) return reply({ error: 'body' }, 400);
      } else return reply({ error: 'body' }, 400);
      const owner = await deps.authenticate(token.slice(7));
      if (!owner) return reply({ error: 'auth' }, 401);
      if (!deps.enabled && (action === 'grant' || action === 'weather')) return reply({ error: 'unavailable' }, 503);
      if (action !== 'weather') {
        const { data, error } = await deps.rpc('weather_consent', {
          p_user_id: owner, p_action: action, p_contract: CONTRACT,
          p_revision: writing ? body.revision : null, p_locale: writing ? body.locale : 'en',
        });
        if (error || !object(data)) return reply({ error: 'consent' }, error?.code === '40001' ? 409 : error?.code === '42501' ? 403 : 503);
        return reply({ ...data, available: deps.enabled });
      }
      if (!deps.userAgent || /[\r\n]/.test(deps.userAgent)) return reply({ error: 'unavailable' }, 503);
      const claim = await deps.rpc('authorize_weather_request', { p_user_id: owner });
      if (claim.error || claim.data !== true) return reply({ error: 'consent' }, 403);
      const place = body.place as { latitude: number; longitude: number };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const onAbort = () => controller.abort();
      req.signal.addEventListener('abort', onAbort, { once: true });
      try {
        if (req.signal.aborted) return reply(null);
        const response = await deps.fetch(`${UPSTREAM}?lat=${place.latitude.toFixed(2)}&lon=${place.longitude.toFixed(2)}`, {
          headers: { 'User-Agent': deps.userAgent }, signal: controller.signal, redirect: 'error',
        });
        if (!response.ok) { await response.body?.cancel(); return reply(null); }
        const bytes = await readBodyBytes(response, 512 * 1024);
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        const series = payload?.properties?.timeseries;
        if (!Array.isArray(series)) return reply(null);
        const now = Date.now();
        const hour = series.find((entry: { time?: string }) => typeof entry.time === 'string' && Date.parse(entry.time) <= now && Date.parse(entry.time) > now - 60 * 60_000);
        const data = hour?.data;
        const symbol = (data?.next_1_hours ?? data?.next_6_hours ?? data?.next_12_hours)?.summary?.symbol_code;
        const tempC = data?.instant?.details?.air_temperature;
        if (typeof symbol !== 'string' || typeof tempC !== 'number' || !Number.isFinite(tempC)) return reply(null);
        return reply({ symbol, tempC, validAt: hour.time, nextRequestAt: response.headers.get('expires') });
      } finally { clearTimeout(timer); req.signal.removeEventListener('abort', onAbort); }
    } catch { return reply(null, 503); }
  };
}
