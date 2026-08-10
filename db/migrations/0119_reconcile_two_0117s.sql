-- 0119_reconcile_two_0117s.sql
-- Two sessions fixed the same billing rail at the same time and both landed:
-- #1203 (0117_refund_history_and_alias_rpc_lock) and #1205
-- (0117_refund_meter_counts_every_real_run + 0118_billing_refund_reconciliation).
-- Git merged them without a textual conflict, CI was green, and the result is
-- still wrong, because migrations apply in FILENAME ORDER: "refund_history"
-- sorts before "refund_meter", so the second CREATE OR REPLACE silently
-- discarded the first one's addition. Each 0117 carried a fix the other lacked
-- and only one survived.
--
-- WHAT #1203 HAD AND WAS LOST: the refund_already_requested guard. It returns
-- early when a pending/accepted refund already exists for the transaction, so
-- the screen stops offering a button for a request already on file. Its client
-- union member, its five locale strings and its test all shipped, leaving main
-- with a verdict the client renders and the database can no longer produce.
--
-- WHAT #1205 HAD AND #1203 LACKED: the run-meter correction (spend='none' marks
-- an UNLIMITED-tier run, so filtering it out zeroed the meter for every 북극성
-- subscriber; and failed/recovered runs are refunded by 0092, so counting them
-- denied refunds that were owed), the requirement that the verdict and the claim
-- select the SAME transaction, and the NULL p_user_id guard.
--
-- This migration is the union. Nothing new is invented here.
--
-- ALSO FIXED: a bug that exists only in the COMBINATION. #1203 maps Paddle's
-- 'pending_approval' adjustment status onto outcome='pending', and #1205 added
-- sweep_stale_billing_claims() which flips ANY 'pending' row older than 15
-- minutes to provider_error. A refund legitimately awaiting Paddle's approval
-- for an hour would have been swept and recorded as a failure. The sweeper now
-- only reaps claims that never reached a provider at all.
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
  -- #1205: p_user_id IS NULL made `auth.uid() <> p_user_id` evaluate to NULL, and
  -- `false OR NULL` is not TRUE, so the guard did not fire.
  v_is_owner := (public.billing_request_role() = 'service_role');
  IF NOT v_is_owner THEN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_tier := public.effective_subscription_tier(p_user_id);

  -- #1205: the transaction id is REQUIRED. It is what the Paddle adjustment
  -- targets and what claim_billing_self_service selects on, so requiring it in
  -- both places is what stops the verdict describing payment A while the refund
  -- is submitted against payment B.
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

  -- #1203's guard, restored. A request already on file must not be offered
  -- again; the client, its five locale strings and its test all expect this
  -- verdict to be reachable.
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

  -- #1205: every run that happened and was not given back. NO spend filter
  -- (spend='none' is how 0092 marks an UNLIMITED-tier run, so excluding it
  -- zeroed the meter for the whole ₩19,900 tier), and all three states 0092
  -- refunds are excluded (failed, cancelled, recovered).
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

----------------------------------------------------------------------
-- The sweeper must not reap a refund Paddle is still reviewing
----------------------------------------------------------------------

-- #1203 maps Paddle's 'pending_approval' onto outcome='pending'. #1205's sweeper
-- reaps anything 'pending' past the 15-minute provider timeout. Together, a
-- refund legitimately awaiting Paddle's decision for an hour was marked
-- provider_error and dropped out of the idempotency index, which would then let
-- a SECOND refund be submitted for the same transaction.
--
-- The sweeper exists for one narrow case: a claim written before the provider
-- call, whose isolate then died. Such a row has no provider response of any kind
-- on it. Anything that has reached Paddle is not abandoned, however long it sits.
CREATE OR REPLACE FUNCTION public.sweep_stale_billing_claims(p_older_than interval DEFAULT '15 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.billing_self_service_log
     SET outcome        = 'provider_error',
         provider_error = 'stale_claim_swept',
         updated_at     = now()
   WHERE outcome = 'pending'
     AND created_at < now() - p_older_than
     AND provider_ref IS NULL
     AND provider_status IS NULL
     AND paddle_adjustment_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL     ON FUNCTION public.sweep_stale_billing_claims(interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sweep_stale_billing_claims(interval) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sweep_stale_billing_claims(interval) TO service_role;
