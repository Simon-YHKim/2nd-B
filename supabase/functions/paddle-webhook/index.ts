// paddle-webhook - Paddle (Merchant of Record) Billing webhook -> entitlement (Phase 4).
//
// Audit BLOCKER 1/2: a purchase never reached the DB (no webhook, no tier writer), so
// a payer stayed 'free'. Paddle calls THIS endpoint on subscription / transaction
// events; we verify the Paddle-Signature HMAC against the notification secret, map the
// price id to a DB tier, and call apply_billing_event() (0087) - atomic + idempotent
// (dedups on the Paddle event id), so a replayed / retried delivery applies at most once.
//
// DEPLOY / CONFIG (Simon, AFTER Paddle account approval):
//   1. Paddle > Notifications: add a destination at this function URL; subscribe to
//      subscription.created / subscription.updated / subscription.canceled and
//      transaction.completed.
//   2. Deploy with verify_jwt=false (Paddle sends no Supabase JWT).
//   3. Secrets (supabase secrets set): PADDLE_WEBHOOK_SECRET (from the notification
//      destination), and the price->tier map PADDLE_PRICE_SOMA / _CORTEX / _BRAIN
//      (Paddle price ids). Then PADDLE_WEBHOOK_ENABLED=1 to turn it on. FAILS CLOSED
//      until then. NEVER hardcode these - env only (repo constraint §4).
//   4. At checkout, pass the Supabase user id in Paddle `customData.user_id`.
// VALIDATION REQUIRED before enabling: replay the same event twice (must apply ONCE)
// and send a tampered body (must be rejected 403). One-time products (Lifetime) and
// dunning/grace on past_due are a later unit - this handles the subscription core.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PaddleEvent {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: {
    status?: string;
    currency_code?: string;
    custom_data?: { user_id?: string } | null;
    items?: Array<{ price?: { id?: string } }>;
    current_billing_period?: { ends_at?: string } | null;
    details?: { totals?: { grand_total?: string | number } } | null;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Constant-time compare of two hex strings (avoids a signature timing oracle).
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Paddle-Signature header: "ts=1700000000;h1=<hex hmac>".
function parsePaddleSignature(header: string): { ts: string | null; h1: string | null } {
  let ts: string | null = null;
  let h1: string | null = null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === 'ts') ts = v;
    else if (k === 'h1') h1 = v;
  }
  return { ts, h1 };
}

// Paddle price id -> DB tier ('soma' | 'cortex' | 'brain'), configured via env.
function priceToTier(priceId: string | undefined): string | null {
  if (!priceId) return null;
  const map: Record<string, string> = {};
  const put = (env: string, tier: string) => {
    const id = Deno.env.get(env);
    if (id) map[id] = tier;
  };
  put('PADDLE_PRICE_SOMA', 'soma');
  put('PADDLE_PRICE_CORTEX', 'cortex');
  put('PADDLE_PRICE_BRAIN', 'brain');
  return map[priceId] ?? null;
}

Deno.serve(async (req: Request) => {
  // FAIL CLOSED until explicitly enabled + validated.
  if (Deno.env.get('PADDLE_WEBHOOK_ENABLED') !== '1') return json({ error: 'disabled' }, 503);
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'misconfigured' }, 503);

  try {
    const raw = await req.text();
    const { ts, h1 } = parsePaddleSignature(req.headers.get('Paddle-Signature') ?? '');
    if (!ts || !h1) return json({ error: 'bad_signature' }, 403);

    // Replay window: reject signatures more than 5 minutes off.
    const skewSec = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(skewSec) || skewSec > 300) return json({ error: 'stale_signature' }, 403);

    // Paddle signs `${ts}:${rawBody}` with the notification secret (HMAC-SHA256).
    const expected = await hmacSha256Hex(secret, `${ts}:${raw}`);
    if (!timingSafeEqualHex(expected, h1)) return json({ error: 'bad_signature' }, 403);

    const event = JSON.parse(raw) as PaddleEvent;
    const eventId = event.event_id;
    if (!eventId) return json({ error: 'no_event_id' }, 400);
    const eventType = event.event_type ?? 'unknown';
    const data = event.data ?? {};
    const occurredAt = event.occurred_at ?? null;
    const userId = data.custom_data?.user_id ?? null;
    const firstPriceId = data.items?.[0]?.price?.id;

    let tier: string | null = null;
    let expiresAt: string | null = null;
    let amountCents: number | null = null;
    let currency: string | null = null;

    if (eventType === 'subscription.created' || eventType === 'subscription.updated') {
      const status = data.status ?? '';
      if (status === 'active' || status === 'trialing') {
        tier = priceToTier(firstPriceId);
        expiresAt = data.current_billing_period?.ends_at ?? null;
      } else if (status === 'canceled' || status === 'paused') {
        tier = 'free';
        expiresAt = null;
      }
      // past_due / other: leave tier unchanged (dunning/grace is a later unit).
    } else if (eventType === 'subscription.canceled') {
      tier = 'free';
      expiresAt = null;
    } else if (eventType === 'transaction.completed') {
      const gt = data.details?.totals?.grand_total;
      const n = gt != null ? parseInt(String(gt), 10) : NaN;
      if (Number.isFinite(n)) {
        amountCents = n;
        currency = data.currency_code ?? null;
      }
      // tier stays null: subscription.* is the tier source of truth (don't clobber expiry).
    } else {
      // Event we don't act on: acknowledge so Paddle marks it delivered.
      return json({ ok: true, ignored: eventType });
    }

    if (tier !== null && !userId) return json({ ok: true, ignored: 'no_user' });
    if (tier === null && amountCents === null) return json({ ok: true, ignored: 'no_op' });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const { data: result, error } = await admin.rpc('apply_billing_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_user_id: userId,
      p_tier: tier,
      p_expires_at: expiresAt,
      p_provider: 'paddle',
      p_amount_cents: amountCents,
      p_currency: currency,
      p_occurred_at: occurredAt,
      p_is_related_party: false,
      p_relation: 'arms_length',
      p_source: 'paddle',
    });
    if (error) {
      console.error('[paddle-webhook] apply failed:', error.message);
      return json({ error: 'apply_failed' }, 500);
    }
    return json({ ok: true, result });
  } catch (e) {
    console.error('[paddle-webhook] error:', String(e));
    return json({ error: 'server_error' }, 500);
  }
});
