// Naver OAuth pre-auth boundary.
//
// The server, not the unauthenticated client, issues a 256-bit state capability.
// SQL stores only its HMAC fingerprint and consumes it atomically with a fixed
// ten-minute TTL. Naver does not document PKCE for this API, so no non-standard
// verifier is invented here. A private subject mapping and durable pending claim
// prevent email-based linking and duplicate auth users during concurrent first
// login. Keep ENABLE_NAVER_OAUTH off until migration 0160 and all secrets exist.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const NAVER_AUTHORIZE_URL = 'https://nid.naver.com/oauth2.0/authorize';
const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';
const REQUEST_BODY_LIMIT_BYTES = 16 * 1024;
const UPSTREAM_BODY_LIMIT_BYTES = 64 * 1024;
const STATE_BYTES = 32;

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);
const ALLOWED_REDIRECTS = new Set<string>([
  'https://simon-yhkim.github.io/2nd-B/oauth-callback',
  'http://localhost:8081/oauth-callback',
  'http://localhost:19006/oauth-callback',
]);
const PRODUCTION_REDIRECT = 'https://simon-yhkim.github.io/2nd-B/oauth-callback';
const NATIVE_STATE_PREFIX = 'native.';
const STATE_RE = /^(?:native\.)?[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class BoundaryError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

function responseOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'null';
}

function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'vary': 'origin',
      ...extraHeaders,
    },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '600',
      'vary': 'origin',
    },
  });
}

function ipv4Valid(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function peerValueValid(value: string): boolean {
  if (value.length === 0 || value.length > 45) return false;
  if (ipv4Valid(value)) return true;
  if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.length > 2;
  } catch {
    return false;
  }
}

// Measured on the hosted project: the Supabase edge gateway discards a
// caller-supplied forwarding header, rewrites X-Forwarded-For, and supplies
// CF-Connecting-IP. Use only those peer headers; never accept a body/query IP.
function trustedPeer(req: Request): string | null {
  const cfPeer = req.headers.get('cf-connecting-ip');
  if (cfPeer !== null) {
    const candidate = cfPeer.trim();
    return peerValueValid(candidate) ? candidate : null;
  }
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded === null || forwarded.length > 256) return null;
  const candidate = forwarded.split(',')[0]?.trim() ?? '';
  return peerValueValid(candidate) ? candidate : null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToHex(value);
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  tooLargeCode: string,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new BoundaryError(413, tooLargeCode);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function decodeJsonObject(bytes: Uint8Array, errorCode: string): Record<string, unknown> {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BoundaryError(400, errorCode);
  }
}

async function readRequestObject(req: Request): Promise<Record<string, unknown>> {
  const mediaType = (req.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new BoundaryError(415, 'json_content_type_required');
  const contentLength = req.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > REQUEST_BODY_LIMIT_BYTES) {
      throw new BoundaryError(413, 'request_body_too_large');
    }
  }
  const bytes = await readBoundedBytes(req.body, REQUEST_BODY_LIMIT_BYTES, 'request_body_too_large');
  return decodeJsonObject(bytes, 'invalid_json');
}

