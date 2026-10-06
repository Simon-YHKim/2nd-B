// Terminal account erasure. The target is always the freshly authenticated
// caller; request data can neither select a user nor weaken deletion checks.
//
// Two steps since 0217 (docs/design/deletion-receipt-server-261006.md 3.3):
//   begin   {op:"begin", op_id}            -> the server records the request
//           before anything is destroyed and returns a signed op token.
//   execute {op:"execute", op_id, op_token} -> the op moves to executing, and
//           only then: tombstone (0192) -> Storage -> Auth deletion. The profile
//           row's BEFORE DELETE trigger turns the op into the receipt.
// The old app's body `{}` still works and gets a server-made op row with no
// token, so the Q6 fence release always sees every deletion in flight.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import {
  MIN_PEPPER_LENGTH,
  OP_ID_RE,
  OP_TOKEN_PEPPER_ENV,
  issueOpToken,
  opTokenHashHex,
  parseDeleteAccountBody,
  publicReceipt,
  sweepsForRecord,
  type DeleteAccountRequest,
} from '../_shared/account-deletion-op.ts';
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

/** Read the whole body (at most 1 KiB, 2 s) as strict UTF-8 text. */
async function readBoundedBody(req: Request): Promise<string> {
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
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RequestError('invalid_body', 400);
  }
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

