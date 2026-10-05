// Read-only account deletion receipt lookup (0217, Simon decision Q-261004-42 = A).
//
// The person who deleted an account has no account any more, so this answers
// without one: the caller sends the publishable (anon) key like peer-respond,
// the gateway keeps verify_jwt on, and the only input is the receipt number.
// The receipt itself holds no account identifier (no user id, session, email or
// hash), so a number is all it can be looked up by and all it can reveal.
//
// POST { "receipt_id": "<uuid>" } ->
//   200 { "receipt": { id, erased_at, expires_at, sweeps, sweeps_reported } }
//   200 { "receipt": null }                 no such receipt, or it expired
//   400 / 405 / 413 / 415                    malformed request
//   503 { "error": "server_unavailable" }   lookup could not be answered
//
// "Not found" is a 200 on purpose: a 404 is also what the gateway says when
// this function is not deployed, and the app must never read "function
// missing" as "this deletion did not happen".
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { JsonBodyError, readStrictJsonObject } from '../_shared/request-json.ts';
import { publicReceipt, receiptIdFromBody } from './receipt-shape.ts';

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);
const MAX_BODY_BYTES = 256;
const MAX_BODY_DEPTH = 1;
const UPSTREAM_TIMEOUT_MS = 10_000;

function responseHeaders(req: Request): Headers {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'origin',
  });
  const origin = req.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('access-control-allow-origin', origin);
  }
  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) });
}

function corsPreflight(req: Request): Response {
  const headers = responseHeaders(req);
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('access-control-max-age', '86400');
  return new Response(null, { status: 204, headers });
}

function safeLog(code: string): void {
  console.warn(`[account-deletion-receipt] ${code}`);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  let receiptId: string;
  try {
    const body = await readStrictJsonObject(req, MAX_BODY_BYTES, MAX_BODY_DEPTH);
    const requested = receiptIdFromBody(body);
    if (requested === null) return jsonResponse(req, { error: 'invalid_body' }, 400);
    receiptId = requested;
  } catch (error) {
    if (error instanceof JsonBodyError) {
      if (error.code === 'request_body_too_large') return jsonResponse(req, { error: 'body_too_large' }, 413);
      if (error.code === 'unsupported_media_type') return jsonResponse(req, { error: 'unsupported_media_type' }, 415);
    }
    return jsonResponse(req, { error: 'invalid_body' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    safeLog('supabase_env_missing');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }

  const boundedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: boundedFetch },
  });

  try {
    const { data, error } = await admin.rpc('get_account_deletion_receipt', {
      p_receipt_id: receiptId,
    });
    if (error) {
      safeLog('receipt_lookup_failed');
      return jsonResponse(req, { error: 'server_unavailable' }, 503);
    }
    if (data === null) return jsonResponse(req, { receipt: null });
    const receipt = publicReceipt(data);
    if (!receipt || receipt.id !== receiptId) {
      safeLog('receipt_shape_invalid');
      return jsonResponse(req, { error: 'server_unavailable' }, 503);
    }
    return jsonResponse(req, { receipt });
  } catch {
    safeLog('upstream_request_failed');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }
});
