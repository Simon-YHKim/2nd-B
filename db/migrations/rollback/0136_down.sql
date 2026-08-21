-- rollback/0136_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- ── WHAT ROLLING BACK 0136 MEANS ─────────────────────────────────────────────
--
-- 0136 changed no data. It narrowed the transaction three functions look at, and
-- added one branch to the refund consequence. So the rollback is exactly:
-- restore the three previous bodies (0115's claim, 0124's eligibility, 0118's
-- refund) and stop there.
--
-- ── WHAT THIS RE-ARMS, IN PLAIN TERMS ────────────────────────────────────────
--
-- Running this file puts three defects back:
--
--   1. A refund requested from the subscription screen is submitted to Paddle
--      against the user's NEWEST completed transaction, whatever it bought. If
--      that is a credit pack, the pack is refunded and the subscription keeps
--      billing. WRONG MONEY.
--   2. The 7-day refund window and the usage gate re-anchor on that same
--      transaction, so a pack re-opens a window that had closed.
--   3. A full refund of a credit pack revokes the subscription tier.
--
-- HARMLESS while no one-time product exists - which is also the only state in
-- which anyone would sensibly run this. The guard below enforces exactly that:
-- if any purchase lot exists, the defects are reachable and rolling back is a
-- decision about real customers, not a revert.
--
-- The refund_review column and its index are DELIBERATELY LEFT IN PLACE. They
-- hold no behaviour, dropping a column is the one irreversible step in here, and
-- a row already flagged for a human should not lose its flag because the
-- function that set it was rolled back.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 0. Refuse to re-arm the defects on live money
----------------------------------------------------------------------
DO $guard$
DECLARE v_paid int;
BEGIN
  SELECT count(*) INTO v_paid FROM public.credit_ledger WHERE kind = 'purchase';
  IF v_paid > 0 THEN
    RAISE EXCEPTION
      '0136_down: % purchased credit lot(s) exist. Rolling back re-arms the '
      'cross-product refund defects on live one-time purchases: a subscription '
      'refund request would target a pack, and refunding a pack would revoke the '
      'subscription. Decide that deliberately before removing this guard.', v_paid;
  END IF;
END
$guard$;

----------------------------------------------------------------------
-- 1. claim_billing_self_service back to 0115
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_billing_self_service(
  p_user_id            uuid,
  p_action             text,
  p_effective_from     text,
  p_eligibility        text,
  p_eligibility_detail jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub_id text;
  v_txn_id text;
  v_id     uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('cancel', 'refund_request') THEN
    RAISE EXCEPTION 'invalid action: %', p_action USING ERRCODE = '22023';
  END IF;

  SELECT e.paddle_subscription_id
    INTO v_sub_id
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.paddle_subscription_id IS NOT NULL
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  SELECT e.paddle_transaction_id
    INTO v_txn_id
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type = 'transaction.completed'
     AND e.paddle_transaction_id IS NOT NULL
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  INSERT INTO public.billing_self_service_log
    (user_id, action, outcome, effective_from,
     paddle_subscription_id, paddle_transaction_id, eligibility, eligibility_detail)
  VALUES
    (p_user_id, p_action, 'pending', p_effective_from,
     v_sub_id, v_txn_id, p_eligibility, p_eligibility_detail)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',              v_id,
    'duplicate',       v_id IS NULL,
    'subscription_id', v_sub_id,
    'transaction_id',  v_txn_id
  );
END;
$$;

----------------------------------------------------------------------
-- 2. refund_eligibility back to 0124
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_window_days   constant int := 7;
  c_free_per_week constant int := 2;

  v_is_owner       boolean;
  v_txn            record;
  v_sub_id         text;
  v_paid_at        timestamptz;
  v_age_days       numeric;
  v_weeks          int;
  v_allowance      int;
  v_runs           bigint;
  v_calls          bigint;
  v_used           bigint;
  v_status         text;
  v_tier           text;
