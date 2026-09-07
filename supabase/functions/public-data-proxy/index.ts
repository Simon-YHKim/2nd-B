// Public-data proxy Edge Function — keeps the 공공데이터 API keys OFF the client.
//
// Why this exists: `EXPO_PUBLIC_*` is inlined by Metro at build time, so any
// variable with that prefix ships inside the public bundle. On 2026-09-07 the
// live web bundle carried the MFDS service key as a 64-char literal inside
// searchFoods — it had been there since #498 wired it into web-deploy on
// 2026-06-20. Those two keys are NOT client keys: 공공데이터포털 and 수출입은행
// issue them per account with quota attached, so anyone who lifts one spends
// ours. (Contrast the Supabase anon key or a RevenueCat SDK key, which are
// issued for clients by design.)
//
// So the key moves here. The client sends only PARAMETERS; this function holds
// the secret and composes the upstream URL itself. That is a stronger posture
// than the rss-proxy's allowlist: the caller cannot name a URL at all, so there
// is no SSRF surface to guard — the endpoints are compile-time constants.
//
// Request:   POST { source: "mfds", query: string, max?: number }
//            POST { source: "exim" }
// Response:  { data: unknown }                  (200, upstream JSON verbatim)
//            { error: string, status?: number } (4xx/5xx)
//
// Secrets (NOT EXPO_PUBLIC_*, never reaches a bundle):
//   supabase secrets set MFDS_FOOD_KEY=...  EXIM_FX_KEY=...
// A missing secret answers 503 `source_unconfigured`, which the client treats
// exactly like today's "no key" case (empty result, never a thrown error).
//
// Deploy gate: `supabase functions deploy public-data-proxy`. Clients must NOT
// be switched to this function before it is deployed and verified — deploy
// first, flip second, then rotate the old keys and delete the public variables.
//
// Auth: verify_jwt=true proves the bearer is a VALID token, but the public anon
// key is itself valid — so a valid token is not authorization. We additionally
// require an AUTHENTICATED user (real `sub`, role==='authenticated'), mirroring
// rss-proxy, so anon callers cannot burn quota. CORS is an explicit origin
// allowlist (no wildcard).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  JsonBodyError,
  PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES,
  readJsonObject,
} from '../_shared/request-json.ts';

// Read JWT claims without re-verifying the signature (the gateway already did).
// Mirrors rss-proxy/authenticatedUserIdFromJwt.
function authenticatedUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.slice(authHeader.toLowerCase().indexOf('bearer ') + 7).trim();
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)));
    const sub = typeof json?.sub === 'string' ? json.sub : '';
    const role = typeof json?.role === 'string' ? json.role : '';
    if (role !== 'authenticated' || sub.length === 0) return null;
    return sub;
  } catch {
    return null;
  }
}

// Upstream endpoints are constants here, never caller-supplied. Mirrors
// src/lib/nutrition/foods.ts:MFDS_ENDPOINT and src/lib/finance/fx.ts:EXIM_ENDPOINT
// — a Deno function cannot import those RN modules, so a jest guard asserts the
// strings match (public-data-proxy-contract.test.ts).
const MFDS_ENDPOINT = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01';
const EXIM_ENDPOINT = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';

// Same caps the client had (foods.ts QUERY_MAX / RESULT_MAX), re-declared for
// the same import reason and asserted by the same guard.
const QUERY_MAX = 60;
const RESULT_MAX = 10;

const FETCH_TIMEOUT_MS = 8000;
const MAX_UPSTREAM_BYTES = 1_000_000;

const STATIC_ALLOWED_ORIGINS: readonly string[] = [
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
];

function parseEnvOrigins(): string[] {
  const raw = Deno.env.get('PUBLIC_DATA_PROXY_ALLOWED_ORIGINS') ?? '';
  return raw.split(',').map((o) => o.trim()).filter((o) => o.length > 0);
}

const ALLOWED_ORIGINS = new Set<string>([...STATIC_ALLOWED_ORIGINS, ...parseEnvOrigins()]);

function resolveOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'null';
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': resolveOrigin(req),
      'vary': 'origin',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': resolveOrigin(req),
      'vary': 'origin',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
    },
  });
}

/** Compose the upstream URL server-side. null = secret unset, 'bad_request' = caller error. */
function upstreamUrlFor(
  body: { source?: unknown; query?: unknown; max?: unknown },
): string | null | 'bad_request' {
  if (body.source === 'mfds') {
    const key = Deno.env.get('MFDS_FOOD_KEY') ?? '';
    if (!key) return null;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (query.length === 0) return 'bad_request';
    const max = typeof body.max === 'number' && Number.isFinite(body.max) ? body.max : RESULT_MAX;
    const numOfRows = Math.min(Math.max(1, Math.floor(max)), RESULT_MAX);
    const params = new URLSearchParams({
      serviceKey: key,
      FOOD_NM_KR: query.slice(0, QUERY_MAX),
      pageNo: '1',
      numOfRows: String(numOfRows),
      type: 'json',
    });
    return `${MFDS_ENDPOINT}?${params.toString()}`;
  }
  if (body.source === 'exim') {
    const key = Deno.env.get('EXIM_FX_KEY') ?? '';
    if (!key) return null;
    return `${EXIM_ENDPOINT}?authkey=${encodeURIComponent(key)}&data=AP01`;
  }
  return 'bad_request';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  // A valid token is not authorization: the public anon key is a valid token.
  // Require a real signed-in user BEFORE any upstream fetch so anon callers
  // cannot burn our 공공데이터 quota.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }
  if (!authenticatedUserIdFromJwt(authHeader)) {
    return jsonResponse(req, { error: 'authentication_required' }, 401);
  }

  let body: { source?: unknown; query?: unknown; max?: unknown };
  try {
    body = await readJsonObject(req, PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES) as typeof body;
  } catch (error) {
    if (error instanceof JsonBodyError && error.code === 'request_body_too_large') {
      return jsonResponse(req, { error: error.code, max: error.maxBytes }, 413);
    }
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }

  const url = upstreamUrlFor(body);
  if (url === 'bad_request') return jsonResponse(req, { error: 'invalid_request' }, 400);
  // Secret unset: the client already handles "no data" for this case, so an
  // unconfigured source degrades to an empty result instead of an error screen.
  if (url === null) return jsonResponse(req, { error: 'source_unconfigured' }, 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // redirect:'manual' for the same reason as rss-proxy, and one more here: the
    // key rides in the query string, so following a 30x would hand it to
    // whatever host the redirect names. Never chase it.
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (upstream.type === 'opaqueredirect' || (upstream.status >= 300 && upstream.status < 400)) {
      return jsonResponse(req, { error: 'upstream_redirect_blocked', status: upstream.status }, 502);
    }
    if (!upstream.ok) {
      return jsonResponse(req, { error: 'upstream_error', status: upstream.status }, 502);
    }
    const text = (await upstream.text()).slice(0, MAX_UPSTREAM_BYTES);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return jsonResponse(req, { error: 'upstream_not_json' }, 502);
    }
    return jsonResponse(req, { data }, 200);
  } catch {
    return jsonResponse(req, { error: 'upstream_fetch_failed' }, 502);
  } finally {
    clearTimeout(timer);
  }
});
