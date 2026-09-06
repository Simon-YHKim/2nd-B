// T5 peer review -- F2 informant responder (spec §6, schema 0064).
// The informant has NO account: this function is the only write path for
// informant consent + observation rows (RLS gives authenticated users no
// policies on those tables). service_role inside; anon key + CORS at the edge.
//
// Actions (POST JSON):
//   { action: "load",     token }                       -> invitation state for the landing page
//   { action: "submit",   token, ratings, birthYear, informantIsMinor, guardianConsent,
//                         llmProcessingAck, overseasTransferAck }
//   { action: "withdraw", token }                       -> informant-side revocation
//
// Privacy: raw token never stored (SHA-256 compare); ip/ua stored as secret-keyed
// HMACs only; no informant name/email exists anywhere in the flow.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PEER_RESPONSE_BODY_LIMIT_BYTES = 4 * 1024;
const PEER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type PeerAction = 'load' | 'submit' | 'withdraw';
type BodyReadErrorCode = 'bad_json' | 'request_body_too_large';

class BodyReadError extends Error {
  constructor(readonly code: BodyReadErrorCode) {
    super(code);
    this.name = 'BodyReadError';
  }
}

const COMMON_BODY_FIELDS = new Set(['action', 'token']);
const SUBMIT_BODY_FIELDS = new Set([
  ...COMMON_BODY_FIELDS,
  'ratings',
  'birthYear',
  'informantIsMinor',
  'guardianConsent',
  'llmProcessingAck',
  'overseasTransferAck',
]);

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
      'access-control-allow-headers': 'authorization, content-type, apikey',
      'access-control-allow-methods': 'POST, OPTIONS',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      vary: 'Origin',
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function versionedHmacSha256Hex(pepper: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v1:${hex}`;
}

async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declaredLength = request.headers.get('content-length')?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    throw new BodyReadError('request_body_too_large');
  }
  if (!request.body) throw new BodyReadError('bad_json');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyReadError('request_body_too_large');
      }
      chunks.push(value.slice());
    }
  } catch (error) {
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError('bad_json');
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BodyReadError('bad_json');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError('bad_json');
  }
}

function hasUnexpectedField(body: Record<string, unknown>, action: PeerAction): boolean {
  const allowed = action === 'submit' ? SUBMIT_BODY_FIELDS : COMMON_BODY_FIELDS;
  return Object.keys(body).some((field) => !allowed.has(field));
}

const TRAITS = ['extraversion', 'conscientiousness', 'agreeableness'] as const;
// 2026-08-25: Big Five 완성(개방성·신경성). OPTIONAL 인 이유 — 구버전 앱은 3키만
// 보낸다. 필수로 만들면 구앱 응답이 전부 400 으로 죽는다. 반대로 이 배포 전의
// 구서버는 새 2키를 "조용히 폐기"했으므로(거부가 아니라 무음 소실), 이 함수
// 재배포가 클라이언트 릴리스보다 반드시 먼저다.
const OPTIONAL_TRAITS = ['openness', 'neuroticism'] as const;

/** C10 floor, mirroring the sign-up gate. Keep in sync with src/app/peer/[token].tsx. */
const MIN_INFORMANT_AGE = 14;
/** C10 adult boundary. Below this the informant is a minor and needs a guardian. */
const ADULT_AGE = 18;

function validRatings(raw: unknown): Record<string, number> | null {
  if (raw == null || typeof raw !== 'object') return null;
  const allowed = new Set<string>([...TRAITS, ...OPTIONAL_TRAITS]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) return null;
  const out: Record<string, number> = {};
  for (const t of TRAITS) {
    const v = (raw as Record<string, unknown>)[t];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return null;
    out[t] = v;
  }
  for (const t of OPTIONAL_TRAITS) {
    const v = (raw as Record<string, unknown>)[t];
    if (v === undefined) continue; // 구앱: 안 보내면 그대로 3키 응답
    // 보냈다면 형식은 지켜야 한다 — 불량 값을 조용히 버리면 응답자는 답했다고
    // 믿는데 데이터가 없다(무음 소실의 재발). 거부해서 드러낸다.
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return null;
    out[t] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(req, { ok: true });
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, PEER_RESPONSE_BODY_LIMIT_BYTES);
  } catch (error) {
    if (error instanceof BodyReadError && error.code === 'request_body_too_large') {
      return jsonResponse(req, { error: 'request_body_too_large' }, 413);
    }
    return jsonResponse(req, { error: 'bad_json' }, 400);
  }
  const action = body.action;
  if (action !== 'load' && action !== 'submit' && action !== 'withdraw') {
    return jsonResponse(req, { error: 'bad_action' }, 400);
  }
  if (hasUnexpectedField(body, action)) {
    return jsonResponse(req, { error: 'unexpected_field' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!PEER_TOKEN_PATTERN.test(token)) {
    return jsonResponse(req, { error: 'bad_token' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured' }, 500);
  }
  const admin = createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  const tokenHash = await sha256Hex(token);
  if (action === 'load') {
    const { data: invite, error: invErr } = await admin
      .from('peer_invitations')
      .select('status, expires_at')
      .eq('invite_token_hash', tokenHash)
      .maybeSingle();
    if (invErr) return jsonResponse(req, { error: 'lookup_failed' }, 500);
    if (!invite) return jsonResponse(req, { error: 'not_found' }, 404);
    const expired = new Date(invite.expires_at).getTime() < Date.now();
    return jsonResponse(req, {
      status: expired && invite.status === 'pending' ? 'expired' : invite.status,
    });
  }

  const rpcArgs: Record<string, unknown> = {
    p_invite_token_hash: tokenHash,
    p_action: action,
  };
  if (action === 'submit') {
    const ratings = validRatings(body.ratings);
    if (!ratings) return jsonResponse(req, { error: 'bad_ratings' }, 400);

    // Decision 7 (0064 CHECK): synthesis crosses the border, both acks are hard requirements.
    if (body.llmProcessingAck !== true || body.overseasTransferAck !== true) {
      return jsonResponse(req, { error: 'acks_required' }, 400);
    }
    // C10 floor. This endpoint is the ONLY server-side gate an informant passes:
    // there is no account here, so enforce_user_age_tier() (which rejects under-14
    // at sign-up) never sees them. Without this check the product accepts, as data
    // subjects, exactly the age band its privacy policy says it does not accept.
    // Year granularity is deliberate — the coarsest signal that answers the
    // question, so we never hold an informant's full birth date.
    const nowYear = new Date().getUTCFullYear();
    if (typeof body.birthYear !== 'number' || !Number.isInteger(body.birthYear)) {
      return jsonResponse(req, { error: 'birth_year_required' }, 400);
    }
    const birthYear = body.birthYear;
    if (birthYear < 1900 || birthYear > nowYear) {
      return jsonResponse(req, { error: 'birth_year_required' }, 400);
    }
    // Year-only subtraction can be one greater than the current age before the
    // birthday. Reject the ambiguous boundary instead of admitting a 13-year-old.
    const yearAge = nowYear - birthYear;
    if (yearAge <= MIN_INFORMANT_AGE) {
      return jsonResponse(req, { error: 'too_young' }, 403);
    }

    // A false client checkbox cannot override the conservative year boundary.
    // It may only add protection for an older respondent.
    const isMinor = yearAge <= ADULT_AGE || body.informantIsMinor === true;
    // Decision 5 (0064 CHECK): a minor informant needs recorded guardian consent.
    if (isMinor && body.guardianConsent !== true) {
      return jsonResponse(req, { error: 'guardian_required' }, 400);
    }

    const pepper = Deno.env.get('PEER_HASH_PEPPER_V1');
    if (!pepper || pepper.length < 32) {
      return jsonResponse(req, { error: 'server_misconfigured' }, 500);
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const ua = req.headers.get('user-agent') ?? '';

    const ipHash = ip ? await versionedHmacSha256Hex(pepper, `v1:ip:${ip}`) : null;
    const uaHash = ua ? await versionedHmacSha256Hex(pepper, `v1:ua:${ua}`) : null;

    Object.assign(rpcArgs, {
      p_ratings: ratings,
      p_informant_is_minor: isMinor,
      p_guardian_consent: body.guardianConsent === true,
      p_llm_processing_ack: true,
      p_overseas_transfer_ack: true,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
    });
  }

  // Migration 0158 owns invitation locking, identity binding, child writes,
  // idempotency, and the terminal withdrawal transition.
  const { data, error } = await admin.rpc('finalize_peer_response', rpcArgs);
  if (error) {
    console.warn('[peer-respond] atomic response unavailable');
    return jsonResponse(req, { error: 'atomic_response_unavailable' }, 503);
  }

  const result = data && typeof data === 'object'
    ? data as { ok?: unknown; error?: unknown; status?: unknown }
    : null;
  if (result?.ok === true && action === 'withdraw' && result.status === 'withdrawn') {
    return jsonResponse(req, { ok: true, status: 'withdrawn' });
  }
  if (result?.ok === true && action === 'submit' && result.status === 'accepted') {
    return jsonResponse(req, { ok: true, status: 'accepted' });
  }
  if (result?.error === 'not_found') {
    return jsonResponse(req, { error: 'not_found' }, 404);
  }
  if (result?.error === 'expired') {
    return jsonResponse(req, { error: 'expired' }, 410);
  }
  if (result?.error === 'already_responded') {
    return jsonResponse(req, {
      error: 'already_responded',
      status: typeof result.status === 'string' ? result.status : undefined,
    }, 409);
  }
  if (result?.error === 'peer_response_invalid_payload' || result?.error === 'invalid_action') {
    return jsonResponse(req, { error: result.error }, 400);
  }
  return jsonResponse(req, { error: 'atomic_response_unavailable' }, 503);
});
