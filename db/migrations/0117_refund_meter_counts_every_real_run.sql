-- 0117_refund_meter_counts_every_real_run.sql
-- refund_eligibility() counted the wrong set of reasoning runs, in BOTH
-- directions. Found by an adversarial audit of 0115 (2026-08-10), before the
-- feature was ever enabled in production.
--
-- The filter shipped in 0115 was:
--     AND r.spend <> 'none'
--     AND r.status <> 'cancelled'
--
-- DEFECT 1 (undercount, hits the most expensive tier). 0092 sets spend='none'
-- for EVERY run on an unlimited tier: reserve_reasoning_run derives v_cap from
-- effective_subscription_tier and takes `IF v_cap IS NULL THEN v_spend := 'none'`
-- (0092:220-221), and brain is the NULL-cap arm (0092:214). So `spend <> 'none'`
-- excluded 100% of 북극성 / North Star runs, and judge-comp accounts with them
-- (0088 comps judges to 'brain'). v_runs was therefore ALWAYS 0 for the
-- ₩19,900 tier, which silently routed every one of those users to the
-- ai_audit_log fallback -- a meter the published policy never mentions. The
-- 'none' exclusion was written to mean "did not touch the weekly allowance",
-- but that is the wrong question here: the refund test asks how much the user
-- CONSUMED versus what the free plan would have given them over the same span,
-- and an unlimited-tier run is consumption by any reading.
--
-- DEFECT 2 (overcount, denies refunds that are owed). 'cancelled' is not the
-- only status whose spend is given back. 0092 calls refund_reasoning_spend()
-- for THREE terminal states: fail_reasoning_run (0092:383,389),
-- cancel_reasoning_run (0092:407,413) and the stale sweeper's 'recovered'
-- (0092:436,441). A run that failed or was swept never cost the user anything,
-- yet it counted against their refund. Two failed runs alone crossed the free
-- allowance of 2 and produced 'used_beyond_free' for a user who consumed
-- nothing.
--
-- The corrected rule is one line and states the question directly: count every
-- run that actually happened and was not given back.
--
-- ALSO FIXED HERE (same function, same audit): refund_eligibility and
-- claim_billing_self_service selected the payment by different predicates --
-- eligibility took the newest transaction.completed with no other condition,
-- while claim took the newest one WHERE paddle_transaction_id IS NOT NULL.
-- Any row written before 0115 added that column has a NULL transaction id (the
-- first real live purchase was 2026-08-08, one day before 0115), so the verdict
-- could be computed against payment A while the refund was submitted against
-- payment B. Both now require a non-NULL transaction id, so the row the verdict
-- describes is exactly the row the adjustment would target. A user whose only
-- payment predates the column now correctly gets 'no_payment' and the support
-- path, instead of a verdict about a transaction that cannot be refunded.
--
-- Nothing else in 0115 changes. Idempotent, forward-only. Safe to re-apply.

