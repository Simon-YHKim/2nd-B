// delete-account Edge Function — terminal account erasure (GDPR Art.17 /
// PIPA right to deletion).
//
// Why a service-role function: most user-owned tables are erased only by an
// ON DELETE CASCADE off public.users (records, testimonials,
// personas, memorized_patterns, xp_events, self_contexts, chat_usage,
// clipper_templates, consent_records, gemini_spend_daily, wiki_pages/links,
// sources, guardian rows). ai_audit_log is the deliberate exception: its
// user_id FK is ON DELETE SET NULL (0011), so its rows are RETAINED (user_id
// nulled) as XPRIZE audit evidence rather than cascade-erased.
// Several of those (memorized_patterns, xp_events,
// personas, the append-only consent_records ledger) have NO client DELETE
// policy, so a client-side wipe can never reach them. Since migration 0107,
// public.users.id -> auth.users(id) is ON DELETE CASCADE, so the service role:
//   1. deletes the auth.users row FIRST -> Postgres cascades the profile and
//      every user_id-owned table in one transaction, and no login can outlive
//      the data (the ghost-account failure mode of the old profile-first order)
//   2. deletes public.users explicitly after, as an idempotent safety net for
//      any environment whose DB predates the 0107 cascade FK
//
// IDOR-safe: the account erased is ALWAYS the caller's own, derived from the
// gateway-verified JWT (verify_jwt=true). The body is ignored — we never accept
// a target user_id from the client.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// The JWT is already validated by the gateway (verify_jwt=true), but verify_jwt
// only proves the token is VALID. The public anon/publishable key is itself a
// valid token (role==='anon'). This is a service-role endpoint that ERASES the
// account, so we require a signed-in USER: a real `sub` AND role==='authenticated'.
// Mirrors gemini-proxy/rss-proxy. Returns null for any non-user token.
function userIdFromJwt(authHeader: string): string | null {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }
  const userId = userIdFromJwt(authHeader);
  if (!userId) return jsonResponse(req, { error: 'invalid_jwt' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured_supabase_env' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // knowledge_sources.verified_by AND added_by both reference users(id) with NO
  // ACTION (no cascade), so either one still pointing at this user blocks the
  // public.users delete. Both are nullable (migration 0013) and a signed-in user
  // CAN author a row (RLS ks_auth_insert: authenticated INSERT WITH CHECK
  // added_by = auth.uid()), so null BOTH before the delete.
  await admin.from('knowledge_sources').update({ verified_by: null }).eq('verified_by', userId);
  await admin.from('knowledge_sources').update({ added_by: null }).eq('added_by', userId);

  // 1. Delete the auth account FIRST. Migration 0107 added
  //    public.users.id -> auth.users(id) ON DELETE CASCADE, so removing the auth
  //    row cascades the profile and every user_id-owned table in a single
  //    transaction. Ordering is the fix, not a detail: if this step fails,
  //    NOTHING has been deleted (auth + profile both intact, consistent, safe to
  //    retry). The previous order deleted the profile first, so an auth-side
  //    failure left a ghost account that could still log in but owned no data.
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    return jsonResponse(req, { error: 'auth_delete_failed', detail: authErr.message }, 500);
  }

  // 2. Safety net for any environment whose DB predates the 0107 cascade FK:
  //    delete the profile explicitly too. Idempotent — a no-op once the cascade
  //    above already removed it. Reported but never fatal: the login is already
  //    gone, so the account can no longer be accessed regardless.
  let profileErased = true;
  const { error: profileErr } = await admin.from('users').delete().eq('id', userId);
  if (profileErr) {
    console.warn('[delete-account] residual profile delete failed:', profileErr.message);
    profileErased = false;
  }

  // 3. Remove the user's raw clipped markdown from Storage (raw-clippings bucket,
  // <userId>/<slug>.md) — the most PII-rich content, NOT FK-linked so the
  // public.users cascade never reaches it. Best-effort: the account is already
  // erased, so a Storage hiccup must not fail the request.
  // Paginate: list() returns one bounded page. We delete each page then re-list
  // from the start (the deleted page is gone, so the next list surfaces the
  // remainder) until a short/empty page — so users with >1000 clippings are
  // fully erased, not just the first page.
  // Best-effort by design (the account is already erased, so a Storage hiccup
  // must not fail the request) — but report whether the PII was actually erased
  // instead of unconditionally claiming success, so a partial failure is
  // observable and an operator can re-run cleanup.
  let rawClippingsErased = true;
  try {
    const PAGE = 1000;
    for (;;) {
      const { data: objs, error: listErr } = await admin.storage.from('raw-clippings').list(userId, { limit: PAGE });
      if (listErr) {
        console.warn('[delete-account] raw-clippings list failed:', listErr.message);
        rawClippingsErased = false;
        break;
      }
      if (!objs || objs.length === 0) break;
      const paths = objs.map((o) => `${userId}/${o.name}`);
      const { error: rmErr } = await admin.storage.from('raw-clippings').remove(paths);
      if (rmErr) {
        console.warn('[delete-account] raw-clippings remove failed:', rmErr.message);
        rawClippingsErased = false;
        break;
      }
      if (objs.length < PAGE) break;
    }
  } catch (e) {
    console.warn('[delete-account] raw-clippings cleanup threw:', String(e));
    rawClippingsErased = false;
  }

  return jsonResponse(req, { deleted: true, profile_erased: profileErased, raw_clippings_erased: rawClippingsErased });
});
