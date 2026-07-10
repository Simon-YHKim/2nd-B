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
const REWARD_MONTHLY_CAP = 20; // must match src/lib/entitlements/tiers.ts
const REWARD_PER_WATCH = 2; //     REWARD_PER_WATCH

type VerifierKey = { keyId: number; pem?: string; base64: string };
let keyCache: { at: number; keys: VerifierKey[] } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 3) % 4);
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

async function getVerifierKeys(): Promise<VerifierKey[]> {
  // Cache 1h; refetch on a key-id miss handled by the caller.
  if (keyCache && Date.now() - keyCache.at < 3_600_000) return keyCache.keys;
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

  const keys = await getVerifierKeys();
  const key = keys.find((k) => String(k.keyId) === keyId);
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

    // The user id is carried in custom_data (set when the client requests the ad).
    const userId = params.get('custom_data') ?? params.get('user_id');
    if (!userId) return json({ error: 'no_user' }, 400);

    // Grant server-side, capped. Trusted service-role write (the caller is a
    // verified AdMob callback, not the user), mirroring 0075's clamp. GREATEST
    // avoids clawing back an over-cap balance.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600_000);
    const monthBucket = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
    const grant = Math.min(REWARD_PER_WATCH, REWARD_MONTHLY_CAP);

    const { data: row } = await admin
      .from('usage_counters')
      .select('reward_credits')
      .eq('user_id', userId)
      .eq('month_bucket', monthBucket)
      .maybeSingle();
    const current = Number(row?.reward_credits) || 0;
    const next = Math.max(current, Math.min(current + grant, REWARD_MONTHLY_CAP));
    const { error: wErr } = await admin
      .from('usage_counters')
      .upsert(
        { user_id: userId, month_bucket: monthBucket, reward_credits: next, updated_at: now.toISOString() },
        { onConflict: 'user_id,month_bucket' },
      );
    if (wErr) {
      console.error('[rewarded-ssv] grant failed:', wErr.message);
      return json({ error: 'grant_failed' }, 500);
    }
    return json({ ok: true, reward_credits: next });
  } catch (e) {
    console.error('[rewarded-ssv] error:', String(e));
    return json({ error: 'server_error' }, 500);
  }
});
