-- 0122_revised_refund_rule_applies_now.sql
-- The revised refund rule applies NOW, to everyone. Simon, 2026-08-11.
--
-- 0120 dated the rule: 30 days no-questions-asked until 2026-09-08, then 7 days
-- plus the free-plan usage test. That was built so nobody would be judged by a
-- standard the published policy did not yet impose. Simon has decided the
-- revised rule is simply the rule, effective immediately.
--
-- ONE RULE, ALWAYS:
--   refundable  = within 7 days of the payment
--                 AND reasoning usage since that payment stayed inside what the
--                     free plan allows over the same span (2 per week)
--
-- WHAT THIS TRADES AWAY, STATED PLAINLY because it is a real cost and the
-- decision was taken with it on the table: the previous policy (published
-- 2026-07-17) promised 30 days with no questions asked. Narrowing it is a change
-- unfavourable to the user, and 이용약관 제3조② asks for 30 days' notice of such a
-- change. The notice was re-issued 2026-08-09, so applying the new rule today
-- gives two days, not thirty. Every surface therefore stops claiming a 30-day
-- notice period, because we did not give one. What the documents say and what
-- this function does now agree, which is the property that actually matters if
-- anyone disputes a refusal.
--
-- The `policy` and `usage_gate_applies` fields stay in the payload rather than
-- being deleted: the client already renders them, and keeping the shape means a
-- future dated change is a constant edit rather than a contract change. They are
-- now always 'revised' / true.
--
-- Everything else is carried forward untouched: the refund_already_requested
-- guard (#1203), the run meter that counts every real run and excludes only the
-- three states 0092 refunds (0117/0119), the shared transaction-id requirement,
-- and the NULL p_user_id guard.
--
-- Idempotent, forward-only. Safe to re-apply.

CREATE OR REPLACE FUNCTION public.refund_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- One window, one rule. Mirrors REFUND_WINDOW_DAYS in
  -- src/lib/billing/subscription-manage.ts and "7일" in docs/legal/refund-policy.md.
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

  -- The transaction id is required: it is what the Paddle adjustment targets and
  -- what claim_billing_self_service selects on, so requiring it in both places is
  -- what stops the verdict describing payment A while the refund hits payment B.
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
  -- The window is one allowance period, so this is always 1 and the allowance is
  -- always 2. The arithmetic stays general so widening the window later cannot
  -- silently turn into a flat cap.
  v_weeks     := GREATEST(1, CEIL(v_age_days / 7.0))::int;
  v_allowance := c_free_per_week * v_weeks;

  -- Every run that happened and was not given back. NO spend filter (spend='none'
  -- is how 0092 marks an UNLIMITED-tier run), and all three states 0092 refunds
  -- are excluded.
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

REVOKE ALL     ON FUNCTION public.refund_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_eligibility(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO service_role;
