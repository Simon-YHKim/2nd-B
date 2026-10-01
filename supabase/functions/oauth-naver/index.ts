// Naver OAuth pre-auth boundary.
//
// The server, not the unauthenticated client, issues a 256-bit state capability.
// SQL stores only its HMAC fingerprint and consumes it atomically with a fixed
// ten-minute TTL. Naver does not document PKCE for this API, so no non-standard
// verifier is invented here. A private subject mapping and durable pending claim
// prevent email-based linking and duplicate auth users during concurrent first
// login. Keep ENABLE_NAVER_OAUTH off until migration 0183, the reserved
// limiter-completion forward migration, and all exact-name secrets are applied.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import {
  JsonBodyError,
  OAUTH_JSON_BODY_LIMIT_BYTES,
  readJsonObject,
} from '../_shared/request-json.ts';
import { canonicalNetworkIdentity } from '../_shared/network-identity.ts';

const NAVER_AUTHORIZE_URL = 'https://nid.naver.com/oauth2.0/authorize';
const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';
const REQUEST_BODY_TIMEOUT_MS = 3_000;
const REQUEST_JSON_MAX_DEPTH = 4;
const UPSTREAM_BODY_LIMIT_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 5_000;
const UPSTREAM_JSON_MAX_DEPTH = 8;
const SUPABASE_UPSTREAM_BODY_LIMIT_BYTES = 128 * 1024;
const SUPABASE_UPSTREAM_TIMEOUT_MS = 5_000;
const STATE_BYTES = 32;

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
]);
const ALLOWED_REDIRECTS = new Map<string, string>([
  ['https://simon-yhkim.github.io', 'https://simon-yhkim.github.io/2nd-B/oauth-callback'],
]);
const STATE_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class BoundaryError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function responseHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'origin',
  };
  const origin = allowedOrigin(req);
  if (origin !== null) headers['access-control-allow-origin'] = origin;
  return headers;
}

function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(req), ...extraHeaders },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...responseHeaders(req),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-max-age': '600',
    },
  });
}

// Measured on the hosted project: the Supabase edge gateway discards a
// caller-supplied forwarding header, rewrites X-Forwarded-For, and supplies
// CF-Connecting-IP. Use only those peer headers; never accept a body/query IP.
function trustedPeer(req: Request): string | null {
  const cfPeer = req.headers.get('cf-connecting-ip');
  if (cfPeer !== null) {
    const candidate = cfPeer.trim();
    return canonicalNetworkIdentity(candidate);
  }
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded === null || forwarded.length > 256) return null;
  const candidate = forwarded.split(',')[0]?.trim() ?? '';
  return canonicalNetworkIdentity(candidate);
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

interface BoundedReadOptions {
  limit: number;
  tooLargeCode: string;
  timeoutMs: number;
  timeoutCode: string;
  declaredLength?: number | null;
  lengthMismatchCode?: string;
}

async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  options: BoundedReadOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const expectedLength = options.declaredLength ?? null;
  if (body === null) {
    if (expectedLength !== null && expectedLength !== 0) {
      throw new BoundaryError(400, options.lengthMismatchCode ?? 'body_length_mismatch');
    }
    return new Uint8Array();
  }

  const reader = body.getReader();
  const buffer = new Uint8Array(options.limit);
  let total = 0;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => undefined);
      reject(new BoundaryError(408, options.timeoutCode));
    }, options.timeoutMs);
  });

  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next.done) break;
      if (total + next.value.byteLength > options.limit) {
        await reader.cancel().catch(() => undefined);
        throw new BoundaryError(413, options.tooLargeCode);
      }
      buffer.set(next.value, total);
      total += next.value.byteLength;
    }
  } catch (error) {
    if (!timedOut) await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      // A deadline may still be settling the pending read after cancellation.
    }
  }

  if (expectedLength !== null && total !== expectedLength) {
    throw new BoundaryError(400, options.lengthMismatchCode ?? 'body_length_mismatch');
  }
  return buffer.slice(0, total);
}