/** PostgREST answers a function the schema cache does not hold with PGRST202. */
function rpcMissing(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

function rpcResult(data: unknown): Record<string, unknown> | null {
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  let request: DeleteAccountRequest;
  try {
    const rawBody = await readBoundedBody(req);
    const parsed = parseDeleteAccountBody(rawBody);
    if (parsed === null) throw new RequestError('invalid_body', 400);
    request = parsed;
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

    // ---- begin: remember the request; nothing is destroyed on this path. ----
    if (request.kind === 'begin') {
      const pepper = Deno.env.get(OP_TOKEN_PEPPER_ENV) ?? '';
      if (pepper.length < MIN_PEPPER_LENGTH) {
        safeLog('op_token_pepper_missing');
        return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
      const issuedMs = Date.now();
      const opToken = await issueOpToken(pepper, request.opId, authUser.id, issuedMs);
      const { data: beginData, error: beginError } = await admin.rpc('begin_account_deletion_op', {
        p_op_id: request.opId,
        p_user_id: authUser.id,
        p_token_issued_ms: issuedMs,
        p_token_hash: await opTokenHashHex(opToken),
      });
      if (beginError) {
        // 0217 is not applied here: tell the app to use the old flow (`{}`).
        if (rpcMissing(beginError)) return jsonResponse(req, { error: 'op_unsupported' }, 400);
        safeLog('op_begin_failed');
        return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
      const begun = rpcResult(beginData);
      switch (begun?.result) {
        case 'accepted':
          return jsonResponse(req, { op_id: request.opId, op_token: opToken });
        case 'replayed': {
          // Same op, same owner, still accepted: the stored issue time gives back the same token.
          const storedMs = begun.token_issued_ms;
          if (typeof storedMs !== 'number' || !Number.isSafeInteger(storedMs)) {
            safeLog('op_begin_shape_invalid');
            return jsonResponse(req, { error: 'server_unavailable' }, 503);
          }
          return jsonResponse(req, {
            op_id: request.opId,
            op_token: await issueOpToken(pepper, request.opId, authUser.id, storedMs),
          });
        }
        case 'op_taken':
          return jsonResponse(req, { error: 'op_id_taken' }, 409);
        case 'account_gone':
          return jsonResponse(req, { error: 'account_profile_missing' }, 409);
        case 'too_many':
          return jsonResponse(req, { error: 'too_many_requests' }, 429);
        case 'invalid':
          return jsonResponse(req, { error: 'invalid_body' }, 400);
        default:
          safeLog('op_begin_shape_invalid');
          return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
    }

    // ---- execute (or the old `{}`): the op must be executing before anything is destroyed. ----
    let opId: string | null = null;
    if (request.kind === 'execute') {
      const { data: startData, error: startError } = await admin.rpc('start_account_deletion_op', {
        p_op_id: request.opId,
        p_user_id: authUser.id,
        p_token_hash: await opTokenHashHex(request.opToken),
      });
      if (startError) {
        safeLog('op_start_failed');
        return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
      const started = rpcResult(startData);
      switch (started?.result) {
        case 'started':
        case 'continued':
          opId = request.opId;
          break;
        case 'completed': {
          // The account is already gone and this op is its receipt: nothing to destroy.
          const receipt = publicReceipt({ ...started, op_id: request.opId, status: 'completed' }, request.opId);
          return jsonResponse(req, {
            deleted: true,
            replayed: true,
            op_id: request.opId,
            ...(receipt ? receipt.sweeps : {}),
          });
        }
        case 'failed':
        case 'abandoned':
          return jsonResponse(req, { error: 'op_closed', op_status: started.result }, 409);
        case 'rejected':
          return jsonResponse(req, { error: 'op_rejected' }, 403);
        default:
          safeLog('op_start_shape_invalid');
          return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
    } else {
      const { data: legacyData, error: legacyError } = await admin.rpc('start_legacy_account_deletion_op', {
        p_user_id: authUser.id,
      });
      if (legacyError && !rpcMissing(legacyError)) {
        safeLog('op_legacy_start_failed');
        return jsonResponse(req, { error: 'server_unavailable' }, 503);
      }
      const legacy = rpcResult(legacyData);
      if (legacy?.result === 'account_gone') {
        return jsonResponse(req, { error: 'fresh_session_required' }, 401);
      }
      if (typeof legacy?.op_id === 'string' && OP_ID_RE.test(legacy.op_id)) opId = legacy.op_id;
      // 0217 missing: the old flow without an op row, exactly as before.
    }

    // Auth deletion has not happened yet on every path that calls this.
    const failOp = async (code: string): Promise<string | null> => {
      if (opId === null) return null;
      try {
        const { data, error } = await admin.rpc('fail_account_deletion_op', {
          p_op_id: opId,
          p_user_id: authUser.id,
          p_code: code,
        });
        if (error) {
          safeLog('op_fail_record_failed');
          return null;
        }
        const status = rpcResult(data)?.status;
        return typeof status === 'string' ? status : null;
      } catch {
        safeLog('op_fail_record_failed');
        return null;
      }
    };

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
      // The op stays executing: a retry with a refreshed session continues it.
      return jsonResponse(req, { error: 'fresh_session_required' }, 401);
    }

    const storageBucket = admin.storage.from('raw-clippings');
    const preDeletionStorage = await eraseRawClippings(storageBucket, authUser.id);
    if (!preDeletionStorage.ok) {
      safeLog(preDeletionStorage.code);
      // Progress (409) keeps the op executing for the retry; a precondition
      // failure ends it, and Q6 may then release its fence.
      const opStatus = preDeletionStorage.code === 'storage_cleanup_in_progress'
        ? null
        : await failOp('storage_precondition');
      return jsonResponse(
        req,
        {
          error: preDeletionStorage.code === 'storage_cleanup_in_progress'
            ? 'deletion_cleanup_in_progress'
            : 'deletion_precondition_failed',
          deletion_fenced: true,
          raw_clippings_erased: false,
          raw_clippings_removed: preDeletionStorage.removed,
          ...(opId === null ? {} : { op_id: opId }),
          ...(opStatus === null ? {} : { op_status: opStatus }),
        },
        preDeletionStorage.code === 'storage_cleanup_in_progress' ? 409 : 503,
      );
    }

    // record-photos (0209) holds the photos a 글 note carries: the same flat,
    // bounded, fenced sweep, and it too must be observed empty before Auth goes.
    // A missing bucket fails closed here, which is why 0209 is applied first.
    const photoBucket = admin.storage.from('record-photos');
    const preDeletionPhotos = await eraseRawClippings(photoBucket, authUser.id);
    if (!preDeletionPhotos.ok) {
      safeLog(`record_photos_${preDeletionPhotos.code}`);
      const opStatus = preDeletionPhotos.code === 'storage_cleanup_in_progress'
        ? null
        : await failOp('record_photos_precondition');
      return jsonResponse(
        req,
        {
          error: preDeletionPhotos.code === 'storage_cleanup_in_progress'
            ? 'deletion_cleanup_in_progress'
            : 'deletion_precondition_failed',
          deletion_fenced: true,
          raw_clippings_erased: true,
          raw_clippings_removed: preDeletionStorage.removed,
          record_photos_erased: false,
          record_photos_removed: preDeletionPhotos.removed,
          ...(opId === null ? {} : { op_id: opId }),
          ...(opStatus === null ? {} : { op_status: opStatus }),
        },
        preDeletionPhotos.code === 'storage_cleanup_in_progress' ? 409 : 503,
      );
    }

    const authDeletion = await deleteAuthUserWithReconciliation(admin.auth.admin, authUser.id);
    if (!authDeletion.ok) {
      safeLog(authDeletion.code);
      if (authDeletion.code === 'auth_delete_failed') {
        // fail_account_deletion_op only marks the op failed while the profile
        // row still exists; if Auth did delete, the trigger already completed it.
        const opStatus = await failOp('auth_delete_failed');
        return jsonResponse(
          req,
          {
            error: 'account_delete_failed',
            ...(opId === null ? {} : { op_id: opId }),
            ...(opStatus === null ? {} : { op_status: opStatus }),
          },
          500,
        );
      }
      // Unknown outcome: the op stays executing and the device asks for its receipt.
      return jsonResponse(req, { error: 'server_unavailable', ...(opId === null ? {} : { op_id: opId }) }, 503);
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

    const observed = {
      profile_erased: profileErased,
      deletion_fenced: true,
      // begin_account_deletion commits the durable write fence before this
      // sweep. Its final empty listV2 page therefore proves no later upload can
      // recreate the owner's raw objects while Auth deletion is in flight.
      raw_clippings_erased: true,
      raw_clippings_empty_at_check: true,
      record_photos_erased: true,
      record_photos_empty_at_check: true,
    };

    // The receipt already exists (the profile row's trigger completed the op).
    // Its sweep flags are a separate, best-effort write: losing it never turns
    // a finished erasure into a failure, and the receipt then says "not reported".
    if (opId !== null) {
      try {
        const { error: sweepError } = await admin.rpc('record_account_deletion_op_sweeps', {
          p_op_id: opId,
          p_sweeps: sweepsForRecord(observed),
        });
        if (sweepError) safeLog('op_sweeps_record_failed');
      } catch {
        safeLog('op_sweeps_record_failed');
      }
    }

    return jsonResponse(req, {
      deleted: true,
      ...(opId === null ? {} : { op_id: opId }),
      ...observed,
      raw_clippings_removed: preDeletionStorage.removed,
      record_photos_removed: preDeletionPhotos.removed,
    });
  } catch {
    safeLog('upstream_request_failed');
    return jsonResponse(req, { error: 'server_unavailable' }, 503);
  }
});
