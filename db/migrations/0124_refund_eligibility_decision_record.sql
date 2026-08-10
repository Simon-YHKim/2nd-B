-- 0124_refund_eligibility_decision_record.sql
-- COMMENTS ONLY. No behaviour change, deliberately.
--
-- The executable body below is a VERBATIM copy of the deployed prosrc as read
-- from production on 2026-08-11. Every constant, branch and returned field is
-- byte-identical: c_window_days = 7, c_free_per_week = 2, policy = 'revised' on
-- all three return paths, usage_gate_applies = true. Nothing is added, removed
-- or reordered. The only additions in this file are the comment block inside the
-- function and the COMMENT ON below it.
--
-- WHY A COMMENT NEEDS ITS OWN MIGRATION, AND WHY IT IS NOT ONLY A `--` BLOCK.
-- Measured on prod 2026-08-11: all seven billing functions (refund_eligibility,
-- apply_billing_refund, claim_billing_self_service, billing_request_role,
-- sweep_stale_billing_claims, record_unhandled_billing_event,
-- purge_unhandled_billing_payloads) have ZERO line comments in pg_proc.prosrc,
-- while every one of their source files is heavily commented. The apply path
-- strips them. So a `--` header alone would document this decision everywhere
-- EXCEPT the place someone reading the live function would look. The durable
-- record is therefore the COMMENT ON FUNCTION, whose text is a string literal
-- and cannot be stripped. The `--` block is kept as well, for readers of the
-- repo. Two copies on purpose.
--
-- ============================================================================
-- THE DECISION
-- ============================================================================
-- On 2026-08-11 Simon chose to KEEP the current behaviour. The facts below were
-- all on the table when that choice was made. This is a recorded decision, not
-- something left unattended because nobody noticed. That distinction is the
-- entire reason this file exists.
--
-- 1. THE NOTICE HISTORY. The grace clause existed first and was lost between two
--    re-issues. From public.notices:
--
--      a3d822d5  published 2026-08-09 20:26 KST
--                "환불 정책 개정 안내 (2026년 9월 8일 시행)"
--                CONTAINED the sentence applying the previous 30-day standard to
--                payments made before the effective date.
--                withdrawn 2026-08-09 21:01 KST
--      22eedef0  published 2026-08-09 21:01 KST, same title, 9월 8일 시행
--                grace sentence ABSENT
--                withdrawn 2026-08-11 02:06 KST
--      d3ff81e6  published 2026-08-11 02:06 KST
--                "환불 정책 개정 안내 (2026년 8월 11일 시행)"   <- currently live
--                grace sentence absent; the word "시행" does not appear in the body
--
--    The grace provision was not merely never written. It was written, published,
--    and then dropped in a re-issue. Anyone auditing this later should know it
--    was lost rather than declined.
--
-- 2. THE NOTICE PERIOD. The live notice d3ff81e6 was published 2026-08-11 02:06
--    KST and states an effective date of 2026-08-11. Advance notice: ZERO days.
--
-- 3. THE CONFLICT WITH OUR OWN TERMS. docs/legal/terms-of-service.md line 17,
--    제3조 (약관의 효력 및 변경) ②, promises: "이용자에게 불리한 변경은 30일 전
--    공지합니다." Narrowing 30 days unconditional to 7 days plus a usage test is
--    a change unfavourable to the user. Zero days of notice does not meet that
--    clause. The terms text is NOT edited to match; it stays as written.
--
-- 4. THE SUBSTANCE IS DEFENSIBLE, AND ONLY THE PROCEDURE IS NOT. 전자상거래법
--    제17조제1항 sets the statutory withdrawal period at 7 days, and 제17조제2항
--    제5호 makes digital content whose provision has begun a permitted
--    restriction. The revised rule is therefore no worse than the statutory
--    floor; the previous 30-day unconditional promise was more generous than the
--    law required. The exposure is the notice procedure, one item, and nothing
--    about the content of the rule. Do not let those two blur together when
--    re-reading this.
--
-- 5. WHAT THE CODE ACTUALLY DOES. There is no effective-date comparison and no
--    grace branch anywhere in this function. c_window_days is a constant 7,
--    'revised' is hard-coded on every return path, usage_gate_applies is always
--    true. The revised rule applies to every payment regardless of when it was
--    made. The code and the published policy agree; it is the notice period that
--    does not.
--
-- 6. CURRENT EXPOSURE, AND WHY IT IS LUCK. One real payment exists in
--    production, 2026-08-08 09:24 KST. All four paddle_webhook_events rows
--    predate 0115 and so have paddle_transaction_id = NULL. This function selects
--    only rows WHERE paddle_transaction_id IS NOT NULL, so that user resolves to
--    'no_payment' and is routed to human support instead of the self-serve path.
--    Nobody is currently harmed. That is an ACCIDENT of when the id capture
--    shipped, not a designed safeguard. From paddle-webhook v15 onward the
--    transaction id is captured normally, and from that point the rule applies
--    exactly as written above.
--
-- ============================================================================
-- WHEN TO RE-OPEN THIS
-- ============================================================================
-- The moment the first transaction.completed row exists WITH a non-null
-- transaction id, this judgement must be revisited: that is when the ungraced
-- revised rule starts reaching real users through the self-serve path.
--
--   select count(*) from public.paddle_webhook_events
--    where event_type = 'transaction.completed' and paddle_transaction_id is not null;
--
-- Non-zero means re-open. See also: docs/legal/refund-policy.md ("개정 경위"),
-- supabase/functions/subscription-manage/index.ts (header), and 0122 for the
-- change this records.
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

