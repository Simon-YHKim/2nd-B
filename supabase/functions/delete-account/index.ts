// Terminal account erasure. The target is always the freshly authenticated
// caller; request data can neither select a user nor weaken deletion checks.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { deleteAuthUserWithReconciliation } from './delete-auth-user.ts';
import { eraseRawClippings } from './storage-erasure.ts';

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);
const MAX_BODY_BYTES = 1024;
const BODY_TIMEOUT_MS = 2_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (authHeader.length > 8192) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }
  const bearer = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authHeader);
  if (!bearer) {
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

    const issuedAtMs = claims.iat * 1000;
    if (!Number.isSafeInteger(issuedAtMs)) {
      return jsonResponse(req, { error: 'invalid_authorization' }, 401);
    }
    const issuedAt = new Date(issuedAtMs).toISOString();
    const { data: deletionFenced, error: sessionError } = await admin.rpc(
      'begin_account_deletion',
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
    if (deletionFenced !== true) {
      return jsonResponse(req, { error: 'fresh_session_required' }, 401);
    }

    const storageBucket = admin.storage.from('raw-clippings');
    const preDeletionStorage = await eraseRawClippings(storageBucket, authUser.id);
    if (!preDeletionStorage.ok) {
      safeLog(preDeletionStorage.code);
      return jsonResponse(
        req,
        {
          error: preDeletionStorage.code === 'storage_cleanup_in_progress'
            ? 'deletion_cleanup_in_progress'
            : 'deletion_precondition_failed',
          deletion_fenced: true,
          raw_clippings_erased: false,
          raw_clippings_removed: preDeletionStorage.removed,
        },
        preDeletionStorage.code === 'storage_cleanup_in_progress' ? 409 : 503,
      );
    }

    const authDeletion = await deleteAuthUserWithReconciliation(admin.auth.admin, authUser.id);
    if (!authDeletion.ok) {
      safeLog(authDeletion.code);
      return jsonResponse(
        req,
        { error: authDeletion.code === 'auth_delete_failed' ? 'account_delete_failed' : 'server_unavailable' },
        authDeletion.code === 'auth_delete_failed' ? 500 : 503,
      );
    }

    let profileErased: boolean | null = null;
    try {
      const { data: profileRows, error: profileError } = await admin
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .limit(1);
      if (profileError || !Array.isArray(profileRows)) {
        safeLog('profile_check_failed');
      } else {
        profileErased = profileRows.length === 0;
      }
    } catch {
      safeLog('profile_check_failed');
    }

    return jsonResponse(req, {
      deleted: true,
      profile_erased: profileErased,
      deletion_fenced: true,
      // begin_account_deletion commits the durable write fence before this
      // sweep. Its final empty listV2 page therefore proves no later upload can
      // recreate the owner's raw objects while Auth deletion is in flight.
      raw_clippings_erased: true,
      raw_clippings_empty_at_check: true,
      raw_clippings_removed: preDeletionStorage.removed,
    });
  } catch {
    safeLog('upstream_request_failed');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }
});
