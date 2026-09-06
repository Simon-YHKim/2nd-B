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
//      subscription.created / subscription.updated / subscription.canceled,
//      transaction.completed, adjustment.created, and adjustment.updated.
//   2. Deploy with verify_jwt=false (Paddle sends no Supabase JWT).
//   3. Secrets (supabase secrets set): PADDLE_WEBHOOK_SECRET (from the notification
//      destination), and the price->tier map PADDLE_PRICE_CORTEX / _BRAIN, each a
//      COMMA-SEPARATED list of that tier's price ids (monthly AND yearly - a tier
//      has two). Then PADDLE_WEBHOOK_ENABLED=1 to turn it on. FAILS CLOSED until
//      then. NEVER hardcode these - env only (repo constraint 4).
//   4. At checkout, pass the Supabase user id in Paddle `customData.user_id`.
// VALIDATION REQUIRED before enabling: replay the same event twice (must apply ONCE)
// and send a tampered body (must be rejected 403). Dunning/grace on past_due is a
// later unit - this handles the subscription core. Lifetime was retired 2026-07-29.
//
// 0115: this function also captures the Paddle object identity (sub_... / txn_...),
// the event time, and the payment-method remnant. Self-serve cancel and refund
// (supabase/functions/subscription-manage) can only address a subscription or a
// transaction that was recorded here first, so an event delivered before 0115
// leaves that user on the "contact support" path by design.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  hasMatchingPaddleWebhookSignature,
  parsePaddleWebhookSignature,
  verifyCheckoutBindingWithSecrets,
  type PaddleCheckoutBindingData,
} from '../_shared/paddle-checkout-binding.ts';

interface PaddleEvent {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: {
    // `id` is the event's OWN object: sub_... on subscription.*, txn_... on
    // transaction.*. Captured since 0115 - without it nothing in the database
    // can name the subscription to cancel or the transaction to refund, which
    // is what made [설정 -> 구독 관리] impossible to build.
    id?: string;
    subscription_id?: string;
    transaction_id?: string;
    action?: string;
    status?: string;
    currency_code?: string;
    custom_data?: PaddleCheckoutBindingData | null;
    items?: Array<{ price?: { id?: string }; type?: string }>;
    current_billing_period?: { ends_at?: string } | null;
    // Set while a cancellation is pending on an otherwise active subscription,
    // and cleared back to null if it is reversed. This is Paddle's answer to
    // "will this renew?", which [설정 -> 구독 관리] has to be able to state.
    scheduled_change?: { action?: string; effective_at?: string } | null;
    // adjustment.* totals. `action` (refund | credit | chargeback), `status`
    // (pending_approval | approved | rejected | reversed) and `items` are
    // declared above and shared with the subscription path; items[].type carries
    // 'full' for a whole-transaction refund, which is what decides whether the
    // entitlement is revoked. Read defensively: an unexpected payload records
    // the money and leaves the tier alone rather than guessing.
    totals?: { total?: string | number } | null;
    details?: { totals?: { grand_total?: string | number } } | null;
    payments?: Array<{
      status?: string;
      method_details?: {
        type?: string;
        card?: { type?: string; last4?: string } | null;
      } | null;
    }> | null;
  };
}

