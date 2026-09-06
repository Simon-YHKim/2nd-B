// AdMob rewarded-ad Server-Side Verification. This route deliberately runs
// with verify_jwt=false because Google sends no Supabase JWT. A Google ECDSA
// signature is the only callback authority; authenticated POST can issue a
// short-lived ticket but can never grant a reward.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  MAX_SSV_QUERY_BYTES,
  decodeBase64,
  decodeBase64Url,
  derToRawEcdsa,
  parseRewardCallback,
  parseSignedSsvQuery,
  parseVerifierKeyDocument,
  readRewardContractConfig,
  type RewardKind,
  type VerifierKey,
} from './reward-contract.ts';
import { VerifierKeyCache, readBoundedJsonResponse } from './verifier-key-cache.ts';

const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const MAX_VERIFIER_KEY_BYTES = 65_536;
const MAX_ISSUE_BODY_BYTES = 128;
const REWARD_PER_WATCH = 2;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

const verifierKeyCache = new VerifierKeyCache<VerifierKey>(
  async (signal) => {
    const response = await fetch(VERIFIER_KEYS_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new Error('verifier-key request failed');
    const keys = parseVerifierKeyDocument(
      await readBoundedJsonResponse(response, MAX_VERIFIER_KEY_BYTES),
    );
    if (!keys) throw new Error('verifier-key document invalid');
    return keys;
  },
  {
    timeoutMs: 5_000,
    ttlMs: 3_600_000,
    maxStaleMs: 86_400_000,
    refreshCooldownMs: 60_000,
  },
);

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 && token.length <= 8_192 && !/\s/.test(token) ? token : null;
}

async function readIssueKind(req: Request): Promise<RewardKind | null> {
  const mediaType = (req.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json' || !req.body) return null;
  const declared = req.headers.get('content-length')?.trim();
  if (declared && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_ISSUE_BODY_BYTES)) {
    return null;
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ISSUE_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value.slice());
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    const kind = (body as { kind?: unknown }).kind;
    return keys.length === 1 && keys[0] === 'kind' && (kind === 'reasoning' || kind === 'chat')
      ? kind : null;
  } catch {
    return null;
  }
}

function randomTicketToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

type SignatureResult =
  | { status: 'valid'; params: URLSearchParams }
  | { status: 'invalid' }
  | { status: 'unavailable' };

async function signatureValid(rawQuery: string): Promise<SignatureResult> {
  const parsed = parseSignedSsvQuery(rawQuery);
  if (!parsed) return { status: 'invalid' };

  let keys: VerifierKey[];
  try {
    keys = await verifierKeyCache.get();
  } catch {
    return { status: 'unavailable' };
  }
  let key = keys.find((candidate) => String(candidate.keyId) === parsed.keyId);
  if (!key) {
    try {
      // A failed key-miss refresh is retriable infrastructure failure, not a
      // forged callback. Known stale keys remain usable for bounded outages.
      keys = await verifierKeyCache.get(true, false);
    } catch {
      return { status: 'unavailable' };
    }
    key = keys.find((candidate) => String(candidate.keyId) === parsed.keyId);
  }
  if (!key) return { status: 'invalid' };

  const der = decodeBase64Url(parsed.signature);
  const rawSignature = der ? derToRawEcdsa(der) : null;
  const spki = decodeBase64(key.base64);
  if (!rawSignature) return { status: 'invalid' };
  if (!spki || spki.length > 512) return { status: 'unavailable' };

  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      'spki', ownedArrayBuffer(spki), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
  } catch {
    return { status: 'unavailable' };
  }
  try {
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      ownedArrayBuffer(rawSignature),
      new TextEncoder().encode(parsed.signedContent),
    );
    return valid ? { status: 'valid', params: parsed.params } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}

Deno.serve(async (req: Request) => {
  if (Deno.env.get('REWARD_SSV_ENABLED') !== '1') return json({ error: 'disabled' }, 503);
  try {
    const contract = readRewardContractConfig((name) => Deno.env.get(name));
    if (!contract) return json({ error: 'misconfigured_reward_contract' }, 503);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'misconfigured_database' }, 503);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (req.method === 'POST') {
      const accessToken = bearerToken(req);
      if (!accessToken) return json({ error: 'missing_authorization' }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
      const user = authData?.user;
      if (authError || !user) return json({ error: 'invalid_authorization' }, 401);
      const kind = await readIssueKind(req);
      if (!kind) return json({ error: 'invalid_reward_kind' }, 400);

      const ticket = randomTicketToken();
      const tokenHash = await sha256Hex(ticket);
      const { data: issued, error: issueError } = await admin.rpc('issue_reward_ssv_ticket', {
        p_user_id: user.id,
        p_reward_kind: kind,
        p_token_hash: tokenHash,
        p_ad_unit_id: contract.adUnitId,
        p_reward_amount: contract.rewardAmount,
        p_reward_item: contract.rewardItem,
      });
      if (issueError) return json({ error: 'ticket_service_unavailable' }, 503);
      if (issued !== true) return json({ error: 'ticket_not_available' }, 429);
      return json({ user_id: user.id, custom_data: ticket, expires_in: 600 });
    }

    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const questionAt = req.url.indexOf('?');
    const rawQuery = questionAt < 0 ? '' : req.url.slice(questionAt + 1);
    if (new TextEncoder().encode(rawQuery).byteLength > MAX_SSV_QUERY_BYTES) {
      return json({ error: 'query_too_large' }, 400);
    }
    const signature = await signatureValid(rawQuery);
    if (signature.status === 'unavailable') return json({ error: 'verifier_keys_unavailable' }, 503);
    if (signature.status !== 'valid') return json({ error: 'bad_signature' }, 403);

    const callback = parseRewardCallback(signature.params, contract);
    if (!callback) return json({ error: 'reward_contract_mismatch' }, 403);
    const tokenHash = await sha256Hex(callback.ticket);
    const { data: consumed, error: consumeError } = await admin.rpc('consume_reward_ssv_ticket', {
      p_token_hash: tokenHash,
      p_callback_user_id: callback.callbackUserId,
      p_txn_id: callback.transactionId,
      p_ad_unit_id: callback.adUnitId,
      p_reward_amount: callback.rewardAmount,
      p_reward_item: callback.rewardItem,
    });
    if (consumeError) return json({ error: 'ticket_service_unavailable' }, 503);
    const row = Array.isArray(consumed) && consumed.length === 1 ? consumed[0] : null;
    if (
      !row || row.ticket_user_id !== callback.callbackUserId ||
      (row.reward_kind !== 'reasoning' && row.reward_kind !== 'chat')
    ) return json({ error: 'invalid_or_expired_ticket' }, 403);

    if (row.reward_kind === 'chat') {
      const { error } = await admin.rpc('grant_chat_ad_bonus_ssv', {
        p_user_id: callback.callbackUserId,
        p_txn_id: callback.transactionId,
      });
      if (error) return json({ error: 'grant_service_unavailable' }, 503);
      return json({ ok: true });
    }

    const kst = new Date(Date.now() + 9 * 3_600_000);
    const month = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
    const { error } = await admin.rpc('grant_reward_credits_ssv', {
      p_user_id: callback.callbackUserId,
      p_month: month,
      p_grant: REWARD_PER_WATCH,
      p_txn_id: callback.transactionId,
    });
    if (error) return json({ error: 'grant_service_unavailable' }, 503);
    return json({ ok: true });
  } catch {
    console.error('[rewarded-ssv] unexpected failure');
    return json({ error: 'server_error' }, 503);
  }
});