function assertJsonStructure(text: string, errorCode: string, maxDepth: number): void {
  let index = 0;
  const fail = (): never => {
    throw new BoundaryError(400, errorCode);
  };
  const skipWhitespace = (): void => {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index]!)) index += 1;
  };
  const parseString = (): string => {
    if (text[index] !== '"') return fail();
    const start = index;
    index += 1;
    while (index < text.length) {
      const char = text[index]!;
      if (char === '"') {
        index += 1;
        try {
          const value = JSON.parse(text.slice(start, index)) as unknown;
          return typeof value === 'string' ? value : fail();
        } catch {
          return fail();
        }
      }
      if (char.charCodeAt(0) <= 0x1f) return fail();
      if (char === '\\') {
        index += 1;
        const escape = text[index];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) return fail();
          index += 5;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) return fail();
      }
      index += 1;
    }
    return fail();
  };
  const parseNumber = (): void => {
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (match === null) return fail();
    index += match[0].length;
  };
  const parseValue = (depth: number): void => {
    if (depth > maxDepth) fail();
    skipWhitespace();
    const char = text[index];
    if (char === '{') {
      parseObject(depth);
      return;
    }
    if (char === '[') {
      parseArray(depth);
      return;
    }
    if (char === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    parseNumber();
  };
  const parseObject = (depth: number): void => {
    index += 1;
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    const keys = new Set<string>();
    while (index < text.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) fail();
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') fail();
      index += 1;
      parseValue(depth + 1);
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail();
      index += 1;
    }
    fail();
  };
  const parseArray = (depth: number): void => {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    while (index < text.length) {
      parseValue(depth + 1);
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail();
      index += 1;
    }
    fail();
  };

  skipWhitespace();
  parseValue(1);
  skipWhitespace();
  if (index !== text.length) fail();
}

function decodeJsonObject(
  bytes: Uint8Array,
  errorCode: string,
  maxDepth: number,
): Record<string, unknown> {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assertJsonStructure(text, errorCode, maxDepth);
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BoundaryError) throw error;
    throw new BoundaryError(400, errorCode);
  }
}

async function cancelUnreadBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body === null || body.locked) return;
  try {
    await body.cancel();
  } catch {
    // The original boundary error remains authoritative.
  }
}

function exactSupabaseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || url.username !== ''
      || url.password !== ''
      || url.search !== ''
      || url.hash !== ''
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function boundedSupabaseFetch(
  supabaseOrigin: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_UPSTREAM_TIMEOUT_MS);
  const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
  const abortFromCaller = () => controller.abort();
  try {
    const rawTarget = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    const target = new URL(rawTarget);
    if (
      target.origin !== supabaseOrigin
      || target.username !== ''
      || target.password !== ''
      || target.hash !== ''
    ) throw new Error('supabase upstream rejected');
    if (sourceSignal?.aborted) throw new Error('supabase upstream rejected');
    sourceSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const deadlineAt = Date.now() + SUPABASE_UPSTREAM_TIMEOUT_MS;
    const response = await fetch(input, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error('supabase upstream rejected');

    const contentLength = response.headers.get('content-length');
    if (
      contentLength !== null
      && (
        !/^(?:0|[1-9]\d*)$/.test(contentLength)
        || Number(contentLength) > SUPABASE_UPSTREAM_BODY_LIMIT_BYTES
      )
    ) throw new Error('supabase upstream rejected');

    const bytes = await readBoundedBytes(response.body, {
      limit: SUPABASE_UPSTREAM_BODY_LIMIT_BYTES,
      tooLargeCode: 'supabase_upstream_body_too_large',
      timeoutMs: remainingMs,
      timeoutCode: 'supabase_upstream_body_timeout',
    });
    const body = [204, 205, 304].includes(response.status) ? null : bytes;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    throw new Error('supabase upstream rejected');
  } finally {
    clearTimeout(timeoutId);
    sourceSignal?.removeEventListener('abort', abortFromCaller);
    controller.abort();
  }
}

