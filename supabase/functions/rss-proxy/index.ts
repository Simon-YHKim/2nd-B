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
// Auth: verify_jwt=true (default) proves the bearer token is VALID, but the
// public anon key is itself a valid token — so a valid token alone is not a
// signed-in user, and anyone holding the anon key could otherwise invoke this
// proxy and burn Edge Function quota/bandwidth. We additionally require the JWT
// to represent an AUTHENTICATED user (a real `sub` + role==='authenticated',
// NOT 'anon'), mirroring the user-auth posture of gemini-proxy. CORS is an
// explicit origin allowlist (no wildcard).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Read the JWT claims without re-verifying the signature (the gateway already
// did, verify_jwt=true). Mirrors gemini-proxy/userIdFromJwt. A signed-in user's
// token carries role==='authenticated' and a real `sub`; the anon key's token
// carries role==='anon'. Returns null for malformed/non-authenticated tokens so
// the caller rejects anon/invalid with 401 before any upstream fetch.
function authenticatedUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.slice(authHeader.toLowerCase().indexOf('bearer ') + 7).trim();
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)));
    const sub = typeof json?.sub === 'string' ? json.sub : '';
    const role = typeof json?.role === 'string' ? json.role : '';
    // A signed-in user only: real subject AND the 'authenticated' role. The anon
    // key's JWT has role==='anon' (and no user sub) — reject it.
    if (role !== 'authenticated' || sub.length === 0) return null;
    return sub;
  } catch {
    return null;
  }
}

// SSRF allowlist — EXACT mirror of src/lib/news/feeds.ts:NEWS_FEED_URLS.
const ALLOWED_FEED_URLS = new Set<string>([
  'https://www.yna.co.kr/rss/news.xml',
  'https://www.hani.co.kr/rss/',
  'https://www.mk.co.kr/rss/30000001/',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
]);

const FETCH_TIMEOUT_MS = 8000;
// Cap the upstream body we read + return. Mirrors src/lib/news/parse.ts:
// MAX_XML_CHARS so a compromised/huge feed cannot OOM the function or the web
// client. Bytes here vs chars in the parser — same order of magnitude, both are
// generous relative to any real feed.
const MAX_UPSTREAM_BYTES = 2_000_000;

// Static origins: GitHub Pages prod + Expo web dev servers. The Vercel deploy
// origin is NOT pinned here (the *.vercel.app host varies per project/preview),
// so it is supplied at deploy time via RSS_PROXY_ALLOWED_ORIGINS — see below.
const STATIC_ALLOWED_ORIGINS: readonly string[] = [
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
];

// Codex P2 #3 (Web CORS on Vercel): on a Vercel deploy the browser origin is the
// project's `https://<name>.vercel.app` (and per-PR preview origins), so a static
// GitHub-Pages-only allowlist returns 'null' and web RSS fails with
// proxy_unavailable. Make the allowlist ENV-DRIVEN: RSS_PROXY_ALLOWED_ORIGINS is
// a comma-separated list of exact origins (e.g.
// "https://2nd-brain.vercel.app,https://2nd-brain-git-main.vercel.app") merged
// with the static set. Set it alongside the function's other secrets
// (`supabase secrets set RSS_PROXY_ALLOWED_ORIGINS=...`) to the Vercel
// production/preview origin(s). Keeps the explicit allowlist posture (no wildcard
// echo) and leaves the SSRF feed allowlist + the user-auth check untouched.
function parseEnvOrigins(): string[] {
  const raw = Deno.env.get('RSS_PROXY_ALLOWED_ORIGINS') ?? '';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  // Require a real signed-in USER, not merely a valid token. verify_jwt=true
  // proves the bearer is valid, but the public anon key is a valid token — so a
  // valid token alone is not authorization. Reject anon/invalid with 401 BEFORE
  // any upstream fetch so anon callers cannot burn Edge Function quota.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }
  if (!authenticatedUserIdFromJwt(authHeader)) {
    return jsonResponse(req, { error: 'authentication_required' }, 401);
  }

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
    // redirect:'manual' so the exact-match SSRF allowlist protects EVERY hop, not
    // just the first. The allowlisted feed URLs are the canonical endpoints and
    // serve 200 directly; a 30x would point at an off-allowlist host (a CDN, or —
    // if a publisher is compromised/misconfigured — an internal/metadata host),
    // which we MUST NOT follow. So we reject any redirect rather than chase it.
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      redirect: 'manual',
      signal: controller.signal,
    });
    // 'manual' surfaces a 3xx as the real status (or an opaqueredirect response).
    if (upstream.type === 'opaqueredirect' || (upstream.status >= 300 && upstream.status < 400)) {
      return jsonResponse(req, { error: 'upstream_redirect_blocked', status: upstream.status }, 502);
    }
    if (!upstream.ok) {
      return jsonResponse(req, { error: 'upstream_error', status: upstream.status }, 502);
    }
    const xml = (await upstream.text()).slice(0, MAX_UPSTREAM_BYTES);
    return jsonResponse(req, { xml }, 200);
  } catch {
    return jsonResponse(req, { error: 'upstream_fetch_failed' }, 502);
  } finally {
    clearTimeout(timer);
  }
});
