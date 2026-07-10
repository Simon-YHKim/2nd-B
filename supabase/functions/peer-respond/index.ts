// T5 peer review — F2 informant responder (spec §6, schema 0064).
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

function validRatings(raw: unknown): Record<string, number> | null {
  if (raw == null || typeof raw !== 'object') return null;
  const out: Record<string, number> = {};
  for (const t of TRAITS) {
    const v = (raw as Record<string, unknown>)[t];
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
    // aggregate — a fail-open consent revocation.
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
    const isMinor = body.informantIsMinor === true;
    // Decision 5 (0064 CHECK): a minor informant needs recorded guardian consent.
    if (isMinor && body.guardianConsent !== true) {
      return jsonResponse(req, { error: 'guardian_required' }, 400);
    }

    const now = new Date().toISOString();
    const salt = Deno.env.get('PEER_HASH_SALT') ?? 'peer-v1';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const ua = req.headers.get('user-agent') ?? '';

    const { data: consent, error: cErr } = await admin
      .from('informant_consents')
      .insert({
        invitation_id: invite.id,
        subject_user_id: invite.user_id,
        consent_at: now,
        informant_is_minor: isMinor,
        guardian_consent_at: isMinor ? now : null,
        llm_processing_ack: true,
        overseas_transfer_ack: true,
        ip_hash: ip ? await sha256Hex(`${salt}:${ip}`) : null,
        ua_hash: ua ? await sha256Hex(`${salt}:${ua}`) : null,
      })
      .select('id')
      .single();
    if (cErr || !consent) return jsonResponse(req, { error: 'consent_failed' }, 500);

    const { error: oErr } = await admin.from('peer_observations').insert({
      invitation_id: invite.id,
      subject_user_id: invite.user_id,
      informant_consent_id: consent.id,
      ratings,
    });
    if (oErr) return jsonResponse(req, { error: 'observation_failed' }, 500);

    await admin.from('peer_invitations').update({ status: 'accepted', responded_at: now })
      .eq('id', invite.id);
    return jsonResponse(req, { ok: true, status: 'accepted' });
  }

  return jsonResponse(req, { error: 'bad_action' }, 400);
});