const REFUND_ADJUSTMENT_STATUSES = new Set([
  'pending_approval',
  'approved',
  'rejected',
  'reversed',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Source-IP allowlist (defence in depth, added 2026-08-04).
//
// The HMAC alone is a single secret: anyone who learns it can mint events that
// grant themselves a paid tier. Paddle publishes the addresses it sends from, so
// requiring BOTH a valid signature AND a Paddle source address means a leaked
// secret is not sufficient on its own.
//
// WHICH HEADER IS TRUSTWORTHY - measured on this project, not assumed. A request
// deliberately sent with `X-Forwarded-For: 1.2.3.4` arrived at the function with
// that value ABSENT: the hosted edge gateway discards a client-supplied
// x-forwarded-for and rewrites it, and sets cf-connecting-ip to the real peer.
// Deno's remoteAddr is 0.0.0.0 behind the proxy and is useless here. So
// cf-connecting-ip is authoritative and cannot be spoofed by the caller;
// x-forwarded-for's FIRST entry is the same value and is kept as a fallback.
//
// FAILURE POLICY. The CIDR list is cached in module scope. A refresh failure
// keeps serving the last known good list indefinitely, so a Paddle API outage
// does not break billing. Only a cold start that has NEVER fetched the list
// rejects with 503 - Paddle retries failed deliveries with backoff, so the
// entitlement is delayed, never lost. Set PADDLE_IP_ALLOWLIST=off to bypass this
// check entirely without a redeploy if it ever blocks real traffic.
const PADDLE_IPS_URL = 'https://api.paddle.com/ips';
const IP_TTL_MS = 60 * 60 * 1000;
let ipCache: { cidrs: string[]; at: number } | null = null;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

async function paddleCidrs(): Promise<string[] | null> {
  const now = Date.now();
  if (ipCache && now - ipCache.at < IP_TTL_MS) return ipCache.cidrs;
  try {
    const res = await fetch(PADDLE_IPS_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const body = await res.json();
      const cidrs = body?.data?.ipv4_cidrs;
      if (Array.isArray(cidrs) && cidrs.length > 0) {
        ipCache = { cidrs: cidrs as string[], at: now };
        return ipCache.cidrs;
      }
    }
    console.warn('[paddle-webhook] paddle ip list fetch returned no cidrs');
  } catch (e) {
    console.warn('[paddle-webhook] paddle ip list fetch failed:', String(e));
  }
  return ipCache?.cidrs ?? null; // stale is fine; null only before any success
}

function callerIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return null;
}

async function hmacMessageHex(secret: string, message: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  // Deno's WebCrypto BufferSource requires an ArrayBuffer-backed view. Copying
  // keeps the exact signed bytes while excluding a SharedArrayBuffer backing.
  const signature = await crypto.subtle.sign('HMAC', key, Uint8Array.from(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(
  secret: string,
  timestamp: string,
  rawBody: Uint8Array,
): Promise<string> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}:`);
  const message = new Uint8Array(prefix.byteLength + rawBody.byteLength);
  message.set(prefix);
  message.set(rawBody, prefix.byteLength);
  return hmacMessageHex(secret, message);
}

// Paddle price id -> DB tier ('cortex' | 'brain'), configured via env.
//
// A tier has MORE THAN ONE price: monthly and yearly are separate Paddle price
// ids on the same product. The first version of this map held one id per tier,
// which silently reintroduced the exact bug this function exists to prevent -
// a yearly purchase resolved to no tier, fell through to `ignored: 'no_op'`,
// and the payer stayed 'free'. Each env var now takes a COMMA-SEPARATED list,
// so adding a price later is a config change, not a redeploy.
//
//   PADDLE_PRICE_CORTEX="pri_<monthly>,pri_<yearly>"
//   PADDLE_PRICE_BRAIN="pri_<monthly>,pri_<yearly>"
//
// `soma` (the retired Lifetime tier) is intentionally absent: it was retired on
// 2026-07-29 and has no Paddle product, so nothing can ever resolve to it.
function priceToTier(priceId: string | undefined): string | null {
  if (!priceId) return null;
  const map: Record<string, string> = {};
  const put = (env: string, tier: string) => {
    for (const id of (Deno.env.get(env) ?? '').split(',')) {
      const trimmed = id.trim();
      if (trimmed) map[trimmed] = tier;
    }
  };
  put('PADDLE_PRICE_CORTEX', 'cortex');
  put('PADDLE_PRICE_BRAIN', 'brain');
  return map[priceId] ?? null;
}

const OWNER_ANCHOR_QUERY_LIMIT = 101;
const UTC_DEADLINE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

interface OwnerAnchorRow {
  user_id?: unknown;
}

interface PaddleWebhookOwnerResolution {
  userId: string | null;
  error: 'ambiguous_owner_anchor' | 'owner_binding_mismatch' | null;
}

function resolvePaddleWebhookOwner(
  signedUserId: string | null,
  rows: readonly OwnerAnchorRow[] | null,
): PaddleWebhookOwnerResolution {
  // A full result page means there may be another, conflicting owner outside
  // the bounded query. Treat uncertainty as ambiguity instead of guessing.
  if (rows && rows.length >= OWNER_ANCHOR_QUERY_LIMIT) {
    return { userId: null, error: 'ambiguous_owner_anchor' };
  }

  const owners = new Set<string>();
  for (const row of rows ?? []) {
    if (typeof row.user_id !== 'string' || row.user_id.length === 0) {
      return { userId: null, error: 'ambiguous_owner_anchor' };
    }
    owners.add(row.user_id);
    if (owners.size > 1) return { userId: null, error: 'ambiguous_owner_anchor' };
  }

  const anchoredUserId = owners.values().next().value as string | undefined;
  if (signedUserId && anchoredUserId && signedUserId !== anchoredUserId) {
    return { userId: null, error: 'owner_binding_mismatch' };
  }
  return { userId: signedUserId ?? anchoredUserId ?? null, error: null };
}

function previousBindingSecretForVerification(
  secret: string,
  expiresAt: string,
  nowMs = Date.now(),
): string | null {
  if (secret.length < 32 || !Number.isSafeInteger(nowMs)) return null;

  const value = expiresAt.trim();
  let deadlineMs: number;
  if (/^\d{10}$/.test(value)) {
    deadlineMs = Number(value) * 1000;
  } else {
    const match = UTC_DEADLINE_RE.exec(value);
    if (!match) return null;
    deadlineMs = Date.parse(value);
    if (!Number.isFinite(deadlineMs)) return null;
    const normalized = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`;
    // Date.parse normalizes impossible dates such as February 30. Requiring the
    // canonical round-trip makes the configured UTC deadline unambiguous.
    if (new Date(deadlineMs).toISOString() !== normalized) return null;
  }

  return Number.isFinite(deadlineMs) && deadlineMs > nowMs ? secret : null;
}

Deno.serve(async (req: Request) => {
  // FAIL CLOSED until explicitly enabled + validated.
  if (Deno.env.get('PADDLE_WEBHOOK_ENABLED') !== '1') return json({ error: 'disabled' }, 503);
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'misconfigured' }, 503);

  // Source check first: a caller that is not Paddle is rejected before we read a
  // body or compute an HMAC.
  if (Deno.env.get('PADDLE_IP_ALLOWLIST') !== 'off') {
    const cidrs = await paddleCidrs();
    if (!cidrs) return json({ error: 'ip_list_unavailable' }, 503);
    const ip = callerIp(req);
    if (!ip || !cidrs.some((c) => inCidr(ip, c))) {
      console.warn('[paddle-webhook] rejected non-Paddle source');
      return json({ error: 'forbidden_source' }, 403);
    }
  }

  try {
    const raw = await req.text();
    const rawBytes = new TextEncoder().encode(raw);
    const { timestamp, signatures } = parsePaddleWebhookSignature(
      req.headers.get('Paddle-Signature') ?? '',
    );
    if (!timestamp || signatures.length === 0) return json({ error: 'bad_signature' }, 403);

    // Replay window: reject signatures more than 5 minutes off.
    const skewSec = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(skewSec) || skewSec > 300) return json({ error: 'stale_signature' }, 403);

    // Paddle signs the exact `${ts}:` prefix + raw request bytes. Decode only
    // after verification so no normalization can change the signed payload.
    const expected = await hmacSha256Hex(secret, timestamp, rawBytes);
    if (!hasMatchingPaddleWebhookSignature(expected, signatures)) {
      return json({ error: 'bad_signature' }, 403);
    }

    let event: PaddleEvent;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'bad_payload' }, 400);
      }
      event = parsed as PaddleEvent;
    } catch {
      return json({ error: 'bad_payload' }, 400);
    }
    const eventId = event.event_id;
    if (!eventId) return json({ error: 'no_event_id' }, 400);
    const eventType = event.event_type ?? 'unknown';
    const data = event.data ?? {};
    const occurredAt = event.occurred_at ?? null;
    const firstPriceId = data.items?.[0]?.price?.id;

    // ── adjustment.* ───────────────────────────────────────────────────────
    // ONE branch (0119). #1203 and #1205 each added an adjustment handler at the
    // same time; git merged both, and #1203's returned first, so #1205's was
    // unreachable dead code and an approved refund still never revoked anything.
    // The two are complementary, not competing, so they run in order:
    //
    //   1. record_paddle_refund_adjustment (#1203) tracks the adjustment
    //      LIFECYCLE on the ledger row - pending_approval -> approved / rejected
    //      / reversed - keyed by adjustment id across redeliveries.
    //   2. apply_billing_refund (#1205) applies the CONSEQUENCE, and only for an
    //      approved refund: the offsetting revenue row (C4) and, for a full
    //      refund, the entitlement revoke. Without it the money went back and
    //      the paid tier stayed live for the rest of the period.
    //
    // Step 2 never blocks step 1: the ledger is the record of what Paddle said,
    // and losing it because a consequence failed would be worse than a delayed
    // revoke an operator can see and redo.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const isAdjustmentEvent = eventType === 'adjustment.created' || eventType === 'adjustment.updated';
    if (isAdjustmentEvent) {
      if (data.action !== 'refund') return json({ ok: true, ignored: 'non_refund_adjustment' });

      const adjustmentId = typeof data.id === 'string' ? data.id.trim() : '';
      const adjustmentTransactionId = typeof data.transaction_id === 'string' ? data.transaction_id.trim() : '';
      const adjustmentStatus = typeof data.status === 'string' ? data.status : '';

      // No id means nothing to address. A refund must never be attributed to a
      // guessed payment, so this one stays a 400 and lets Paddle retry.
      if (!adjustmentId || !adjustmentTransactionId) {
        return json({ error: 'invalid_refund_adjustment' }, 400);
      }

      // A status outside REFUND_ADJUSTMENT_STATUSES used to 400 as well. That set
      // is an ASSUMPTION - no adjustment webhook has ever been observed here and
      // the sandbox comparison is still outstanding - and a 400 makes Paddle
      // retry, fail, and leave NO row on our side: no event, no ledger entry,
      // nothing to reconcile a missing refund from. Record it instead, loudly,
      // and touch neither the entitlement nor revenue: acting on a status we do
      // not understand is the one thing worse than not acting.
      if (!REFUND_ADJUSTMENT_STATUSES.has(adjustmentStatus)) {
        console.error(
          '[paddle-webhook][ALERT] unhandled_adjustment_status',
          JSON.stringify({ status: adjustmentStatus, adjustment: adjustmentId, event: eventId }),
        );
        const { error: recErr } = await admin.rpc('record_unhandled_billing_event', {
          p_event_id: eventId,
          p_event_type: eventType,
          p_subscription_id: data.subscription_id ?? null,
          p_transaction_id: adjustmentTransactionId,
          p_occurred_at: occurredAt,
          p_payload: event,
        });
        if (recErr) {
          // Could not even record it: a 500 keeps Paddle retrying, which is the
          // right outcome when we have lost the event entirely.
          console.error('[paddle-webhook][ALERT] unhandled adjustment record failed:', recErr.message);
          return json({ error: 'unhandled_adjustment_record_failed' }, 500);
        }
        return json({ ok: true, ignored: 'unhandled_adjustment_status', status: adjustmentStatus });
      }

      const { data: result, error } = await admin.rpc('record_paddle_refund_adjustment', {
        p_event_id: eventId,
        p_event_type: eventType,
        p_adjustment_id: adjustmentId,
        p_transaction_id: adjustmentTransactionId,
        p_status: adjustmentStatus,
        p_occurred_at: occurredAt,
      });
      if (error) {
        console.error('[paddle-webhook] refund adjustment apply failed:', error.message);
        return json({ error: 'refund_adjustment_apply_failed' }, 500);
      }

      let applied: unknown = null;
      if (adjustmentStatus === 'approved') {
        const rawTotal = data.totals?.total;
        const cents = rawTotal != null ? parseInt(String(rawTotal), 10) : NaN;
        // Either signal is sufficient; the RPC also treats a matching accepted
        // self-serve request as full, since we only ever submit type:'full'.
        const isFull = (data.items ?? []).some((i) => i?.type === 'full');
        const { data: applyResult, error: applyError } = await admin.rpc('apply_billing_refund', {
          p_event_id: `${eventId}:consequence`,
          p_event_type: eventType,
          p_adjustment_id: adjustmentId,
          p_transaction_id: adjustmentTransactionId,
          p_subscription_id: data.subscription_id ?? null,
          p_occurred_at: occurredAt,
          p_amount_cents: Number.isFinite(cents) ? cents : null,
          p_currency: data.currency_code ?? null,
          p_is_full: isFull,
        });
        if (applyError) {
          // Loud, but not fatal: the ledger above already recorded the approval,
          // so an operator can see the refund and reconcile the tier by hand.
          console.error('[paddle-webhook][ALERT] refund consequence failed:', applyError.message);
        } else {
          applied = applyResult;
        }
      }
      return json({ ok: true, result, applied });
    }

    // RELEASE GATE: provision the same current secret in subscription-manage
    // first. Then publish the binding-aware web client with a new Paddle client
    // token, revoke the legacy token, reconcile open legacy checkouts, and only
    // then deploy this strict verifier. Unsigned legacy user_id is never trusted.
    const bindingSecret = Deno.env.get('PADDLE_CHECKOUT_BINDING_SECRET') ?? '';
    if (bindingSecret.length < 32) return json({ error: 'misconfigured_checkout_binding' }, 503);
    const previousBindingSecret = Deno.env.get('PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS') ?? '';
    const previousBindingExpiresAt =
      Deno.env.get('PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS_EXPIRES_AT') ?? '';
    const acceptedPreviousBindingSecret = previousBindingSecretForVerification(
      previousBindingSecret,
      previousBindingExpiresAt,
    );
    const bindingSecrets = [bindingSecret];
    if (acceptedPreviousBindingSecret) bindingSecrets.push(acceptedPreviousBindingSecret);
    if (previousBindingSecret && !acceptedPreviousBindingSecret) {
      console.error('[paddle-webhook][ALERT] previous_checkout_binding_secret_ignored');
    }
    const signedUserId = await verifyCheckoutBindingWithSecrets(data.custom_data, bindingSecrets);

    // Paddle object identity (0115). On subscription.* the event's own object IS
    // the subscription; on transaction.* it is the transaction and the
    // subscription is a sibling field. Everything stays null for event shapes
    // that carry neither, and a null id is what makes self-serve fail closed.
    const isSubscriptionEvent = eventType.startsWith('subscription.');
    const subscriptionId = (isSubscriptionEvent ? data.id : data.subscription_id) ?? null;
    const transactionId = (isSubscriptionEvent ? null : data.id) ?? null;
    // Payment-method summary for the settings card. Only the captured payment is
    // meaningful; last4/brand exist only for card payments. Nothing here is a
    // credential - Paddle exposes the display remnant, never the PAN.
    const captured = data.payments?.find((p) => p?.status === 'captured') ?? data.payments?.[0] ?? null;
    const paymentMethod = captured?.method_details?.type ?? null;
    const cardBrand = captured?.method_details?.card?.type ?? null;
    const cardLast4 = captured?.method_details?.card?.last4 ?? null;

    // Auto-renewal state. Null (no scheduled change, or a scheduled change that
    // is not a cancel) means the subscription still renews - and null is exactly
    // what gets stored, so a reversal is recorded as faithfully as a cancel.
    const sc = data.scheduled_change ?? null;
    const scheduledCancelAt = sc?.action === 'cancel' ? (sc.effective_at ?? null) : null;

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

    // Webhook delivery order is not guaranteed. Always compare a signed owner
    // with the stored subscription owner; a valid binding for user A must not
    // take over a subscription already anchored to user B. Renewals whose
    // checkout binding has expired use the unique DB anchor as the real owner.
    let ownerAnchorRows: OwnerAnchorRow[] = [];
    if (subscriptionId) {
      const { data: ownerAnchors, error: ownerAnchorError } = await admin
        .from('paddle_webhook_events')
        .select('user_id')
        .eq('paddle_subscription_id', subscriptionId)
        .eq('provider', 'paddle')
        .not('user_id', 'is', null)
        .limit(OWNER_ANCHOR_QUERY_LIMIT);
      if (ownerAnchorError) {
        console.error(
          '[paddle-webhook][ALERT] owner_anchor_check_failed',
          JSON.stringify({ event: eventId }),
        );
        return json({ error: 'owner_anchor_check_failed' }, 503);
      }
      ownerAnchorRows = ownerAnchors ?? [];
    }
    const ownerResolution = resolvePaddleWebhookOwner(signedUserId, ownerAnchorRows);
    if (ownerResolution.error) {
      console.error(
        '[paddle-webhook][ALERT] owner_resolution_failed',
        JSON.stringify({ event: eventId, reason: ownerResolution.error }),
      );
      return json({ error: ownerResolution.error }, 409);
    }
    const resolvedUserId = ownerResolution.userId;
    if (!resolvedUserId) {
      if (data.custom_data?.user_id) {
        console.error(
          '[paddle-webhook][ALERT] invalid_checkout_binding',
          JSON.stringify({ event: eventId }),
        );
      }
      // Never acknowledge an ownership-changing or revenue event that cannot
      // yet be attributed. A non-2xx response lets Paddle retry after an
      // out-of-order owner event arrives or an operator reconciles the charge.
      console.error(
        '[paddle-webhook][ALERT] unattributed_subscription',
        JSON.stringify({ event: eventId }),
      );
      return json({ error: 'unattributed_subscription' }, 409);
    }

    // 0118: a subscription event that changes no tier is still RECORDED, where
    // it used to return no_op and leave no trace at all. Two things were
    // invisible because of that: a past_due / payment-failure period, during
    // which the paid tier survives unpaid with nothing in the database saying
    // so; and an active subscription whose price id is missing from
    // PADDLE_PRICE_* (a new price created in Paddle and not mirrored into the
    // env), where the payer silently stayed free and Paddle was told 200 OK.
    // Writing the row costs nothing and makes both greppable.
    const isSubscriptionLifecycle = eventType.startsWith('subscription.');
    if (tier === null && amountCents === null && !isSubscriptionLifecycle) {
      return json({ ok: true, ignored: 'no_op' });
    }

    const { data: result, error } = await admin.rpc('apply_billing_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_user_id: resolvedUserId,
      p_tier: tier,
      p_expires_at: expiresAt,
      p_provider: 'paddle',
      p_amount_cents: amountCents,
      p_currency: currency,
      p_occurred_at: occurredAt,
      p_is_related_party: false,
      p_relation: 'arms_length',
      p_source: 'paddle',
      p_subscription_id: subscriptionId,
      p_transaction_id: transactionId,
      p_payment_method: paymentMethod,
      p_card_brand: cardBrand,
      p_card_last4: cardLast4,
      p_scheduled_cancel_at: scheduledCancelAt,
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
