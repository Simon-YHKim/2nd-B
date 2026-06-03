// Naver OAuth Edge Function.
//
// Mirrors oauth-kakao but targets Naver Login. Same shape:
//   POST { code, state, redirect_uri } → { user_id, email, token_hash, token_type }
//
// Secrets the operator sets via the Supabase Dashboard:
//   NAVER_CLIENT_ID       — Client ID from developers.naver.com
//   NAVER_CLIENT_SECRET   — Client Secret from developers.naver.com
//   ENABLE_NAVER_OAUTH    — must be 'true' to activate (default: disabled)
//
// Auth: verify_jwt=false (pre-auth — Naver validates the user).
//
// Security posture:
//   State CSRF: the web client issues a random `state`, stashes it in
//     sessionStorage, and verifies the echo on return (completeNaverOAuth in
//     src/lib/supabase/auth.ts); Naver also re-checks state at token exchange.
//     The standard SPA double-submit defense.
//   Account-takeover: find-or-create binds on the stable naver_id (step 3),
//     never on email alone. An email already owned by a different sign-in
//     method is refused (409) instead of being auto-linked.
//   CORS: explicit origin allowlist (no wildcard).
//   ENABLE_NAVER_OAUTH gate: stays opt-in so the endpoint is dark until the
//     operator has configured Naver credentials and reviewed the flow.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_USER_URL = 'https://openapi.naver.com/v1/nid/me';

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

  // H2 — disabled until proper state validation lands.
  if (Deno.env.get('ENABLE_NAVER_OAUTH') !== 'true') {
    return jsonResponse(req, { error: 'naver_oauth_disabled' }, 503);
  }

  const clientId = Deno.env.get('NAVER_CLIENT_ID');
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return jsonResponse(req, { error: 'server_misconfigured_missing_NAVER_credentials' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured_supabase_env' }, 500);
  }

  let body: { code?: unknown; state?: unknown; redirect_uri?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }
  const code = typeof body?.code === 'string' ? body.code : '';
  const state = typeof body?.state === 'string' ? body.state : '';
  // redirect_uri is required as a sanity check that the caller is our own
  // client flow, but Naver's token endpoint (unlike Google) does NOT take a
  // redirect_uri in the exchange -- it validates code + state -- so it is not
  // forwarded below.
  const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
  if (!code || !state || !redirectUri) {
    return jsonResponse(req, { error: 'code_state_redirect_uri_required' }, 400);
  }

  // 1. Exchange code for access token. Naver uses GET with query params.
  const tokenUrl = new URL(NAVER_TOKEN_URL);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('state', state);

  const tokenRes = await fetch(tokenUrl.toString(), { method: 'GET' });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    return jsonResponse(req, { error: 'naver_token_exchange_failed', detail: tokenJson }, 502);
  }

  // 2. Fetch user profile.
  const userRes = await fetch(NAVER_USER_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) return jsonResponse(req, { error: 'naver_user_fetch_failed', status: userRes.status }, 502);
  const userJson = (await userRes.json()) as {
    resultcode?: string;
    response?: { id?: string; email?: string; nickname?: string };
  };
  const naverId = userJson.response?.id;
  if (!naverId) return jsonResponse(req, { error: 'naver_user_missing_id' }, 502);
  const userEmail = userJson.response?.email ?? `${naverId}@naver.local`;

  // 3. Find-or-create + mint session — same pattern as oauth-kakao.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find-or-create bound on the stable Naver subject id, NOT email.
  //
  // Account-takeover guard: matching purely on email would let a Naver login
  // whose profile email equals an account created via another method
  // (email/password, Google, Apple) silently mint a session for that other
  // account. So we (a) look up the existing Naver user by naver_id stored in
  // user_metadata, and (b) refuse to auto-link when the email is already owned
  // by a different identity, surfacing an explicit error instead of a session.
  //
  // Paginated lookup — listUsers() returns one page only; a single call misses
  // users past the first page and would wrongly re-create them.
  type AdminUser = { id: string; email?: string; user_metadata?: Record<string, unknown> | null };
  let matchedByNaverId: AdminUser | undefined;
  let emailOwner: AdminUser | undefined;
  for (let page = 1; page <= 100 && !matchedByNaverId; page++) {
    const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr || !pageData) break;
    for (const u of pageData.users as AdminUser[]) {
      const meta = u.user_metadata ?? {};
      if (meta.provider === 'naver' && meta.naver_id === naverId) {
        matchedByNaverId = u;
        break;
      }
      if (!emailOwner && u.email === userEmail) emailOwner = u;
    }
    if (pageData.users.length < 200) break; // last page
  }

  let userId: string;
  let accountEmail: string;
  if (matchedByNaverId) {
    // Returning Naver user, matched on the provider-stable id (their email may
    // have changed on Naver's side since the account was created).
    userId = matchedByNaverId.id;
    accountEmail = matchedByNaverId.email ?? userEmail;
  } else if (emailOwner) {
    // The email already belongs to an account that is NOT this Naver identity.
    // Refuse to take it over: the user should sign in with their original
    // method (a deliberate account-linking flow can be added from authenticated
    // settings later). No session is minted.
    return jsonResponse(req, { error: 'email_belongs_to_existing_account' }, 409);
  } else {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      user_metadata: {
        naver_id: naverId,
        nickname: userJson.response?.nickname ?? null,
        provider: 'naver',
      },
    });
    if (createErr || !created?.user) {
      return jsonResponse(req, { error: 'supabase_create_user_failed', detail: createErr?.message }, 500);
    }
    userId = created.user.id;
    accountEmail = userEmail;
  }

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: accountEmail,
  });
  if (linkErr || !linkData) {
    return jsonResponse(req, { error: 'supabase_session_mint_failed', detail: linkErr?.message }, 500);
  }
  const actionLink = linkData.properties?.action_link ?? '';
  const url = new URL(actionLink);
  const tokenHash = url.searchParams.get('token_hash') ?? '';

  return jsonResponse(req, {
    user_id: userId,
    email: accountEmail,
    token_hash: tokenHash,
    token_type: 'magiclink',
  });
});