-- The durable copy. Survives the comment stripping described in the header,
-- because it is a string constant rather than a comment token. Read it with:
--   select obj_description('public.refund_eligibility(uuid)'::regprocedure, 'pg_proc');
COMMENT ON FUNCTION public.refund_eligibility(uuid) IS
$c$RECORDED DECISION, Simon, 2026-08-11: keep this behaviour as is.

WHAT THIS FUNCTION DOES: applies the revised refund rule (7 days AND usage since
payment within the free-plan allowance) to EVERY payment. There is no
effective-date comparison and no grace branch. c_window_days = 7,
policy = 'revised' and usage_gate_applies = true on every return path.

WHY THAT IS WORTH A NOTE. The previous policy promised 30 days unconditionally.
Narrowing it is a change unfavourable to the user, and 이용약관 제3조② promises
"이용자에게 불리한 변경은 30일 전 공지". The live notice (public.notices d3ff81e6)
was published 2026-08-11 02:06 KST for an effective date of 2026-08-11: zero days
of advance notice. An earlier notice a3d822d5 (published 2026-08-09 20:26 KST) DID
carry a grace clause preserving the 30-day standard for payments made before the
effective date; it was lost in the re-issues a3d822d5 to 22eedef0 to d3ff81e6, not
consciously dropped.

THE SUBSTANCE IS DEFENSIBLE; ONLY THE PROCEDURE IS EXPOSED. 전자상거래법 제17조
제1항 sets the statutory withdrawal period at 7 days and 제17조제2항제5호 permits
restricting it for digital content already provided, so the revised rule is not
below the statutory floor. The old 30-day promise was more generous than required.
The single open item is the notice period, not the rule.

CURRENT EXPOSURE IS ZERO BY ACCIDENT, NOT BY DESIGN. One real payment exists
(2026-08-08 09:24 KST) but all pre-0115 webhook rows have paddle_transaction_id
NULL, and this function requires that id, so that user falls through to
'no_payment' and reaches human support instead. From paddle-webhook v15 onward the
id is captured normally.

RE-OPEN THIS JUDGEMENT when the first transaction.completed row with a non-null
transaction id appears, because that is when the ungraced rule starts reaching
real users:
  select count(*) from public.paddle_webhook_events
   where event_type = 'transaction.completed' and paddle_transaction_id is not null;

See docs/legal/refund-policy.md section "개정 경위", db/migrations/0124, and
supabase/functions/subscription-manage/index.ts.$c$;

REVOKE ALL     ON FUNCTION public.refund_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_eligibility(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO service_role;
