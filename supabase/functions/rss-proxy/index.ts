// Authenticated, bounded proxy for the four curated RSS feeds used by web.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  readBoundedUtf8Body,
  parseJsonWithLimits,
  RequestBoundaryError,
} from '../_shared/request-boundary.ts';

const ALLOWED_FEED_URLS = new Set<string>([
  'https://www.yna.co.kr/rss/news.xml',
  'https://www.hani.co.kr/rss/',
  'https://www.mk.co.kr/rss/30000001/',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
]);
if (ALLOWED_FEED_URLS.size !== 4) throw new Error('invalid_feed_allowlist');

// Hankyoreh currently redirects /rss/ to /rss. Keep the public request
// contract aligned with NEWS_FEEDS while selecting the measured canonical
// endpoint directly, so redirect:'manual' can remain fail closed for every hop.
const FIXED_UPSTREAM_OVERRIDES = new Map<string, string>([
  ['https://www.hani.co.kr/rss/', 'https://www.hani.co.kr/rss'],
]);

const STATIC_ALLOWED_ORIGINS: readonly string[] = [
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
];
const ALLOWED_UPSTREAM_CONTENT_TYPES: readonly string[] = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
];

const MAX_REQUEST_BYTES = 1024;
const REQUEST_TIMEOUT_MS = 3000;
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

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'cdn-cache-control': 'no-store',
      'surrogate-control': 'no-store',
      'pragma': 'no-cache',
      'expires': '0',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'vary': 'origin, authorization',
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
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
      'vary': 'origin, authorization',
    },
  });
}

interface GatewayIdentityHint {
  readonly accessToken: string;
  readonly subject: string;
}

// This decoded payload is only a cheap gateway/configuration hint. Authorization
// below comes from Supabase Auth getUser(), and the verified id must match it.
function gatewayIdentityHintFromJwt(authHeader: string): GatewayIdentityHint | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authHeader);
  if (!match) return null;
  const accessToken = match[1];
  if (accessToken.length > MAX_ACCESS_TOKEN_BYTES) return null;

  try {
    const encoded = accessToken.split('.')[1];
    if (encoded.length === 0 || encoded.length > 2048) return null;
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(base64 + padding));
    const subject = typeof payload?.sub === 'string' ? payload.sub.toLowerCase() : '';
    if (payload?.role !== 'authenticated' || !UUID_PATTERN.test(subject)) return null;
    return { accessToken, subject };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (!requestOriginAllowed(req)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const contentEncoding = req.headers.get('content-encoding');
  if (contentEncoding !== null && contentEncoding.toLowerCase() !== 'identity') {
    return jsonResponse(req, { error: 'unsupported_content_encoding' }, 415);
  }

  let parsed: unknown;
  try {
    const { text } = await readBoundedUtf8Body(req, {
      maxBytes: MAX_REQUEST_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
      allowedContentTypes: ['application/json'],
      requireLengthMatch: true,
    });
    parsed = parseJsonWithLimits(text, 2);
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return jsonResponse(req, { error: error.code }, error.status);
    }
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse(req, { error: 'invalid_request' }, 400);
  }
  const body = parsed as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.url !== 'string') {
    return jsonResponse(req, { error: 'invalid_request' }, 400);
  }
  if (!ALLOWED_FEED_URLS.has(body.url)) {
    return jsonResponse(req, { error: 'url_not_allowed' }, 403);
  }
  const url = FIXED_UPSTREAM_OVERRIDES.get(body.url) ?? body.url;

  const authHeader = req.headers.get('authorization') ?? '';
  const identity = gatewayIdentityHintFromJwt(authHeader);
  if (!identity) return jsonResponse(req, { error: 'authentication_required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let verifiedUserId: string | null = null;
  try {
    const { data, error } = await admin.auth.getUser(identity.accessToken);
    if (!error && data.user && UUID_PATTERN.test(data.user.id)) {
      verifiedUserId = data.user.id.toLowerCase();
    }
  } catch {
    verifiedUserId = null;
  }
  if (verifiedUserId === null || verifiedUserId !== identity.subject) {
    return jsonResponse(req, { error: 'authentication_required' }, 401);
  }
  const userId = verifiedUserId;

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
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response | null = null;
  try {
    upstream = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: ALLOWED_UPSTREAM_CONTENT_TYPES.join(', '),
        'Accept-Encoding': 'identity',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (
      upstream.type === 'opaqueredirect'
      || (upstream.status >= 300 && upstream.status < 400)
      || !upstream.ok
    ) {
      await upstream.body?.cancel().catch(() => undefined);
      return jsonResponse(req, { error: 'upstream_unavailable' }, 502);
    }

    const { bytes, text: xml } = await readBoundedUtf8Body(upstream, {
      maxBytes: MAX_UPSTREAM_BYTES,
      timeoutMs: Math.max(1, deadline - Date.now()),
      allowedContentTypes: ALLOWED_UPSTREAM_CONTENT_TYPES,
    });
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
