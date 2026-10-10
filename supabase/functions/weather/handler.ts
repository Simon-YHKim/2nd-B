// No device coordinates, caller identity or IP go upstream. Only public global data is cached.
import { readJsonObject, readBodyBytes } from '../_shared/request-json.ts';
import { parseMetarCsv, type MetarStation } from './metar.ts';

const CONTRACT = 'weather-v1-261007';
const ORIGINS = new Set(['https://simon-yhkim.github.io', 'http://localhost:8081', 'http://localhost:8082', 'http://localhost:19006']);
const UPSTREAM = 'https://aviationweather.gov/data/cache/metars.cache.csv.gz';
const PUBLIC_CACHE_MS = 10 * 60_000;
const RETRY_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 6000;
interface Dependencies {
  enabled: boolean;
  userAgent: string;
  authenticate(token: string): Promise<string | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }>;
  fetch: typeof fetch;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((key) => key in v);
interface PublicWeather { source: 'noaa-metar'; stations: MetarStation[] }

export function createWeatherHandler(deps: Dependencies) {
  // This shared work has no Request, JWT, owner or device-location input.
  let cache: { data: PublicWeather; expiresAt: number } | null = null;
  let inFlight: Promise<PublicWeather | null> | null = null;
  let retryAt = 0;
  async function download(): Promise<PublicWeather | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('weather_timeout')); }, UPSTREAM_TIMEOUT_MS);
    });
    try {
      const data = await Promise.race([(async (): Promise<PublicWeather> => {
        const response = await deps.fetch(UPSTREAM, {
          headers: { 'User-Agent': deps.userAgent, 'Accept-Encoding': 'identity' },
          signal: controller.signal, redirect: 'error',
        });
        if (!response.ok || controller.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          throw new Error('weather_upstream');
        }
        const compressedInput = { body: response.body, headers: response.headers, signal: controller.signal };
        const compressed = await readBodyBytes(compressedInput, 2 * 1024 * 1024);
        if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) throw new Error('weather_gzip');
        const stream = new ReadableStream<BufferSource>({ start(target) { target.enqueue(new Uint8Array(compressed)); target.close(); } });
        const expandedInput = {
          body: stream.pipeThrough(new DecompressionStream('gzip')),
          headers: new Headers(), signal: controller.signal,
        };
        const expanded = await readBodyBytes(expandedInput, 8 * 1024 * 1024);
        const stations = parseMetarCsv(new TextDecoder('utf-8', { fatal: true }).decode(expanded));
        return { source: 'noaa-metar', stations };
      })(), deadline]);
      cache = { data, expiresAt: Date.now() + PUBLIC_CACHE_MS };
      retryAt = 0;
      return data;
    } catch {
      cache = null;
      retryAt = Date.now() + RETRY_MS;
      return null;
    } finally { clearTimeout(timer); }
  }
  function publicWeather(): Promise<PublicWeather | null> {
    if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.data);
    cache = null;
    if (inFlight) return inFlight;
    if (Date.now() < retryAt) return Promise.resolve(null);
    inFlight = download().finally(() => { inFlight = null; });
    return inFlight;
  }
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
        if (!exact(body, ['action','contract'])) return reply({ error: 'body' }, 400);
      } else return reply({ error: 'body' }, 400);
      const owner = await deps.authenticate(token.slice(7));
      if (!owner) return reply({ error: 'auth' }, 401);
      if (!deps.enabled && (action === 'grant' || action === 'weather')) return reply({ error: 'unavailable' }, 503);
      if (action !== 'weather') {
        const { data, error } = await deps.rpc('weather_consent', {
          p_user_id: owner, p_action: action, p_contract: CONTRACT,
          p_revision: writing ? body.revision : null, p_locale: writing ? body.locale : 'en',
        });
        if (action === 'grant' && (error?.code === 'PT409' || error?.code === '42501')) {
          // The failed grant transaction rolled back. Admit its attempt in a
          // separate committed RPC, preserving the original conflict/denial.
          // Deleted/inactive owners cannot have quota state; status denies them.
          const admission = await deps.rpc('weather_consent', {
            p_user_id: owner, p_action: 'status', p_contract: CONTRACT,
            p_revision: null, p_locale: 'en',
          });
          if (admission.error?.code === 'PT429') return reply({ error: 'consent' }, 429);
          if (admission.error || !object(admission.data)) {
            return reply({ error: 'consent' }, admission.error?.code === '42501' ? 403 : 503);
          }
        }
        if (error || !object(data)) return reply({ error: 'consent' }, error?.code === 'PT409' || error?.code === '40001' ? 409 : error?.code === 'PT429' ? 429 : error?.code === '42501' ? 403 : 503);
        return reply({ ...data, available: deps.enabled });
      }
      if (!deps.userAgent || deps.userAgent.length > 512 || /[\r\n]/.test(deps.userAgent)) return reply({ error: 'unavailable' }, 503);
      const claim = await deps.rpc('authorize_weather_request', { p_user_id: owner });
      if (claim.error || claim.data !== true) return reply({ error: 'consent' }, 403);
      if (req.signal.aborted) return reply(null);
      // Caller cancellation only stops that response, not the shared public download.
      let onAbort = () => {};
      const aborted = new Promise<null>((resolve) => {
        onAbort = () => resolve(null);
        req.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        const data = await Promise.race([publicWeather(), aborted]);
        return reply(req.signal.aborted ? null : data);
      } finally { req.signal.removeEventListener('abort', onAbort); }
    } catch { return reply(null, 503); }
  };
}