async function readUpstreamObject(response: Response): Promise<Record<string, unknown>> {
  const mediaType = (response.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new Error('unexpected provider content type');
  const bytes = await readBoundedBytes(response.body, UPSTREAM_BODY_LIMIT_BYTES, 'upstream_body_too_large');
  try {
    return decodeJsonObject(bytes, 'invalid_upstream_json');
  } catch {
    throw new Error('invalid provider JSON');
  }
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(body).every((key) => allowedKeys.has(key));
}

function redirectAllowed(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_REDIRECTS.has(value);
}

function codeValid(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 512
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function stateValid(value: unknown): value is string {
  return typeof value === 'string' && STATE_RE.test(value);
}

interface AdminUser {
  id: string;
  email?: string | null;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
  auth: {
    admin: {
      getUserById(id: string): Promise<{
        data: { user: AdminUser | null };
        error: unknown;
      }>;
      createUser(attributes: {
        email: string;
        email_confirm: boolean;
        app_metadata: Record<string, string>;
      }): Promise<{
        data: { user: AdminUser | null };
        error: unknown;
      }>;
      generateLink(attributes: { type: 'magiclink'; email: string }): Promise<{
        data: { properties?: { action_link?: string | null } } | null;
        error: unknown;
      }>;
    };
  };
}

async function safeRpc(
  client: RpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> {
  try {
    const result = await client.rpc(name, args);
    return { data: result.data, error: result.error };
  } catch {
    return { data: null, error: true };
  }
}

async function enforceRateLimit(
  client: RpcClient,
  ipHash: string,
  stateHash: string,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number } | null> {
  const result = await safeRpc(client, 'consume_oauth_naver_rate_limit', {
    p_ip_hash: ipHash,
    p_state_hash: stateHash,
  });
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return null;
  const rawRow = result.data[0];
  if (typeof rawRow !== 'object' || rawRow === null || Array.isArray(rawRow)) return null;
  const row = rawRow as Record<string, unknown>;
  if (row.allowed === true && row.retry_after_seconds === 0) return { allowed: true };
  if (
    row.allowed === false
    && Number.isInteger(row.retry_after_seconds)
    && Number(row.retry_after_seconds) >= 1
    && Number(row.retry_after_seconds) <= 3600
  ) return { allowed: false, retryAfter: Number(row.retry_after_seconds) };
  return null;
}

async function fetchProvider(
  target: string,
  init: RequestInit,
): Promise<{ response: Response; body: Record<string, unknown> } | null> {
  try {
    const response = await fetch(target, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    const body = await readUpstreamObject(response);
    return { response, body };
  } catch {
    return null;
  }
}

function tokenFrom(body: Record<string, unknown>): string | null {
  const accessToken = body.access_token;
  const tokenType = body.token_type;
  if (
    typeof accessToken !== 'string'
    || accessToken.length < 8
    || accessToken.length > 8192
    || !/^[\x21-\x7e]+$/.test(accessToken)
    || typeof tokenType !== 'string'
    || tokenType.toLowerCase() !== 'bearer'
  ) return null;
  return accessToken;
}

function providerEmail(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string'
    || value.length < 3
    || value.length > 320
    || !/^[^@\s]+@[^@\s]+$/.test(value)
    || /[\u0000-\u001f\u007f]/.test(value)
  ) return false;
  return value;
}

function profileFrom(body: Record<string, unknown>): { subject: string; email: string | null } | null {
  if (body.resultcode !== '00') return null;
  const profile = body.response;
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) return null;
  const record = profile as Record<string, unknown>;
  const subject = record.id;
  if (
    typeof subject !== 'string'
    || subject.length < 1
    || subject.length > 255
    || /[\u0000-\u001f\u007f]/.test(subject)
  ) return null;
  const email = providerEmail(record.email);
  return email === false ? null : { subject, email };
}

function validAccountEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 3
    && value.length <= 320
    && value.includes('@')
    && !/[\u0000-\u0020\u007f]/.test(value);
}

async function handleStart(
  req: Request,
  body: Record<string, unknown>,
  admin: RpcClient,
  clientId: string,
  pepper: string,
  peer: string,
): Promise<Response> {
  if (
    !hasOnlyKeys(body, ['action', 'redirect_uri', 'native'])
    || !redirectAllowed(body.redirect_uri)
    || typeof body.native !== 'boolean'
    || (body.native && body.redirect_uri !== PRODUCTION_REDIRECT)
  ) return jsonResponse(req, { error: 'invalid_oauth_start' }, 400);

  const rawState = `${body.native ? NATIVE_STATE_PREFIX : ''}${randomHex(STATE_BYTES)}`;
  const [ipHash, stateHash] = await Promise.all([
    hmacHex(pepper, `naver:peer:${peer}`),
    hmacHex(pepper, `naver:state:${rawState}`),
  ]);
  const limit = await enforceRateLimit(admin, ipHash, stateHash);
  if (limit === null) return jsonResponse(req, { error: 'oauth_rate_limit_unavailable' }, 503);
  if (!limit.allowed) {
    return jsonResponse(req, { error: 'rate_limited' }, 429, {
      'retry-after': String(limit.retryAfter),
    });
  }

  const issued = await safeRpc(admin, 'issue_oauth_naver_state', {
    p_state_hash: stateHash,
    p_redirect_uri: body.redirect_uri,
  });
  if (issued.error || issued.data !== true) {
    return jsonResponse(req, { error: 'oauth_state_store_unavailable' }, 503);
  }

  const authorize = new URL(NAVER_AUTHORIZE_URL);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', body.redirect_uri);
  authorize.searchParams.set('state', rawState);
  return jsonResponse(req, { authorize_url: authorize.toString() });
}

async function handleExchange(
  req: Request,
  body: Record<string, unknown>,
  admin: RpcClient,
  clientId: string,
  clientSecret: string,
  pepper: string,
  peer: string,
): Promise<Response> {
  if (
    !hasOnlyKeys(body, ['action', 'code', 'state', 'redirect_uri'])
    || !codeValid(body.code)
    || !stateValid(body.state)
    || !redirectAllowed(body.redirect_uri)
  ) return jsonResponse(req, { error: 'invalid_oauth_exchange' }, 400);

  const [ipHash, stateHash] = await Promise.all([
    hmacHex(pepper, `naver:peer:${peer}`),
    hmacHex(pepper, `naver:state:${body.state}`),
  ]);
  const limit = await enforceRateLimit(admin, ipHash, stateHash);
  if (limit === null) return jsonResponse(req, { error: 'oauth_rate_limit_unavailable' }, 503);
  if (!limit.allowed) {
    return jsonResponse(req, { error: 'rate_limited' }, 429, {
      'retry-after': String(limit.retryAfter),
    });
  }

  const consumed = await safeRpc(admin, 'consume_oauth_naver_state', {
    p_state_hash: stateHash,
    p_redirect_uri: body.redirect_uri,
  });
  if (consumed.error) return jsonResponse(req, { error: 'oauth_state_store_unavailable' }, 503);
  if (consumed.data !== true) return jsonResponse(req, { error: 'oauth_state_invalid' }, 409);

  const tokenForm = new URLSearchParams();
  tokenForm.set('grant_type', 'authorization_code');
  tokenForm.set('client_id', clientId);
  tokenForm.set('client_secret', clientSecret);
  tokenForm.set('code', body.code);
  tokenForm.set('state', body.state);
  const tokenResult = await fetchProvider(NAVER_TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: tokenForm.toString(),
  });
  const accessToken = tokenResult?.response.ok ? tokenFrom(tokenResult.body) : null;
  if (accessToken === null) {
    return jsonResponse(req, { error: 'naver_token_exchange_failed' }, 502);
  }

  const profileResult = await fetchProvider(NAVER_PROFILE_URL, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
  });
  const profile = profileResult?.response.ok ? profileFrom(profileResult.body) : null;
  if (profile === null) return jsonResponse(req, { error: 'naver_profile_failed' }, 502);

  const subjectHash = await hmacHex(pepper, `naver:subject:${profile.subject}`);
  const claimHash = await hmacHex(pepper, `naver:claim:${randomHex(STATE_BYTES)}`);
  const claim = await safeRpc(admin, 'claim_oauth_naver_identity', {
    p_subject_hash: subjectHash,
    p_claim_hash: claimHash,
  });
  if (claim.error || !Array.isArray(claim.data) || claim.data.length !== 1) {
    return jsonResponse(req, { error: 'naver_identity_unavailable' }, 503);
  }
  const rawClaimRow = claim.data[0];
  if (typeof rawClaimRow !== 'object' || rawClaimRow === null || Array.isArray(rawClaimRow)) {
    return jsonResponse(req, { error: 'naver_identity_unavailable' }, 503);
  }
  const claimRow = rawClaimRow as Record<string, unknown>;
  if (claimRow.status === 'pending') {
    return jsonResponse(req, { error: 'naver_identity_pending' }, 503);
  }

  let userId: string;
  let accountEmail: string;
  if (claimRow.status === 'bound' && typeof claimRow.user_id === 'string' && UUID_RE.test(claimRow.user_id)) {
    try {
      const existing = await admin.auth.admin.getUserById(claimRow.user_id);
      if (
        existing.error
        || !existing.data?.user
        || existing.data.user.id !== claimRow.user_id
        || !validAccountEmail(existing.data.user.email)
      ) return jsonResponse(req, { error: 'naver_identity_unavailable' }, 503);
      userId = claimRow.user_id;
      accountEmail = existing.data.user.email;
    } catch {
      return jsonResponse(req, { error: 'naver_identity_unavailable' }, 503);
    }
  } else if (claimRow.status === 'claimed' && claimRow.user_id === null) {
    // The provider email is used only when creating this newly claimed subject.
    // It is never searched or used to link an existing account. A missing email
    // gets a deterministic private placeholder so email is not an identity key.
    accountEmail = profile.email ?? `${subjectHash}@naver.invalid`;
    try {
      const created = await admin.auth.admin.createUser({
        email: accountEmail,
        email_confirm: true,
        app_metadata: {
          oauth_provider: 'naver',
          oauth_subject_hash: subjectHash,
        },
      });
      if (created.error || !created.data?.user || !UUID_RE.test(created.data.user.id)) {
        return jsonResponse(req, { error: 'naver_identity_reconciliation_required' }, 503);
      }
      userId = created.data.user.id;
    } catch {
      return jsonResponse(req, { error: 'naver_identity_reconciliation_required' }, 503);
    }

    const bindingArgs = {
      p_subject_hash: subjectHash,
      p_claim_hash: claimHash,
      p_user_id: userId,
    };
    let bound = await safeRpc(admin, 'bind_oauth_naver_identity', bindingArgs);
    if (bound.error || bound.data !== true) {
      bound = await safeRpc(admin, 'bind_oauth_naver_identity', bindingArgs);
    }
    if (bound.error || bound.data !== true) {
      return jsonResponse(req, { error: 'naver_identity_reconciliation_required' }, 503);
    }
  } else {
    return jsonResponse(req, { error: 'naver_identity_unavailable' }, 503);
  }

  try {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: accountEmail });
    if (link.error || !link.data?.properties?.action_link) {
      return jsonResponse(req, { error: 'naver_session_unavailable' }, 503);
    }
    const actionLink = new URL(link.data.properties.action_link);
    const tokenHash = actionLink.searchParams.get('token_hash') ?? '';
    if (tokenHash.length < 8 || tokenHash.length > 4096 || /[\u0000-\u0020\u007f]/.test(tokenHash)) {
      return jsonResponse(req, { error: 'naver_session_unavailable' }, 503);
    }
    return jsonResponse(req, { token_hash: tokenHash, token_type: 'magiclink' });
  } catch {
    return jsonResponse(req, { error: 'naver_session_unavailable' }, 503);
  }
}

