// subscription-manage - self-serve subscription cancel + usage-gated refund request.
//
// The published refund policy (docs/legal/refund-policy.md KO 3항 / EN §3) tells
// users to cancel from "앱 내 [설정 -> 구독 관리]". This is the server side of that
// screen. Two actions, both acting ONLY on the caller's own subscription:
//
//   cancel          -> Paddle POST /subscriptions/{id}/cancel
//                      effective_from = next_billing_period (default) | immediately
//   refund_request  -> Paddle POST /adjustments  { action: refund, type: full }
//
// IDOR contract (same as delete-account / export-account): the target user is the
// JWT `sub`, and the Paddle subscription / transaction ids are resolved SERVER-SIDE
// from paddle_webhook_events by claim_billing_self_service(). The request body
// never carries a user id, a subscription id, or a transaction id, so a crafted
// body cannot reach another account's money.
//
// ELIGIBILITY IS RE-DERIVED HERE. The settings screen shows the verdict from
// refund_eligibility(), but the client's copy is display only: this function calls
// the same RPC again under service_role immediately before spending money. A user
// who read "eligible", then burned their allowance, then tapped the button gets the
// current answer, not the stale one.
//
// IDEMPOTENCY. claim_billing_self_service() inserts the ledger row BEFORE the Paddle
// call and a partial unique index rejects a second live claim on the same
// transaction (refund) or subscription+timing (cancel). A duplicate returns 200 with
// { duplicate: true } rather than issuing a second adjustment. A claim that ends in
// provider_error leaves the index, so a genuine failure is retryable.
//
// FAIL CLOSED. Without PADDLE_API_KEY (or with PADDLE_SELF_SERVICE_ENABLED != '1')
// nothing is attempted: the action is logged as 'misconfigured' and the response
// tells the client to route the user to support (C11, 2 business days). The same
// applies to a user whose subscription predates 0115 and therefore has no stored
// Paddle id. Never guess an id, never half-cancel.
//
// A REFUND IS A REQUEST, NOT A SETTLEMENT. Paddle is the Merchant of Record and
// reviews refund adjustments; the API returns the adjustment, not a completed
// refund. Response and copy say "requested"/"접수", never "refunded"/"환불 완료".
//
// SECRETS (supabase secrets set):
//   PADDLE_API_KEY               server-side Paddle API key. NEVER in git.
//   PADDLE_SELF_SERVICE_ENABLED  '1' to turn the endpoint on. Fails closed otherwise.
//   PADDLE_API_BASE              optional; defaults to https://api.paddle.com
//                                (set to https://sandbox-api.paddle.com to test).
//   PADDLE_SELF_SERVICE_DRYRUN   '1' to exercise the whole path (eligibility,
//                                ledger, idempotency) WITHOUT calling Paddle.
// Deploy with verify_jwt=true. Never deploy with --no-verify-jwt.

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
      'vary': 'origin',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': resolveOrigin(req),
      'vary': 'origin',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
    },
  });
}

// The JWT is already validated by the gateway (verify_jwt=true), but verify_jwt
// only proves the token is VALID. The public anon/publishable key is itself a
// valid token (role==='anon'). This endpoint cancels subscriptions and asks for
// money back, so we require a signed-in USER: a real `sub` AND
// role==='authenticated'. Mirrors delete-account / export-account. Returns null
// for any non-user token.
function userIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.slice(authHeader.toLowerCase().indexOf('bearer ') + 7).trim();
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)));
    const sub = typeof json?.sub === 'string' ? json.sub : '';
    const role = typeof json?.role === 'string' ? json.role : '';
    if (role !== 'authenticated' || sub.length === 0) return null;
    return sub;
  } catch {
    return null;
  }
}

type Action = 'cancel' | 'refund_request';
type EffectiveFrom = 'next_billing_period' | 'immediately';

interface Eligibility {
  status: string;
  [key: string]: unknown;
}

const PADDLE_TIMEOUT_MS = 15000;

function paddleBase(): string {
  return (Deno.env.get('PADDLE_API_BASE') ?? 'https://api.paddle.com').replace(/\/+$/, '');
}

interface PaddleCall {
  ok: boolean;
  status: number;
  ref: string | null;
  error: string | null;
}