async function readRequestObject(request: Request): Promise<Record<string, unknown>> {
  const mediaType = (request.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    await cancelUnreadBody(request.body);
    throw new BoundaryError(415, 'json_content_type_required');
  }

  const contentLength = request.headers.get('content-length');
  let declaredLength: number | null = null;
  if (contentLength !== null) {
    if (!/^(?:0|[1-9]\d*)$/.test(contentLength)) {
      await cancelUnreadBody(request.body);
      throw new BoundaryError(400, 'request_content_length_invalid');
    }
    declaredLength = Number(contentLength);
    if (declaredLength > OAUTH_JSON_BODY_LIMIT_BYTES) {
      await cancelUnreadBody(request.body);
      throw new BoundaryError(413, 'request_body_too_large');
    }
  }

  // Use the repository-wide streamed JSON reader, but retain this endpoint's
  // shorter deadline and duplicate-key/depth checks. The transform captures at
  // most the same 4 KiB the shared reader permits; it never buffers an
  // attacker-controlled amount beyond that bound.
  const captured = new Uint8Array(OAUTH_JSON_BODY_LIMIT_BYTES);
  let capturedLength = 0;
  const capturedBody = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (capturedLength + chunk.byteLength <= captured.byteLength) {
        captured.set(chunk, capturedLength);
      }
      capturedLength += chunk.byteLength;
      controller.enqueue(chunk);
    },
  })) ?? null;
  const deadlineController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    deadlineController.abort();
  }, REQUEST_BODY_TIMEOUT_MS);
  const abortFromCaller = () => deadlineController.abort();
  request.signal.addEventListener('abort', abortFromCaller, { once: true });
  const req = {
    body: capturedBody,
    headers: request.headers,
    signal: deadlineController.signal,
  } as Request;

  try {
    const parsed = await readJsonObject(req, OAUTH_JSON_BODY_LIMIT_BYTES);
    if (declaredLength !== null && capturedLength !== declaredLength) {
      throw new BoundaryError(400, 'request_content_length_mismatch');
    }
    const text = new TextDecoder('utf-8', { fatal: true })
      .decode(captured.slice(0, capturedLength));
    assertJsonStructure(text, 'invalid_json', REQUEST_JSON_MAX_DEPTH);
    return parsed;
  } catch (error) {
    if (error instanceof BoundaryError) throw error;
    if (timedOut) throw new BoundaryError(408, 'request_body_timeout');
    if (error instanceof JsonBodyError && error.code === 'request_body_too_large') {
      throw new BoundaryError(413, error.code);
    }
    throw new BoundaryError(400, 'invalid_json');
  } finally {
    clearTimeout(timeoutId);
    request.signal.removeEventListener('abort', abortFromCaller);
    deadlineController.abort();
  }
}

async function readUpstreamObject(
  response: Response,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const mediaType = (response.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    await cancelUnreadBody(response.body);
    throw new Error('unexpected provider content type');
  }
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null
    && (!/^(?:0|[1-9]\d*)$/.test(contentLength) || Number(contentLength) > UPSTREAM_BODY_LIMIT_BYTES)
  ) {
    await cancelUnreadBody(response.body);
    throw new Error('unexpected provider content length');
  }

  const bytes = await readBoundedBytes(response.body, {
    limit: UPSTREAM_BODY_LIMIT_BYTES,
    tooLargeCode: 'upstream_body_too_large',
    timeoutMs,
    timeoutCode: 'upstream_body_timeout',
  });
  try {
    return decodeJsonObject(bytes, 'invalid_upstream_json', UPSTREAM_JSON_MAX_DEPTH);
  } catch {
    throw new Error('invalid provider JSON');
  }
}

function hasExactKeys(body: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(body).sort().join(',') === [...expected].sort().join(',');
}

function redirectAllowed(value: unknown, origin: string): value is string {
  return typeof value === 'string' && ALLOWED_REDIRECTS.get(origin) === value;
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
        data: {
          user?: AdminUser | null;
          properties?: {
            hashed_token?: unknown;
            verification_type?: unknown;
          };
        } | null;
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
  return rateLimitDecision(result);
}

