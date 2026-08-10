-- 0120_refund_policy_effective_dating.sql
-- Self-serve refund now WORKS today, under the policy that is actually in force.
--
-- What 0117-0119 shipped was a gate, not a rule: the client hid the verdict and
-- the edge function refused every refund_request until 2026-09-08. That kept us
-- from showing a stricter standard than the one binding us, which was the right
-- concern, but it solved it by turning the feature off. A user who paid
-- yesterday and is owed a no-questions-asked refund under the CURRENT policy was
-- told to email support by a screen that could have refunded them.
--
-- The correct shape is effective-dating, not gating. The server applies the
-- policy in force AT THE MOMENT OF THE REQUEST:
--
--   before 2026-09-08 KST   the policy published 2026-07-17: 30 days, no
--                           questions asked. No usage condition. Anything
--                           inside the window is eligible, full stop.
--   from  2026-09-08 KST    the revision announced 2026-08-09: 7 days AND usage
--                           must have stayed inside the free-plan allowance.
--
-- Nobody is ever judged by a rule that does not bind us, and nobody is refused a
-- refund they are owed. The transition needs no deploy and no flag: it is a
-- timestamp comparison, so the rule changes by itself at the announced instant.
--
-- Adding a self-serve PATH to the pre-revision policy is not an adverse change
-- (이용약관 제3조② only governs changes unfavourable to the user), so it needs no
-- separate notice period. The 30-day notice already given covers the tightening
-- that arrives on 09-08.
--
-- Two new fields travel with the verdict so the UI and the ledger can both say
-- WHICH rule produced it:
--   policy              'pre_revision' | 'revised'
--   usage_gate_applies  false before the revision, true after
--
-- 'used_beyond_free' is unreachable while policy = 'pre_revision'. That is the
-- point, not an omission.
--
-- Everything else from 0117/0119 is preserved verbatim: the refund_already_requested
-- guard, the run meter that counts every real run (no spend filter, all three
-- refunded states excluded), the shared transaction-id requirement, and the NULL
-- p_user_id guard.
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
  -- The revision's effective instant, KST, matching the header of
  -- docs/legal/refund-policy.md ("개정 시행일: 2026-09-08") and the TS mirror
  -- REFUND_POLICY_EFFECTIVE_AT in src/lib/billing/subscription-manage.ts.
  c_effective_at  constant timestamptz := timestamptz '2026-09-08 00:00:00+09';
  -- Pre-revision policy (published 2026-07-17): 30 days, no questions asked.
  c_prev_window   constant int := 30;
  -- Revised policy (announced 2026-08-09): 7 days + the free-plan usage test.
  c_new_window    constant int := 7;
  c_free_per_week constant int := 2;

  v_revised        boolean;
  v_window_days    int;
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

  -- The rule is chosen by the clock, not by a flag, so the changeover needs no
  -- deploy and cannot be forgotten.
  v_revised     := now() >= c_effective_at;
  v_window_days := CASE WHEN v_revised THEN c_new_window ELSE c_prev_window END;

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
      'policy',             CASE WHEN v_revised THEN 'revised' ELSE 'pre_revision' END,
      'usage_gate_applies', v_revised,
      'refund_window_days', v_window_days,
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
      'policy',             CASE WHEN v_revised THEN 'revised' ELSE 'pre_revision' END,
      'usage_gate_applies', v_revised,
      'paid_at',            v_txn.paid_at,
      'transaction_id',     v_txn.paddle_transaction_id,
      'refund_window_days', v_window_days,
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

  -- Usage is ALWAYS measured and ALWAYS returned, even when it cannot refuse a
  -- refund. The numbers are what the screen shows, and a user who can see what
  -- the rule will be from 09-08 is better served than one who is surprised by it.
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

  IF v_age_days > v_window_days THEN
    v_status := 'window_passed';
  ELSIF v_revised AND v_used > v_allowance THEN
    -- Only the revised policy has a usage condition. Before 09-08 the published
    -- promise is "사유를 묻지 않으며" and this arm must stay unreachable.
    v_status := 'used_beyond_free';
  ELSE
    v_status := 'eligible';
  END IF;

  RETURN jsonb_build_object(
    'status',              v_status,
    'tier',                v_tier,
    'policy',              CASE WHEN v_revised THEN 'revised' ELSE 'pre_revision' END,
    'usage_gate_applies',  v_revised,
    'paid_at',             v_paid_at,
    'transaction_id',      v_txn.paddle_transaction_id,
    'has_subscription',    v_sub_id IS NOT NULL,
    'days_since_payment',  round(v_age_days, 2),
    'refund_window_days',  v_window_days,
    'window_expires_at',   v_paid_at + make_interval(days => v_window_days),
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
