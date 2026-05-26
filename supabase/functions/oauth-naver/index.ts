// Naver OAuth Edge Function.
//
// Mirrors oauth-kakao but targets Naver Login. Same shape:
//   POST { code, state, redirect_uri } → { user_id, email, token_hash, token_type }
//
// Secrets the operator sets via the Supabase Dashboard:
//   NAVER_CLIENT_ID       — Client ID from developers.naver.com
//   NAVER_CLIENT_SECRET   — Client Secret from developers.naver.com
//
// Auth: verify_jwt=false (pre-auth — Naver validates the user).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_USER_URL = 'https://openapi.naver.com/v1/nid/me';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const clientId = Deno.env.get('NAVER_CLIENT_ID');
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'server_misconfigured_missing_NAVER_credentials' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_misconfigured_supabase_env' }, 500);
  }

  let body: { code?: unknown; state?: unknown; redirect_uri?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const code = typeof body?.code === 'string' ? body.code : '';
  const state = typeof body?.state === 'string' ? body.state : '';
  const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
  if (!code || !state || !redirectUri) {
    return jsonResponse({ error: 'code_state_redirect_uri_required' }, 400);
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
    return jsonResponse({ error: 'naver_token_exchange_failed', detail: tokenJson }, 502);
  }

  // 2. Fetch user profile.
  const userRes = await fetch(NAVER_USER_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) return jsonResponse({ error: 'naver_user_fetch_failed', status: userRes.status }, 502);
  const userJson = (await userRes.json()) as {
    resultcode?: string;
    response?: { id?: string; email?: string; nickname?: string };
  };
  const naverId = userJson.response?.id;
  if (!naverId) return jsonResponse({ error: 'naver_user_missing_id' }, 502);
  const userEmail = userJson.response?.email ?? `${naverId}@naver.local`;

  // 3. Find-or-create + mint session — same pattern as oauth-kakao.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const found = existing?.users.find((u: { email?: string }) => u.email === userEmail);
  let userId: string;
  if (found) {
    userId = found.id;
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
      return jsonResponse({ error: 'supabase_create_user_failed', detail: createErr?.message }, 500);
    }
    userId = created.user.id;
  }

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });
  if (linkErr || !linkData) {
    return jsonResponse({ error: 'supabase_session_mint_failed', detail: linkErr?.message }, 500);
  }
  const actionLink = linkData.properties?.action_link ?? '';
  const url = new URL(actionLink);
  const tokenHash = url.searchParams.get('token_hash') ?? '';

  return jsonResponse({
    user_id: userId,
    email: userEmail,
    token_hash: tokenHash,
    token_type: 'magiclink',
  });
});