// One outbound shape for both actions. `Paddle-Idempotency-Key` is sent so a
// network retry of the SAME claim cannot produce two adjustments at Paddle even
// if our own ledger row were somehow replayed.
async function callPaddle(path: string, body: unknown, idempotencyKey: string): Promise<PaddleCall> {
  const apiKey = Deno.env.get('PADDLE_API_KEY') ?? '';
  try {
    const res = await fetch(`${paddleBase()}${path}`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'paddle-version': '1',
        'paddle-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PADDLE_TIMEOUT_MS),
    });
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const dataObj = (parsed?.data ?? null) as Record<string, unknown> | null;
    const ref = typeof dataObj?.id === 'string' ? dataObj.id : null;
    if (!res.ok) {
      const errObj = (parsed?.error ?? null) as Record<string, unknown> | null;
      const code = typeof errObj?.code === 'string' ? errObj.code : `http_${res.status}`;
      const detail = typeof errObj?.detail === 'string' ? errObj.detail : '';
      return { ok: false, status: res.status, ref, error: `${code}${detail ? `: ${detail}` : ''}` };
    }
    return { ok: true, status: res.status, ref, error: null };
  } catch (e) {
    // A timeout or transport failure is genuinely unknown, not a refusal: the
    // claim is settled as provider_error so the user can retry.
    return { ok: false, status: 0, ref: null, error: String(e).slice(0, 300) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }
  const userId = userIdFromJwt(authHeader);
  if (!userId) return jsonResponse(req, { error: 'invalid_jwt' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured_supabase_env' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = body.action as Action | undefined;
  if (action !== 'cancel' && action !== 'refund_request') {
    return jsonResponse(req, { error: 'invalid_action' }, 400);
  }
  const effectiveFrom: EffectiveFrom =
    action === 'cancel' && body.effective_from === 'immediately' ? 'immediately' : 'next_billing_period';

  // Verdict first, always: it is logged with EVERY action, cancel included, so
  // the ledger records what the user was told at the moment they acted.
  const { data: eligRaw, error: eligErr } = await admin.rpc('refund_eligibility', { p_user_id: userId });
  if (eligErr) {
    console.error('[subscription-manage] eligibility failed:', eligErr.message);
    return jsonResponse(req, { error: 'eligibility_unavailable' }, 503);
  }
  const eligibility = (eligRaw ?? { status: 'unknown' }) as Eligibility;

  const settleTerminal = async (outcome: string, detail: string): Promise<void> => {
    const { error } = await admin.rpc('log_billing_self_service', {
      p_user_id: userId,
      p_action: action,
      p_outcome: outcome,
      p_eligibility: eligibility.status,
      p_eligibility_detail: eligibility,
      p_provider_error: detail,
    });
    if (error) console.error('[subscription-manage] terminal log failed:', error.message);
  };

  // NOTE (0120): there is deliberately no effective-date REFUSAL here any more.
  // refund_eligibility() now applies the policy in force at the moment of the
  // request - 30 days no-questions-asked before 2026-09-08, 7 days plus the
  // usage test after - so the verdict this function enforces is already the
  // right one. Blocking the action instead of dating the rule turned the whole
  // feature off and sent users who were OWED a refund to email support.
  // A refund that is not owed never reaches Paddle. The verdict and its evidence
  // go back to the client so the screen can show WHY, not just "no".
  if (action === 'refund_request' && eligibility.status !== 'eligible') {
    await settleTerminal('rejected', `not_eligible:${eligibility.status}`);
    return jsonResponse(req, { ok: false, outcome: 'rejected', reason: 'not_eligible', eligibility }, 200);
  }

  // A cancel needs something to cancel. The screen hides the button on a free
  // tier, but the FUNCTION is the boundary, not the screen: without this a stale
  // client, a replayed request, or a direct call claims a cancel row and fires a
  // Paddle request for a subscription the caller does not hold. Paddle rejects
  // it, so the user is handed "provider_error, contact support" for an action
  // that was never valid - a support ticket manufactured out of nothing.
  // eligibility.tier is the EFFECTIVE tier (judge comp + expiry aware, 0088),
  // already computed above, so this costs no extra round trip.
  if (action === 'cancel' && eligibility.tier === 'free') {
    await settleTerminal('rejected', 'not_subscribed');
    return jsonResponse(req, { ok: false, outcome: 'rejected', reason: 'not_subscribed', eligibility }, 200);
  }

  // Abuse guard. This endpoint writes a ledger row and can reach a paid API on
  // every call, and nothing else throttles it (the LLM proxies have
  // bump_gemini_spend; there is no generic limiter). A loop with any valid user
  // token could otherwise grow the ledger without bound and, once enabled, keep
  // re-opening released claims against Paddle's rate limits. service_role
  // bypasses RLS, so this counts the caller's OWN rows only.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent, error: rateErr } = await admin
    .from('billing_self_service_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (rateErr) {
    // Fail CLOSED: an unreadable ledger is exactly when we cannot tell a retry
    // from an attack, and this endpoint spends money.
    console.error('[subscription-manage] rate check failed:', rateErr.message);
    return jsonResponse(req, { error: 'rate_check_unavailable' }, 503);
  }
  if ((recent ?? 0) >= 20) {
    return jsonResponse(req, { error: 'too_many_requests', retry_after_seconds: 3600 }, 429);
  }

  const enabled = Deno.env.get('PADDLE_SELF_SERVICE_ENABLED') === '1';
  const dryRun = Deno.env.get('PADDLE_SELF_SERVICE_DRYRUN') === '1';
  const hasKey = (Deno.env.get('PADDLE_API_KEY') ?? '').length > 0;
  if (enabled && dryRun) {
    // Both on is a rehearsal, which is legitimate - but it is also exactly the
    // state that must never survive the go-live flip, so it is loud in the logs.
    console.warn('[subscription-manage][ALERT] DRYRUN is set while the feature is ENABLED: no request will reach Paddle.');
  }
  if (!enabled || (!hasKey && !dryRun)) {
    // Fail closed: the action is recorded, nothing is attempted, and the client
    // is told to send the user to support rather than shown a fake success.
    await settleTerminal('misconfigured', enabled ? 'missing_paddle_api_key' : 'self_service_disabled');
    return jsonResponse(req, { ok: false, outcome: 'misconfigured', contact_support: true, eligibility }, 200);
  }

  // Claim: writes the pending ledger row and resolves the Paddle ids server-side.
  const { data: claimRaw, error: claimErr } = await admin.rpc('claim_billing_self_service', {
    p_user_id: userId,
    p_action: action,
    p_effective_from: action === 'cancel' ? effectiveFrom : null,
    p_eligibility: eligibility.status,
    p_eligibility_detail: eligibility,
  });
  if (claimErr) {
    console.error('[subscription-manage] claim failed:', claimErr.message);
    return jsonResponse(req, { error: 'claim_failed' }, 500);
  }
  const claim = (claimRaw ?? {}) as {
    id?: string | null;
    duplicate?: boolean;
    subscription_id?: string | null;
    transaction_id?: string | null;
  };

  if (claim.duplicate) {
    // Already pending or already accepted. 200, not an error: the user's intent
    // is on record exactly once and a second tap must not spend money again.
    return jsonResponse(req, { ok: true, outcome: 'duplicate', duplicate: true, eligibility }, 200);
  }
  const claimId = claim.id;
  if (!claimId) {
    console.error('[subscription-manage] claim returned no id');
    return jsonResponse(req, { error: 'claim_failed' }, 500);
  }

  const settleClaim = async (outcome: string, call: PaddleCall | null): Promise<void> => {
    const { error } = await admin.rpc('settle_billing_self_service', {
      p_id: claimId,
      p_outcome: outcome,
      p_provider_status: call?.status ?? null,
      p_provider_ref: call?.ref ?? null,
      p_provider_error: call?.error ?? null,
    });
    if (error) console.error('[subscription-manage] settle failed:', error.message);
  };

  // The stored Paddle id is what makes the action addressable. Missing means the
  // subscription predates 0115's capture (or came from a store purchase, which we
  // cannot cancel at all) - support, not a guess.
  const targetId = action === 'cancel' ? claim.subscription_id : claim.transaction_id;
  if (!targetId) {
    await settleClaim('misconfigured', { ok: false, status: 0, ref: null, error: 'no_paddle_id_on_record' });
    return jsonResponse(req, { ok: false, outcome: 'misconfigured', contact_support: true, eligibility }, 200);
  }

  if (dryRun) {
    // Everything above ran for real (eligibility, ledger, idempotency); only the
    // outbound call is skipped. Lets the whole path be exercised without moving money.
    //
    // Settled as its own outcome, NOT 'accepted' (0118). 'accepted' sits inside
    // the refund idempotency index, so a dry run that looked like a real one
    // would have permanently blocked the user's actual request - and if DRYRUN
    // survived the go-live flip, every user would have been told "submitted"
    // while nothing reached Paddle and their real attempt was locked out.
    // 'dry_run' is outside both indexes, so a rehearsal is repeatable and
    // consumes nothing.
    await settleClaim('dry_run', { ok: true, status: 0, ref: `dryrun:${targetId}`, error: null });
    return jsonResponse(req, { ok: true, outcome: 'dry_run', dry_run: true, eligibility }, 200);
  }

  // The idempotency key must identify the REQUEST, not the attempt. It used to
  // be the claim uuid, minted fresh every time, so the one case it existed for
  // could not work: our 15s timeout settles the claim as provider_error (which
  // releases the index by design), the user retries, a NEW claim mints a NEW
  // key, and Paddle - having already accepted the first adjustment - sees an
  // unrelated request and issues a SECOND full refund. Keyed on the target
  // object instead, a retry is the same logical request and Paddle dedupes it.
  const idempotencyKey = action === 'cancel'
    ? `cancel:${targetId}:${effectiveFrom}`
    : `refund:${targetId}`;

  const call = action === 'cancel'
    ? await callPaddle(`/subscriptions/${encodeURIComponent(targetId)}/cancel`, { effective_from: effectiveFrom }, idempotencyKey)
    : await callPaddle('/adjustments', {
        action: 'refund',
        type: 'full',
        transaction_id: targetId,
        reason: 'Customer self-serve refund request within the published refund window',
      }, idempotencyKey);

  if (!call.ok) {
    console.error(`[subscription-manage] paddle ${action} failed:`, call.status, call.error);
    await settleClaim('provider_error', call);
    return jsonResponse(req, { ok: false, outcome: 'provider_error', contact_support: true, eligibility }, 200);
  }

  await settleClaim('accepted', call);

  // No tier write here. subscription.canceled / subscription.updated already flow
  // back through paddle-webhook -> apply_billing_event (0087), which is the ONE
  // entitlement writer. A second revocation path here would be a race against it.
  return jsonResponse(req, {
    ok: true,
    outcome: 'accepted',
    action,
    effective_from: action === 'cancel' ? effectiveFrom : null,
    reference: call.ref,
    eligibility,
  }, 200);
});