Deno.serve(async (req: Request) => {
  if (!originAllowed(req)) return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);
  if (Deno.env.get('ENABLE_NAVER_OAUTH') !== 'true') {
    return jsonResponse(req, { error: 'naver_oauth_disabled' }, 503);
  }

  const clientId = Deno.env.get('NAVER_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET') ?? '';
  const pepper = Deno.env.get('NAVER_OAUTH_HMAC_PEPPER') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (
    clientId.length === 0
    || clientSecret.length === 0
    || new TextEncoder().encode(pepper).byteLength < 32
    || supabaseUrl.length === 0
    || serviceRoleKey.length === 0
  ) return jsonResponse(req, { error: 'naver_oauth_unavailable' }, 503);

  const peer = trustedPeer(req);
  if (peer === null) return jsonResponse(req, { error: 'peer_identity_unavailable' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await readRequestObject(req);
  } catch (error) {
    if (error instanceof BoundaryError) {
      return jsonResponse(req, { error: error.code }, error.status);
    }
    return jsonResponse(req, { error: 'invalid_request' }, 400);
  }

  const action = body.action;
  if (action !== 'start' && action !== 'exchange') {
    return jsonResponse(req, { error: 'invalid_oauth_action' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  try {
    if (action === 'start') return await handleStart(req, body, admin, clientId, pepper, peer);
    return await handleExchange(req, body, admin, clientId, clientSecret, pepper, peer);
  } catch {
    return jsonResponse(req, { error: 'naver_oauth_unavailable' }, 503);
  }
});