BEGIN
  v_is_owner := (public.billing_request_role() = 'service_role');
  IF NOT v_is_owner THEN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_tier := public.effective_subscription_tier(p_user_id);

  SELECT e.paddle_transaction_id,
         e.paddle_subscription_id,
         COALESCE(e.occurred_at, e.processed_at) AS paid_at
    INTO v_txn
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type = 'transaction.completed'
     AND e.paddle_transaction_id IS NOT NULL
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  IF v_txn IS NULL THEN
    RETURN jsonb_build_object(
      'status',             'no_payment',
      'tier',               v_tier,
      'policy',             'revised',
      'usage_gate_applies', true,
      'refund_window_days', c_window_days,
      'free_runs_per_week', c_free_per_week
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.billing_self_service_log l
     WHERE l.user_id = p_user_id
       AND l.action = 'refund_request'
       AND l.outcome IN ('pending', 'accepted')
       AND l.paddle_transaction_id IS NOT DISTINCT FROM v_txn.paddle_transaction_id
  ) THEN
    RETURN jsonb_build_object(
      'status',             'refund_already_requested',
      'tier',               v_tier,
      'policy',             'revised',
      'usage_gate_applies', true,
      'paid_at',            v_txn.paid_at,
      'transaction_id',     v_txn.paddle_transaction_id,
      'refund_window_days', c_window_days,
      'free_runs_per_week', c_free_per_week
    );
  END IF;

  v_paid_at := v_txn.paid_at;

  v_sub_id := v_txn.paddle_subscription_id;
  IF v_sub_id IS NULL THEN
    SELECT e.paddle_subscription_id
      INTO v_sub_id
      FROM public.paddle_webhook_events e
     WHERE e.user_id = p_user_id
       AND e.paddle_subscription_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;

  v_age_days := EXTRACT(EPOCH FROM (now() - v_paid_at)) / 86400.0;
  v_weeks     := GREATEST(1, CEIL(v_age_days / 7.0))::int;
  v_allowance := c_free_per_week * v_weeks;

  SELECT count(*)
    INTO v_runs
    FROM public.reasoning_runs r
   WHERE r.user_id = p_user_id
     AND r.created_at >= v_paid_at
     AND r.status NOT IN ('cancelled', 'failed', 'recovered');

  SELECT count(*)
    INTO v_calls
    FROM public.ai_audit_log a
   WHERE a.user_id = p_user_id
     AND a.created_at >= v_paid_at
     AND a.purpose IN (
       'reasoning_connect', 'persona_synthesis', 'northstar_propose',
       'axis_estimate', 'self_model_propose', 'persona_narrative',
       'gap_synthesize', 'advisor', 'digest_weekly', 'imagine',
       'journal_reflect', 'knowledge_lookup'
     );

  v_used := CASE WHEN v_runs > 0 THEN v_runs ELSE v_calls END;

  IF v_age_days > c_window_days THEN
    v_status := 'window_passed';
  ELSIF v_used > v_allowance THEN
    v_status := 'used_beyond_free';
  ELSE
    v_status := 'eligible';
  END IF;

  RETURN jsonb_build_object(
    'status',              v_status,
    'tier',                v_tier,
    'policy',              'revised',
    'usage_gate_applies',  true,
    'paid_at',             v_paid_at,
    'transaction_id',      v_txn.paddle_transaction_id,
    'has_subscription',    v_sub_id IS NOT NULL,
    'days_since_payment',  round(v_age_days, 2),
    'refund_window_days',  c_window_days,
    'window_expires_at',   v_paid_at + make_interval(days => c_window_days),
    'free_runs_per_week',  c_free_per_week,
    'weeks_elapsed',       v_weeks,
    'free_allowance',      v_allowance,
    'reasoning_runs_used', v_runs,
    'reasoning_calls_logged', v_calls,
    'counted_usage',       v_used,
    'counted_from',        CASE WHEN v_runs > 0 THEN 'reasoning_runs' ELSE 'ai_audit_log' END
  );
END;
$$;

----------------------------------------------------------------------
-- 3. apply_billing_refund back to 0118
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_billing_refund(
  p_event_id       text,
  p_event_type     text,
  p_adjustment_id  text,
  p_transaction_id text,
  p_subscription_id text,
  p_occurred_at    timestamptz,
  p_amount_cents   integer,
  p_currency       text,
  p_is_full        boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows    int;
  v_at      timestamptz := COALESCE(p_occurred_at, now());
  v_txn_id  text := NULLIF(btrim(p_transaction_id), '');
  v_sub_id  text := NULLIF(btrim(p_subscription_id), '');
  v_user_id uuid;
  v_full    boolean := COALESCE(p_is_full, false);
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;

  IF v_txn_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_transaction_id = v_txn_id AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC LIMIT 1;
  END IF;
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_subscription_id = v_sub_id AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC LIMIT 1;
  END IF;

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id,
    paddle_subscription_id, paddle_transaction_id, occurred_at
  )
  VALUES (
    p_event_id, COALESCE(p_event_type, 'adjustment'), v_user_id,
    v_sub_id, v_txn_id, p_occurred_at
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  IF v_txn_id IS NOT NULL THEN
    UPDATE public.billing_self_service_log
       SET provider_refunded_at  = v_at,
           provider_refund_cents = p_amount_cents,
           updated_at            = now()
     WHERE action = 'refund_request'
       AND outcome = 'accepted'
       AND paddle_transaction_id = v_txn_id
       AND provider_refunded_at IS NULL;
    IF FOUND THEN
      v_full := true;
    END IF;
  END IF;

  IF p_amount_cents IS NOT NULL AND p_amount_cents <> 0 THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (v_user_id, -abs(p_amount_cents), COALESCE(p_currency, 'USD'), v_at,
       false, 'arms_length', 'paddle', p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_full AND v_user_id IS NOT NULL THEN
    UPDATE public.users
       SET subscription_tier       = 'free',
           subscription_expires_at = NULL,
           subscription_event_at   = v_at
     WHERE id = v_user_id
       AND (subscription_event_at IS NULL OR v_at >= subscription_event_at);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      UPDATE public.paddle_webhook_events
         SET stale_entitlement = true
       WHERE event_id = p_event_id;
    END IF;
    RETURN 'revoked';
  END IF;

  RETURN 'recorded';
END;
$$;

COMMIT;
