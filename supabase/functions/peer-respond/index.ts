// T5 peer review -- F2 informant responder (spec §6, schema 0064).
// The informant has NO account: this function is the only write path for
// informant consent + observation rows (RLS gives authenticated users no
// policies on those tables). service_role inside; anon key + CORS at the edge.
//
// Actions (POST JSON):
//   { action: "load",     token }                       -> invitation state for the landing page
//   { action: "submit",   token, ratings, informantIsMinor, guardianConsent,
//                         llmProcessingAck, overseasTransferAck }
//   { action: "withdraw", token }                       -> informant-side revocation
//
// Privacy: raw token never stored (SHA-256 compare); ip/ua stored as salted
// hashes only; no informant name/email exists anywhere in the flow.
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
      'access-control-allow-headers': 'authorization, content-type, apikey',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
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
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'bad_json' }, 400);
  }
  const action = body.action;
  const token = typeof body.token === 'string' ? body.token : '';
  if (!token || token.length < 20 || token.length > 128) {
    return jsonResponse(req, { error: 'bad_token' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const tokenHash = await sha256Hex(token);
  const { data: invite, error: invErr } = await admin
    .from('peer_invitations')
    .select('id, user_id, status, expires_at')
    .eq('invite_token_hash', tokenHash)
    .maybeSingle();
  if (invErr) return jsonResponse(req, { error: 'lookup_failed' }, 500);
  if (!invite) return jsonResponse(req, { error: 'not_found' }, 404);

  const expired = new Date(invite.expires_at).getTime() < Date.now();

  if (action === 'load') {
    return jsonResponse(req, {
      status: expired && invite.status === 'pending' ? 'expired' : invite.status,
    });
  }

  if (action === 'withdraw') {
    // Informant-side revocation (spec §3.4): mark consent + observation
    // withdrawn; the aggregate drops them immediately (0064 filters on
    // withdrawn_at IS NULL). Check every write: a silent failure here would
    // report "withdrawn" while the informant's ratings stay live in the
    // aggregate -- a fail-open consent revocation.
    const now = new Date().toISOString();
    const { error: icErr } = await admin.from('informant_consents').update({ withdrawn_at: now })
      .eq('invitation_id', invite.id).is('withdrawn_at', null);
    const { error: poErr } = await admin.from('peer_observations').update({ withdrawn_at: now })
      .eq('invitation_id', invite.id).is('withdrawn_at', null);
    const { error: piErr } = await admin.from('peer_invitations').update({ status: 'withdrawn', responded_at: now })
      .eq('id', invite.id);
    if (icErr || poErr || piErr) {
      console.warn('[peer-respond] withdraw failed:', icErr?.message, poErr?.message, piErr?.message);
      return jsonResponse(req, { error: 'withdraw_failed' }, 500);
    }
    return jsonResponse(req, { ok: true, status: 'withdrawn' });
  }

  if (action === 'submit') {
    if (invite.status !== 'pending') return jsonResponse(req, { error: 'already_responded', status: invite.status }, 409);
    if (expired) return jsonResponse(req, { error: 'expired' }, 410);

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
    const birthYear = Number(body.birthYear);
    const nowYear = new Date().getUTCFullYear();
    const yearLooksReal =
      Number.isInteger(birthYear) && birthYear >= 1900 && birthYear <= nowYear;
    if (!yearLooksReal) {
      return jsonResponse(req, { error: 'birth_year_required' }, 400);
    }
    // Compare on the year alone, which reads one year YOUNGER than the true age
    // until the birthday passes. That direction is the safe one: it can only
    // exclude a just-turned-14, never admit a 13-year-old.
    if (nowYear - birthYear < MIN_INFORMANT_AGE) {
      return jsonResponse(req, { error: 'too_young' }, 403);
    }

    // Minority is DERIVED, not asserted. The line above already trusted birthYear
    // enough to reject an under-14 informant; reading the same number for the adult
    // boundary costs one subtraction and closes the hole where an informant simply
    // sends informantIsMinor:false and walks past the guardian check. The screen is
    // not the gate here — there is no account, so a request that never touches
    // src/app/peer/[token].tsx is the normal case, not the attack case.
    //
    // Year granularity, same as the floor above, reads one year YOUNGER than the
    // true age until the birthday passes. For the floor that could only exclude a
    // just-turned-14. Here it can only hold a just-turned-18 as a minor for one more
    // birthday, asking for a guardian where none is strictly required. Both errors
    // land on the cautious side, which is the direction this endpoint must fail.
    //
    // The client flag is still honoured, but only where it ADDS protection: it can
    // declare a minority the year did not imply, never remove one that it did.
    const isMinor = nowYear - birthYear < ADULT_AGE || body.informantIsMinor === true;
    // Decision 5 (0064 CHECK): a minor informant needs recorded guardian consent.
    if (isMinor && body.guardianConsent !== true) {
      return jsonResponse(req, { error: 'guardian_required' }, 400);
    }

    const now = new Date().toISOString();
    const salt = Deno.env.get('PEER_HASH_SALT') ?? 'peer-v1';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const ua = req.headers.get('user-agent') ?? '';

    const ipHash = ip ? await sha256Hex(`${salt}:${ip}`) : null;
    const uaHash = ua ? await sha256Hex(`${salt}:${ua}`) : null;

    // The status read at line ~81 and these writes are not one atomic step, so
    // two submissions of the same token can both pass the pending check above.
    // Migration 0110 put UNIQUE(invitation_id) on BOTH informant_consents and
    // peer_observations; upserting with onConflict + ignoreDuplicates compiles to
    // INSERT ... ON CONFLICT (invitation_id) DO NOTHING, which is the atomic race
    // gate: the first writer inserts, any concurrent OR retried writer no-ops
    // instead of double-counting the informant in the T5 aggregate. It is also
    // idempotent across a partial prior attempt (consent written, observation
    // not): the retry no-ops the consent and still completes the observation,
    // rather than being falsely told "already responded" with its ratings lost.
    const { error: cErr } = await admin
      .from('informant_consents')
      .upsert(
        {
          invitation_id: invite.id,
          subject_user_id: invite.user_id,
          consent_at: now,
          informant_is_minor: isMinor,
          guardian_consent_at: isMinor ? now : null,
          llm_processing_ack: true,
          overseas_transfer_ack: true,
          ip_hash: ipHash,
          ua_hash: uaHash,
        },
        { onConflict: 'invitation_id', ignoreDuplicates: true },
      );
    if (cErr) return jsonResponse(req, { error: 'consent_failed' }, 500);

    // Resolve the canonical consent id for this invitation -- the row this
    // request just inserted, or the one a prior/concurrent request inserted.
    const { data: consent, error: cSelErr } = await admin
      .from('informant_consents')
      .select('id')
      .eq('invitation_id', invite.id)
      .maybeSingle();
    if (cSelErr || !consent) return jsonResponse(req, { error: 'consent_failed' }, 500);

    const { error: oErr } = await admin
      .from('peer_observations')
      .upsert(
        {
          invitation_id: invite.id,
          subject_user_id: invite.user_id,
          informant_consent_id: consent.id,
          ratings,
        },
        { onConflict: 'invitation_id', ignoreDuplicates: true },
      );
    if (oErr) return jsonResponse(req, { error: 'observation_failed' }, 500);

    await admin.from('peer_invitations').update({ status: 'accepted', responded_at: now })
      .eq('id', invite.id);
    return jsonResponse(req, { ok: true, status: 'accepted' });
  }

  return jsonResponse(req, { error: 'bad_action' }, 400);
});
