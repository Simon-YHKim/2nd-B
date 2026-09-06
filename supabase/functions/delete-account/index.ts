// Terminal account erasure. The target is always the freshly authenticated
// caller; request data can neither select a user nor weaken deletion checks.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);
const MAX_BODY_BYTES = 1024;
const BODY_TIMEOUT_MS = 2_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const STORAGE_PAGE_SIZE = 1000;
const MAX_STORAGE_LIST_CALLS = 40;
const MAX_STORAGE_OBJECTS = 10_000;
const MAX_STORAGE_PATH_LENGTH = 1024;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_NAME_RE = /^[^/\\\r\n]{1,512}$/;

class RequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

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

async function readExactEmptyObject(req: Request): Promise<void> {
  const mediaType = (req.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') throw new RequestError('unsupported_media_type', 415);

  const contentLength = req.headers.get('content-length');
  let declaredLength: number | null = null;
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength)) {
      throw new RequestError('invalid_content_length', 400);
    }
    declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_BODY_BYTES) {
      throw new RequestError('body_too_large', 413);
    }
  }

  if (!req.body) throw new RequestError('invalid_body', 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, BODY_TIMEOUT_MS);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new RequestError('body_timeout', 408);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError('body_too_large', 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(timedOut ? 'body_timeout' : 'invalid_body', timedOut ? 408 : 400);
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }

  if (declaredLength !== null && declaredLength !== totalBytes) {
    throw new RequestError('invalid_content_length', 400);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let rawBody: string;
  try {
    rawBody = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RequestError('invalid_body', 400);
  }
  if (rawBody !== '{}') throw new RequestError('invalid_body', 400);
}

interface VerifiedClaims {
  sub: string;
  role: string;
  session_id: string;
  iat: number;
}

function decodeVerifiedClaims(token: string): VerifiedClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4)));
    return {
      sub: typeof decoded?.sub === 'string' ? decoded.sub : '',
      role: typeof decoded?.role === 'string' ? decoded.role : '',
      session_id: typeof decoded?.session_id === 'string' ? decoded.session_id : '',
      iat: typeof decoded?.iat === 'number' ? decoded.iat : Number.NaN,
    };
  } catch {
    return null;
  }
}

interface StorageBucket {
  list(
    path: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: 'name'; order: 'asc' };
    },
  ): PromiseLike<{ data: Array<{ name: string; id?: string | null }> | null; error: unknown | null }>;
  remove(paths: string[]): PromiseLike<{ error: unknown | null }>;
}

async function eraseRawClippings(
  bucket: StorageBucket,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const prefixes = [userId];
  const seenPrefixes = new Set(prefixes);
  const objectPaths = new Set<string>();
  let listCalls = 0;
  let listedObjects = 0;

  for (let prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex += 1) {
    const prefix = prefixes[prefixIndex];
    let pageOffset = 0;

    for (;;) {
      listCalls += 1;
      if (listCalls > MAX_STORAGE_LIST_CALLS) {
        return { ok: false, code: 'storage_listing_limit_exceeded' };
      }
      const { data: objects, error: listError } = await bucket.list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset: pageOffset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (listError || !Array.isArray(objects) || objects.length > STORAGE_PAGE_SIZE) {
        return { ok: false, code: 'storage_list_failed' };
      }

      for (const object of objects) {
        listedObjects += 1;
        if (
          listedObjects > MAX_STORAGE_OBJECTS ||
          !STORAGE_NAME_RE.test(object.name) ||
          object.name === '.' ||
          object.name === '..'
        ) {
          return { ok: false, code: 'storage_listing_invalid' };
        }
        const objectPath = `${prefix}/${object.name}`;
        if (objectPath.length > MAX_STORAGE_PATH_LENGTH || !objectPath.startsWith(`${userId}/`)) {
          return { ok: false, code: 'storage_listing_invalid' };
        }
        if (object.id === null || object.id === undefined) {
          if (!seenPrefixes.has(objectPath)) {
            seenPrefixes.add(objectPath);
            prefixes.push(objectPath);
          }
        } else if (typeof object.id === 'string' && object.id.length > 0) {
          objectPaths.add(objectPath);
        } else {
          return { ok: false, code: 'storage_listing_invalid' };
        }
      }

      if (objects.length < STORAGE_PAGE_SIZE) break;
      pageOffset += objects.length;
    }
  }

  const allPaths = [...objectPaths];
  for (let offset = 0; offset < allPaths.length; offset += STORAGE_PAGE_SIZE) {
    const paths = allPaths.slice(offset, offset + STORAGE_PAGE_SIZE);
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) return { ok: false, code: 'storage_remove_failed' };
  }

  listCalls += 1;
  if (listCalls > MAX_STORAGE_LIST_CALLS) {
    return { ok: false, code: 'storage_listing_limit_exceeded' };
  }
  const { data: remaining, error: finalListError } = await bucket.list(userId, {
    limit: 1,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (finalListError || !Array.isArray(remaining)) {
    return { ok: false, code: 'storage_final_check_failed' };
  }
  if (remaining.length !== 0) {
    return { ok: false, code: 'storage_not_empty' };
  }
  return { ok: true };
}

function safeLog(code: string): void {
  console.warn(`[delete-account] ${code}`);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  try {
    await readExactEmptyObject(req);
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.code }, error.status);
    return jsonResponse(req, { error: 'invalid_body' }, 400);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authHeader);
  if (!bearer || authHeader.length > 8192) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }
  const token = bearer[1];

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
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUser = authData.user;
    if (authError || !authUser) {
      return jsonResponse(req, { error: 'invalid_authorization' }, 401);
    }

    const claims = decodeVerifiedClaims(token);
    if (
      !claims ||
      claims.sub !== authUser.id ||
      claims.role !== 'authenticated' ||
      !SESSION_ID_RE.test(claims.session_id) ||
      !Number.isInteger(claims.iat) ||
      !Number.isSafeInteger(claims.iat) ||
      claims.iat < 0
    ) {
      return jsonResponse(req, { error: 'invalid_authorization' }, 401);
    }

    const issuedAt = new Date(claims.iat * 1000).toISOString();
    const { data: sessionIsCurrent, error: sessionError } = await admin.rpc(
      'verify_account_deletion_session',
      {
        p_user_id: authUser.id,
        p_session_id: claims.session_id,
        p_issued_at: issuedAt,
      },
    );
    if (sessionError) {
      safeLog('session_check_failed');
      return jsonResponse(req, { error: 'server_unavailable' }, 503);
    }
    if (sessionIsCurrent !== true) {
      return jsonResponse(req, { error: 'fresh_session_required' }, 401);
    }

    const storage = await eraseRawClippings(admin.storage.from('raw-clippings'), authUser.id);
    if (!storage.ok) {
      safeLog(storage.code);
      return jsonResponse(req, { error: 'deletion_precondition_failed' }, 503);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(authUser.id, false);
    if (deleteError) {
      safeLog('auth_delete_failed');
      return jsonResponse(req, { error: 'account_delete_failed' }, 500);
    }

    return jsonResponse(req, { deleted: true });
  } catch {
    safeLog('upstream_request_failed');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }
});
