// rewarded-ssv — AdMob rewarded-ad Server-Side Verification (SSV) callback (D2).
//
// Replaces the client dev-seam (which "completed" every watch even in prod, so
// credits could be self-granted with no real impression — audit M4/D2) with a
// server-to-server grant: AdMob calls THIS endpoint after a verified impression,
// we verify the ECDSA signature against Google's rotating verifier keys, and only
// then grant the reward (server-owned cap, mirrors 0075).
//
// DEPLOY / CONFIG (Simon): (1) create an SSV-enabled rewarded ad unit in AdMob and
// point its SSV callback at this function URL, passing the user id in custom_data;
// (2) deploy with verify_jwt=false (AdMob sends no JWT); (3) set REWARD_SSV_ENABLED=1
// to turn it on. It FAILS CLOSED until then. VALIDATION REQUIRED before enabling:
// test against a real AdMob callback (valid) AND a tampered one (must be rejected) —
// a wrong signature check either drops real rewards or re-opens the forge hole.
//
// SSV spec: https://developers.google.com/admob/android/ssv

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
// The monthly cap + clamp are enforced server-side in migration 0079
// (grant_reward_credits_ssv); this file only forwards one watch's worth.
const REWARD_PER_WATCH = 2; // must match src/lib/entitlements/tiers.ts REWARD_PER_WATCH

type VerifierKey = { keyId: number; pem?: string; base64: string };
let keyCache: { at: number; keys: VerifierKey[] } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function b64urlToBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// AdMob signs with ECDSA and encodes the signature as DER; Web Crypto verify wants
// the raw r||s (64 bytes for P-256). Convert DER (SEQUENCE{INTEGER r, INTEGER s}).
function derToRawEcdsa(der: Uint8Array): Uint8Array | null {
  try {
    let i = 0;
    if (der[i++] !== 0x30) return null; // SEQUENCE
    if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i++; // seq length
    const readInt = (): Uint8Array | null => {
      if (der[i++] !== 0x02) return null; // INTEGER
      let len = der[i++];
      let v = der.slice(i, i + len);
      i += len;
      while (v.length > 32 && v[0] === 0x00) v = v.slice(1); // strip sign pad
      if (v.length > 32) return null;
      const p = new Uint8Array(32);
      p.set(v, 32 - v.length);
      return p;
    };
    const r = readInt();
    const s = readInt();
    if (!r || !s) return null;
    const raw = new Uint8Array(64);
    raw.set(r, 0);
    raw.set(s, 32);
    return raw;
  } catch {
    return null;
  }
}

async function getVerifierKeys(force = false): Promise<VerifierKey[]> {
  // Cache 1h; the caller force-refetches on a key-id miss (Google rotates keys).
  if (!force && keyCache && Date.now() - keyCache.at < 3_600_000) return keyCache.keys;
  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`verifier keys ${res.status}`);
  const data = (await res.json()) as { keys: VerifierKey[] };
  keyCache = { at: Date.now(), keys: data.keys ?? [] };
  return keyCache.keys;
}

async function signatureValid(rawQuery: string): Promise<{ ok: boolean; params: URLSearchParams }> {
  // The signed content is everything before "&signature="; signature + key_id
  // are the last two params (per the SSV spec).
  const sigIdx = rawQuery.indexOf('&signature=');
  const params = new URLSearchParams(rawQuery);
  if (sigIdx < 0) return { ok: false, params };
  const signedContent = rawQuery.slice(0, sigIdx);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  if (!signature || !keyId) return { ok: false, params };

  let keys = await getVerifierKeys();
  let key = keys.find((k) => String(k.keyId) === keyId);
  if (!key) {
    // Key rotation: the new key_id may be absent from the 1h cache. Force one
    // refetch before rejecting (still fail closed if genuinely absent).
    keys = await getVerifierKeys(true);
    key = keys.find((k) => String(k.keyId) === keyId);
  }
  if (!key) return { ok: false, params };

  const raw = derToRawEcdsa(b64urlToBytes(signature));
  if (!raw) return { ok: false, params };

  const spki = b64urlToBytes(key.base64);
  const pubKey = await crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    raw,
    new TextEncoder().encode(signedContent),
  );
  return { ok, params };
}

Deno.serve(async (req: Request) => {
  // FAIL CLOSED until explicitly enabled + validated.
  if (Deno.env.get('REWARD_SSV_ENABLED') !== '1') return json({ error: 'disabled' }, 503);
  try {
    const url = new URL(req.url);
    const { ok, params } = await signatureValid(url.search.replace(/^\?/, ''));
    if (!ok) return json({ error: 'bad_signature' }, 403);

    // The user id is carried in custom_data (set when the client requests the
    // ad). Phase 4 (0091): custom_data may also carry the reward KIND as
    // "<userId>|chat" -- one watch tops up TODAY's chat allowance instead of
    // the monthly reasoning credits. Bare custom_data stays reasoning, so
    // already-fielded clients keep their exact behavior.
    const rawCustom = params.get('custom_data') ?? params.get('user_id');
    if (!rawCustom) return json({ error: 'no_user' }, 400);
    const [userId, kindRaw] = rawCustom.split('|');
    if (!userId) return json({ error: 'no_user' }, 400);
    const kind = kindRaw === 'chat' ? 'chat' : 'reasoning';
    // AdMob's unique impression id = the idempotency key (replay + retry defense).
    const txnId = params.get('transaction_id');
    if (!txnId) return json({ error: 'no_transaction_id' }, 400);

    // Grant via the atomic, idempotent, service-role-only RPC (0079): it dedups on
    // transaction_id and clamps to the server-owned monthly cap in one statement-set,
    // so a replayed or AdMob-retried callback grants at most once.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    if (kind === 'chat') {
      // 0091: +2 chat sends TODAY, monthly-capped; buckets derived inside the
      // RPC. Same dedup ledger, so one impression funds exactly one grant.
      const { data: bonus, error: cErr } = await admin.rpc('grant_chat_ad_bonus_ssv', {
        p_user_id: userId,
        p_txn_id: txnId,
      });
      if (cErr) {
        console.error('[rewarded-ssv] chat grant failed:', cErr.message);
        return json({ error: 'grant_failed' }, 500);
      }
      return json({ ok: true, chat_ad_bonus: bonus ?? null });
    }

    const kst = new Date(Date.now() + 9 * 3600_000);
    const monthBucket = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;

    const { data: credits, error: gErr } = await admin.rpc('grant_reward_credits_ssv', {
      p_user_id: userId,
      p_month: monthBucket,
      p_grant: REWARD_PER_WATCH,
      p_txn_id: txnId,
    });
    if (gErr) {
      console.error('[rewarded-ssv] grant failed:', gErr.message);
      return json({ error: 'grant_failed' }, 500);
    }
    return json({ ok: true, reward_credits: credits ?? null });
  } catch (e) {
    console.error('[rewarded-ssv] error:', String(e));
    return json({ error: 'server_error' }, 500);
  }
});
