// RSS proxy Edge Function (Codex P2 #4 — Web CORS).
//
// Why: on Expo web the client bundle runs in a browser. A direct fetch() to a
// third-party RSS host (yna.co.kr, hani.co.kr, mk.co.kr, bbci.co.uk) is blocked
// by the browser's CORS policy, so the digest silently shows []. This function
// fetches the feed XML SERVER-SIDE (no browser CORS) and returns it to the web
// client with permissive CORS headers. Native keeps the direct fetch and never
// touches this function.
//
// Request shape:   POST { url: string }
// Response shape:  { xml: string }  (200) | { error: string }  (4xx/5xx)
//
// SSRF guard: the `url` is validated against an EXACT-MATCH allowlist that
// mirrors src/lib/news/feeds.ts:NEWS_FEED_URLS. Only those exact strings may be
// fetched — an attacker cannot make this function fetch an internal/metadata
// endpoint (e.g. http://169.254.169.254/) or any arbitrary host. KEEP THIS LIST
// IN SYNC with feeds.ts (this Deno function cannot import the RN module).
//
// Deploy gate: this function MUST be deployed for the web build's news digest to
// work (`supabase functions deploy rss-proxy`). The web client treats a missing/
// unreachable function as an explicit "proxy_unavailable" error state (not a
// silent []), so an undeployed proxy surfaces a clear failure.
//
// Auth: verify_jwt=true (default) — only signed-in app users can call it; it is
// not an open relay. CORS is an explicit origin allowlist (no wildcard).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// SSRF allowlist — EXACT mirror of src/lib/news/feeds.ts:NEWS_FEED_URLS.
const ALLOWED_FEED_URLS = new Set<string>([
  'https://www.yna.co.kr/rss/news.xml',
  'https://www.hani.co.kr/rss/',
  'https://www.mk.co.kr/rss/30000001/',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
]);

const FETCH_TIMEOUT_MS = 8000;

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }

  const url = typeof body?.url === 'string' ? body.url : '';
  if (!url) return jsonResponse(req, { error: 'url_required' }, 400);

  // SSRF guard: only an exact allowlist match may be fetched.
  if (!ALLOWED_FEED_URLS.has(url)) {
    return jsonResponse(req, { error: 'url_not_allowed' }, 403);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return jsonResponse(req, { error: 'upstream_error', status: upstream.status }, 502);
    }
    const xml = await upstream.text();
    return jsonResponse(req, { xml }, 200);
  } catch {
    return jsonResponse(req, { error: 'upstream_fetch_failed' }, 502);
  } finally {
    clearTimeout(timer);
  }
});
