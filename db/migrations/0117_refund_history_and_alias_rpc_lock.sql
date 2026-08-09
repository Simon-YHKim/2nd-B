-- 0117: close two billing/security gaps without changing entitlement writes.
--
-- (1) refund_eligibility() used only the newest transaction.completed row, so
-- an already pending or accepted refund could still be shown as eligible.
-- Preserve the complete 0115 verdict and add one early history check.
--
-- (2) Paddle adjustment webhooks need a service-role-only fact recorder. It
-- updates the self-service ledger, deduplicates both event and adjustment ids,
-- and orders status updates by Paddle's occurred_at. It never writes a tier.
--
-- (3) block_alias_duplicate_signup() is trigger-only but retained default RPC
-- EXECUTE privileges. Remove that surface, then assert that its auth.users
-- trigger dependency still exists and is enabled.

----------------------------------------------------------------------
-- 1. Paddle refund-adjustment facts on the self-service ledger
----------------------------------------------------------------------

ALTER TABLE public.billing_self_service_log
  ADD COLUMN IF NOT EXISTS paddle_adjustment_id       text,
  ADD COLUMN IF NOT EXISTS paddle_adjustment_status   text,
  ADD COLUMN IF NOT EXISTS paddle_adjustment_event_id text,
  ADD COLUMN IF NOT EXISTS paddle_adjustment_event_at timestamptz;

COMMENT ON COLUMN public.billing_self_service_log.paddle_adjustment_id IS
  'Paddle adj_... id for the refund fact. One ledger row follows one adjustment across created/updated deliveries.';
COMMENT ON COLUMN public.billing_self_service_log.paddle_adjustment_status IS
  'Latest ordered Paddle refund adjustment status: pending_approval, approved, rejected, or reversed.';
COMMENT ON COLUMN public.billing_self_service_log.paddle_adjustment_event_id IS
  'Paddle event id that produced paddle_adjustment_status. Full replay history remains in paddle_webhook_events.';
COMMENT ON COLUMN public.billing_self_service_log.paddle_adjustment_event_at IS
  'Paddle occurred_at for the latest applied adjustment event. Older deliveries are recorded but cannot regress status.';

CREATE UNIQUE INDEX IF NOT EXISTS billing_self_service_adjustment_uidx
  ON public.billing_self_service_log (paddle_adjustment_id)
  WHERE paddle_adjustment_id IS NOT NULL;

----------------------------------------------------------------------
-- 2. refund_eligibility(): preserve 0115 and add the refund-history guard
----------------------------------------------------------------------

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
  --
  -- The window is 7 days (Simon, 2026-08-09), not 30. That is deliberately the
  -- statutory floor of 전자상거래법 제17조① (7일 청약철회권): the guarantee now
  -- matches the right the law grants rather than exceeding it, and one week is
  -- also exactly one free-plan allowance period, so v_weeks below is always 1
  -- and the verdict never depends on how long the user waited to ask.
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
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_tier := public.effective_subscription_tier(p_user_id);

  -- The payment the refund would reverse: the most recent completed Paddle
  -- transaction. occurred_at is the Paddle event time; processed_at is only a
  -- fallback for rows written before 0115 added the column.
  SELECT e.paddle_transaction_id,
         e.paddle_subscription_id,
         COALESCE(e.occurred_at, e.processed_at) AS paid_at
    INTO v_txn
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type = 'transaction.completed'
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

  -- 0117 refund history guard begin
  IF EXISTS (
    SELECT 1
      FROM public.billing_self_service_log l
     WHERE l.user_id = p_user_id
       AND l.action = 'refund_request'
       AND l.outcome IN ('pending', 'accepted')
       AND l.paddle_transaction_id IS NOT DISTINCT FROM v_txn.paddle_transaction_id
  ) THEN
    v_status := 'refund_already_requested';
    RETURN jsonb_build_object(
      'status',             v_status,
      'tier',               v_tier,
      'paid_at',            v_txn.paid_at,
      'transaction_id',     v_txn.paddle_transaction_id,
      'refund_window_days', c_window_days,
      'free_runs_per_week', c_free_per_week
    );
  END IF;
  -- 0117 refund history guard end

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

  -- Primary meter: billable reasoning runs. 'none' spend never touched the
  -- allowance (judge comp / unlimited tier), and a cancelled run is refunded
  -- back into the counter by 0092, so neither counts as consumption.
  SELECT count(*)
    INTO v_runs
    FROM public.reasoning_runs r
   WHERE r.user_id = p_user_id
     AND r.created_at >= v_paid_at
     AND r.spend <> 'none'
     AND r.status <> 'cancelled';

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

