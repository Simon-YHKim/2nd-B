// Kakao OAuth Edge Function.
//
// Supabase Auth doesn't natively support Kakao as a provider, so we run
// the OAuth code-exchange + user-creation here and hand back a Supabase
// session JWT the client can sign in with.
//
// Flow (called by the app after the user returns from kauth.kakao.com):
//   1. App POSTs { code, redirect_uri } to this function.
//   2. Function exchanges the code with Kakao for an access token.
//   3. Function fetches the user profile from kapi.kakao.com.
//   4. Function uses the Supabase service-role key to find-or-create a
//      user (auth.users) and emit a session, then returns the session
//      JSON to the client.
//
// Secrets the operator sets via the Supabase Dashboard:
//   KAKAO_CLIENT_ID       — REST API key from developers.kakao.com
//   KAKAO_CLIENT_SECRET   — optional; if Kakao app has client_secret enabled
//   SUPABASE_URL          — auto-injected by the Edge Function runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by the Edge Function runtime
//
// Auth: verify_jwt=false (anonymous callers — the function IS the auth
// boundary; it returns a JWT only after Kakao validates the user).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USER_URL = 'https://kapi.kakao.com/v2/user/me';

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

interface KakaoTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface KakaoUser {
  id?: number;
  kakao_account?: {
    email?: string;
    email_needs_agreement?: boolean;
    profile?: { nickname?: string; profile_image_url?: string };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const clientId = Deno.env.get('KAKAO_CLIENT_ID');
  if (!clientId) return jsonResponse({ error: 'server_misconfigured_missing_KAKAO_CLIENT_ID' }, 500);
  const clientSecret = Deno.env.get('KAKAO_CLIENT_SECRET') ?? '';

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_misconfigured_supabase_env' }, 500);
  }

  let body: { code?: unknown; redirect_uri?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const code = typeof body?.code === 'string' ? body.code : '';
  const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
  if (!code || !redirectUri) return jsonResponse({ error: 'code_and_redirect_uri_required' }, 400);

  // 1. Exchange code for access token.
  const tokenForm = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });
  if (clientSecret) tokenForm.set('client_secret', clientSecret);

  const tokenRes = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenForm.toString(),
  });
  const tokenJson: KakaoTokenResponse = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return jsonResponse({ error: 'kakao_token_exchange_failed', detail: tokenJson }, 502);
  }

  // 2. Fetch user profile.
  const userRes = await fetch(KAKAO_USER_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) {
    return jsonResponse({ error: 'kakao_user_fetch_failed', status: userRes.status }, 502);
  }
  const kakaoUser: KakaoUser = await userRes.json();
  const kakaoId = kakaoUser.id;
  const email = kakaoUser.kakao_account?.email;
  if (!kakaoId) return jsonResponse({ error: 'kakao_user_missing_id' }, 502);

  // Kakao users can refuse to share email; we still need a stable identifier.
  // Synthesize a kakao.local email when missing — the user can update later
  // via account settings. This keeps Supabase auth.users.email NOT NULL
  // satisfied without prompting the user mid-OAuth.
  const userEmail = email ?? `${kakaoId}@kakao.local`;

  // 3. Find-or-create auth.users via the admin API.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up existing user by email; if absent, create.
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
        kakao_id: kakaoId,
        nickname: kakaoUser.kakao_account?.profile?.nickname ?? null,
        provider: 'kakao',
      },
    });
    if (createErr || !created?.user) {
      return jsonResponse({ error: 'supabase_create_user_failed', detail: createErr?.message }, 500);
    }
    userId = created.user.id;
  }

  // 4. Mint a session for the user via the admin signInWithPassword path
  //    isn't available; we use generateLink to create a magic-link-style
  //    session, then return the access/refresh tokens for the client to
  //    setSession() with.
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });
  if (linkErr || !linkData) {
    return jsonResponse({ error: 'supabase_session_mint_failed', detail: linkErr?.message }, 500);
  }

  // The action_link contains a hashed_token; on a real browser flow Supabase
  // would consume it via /verify. For an SPA we can extract and return it
  // so the client calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
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
