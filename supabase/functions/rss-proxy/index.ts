// Authenticated, quota-bounded proxy for the four curated RSS feeds used by web.
// The caller cannot select an arbitrary host, redirects stay disabled, and the
// decoded upstream stream is capped before it becomes a string.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import {
  JsonBodyError,
  RSS_PROXY_JSON_BODY_LIMIT_BYTES,
  readBodyBytes,
  readJsonObject,
} from '../_shared/request-json.ts';

// Exact mirror of src/lib/news/feeds.ts:NEWS_FEED_URLS.
const ALLOWED_FEED_URLS = new Set<string>([
  'https://www.yna.co.kr/rss/news.xml',
  'https://www.hani.co.kr/rss/',
  'https://www.mk.co.kr/rss/30000001/',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
]);
if (ALLOWED_FEED_URLS.size !== 4) throw new Error('invalid_feed_allowlist');

// Hankyoreh redirects /rss/ to /rss. Select the measured canonical endpoint
// directly so redirect:'manual' remains fail closed for every response hop.
const FIXED_UPSTREAM_OVERRIDES = new Map<string, string>([
  ['https://www.hani.co.kr/rss/', 'https://www.hani.co.kr/rss'],
]);

const ALLOWED_UPSTREAM_CONTENT_TYPES = new Set<string>([
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
]);
const STATIC_ALLOWED_ORIGINS: readonly string[] = [
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
];

const FETCH_TIMEOUT_MS = 5000;
const MAX_UPSTREAM_BYTES = 512 * 1024;
const MAX_ACCESS_TOKEN_BYTES = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseEnvOrigins(): string[] {
  const raw = Deno.env.get('RSS_PROXY_ALLOWED_ORIGINS') ?? '';
  if (raw.length > 4096) return [];

  const configured: string[] = [];
  for (const part of raw.split(',').slice(0, 20)) {
    const candidate = part.trim();
    if (candidate.length === 0) continue;
    try {
      const candidateUrl = new URL(candidate);
      if (candidateUrl.origin === candidate && candidateUrl.protocol === 'https:') {
        configured.push(candidate);
      }
    } catch {
      // Invalid configured origins are ignored and therefore fail closed.
    }
  }
  return configured;
}

const ALLOWED_ORIGINS = new Set<string>([...STATIC_ALLOWED_ORIGINS, ...parseEnvOrigins()]);

function requestOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && ALLOWED_ORIGINS.has(origin);
}

function responseOrigin(req: Request): string {
  const origin = req.headers.get('origin');
  return origin !== null && ALLOWED_ORIGINS.has(origin) ? origin : 'null';
}

function mediaType(headers: Headers): string {
  return (headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
}

function requestContentTypeAllowed(req: Request): boolean {
  return mediaType(req.headers) === 'application/json';
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'cdn-cache-control': 'no-store',
      'surrogate-control': 'no-store',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      vary: 'origin, authorization',
    },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'cdn-cache-control': 'no-store',
      'surrogate-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
      vary: 'origin, authorization',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (!requestOriginAllowed(req)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const contentEncoding = req.headers.get('content-encoding');
  if (contentEncoding !== null && contentEncoding.trim().toLowerCase() !== 'identity') {
    return jsonResponse(req, { error: 'unsupported_content_encoding' }, 415);
  }
  if (!requestContentTypeAllowed(req)) {
    return jsonResponse(req, { error: 'unsupported_content_type' }, 415);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.length > MAX_ACCESS_TOKEN_BYTES) {
    return jsonResponse(req, { error: 'authentication_required' }, 401);
  }
  const bearer = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authHeader);
  if (!bearer) return jsonResponse(req, { error: 'authentication_required' }, 401);
  const accessToken = bearer[1];

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured' }, 503);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId: string;
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    const authUser = authData.user;
    if (authError || !authUser || !UUID_PATTERN.test(authUser.id)) {
      return jsonResponse(req, { error: 'authentication_required' }, 401);
    }
    userId = authUser.id.toLowerCase();
  } catch {
    return jsonResponse(req, { error: 'authentication_required' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, RSS_PROXY_JSON_BODY_LIMIT_BYTES);
  } catch (error) {
    if (error instanceof JsonBodyError && error.code === 'request_body_too_large') {
      return jsonResponse(req, { error: error.code }, 413);
    }
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }
  if (Object.keys(body).length !== 1 || typeof body.url !== 'string') {
    return jsonResponse(req, { error: 'invalid_request' }, 400);
  }
  if (!ALLOWED_FEED_URLS.has(body.url)) {
    return jsonResponse(req, { error: 'url_not_allowed' }, 403);
  }
  const upstreamUrl = FIXED_UPSTREAM_OVERRIDES.get(body.url) ?? body.url;

  let quotaAllowed: unknown = null;
  let quotaError: unknown = null;
  try {
    const quota = await admin.rpc('consume_rss_proxy_quota', { p_user_id: userId });
    quotaAllowed = quota.data;
    quotaError = quota.error;
  } catch {
    return jsonResponse(req, { error: 'quota_unavailable' }, 503);
  }
  if (quotaError) return jsonResponse(req, { error: 'quota_unavailable' }, 503);
  if (quotaAllowed !== true) return jsonResponse(req, { error: 'quota_exceeded' }, 429);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response | null = null;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: [...ALLOWED_UPSTREAM_CONTENT_TYPES].join(', '),
        'Accept-Encoding': 'identity',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (
      upstream.type === 'opaqueredirect' ||
      (upstream.status >= 300 && upstream.status < 400) ||
      !upstream.ok
    ) {
      await upstream.body?.cancel().catch(() => undefined);
      return jsonResponse(req, { error: 'upstream_unavailable' }, 502);
    }

    const upstreamContentType = mediaType(upstream.headers);
    if (!ALLOWED_UPSTREAM_CONTENT_TYPES.has(upstreamContentType)) {
      await upstream.body?.cancel().catch(() => undefined);
      return jsonResponse(req, { error: 'upstream_content_type_rejected' }, 502);
    }

    const bytes = await readBodyBytes(upstream, MAX_UPSTREAM_BYTES);
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.byteLength === 0 || xml.trim().length === 0) {
      return jsonResponse(req, { error: 'upstream_unavailable' }, 502);
    }
    return jsonResponse(req, { xml }, 200);
  } catch {
    controller.abort();
    await upstream?.body?.cancel().catch(() => undefined);
    return jsonResponse(req, { error: 'upstream_unavailable' }, 502);
  } finally {
    clearTimeout(timer);
  }
});