async function enforceSubjectRateLimit(
  client: RpcClient,
  subjectHash: string,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number } | null> {
  const result = await safeRpc(client, 'consume_oauth_naver_subject_rate_limit', {
    p_subject_hash: subjectHash,
  });
  return rateLimitDecision(result);
}

function rateLimitDecision(
  result: { data: unknown; error: unknown },
): { allowed: true } | { allowed: false; retryAfter: number } | null {
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
  const controller = new AbortController();
  const deadlineAt = Date.now() + UPSTREAM_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      await cancelUnreadBody(response.body);
      return null;
    }
    const body = await readUpstreamObject(response, remainingMs);
    return { response, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
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

function profileFrom(body: Record<string, unknown>): { subject: string } | null {
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
  return { subject };
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
  origin: string,
): Promise<Response> {
  if (
    !hasExactKeys(body, ['action', 'redirect_uri'])
    || body.action !== 'start'
    || !redirectAllowed(body.redirect_uri, origin)
  ) return jsonResponse(req, { error: 'invalid_oauth_start' }, 400);

  const rawState = randomHex(STATE_BYTES);
  const [ipHash, stateHash] = await Promise.all([
    hmacHex(pepper, 'naver:peer:' + peer),
    hmacHex(pepper, 'naver:state:' + rawState),
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
  origin: string,
): Promise<Response> {
  if (
    !hasExactKeys(body, ['action', 'code', 'state', 'redirect_uri'])
    || body.action !== 'exchange'
    || !codeValid(body.code)
    || !stateValid(body.state)
    || !redirectAllowed(body.redirect_uri, origin)
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
  const subjectLimit = await enforceSubjectRateLimit(admin, subjectHash);
  if (subjectLimit === null) {
    return jsonResponse(req, { error: 'oauth_subject_rate_limit_unavailable' }, 503);
  }
  if (!subjectLimit.allowed) {
    return jsonResponse(req, { error: 'rate_limited' }, 429, {
      'retry-after': String(subjectLimit.retryAfter),
    });
  }

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
    // The profile contract has no independently verified-email proof. Never
    // promote its email to a confirmed Supabase identifier or recovery path.
    // The HMAC alias is unique to the provider subject and never receives mail.
    accountEmail = `${subjectHash}@naver.invalid`;
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
    const properties = link.data?.properties;
    if (
      link.error
      || link.data?.user?.id !== userId
      || properties?.verification_type !== 'magiclink'
    ) {
      return jsonResponse(req, { error: 'naver_session_unavailable' }, 503);
    }
    const tokenHash = properties.hashed_token;
    if (
      typeof tokenHash !== 'string'
      || tokenHash.length < 8
      || tokenHash.length > 4096
      || /[\u0000-\u0020\u007f]/.test(tokenHash)
    ) {
      return jsonResponse(req, { error: 'naver_session_unavailable' }, 503);
    }
    return jsonResponse(req, { token_hash: tokenHash, token_type: 'magiclink' });
  } catch {
    return jsonResponse(req, { error: 'naver_session_unavailable' }, 503);
  }
}

Deno.serve(async (req: Request) => {
  const origin = allowedOrigin(req);
  if (origin === null) return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
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
  const supabaseOrigin = exactSupabaseOrigin(supabaseUrl);
  if (
    clientId.length === 0
    || clientSecret.length === 0
    || new TextEncoder().encode(pepper).byteLength < 32
    || supabaseOrigin === null
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
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        boundedSupabaseFetch(supabaseOrigin, input, init),
    },
  }) as unknown as RpcClient;
  try {
    if (action === 'start') return await handleStart(req, body, admin, clientId, pepper, peer, origin);
    return await handleExchange(req, body, admin, clientId, clientSecret, pepper, peer, origin);
  } catch {
    return jsonResponse(req, { error: 'naver_oauth_unavailable' }, 503);
  }
});
