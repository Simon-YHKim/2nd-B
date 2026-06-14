// export-account Edge Function — subject data portability (GDPR Art.20 /
// PIPA right to data portability).
//
// Returns a structured, machine-readable (JSON) bundle of all personal data the
// service holds for the caller, gathered from every user-owned table plus the
// raw-clippings Storage bucket. This closes the DPIA "PRIMARY GAP" (Section 6.1.3):
// the only prior export was an LLM-context markdown bundle (exportUserWiki), which
// omits consent_records, privacy_prefs, personas, memorized_patterns, xp_events,
// esm_responses, chat_usage, self_contexts and is not a structured format.
//
// Why a service-role function: several owned tables (personas, memorized_patterns,
// the append-only consent_records ledger, xp_events) have NO client SELECT path or
// are RLS-narrowed, so a client-side gather can never reach them — the same reason
// delete-account runs service-role.
//
// IDOR-safe: the data returned is ALWAYS the caller's own, derived from the
// gateway-verified JWT (verify_jwt=true). The body is ignored — we never accept a
// target user_id from the client (identical contract to delete-account).
//
// NOT a destructive operation: read-only. Deliberately EXCLUDED from the export
// (documented in the `excluded` field of the response for transparency):
//   - ai_audit_log     : hashes only, retained-after-erasure audit evidence (not the subject's content)
//   - gemini_spend_daily: internal cost accounting, not personal content
//   - revenue_events   : billing/ops records (financial export is out of scope for v1)

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

// The JWT is already validated by the gateway (verify_jwt=true), so we only read
// the `sub` claim, not re-verify the signature (identical to delete-account).
function userIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.slice(authHeader.toLowerCase().indexOf('bearer ') + 7).trim();
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)));
    return typeof json?.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

// User-owned tables and the column that scopes a row to its owner. Verified against
// the live schema (information_schema) on 2026-06-14. `users` (profile + privacy_prefs
// jsonb) is handled separately by primary key, and knowledge_sources is filtered to the
// user's own contributions (added_by).
const EXPORT_TABLES: { table: string; fk: string }[] = [
  { table: 'records', fk: 'user_id' },
  { table: 'sources', fk: 'user_id' },
  { table: 'wiki_pages', fk: 'user_id' },
  { table: 'wiki_links', fk: 'user_id' },
  { table: 'personas', fk: 'user_id' },
  { table: 'memorized_patterns', fk: 'user_id' },
  { table: 'self_contexts', fk: 'user_id' },
  { table: 'esm_responses', fk: 'user_id' },
  { table: 'chat_usage', fk: 'user_id' },
  { table: 'consent_records', fk: 'user_id' },
  { table: 'testimonials', fk: 'user_id' },
  { table: 'xp_events', fk: 'user_id' },
  { table: 'clipper_templates', fk: 'owner_id' },
];

const EXCLUDED: Record<string, string> = {
  ai_audit_log: 'hashes only; retained-after-erasure audit evidence, not the subject content',
  gemini_spend_daily: 'internal cost accounting, not personal content',
  revenue_events: 'billing/ops records; financial export out of scope for v1',
};

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

  const tables: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  // Profile row (includes privacy_prefs jsonb). Keyed by primary key, not user_id.
  {
    const { data, error } = await admin.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) errors['users'] = error.message;
    else tables['users'] = data;
  }

  // Every user-owned table, scoped to the caller.
  for (const { table, fk } of EXPORT_TABLES) {
    const { data, error } = await admin.from(table).select('*').eq(fk, userId);
    if (error) errors[table] = error.message;
    else tables[table] = data ?? [];
  }

  // Sources the user contributed to the shared knowledge base (their authored rows only).
  {
    const { data, error } = await admin.from('knowledge_sources').select('*').eq('added_by', userId);
    if (error) errors['knowledge_sources'] = error.message;
    else tables['knowledge_sources_contributed'] = data ?? [];
  }

  // raw-clippings Storage (<userId>/<slug>.md) — the original clipped markdown, NOT
  // FK-linked. Best-effort: list paginated, download each; never fail the export on a
  // Storage hiccup (the structured DB export above is the rights-grade payload).
  const storage: { path: string; markdown?: string; error?: string }[] = [];
  try {
    const PAGE = 1000;
    for (;;) {
      const { data: objs, error: listErr } = await admin.storage
        .from('raw-clippings')
        .list(userId, { limit: PAGE });
      if (listErr) {
        errors['raw-clippings:list'] = listErr.message;
        break;
      }
      if (!objs || objs.length === 0) break;
      for (const o of objs) {
        const path = `${userId}/${o.name}`;
        const { data: blob, error: dlErr } = await admin.storage.from('raw-clippings').download(path);
        if (dlErr || !blob) storage.push({ path, error: dlErr?.message ?? 'download_failed' });
        else storage.push({ path, markdown: await blob.text() });
      }
      if (objs.length < PAGE) break;
    }
  } catch (e) {
    errors['raw-clippings'] = String(e);
  }

  return jsonResponse(req, {
    schema_version: 1,
    kind: '2nd-b-account-export',
    exported_at: new Date().toISOString(),
    user_id: userId,
    tables,
    storage,
    excluded: EXCLUDED,
    errors,
  });
});
