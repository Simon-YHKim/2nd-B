// Account deletion receipt lookup without an account (0217,
// docs/design/deletion-receipt-server-261006.md 3.4).
//
// The person who deleted an account has no session, so the app posts the
// publishable (anon) key like peer-respond; the gateway keeps verify_jwt on and
// this function trusts no identity from it. Two questions:
//
//   POST { op_id }                       the receipt (anyone holding the number):
//     200 { receipt: { op_id, erased_at, expires_at, sweeps, sweeps_reported, unrecorded } }
//     200 { receipt: null }              no completed receipt with that number (or it expired)
//
//   POST { op_id, op_token, owner_id }   this device asking about its own request:
//     200 { op: { status, receipt|null } } only when HMAC(op token pepper, op, owner,
//                                          issue time) equals the token it holds
//     200 { op: null }                   no such op, or the token/owner does not bind
//
//   400 / 405 / 413 / 415 malformed · 429 rate_limited · 503 server_unavailable
//
// "Not found" is a 200 on purpose: a 404 is also what the gateway says when this
// function is not deployed, and the app must never read "function missing" as
// "this deletion did not happen".
//
// Every call spends the signed-out lookup budget (0217: 30 per network key per
// hour, 3000 per day) BEFORE any op row is read. The network key is an HMAC
// with ACCOUNT_DELETION_LOOKUP_PEPPER_V1; no raw address reaches the database.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { JsonBodyError, readStrictJsonObject } from '../_shared/request-json.ts';
import { canonicalNetworkIdentity } from '../_shared/network-identity.ts';
import {
  LOOKUP_PEPPER_ENV,
  MIN_PEPPER_LENGTH,
  OP_TOKEN_PEPPER_ENV,
  opTokenHashHex,
  parseReceiptLookupBody,
  publicReceipt,
  recoveryRow,
  verifyOpToken,
  type ReceiptLookupRequest,
} from '../_shared/account-deletion-op.ts';

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);
const MAX_BODY_BYTES = 512;
const MAX_BODY_DEPTH = 1;
const UPSTREAM_TIMEOUT_MS = 10_000;
const UNKNOWN_NETWORK_HINT = 'unknown';

function responseHeaders(req: Request, extra: Record<string, string> = {}): Headers {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'origin',
    ...extra,
  });
  const origin = req.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('access-control-allow-origin', origin);
  }
  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req, extra) });
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

async function hmacSha256Hex(pepper: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function trustedGatewayNetworkHint(request: Request): string {
  // Supabase's Cloudflare edge overwrites this hop header. If it is absent or
  // malformed, share one fail-safe bucket instead of trusting a caller value.
  const cloudflare = request.headers.get('cf-connecting-ip');
  if (cloudflare !== null) {
    return canonicalNetworkIdentity(cloudflare) ?? UNKNOWN_NETWORK_HINT;
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded === null || forwarded.length > 256) return UNKNOWN_NETWORK_HINT;
  const firstHop = forwarded.split(',', 2)[0] ?? '';
  return canonicalNetworkIdentity(firstHop) ?? UNKNOWN_NETWORK_HINT;
}

function parseQuota(data: unknown): { allowed: boolean; retryAfterSeconds: number } | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0] as Record<string, unknown> | null;
  if (!row || typeof row !== 'object') return null;
  if (typeof row.allowed !== 'boolean' || typeof row.retry_after_seconds !== 'number') return null;
  const retry = row.retry_after_seconds;
  if (!Number.isInteger(retry) || retry < 0 || retry > 86_400) return null;
  return { allowed: row.allowed, retryAfterSeconds: retry };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  let request: ReceiptLookupRequest;
  try {
    const body = await readStrictJsonObject(req, MAX_BODY_BYTES, MAX_BODY_DEPTH);
    const parsed = parseReceiptLookupBody(body);
    if (parsed === null) return jsonResponse(req, { error: 'invalid_body' }, 400);
    request = parsed;
  } catch (error) {
    if (error instanceof JsonBodyError) {
      if (error.code === 'request_body_too_large') return jsonResponse(req, { error: 'body_too_large' }, 413);
      if (error.code === 'unsupported_media_type') return jsonResponse(req, { error: 'unsupported_media_type' }, 415);
    }
    return jsonResponse(req, { error: 'invalid_body' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const lookupPepper = Deno.env.get(LOOKUP_PEPPER_ENV) ?? '';
  if (!supabaseUrl || !serviceRoleKey || lookupPepper.length < MIN_PEPPER_LENGTH) {
    safeLog('env_missing');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }
  const opPepper = Deno.env.get(OP_TOKEN_PEPPER_ENV) ?? '';
  if (request.kind === 'recover' && opPepper.length < MIN_PEPPER_LENGTH) {
    safeLog('op_token_pepper_missing');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }

  const boundedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: boundedFetch },
  });

  try {
    const keyHash = await hmacSha256Hex(
      lookupPepper,
      `account-deletion-receipt:abuse:v1:${trustedGatewayNetworkHint(req)}`,
    );
    const { data: quotaData, error: quotaError } = await admin.rpc('consume_account_deletion_receipt_lookup', {
      p_key_hash: keyHash,
    });
    const quota = quotaError ? null : parseQuota(quotaData);
    if (!quota) {
      safeLog('rate_limit_unavailable');
      return jsonResponse(req, { error: 'server_unavailable' }, 503);
    }
    if (!quota.allowed) {
      return jsonResponse(req, { error: 'rate_limited' }, 429, { 'retry-after': String(quota.retryAfterSeconds) });
    }

    if (request.kind === 'receipt') {
      const { data, error } = await admin.rpc('get_account_deletion_op', {
        p_op_id: request.opId,
        p_token_hash: null,
      });
      if (error) {
        safeLog('receipt_lookup_failed');
        return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
      if (data === null) return jsonResponse(req, { receipt: null });
      const receipt = publicReceipt(data, request.opId);
      if (!receipt) {
        safeLog('receipt_shape_invalid');
        return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
      return jsonResponse(req, { receipt });
    }

    const { data, error } = await admin.rpc('get_account_deletion_op', {
      p_op_id: request.opId,
      p_token_hash: await opTokenHashHex(request.opToken),
    });
    if (error) {
      safeLog('op_lookup_failed');
      return jsonResponse(req, { error: 'server_unavailable' }, 503);
    }
    if (data === null) return jsonResponse(req, { op: null });
    const row = recoveryRow(data, request.opId);
    if (!row) {
      safeLog('op_shape_invalid');
      return jsonResponse(req, { error: 'server_unavailable' }, 503);
    }
    // The token hash matched; the owner binding is proven only by the HMAC. A
    // wrong owner id is answered exactly like an unknown op.
    if (!(await verifyOpToken(opPepper, request.opToken, request.opId, request.ownerId, row.issuedMs))) {
      return jsonResponse(req, { op: null });
    }
    const receipt = row.status === 'completed' ? publicReceipt(data, request.opId) : null;
    return jsonResponse(req, { op: { status: row.status, receipt } });
  } catch {
    safeLog('upstream_request_failed');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }
});