CREATE OR REPLACE FUNCTION public.refund_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Policy constants. c_window_days matches docs/legal/refund-policy.md;
  -- c_free_per_week mirrors tier-map.ts REASONING_PER_WEEK.free (2).
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
  -- Ownership guard. service_role (the edge function) is exempt: it has no
  -- auth.uid() and is the caller that enforces the verdict.
  v_is_owner := (public.billing_request_role() = 'service_role');
  IF NOT v_is_owner THEN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_tier := public.effective_subscription_tier(p_user_id);

  -- The payment the refund would reverse. The transaction id is REQUIRED here
  -- (0117): it is what the Paddle adjustment targets, and claim_billing_self_service
  -- selects on the same condition, so the two can never describe different rows.
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
      'status',            'no_payment',
      'tier',              v_tier,
      'refund_window_days', c_window_days,
      'free_runs_per_week', c_free_per_week
    );
  END IF;

  v_paid_at := v_txn.paid_at;

  -- Subscription id for the cancel path: prefer the one carried on the
  -- transaction, else the newest subscription event for this user.
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

  -- Free-plan equivalent allowance over the SAME span, pro-rated by whole or
  -- partial ISO weeks (a 1-day-old payment still gets a full week's 2).
  v_weeks     := GREATEST(1, CEIL(v_age_days / 7.0))::int;
  v_allowance := c_free_per_week * v_weeks;

  -- Primary meter: every reasoning run that actually happened and was not given
  -- back. NO spend filter (0117 defect 1: spend='none' is how 0092 marks an
  -- UNLIMITED-tier run, not a free one), and all three refunded terminal states
  -- are excluded (0117 defect 2: 0092 refunds the spend for failed, cancelled
  -- AND recovered).
  SELECT count(*)
    INTO v_runs
    FROM public.reasoning_runs r
   WHERE r.user_id = p_user_id
     AND r.created_at >= v_paid_at
     AND r.status NOT IN ('cancelled', 'failed', 'recovered');

  -- Evidence meter (C3): reasoning-purpose LLM calls. The legacy labels are
  -- included because rows written between #1061 and #1069 carry them for what
  -- is now reasoning_connect (docs/LLM-ROUTING.md audit-continuity table).
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

  -- Fallback only: with an empty run ledger the audit rows are the only
  -- evidence of consumption, and ignoring them would hand out a free refund to
  -- any path that logged calls without reserving a run.
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

-- CREATE OR REPLACE keeps the existing ACL, but check:definer-grants requires
-- the FROM anon revoke in the same file as any SECURITY DEFINER create, and
-- re-asserting the full triplet is cheap and idempotent.
REVOKE ALL     ON FUNCTION public.refund_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_eligibility(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO service_role;

-- Same three-valued-logic hole on the sibling RPC: `auth.uid() <> p_user_id`
-- evaluates to NULL when p_user_id is NULL, and `false OR NULL` is not TRUE, so
-- the guard did not raise. It returned a row for p_user_id = NULL rather than
-- another user's row, so nothing leaked, but a guard that does not fire is not
-- a guard. Explicit NULL check added.
CREATE OR REPLACE FUNCTION public.subscription_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_service boolean;
  v_user       record;
  v_pay        record;
  v_sub_id     text;
  v_sched      timestamptz;
  v_req        timestamptz;
  v_tier       text;
  v_auto       boolean;
BEGIN
  v_is_service := (public.billing_request_role() = 'service_role');
  IF NOT v_is_service THEN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT u.subscription_tier, u.subscription_expires_at, u.subscription_provider, u.judge_mode
    INTO v_user
    FROM public.users u
   WHERE u.id = p_user_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unknown user %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  SELECT e.payment_method, e.payment_card_brand, e.payment_card_last4,
         COALESCE(e.occurred_at, e.processed_at) AS paid_at
    INTO v_pay
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type = 'transaction.completed'
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  SELECT e.paddle_subscription_id
    INTO v_sub_id
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.paddle_subscription_id IS NOT NULL
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  -- LATEST subscription event only: Paddle clears scheduled_change back to null
  -- when a cancellation is reversed, so max(scheduled_cancel_at) would keep
  -- reporting a cancel that no longer exists.
  SELECT e.scheduled_cancel_at
    INTO v_sched
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type LIKE 'subscription.%'
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  -- 0117: scope our own cancel signal to the SUBSCRIPTION it cancelled, not just
  -- to the user. Before this, one accepted cancel pinned auto_renew=false
  -- forever: a user who resumed that subscription, or who cancelled and later
  -- re-subscribed under a NEW subscription id, kept being told "auto-renewal is
  -- off" while Paddle charged them every month, and the cancel card was hidden
  -- because the screen keys it off renewal === 'auto_renew'. Paddle's own signal
  -- (v_sched) already clears correctly on a reversal; ours has to as well.
  SELECT l.created_at
    INTO v_req
    FROM public.billing_self_service_log l
   WHERE l.user_id = p_user_id
     AND l.action = 'cancel'
     AND l.outcome = 'accepted'
     AND v_sub_id IS NOT NULL
     AND l.paddle_subscription_id = v_sub_id
   ORDER BY l.created_at DESC
   LIMIT 1;

  v_tier := public.effective_subscription_tier(p_user_id);
  -- Only a paying subscription can auto-renew, and only while neither signal
  -- says a cancellation is on the books. A tier with no Paddle subscription at
  -- all (judge comp, manual grant, retired soma) cannot auto-renew either:
  -- claiming an upcoming charge that is not coming is the one wrong answer here.
  v_auto := v_tier <> 'free' AND v_sub_id IS NOT NULL AND v_sched IS NULL AND v_req IS NULL;

  RETURN jsonb_build_object(
    'tier',                v_tier,
    'stored_tier',         COALESCE(v_user.subscription_tier, 'free'),
    'judge_comp',          COALESCE(v_user.judge_mode, false),
    'renews_at',           v_user.subscription_expires_at,
    'provider',            v_user.subscription_provider,
    'last_paid_at',        v_pay.paid_at,
    'payment_method',      v_pay.payment_method,
    'card_brand',          v_pay.payment_card_brand,
    'card_last4',          v_pay.payment_card_last4,
    'can_self_cancel',     v_sub_id IS NOT NULL,
    'auto_renew',          v_auto,
    'cancel_scheduled_at', v_sched,
    'cancel_requested_at', v_req
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.subscription_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.subscription_overview(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.subscription_overview(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.subscription_overview(uuid) TO service_role;