REVOKE ALL     ON FUNCTION public.refund_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_eligibility(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO service_role;

----------------------------------------------------------------------
-- 3. Service-role-only adjustment recorder
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_paddle_refund_adjustment(
  p_event_id text,
  p_event_type text,
  p_adjustment_id text,
  p_transaction_id text,
  p_status text,
  p_occurred_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id             text := NULLIF(btrim(p_event_id), '');
  v_event_type           text := lower(NULLIF(btrim(p_event_type), ''));
  v_adjustment_id        text := NULLIF(btrim(p_adjustment_id), '');
  v_transaction_id       text := NULLIF(btrim(p_transaction_id), '');
  v_status               text := lower(NULLIF(btrim(p_status), ''));
  v_occurred_at          timestamptz := p_occurred_at;
  v_outcome              text;
  v_log_id               uuid;
  v_user_id              uuid;
  v_current_status       text;
  v_current_event_at     timestamptz;
  v_rows                 int;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;
  IF v_event_type IS NULL OR v_event_type NOT IN ('adjustment.created', 'adjustment.updated') THEN
    RAISE EXCEPTION 'p_event_type must be adjustment.created or adjustment.updated'
      USING ERRCODE = '22023';
  END IF;
  IF v_adjustment_id IS NULL THEN
    RAISE EXCEPTION 'adjustment_id required' USING ERRCODE = '22004';
  END IF;
  IF v_transaction_id IS NULL THEN
    RAISE EXCEPTION 'transaction_id required' USING ERRCODE = '22004';
  END IF;
  IF v_occurred_at IS NULL THEN
    RAISE EXCEPTION 'occurred_at required' USING ERRCODE = '22004';
  END IF;

  v_outcome := CASE v_status
    WHEN 'pending_approval' THEN 'pending'
    WHEN 'approved' THEN 'accepted'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'reversed' THEN 'rejected'
    ELSE NULL
  END;
  IF v_outcome IS NULL THEN
    RAISE EXCEPTION 'p_status must be pending_approval, approved, rejected, or reversed'
      USING ERRCODE = '22023';
  END IF;

  -- An adjustment id owns one ledger row across created/updated deliveries.
  SELECT l.id, l.user_id, l.paddle_adjustment_status, l.paddle_adjustment_event_at
    INTO v_log_id, v_user_id, v_current_status, v_current_event_at
    FROM public.billing_self_service_log l
   WHERE l.paddle_adjustment_id = v_adjustment_id
   LIMIT 1
   FOR UPDATE;

  -- First delivery for this adjustment: attach it to the existing self-service
  -- claim for the same transaction. A row already linked to another adjustment
  -- represents another attempt and is not overwritten.
  IF v_log_id IS NULL THEN
    SELECT l.id, l.user_id, l.paddle_adjustment_status, l.paddle_adjustment_event_at
      INTO v_log_id, v_user_id, v_current_status, v_current_event_at
      FROM public.billing_self_service_log l
     WHERE l.action = 'refund_request'
       AND l.paddle_transaction_id = v_transaction_id
       AND l.paddle_adjustment_id IS NULL
     ORDER BY CASE WHEN l.outcome IN ('pending', 'accepted') THEN 0 ELSE 1 END,
              l.created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  -- Provider-originated adjustment with no self-service row: recover the owner
  -- only from the completed transaction ledger. If it is not available, raise
  -- so the webhook retries after its transaction event arrives.
  IF v_log_id IS NULL THEN
    SELECT e.user_id
      INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.event_type = 'transaction.completed'
       AND e.paddle_transaction_id = v_transaction_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'refund adjustment owner not found for transaction %', v_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Event-id replay guard. This write and the ledger update are one transaction,
  -- so any later error rolls this claim back and lets Paddle retry safely.
  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id, paddle_transaction_id, occurred_at
  ) VALUES (
    v_event_id, v_event_type, v_user_id, v_transaction_id, v_occurred_at
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  IF v_log_id IS NOT NULL THEN
    -- Paddle retries out of order. An older pending_approval must not overwrite
    -- a later approved/rejected/reversed fact. The terminal check also handles
    -- equal timestamps defensively.
    IF (v_current_event_at IS NOT NULL AND v_occurred_at < v_current_event_at)
       OR (v_current_status IN ('approved', 'rejected', 'reversed')
           AND v_status = 'pending_approval') THEN
      RETURN 'stale';
    END IF;

    UPDATE public.billing_self_service_log
       SET outcome                    = v_outcome,
           paddle_adjustment_id       = v_adjustment_id,
           paddle_adjustment_status   = v_status,
           paddle_adjustment_event_id = v_event_id,
           paddle_adjustment_event_at = v_occurred_at,
           provider_ref               = v_adjustment_id,
           provider_error             = NULL,
           updated_at                 = now()
     WHERE id = v_log_id;
  ELSE
    INSERT INTO public.billing_self_service_log (
      user_id, action, outcome, paddle_transaction_id,
      paddle_adjustment_id, paddle_adjustment_status,
      paddle_adjustment_event_id, paddle_adjustment_event_at,
      eligibility, eligibility_detail, provider_ref
    ) VALUES (
      v_user_id, 'refund_request', v_outcome, v_transaction_id,
      v_adjustment_id, v_status,
      v_event_id, v_occurred_at,
      'refund_already_requested',
      jsonb_build_object('source', 'paddle_adjustment', 'status', v_status),
      v_adjustment_id
    );
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.record_paddle_refund_adjustment(text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_paddle_refund_adjustment(text, text, text, text, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paddle_refund_adjustment(text, text, text, text, text, timestamptz) TO service_role;

----------------------------------------------------------------------
-- 4. Remove the trigger-only alias guard from the PostgREST RPC surface
----------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.block_alias_duplicate_signup() FROM PUBLIC, anon, authenticated;

-- EXECUTE is checked when CREATE TRIGGER binds the function. The trigger keeps
-- its pg_proc dependency after the RPC grants are removed. Fail the migration
-- if that binding is missing or disabled instead of discovering it at signup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
      JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
     WHERE n.nspname = 'auth'
       AND c.relname = 'users'
       AND t.tgname = 'trg_block_alias_duplicate_signup'
       AND NOT t.tgisinternal
       AND t.tgenabled <> 'D'
       AND pn.nspname = 'public'
       AND p.proname = 'block_alias_duplicate_signup'
       AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'alias signup trigger dependency is missing or disabled';
  END IF;
END;
$$;

----------------------------------------------------------------------
-- 5. Bound the retention of the 0107 orphan-profile rollback copy
----------------------------------------------------------------------

-- This table contains two full public.users rows and is already locked to
-- service_role by 0113. Thirty days is an internal maximum rollback window,
-- not a statutory retention period. Remove it sooner if rollback verification
-- finishes sooner; otherwise drop it in a dedicated migration by the deadline.
COMMENT ON TABLE public.users_orphan_backup_0107 IS
  'Reversal data for migration 0107. Restore with: insert into public.users select * from jsonb_populate_record(null::public.users, row_data); Retain for no more than 30 calendar days from the latest backed_up_at, through 2026-09-06 02:48:55.689335 KST. Remove sooner if rollback verification finishes; otherwise permanently delete by the deadline and record the result.';
