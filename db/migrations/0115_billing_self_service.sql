-- 0115_billing_self_service.sql
-- Self-serve subscription management: cancel + usage-gated refund.
--
-- WHY NOW. docs/legal/refund-policy.md KO 3항 / EN §3 already tells users the
-- cancel path is "앱 내 [설정 → 구독 관리]" / "in-app [Settings → Manage
-- subscription]". That screen does not exist, and neither does any server-side
-- rail that could back it: 0087 is a ONE-WAY inbound webhook. It records
-- (event_id, event_type, user_id, processed_at) and nothing else, so nothing in
-- the database can name the Paddle subscription to cancel or the Paddle
-- transaction to refund. This migration adds the missing identifiers, the audit
-- ledger for every self-serve billing action, and the ONE server-side function
-- that decides whether a refund is owed.
--
-- FOUR PARTS
--   1. paddle_webhook_events gains the Paddle object ids + the event time + a
--      payment-method summary. Nullable and additive: existing rows stay valid,
--      and a NULL id is what makes the self-serve action fail closed.
--   2. apply_billing_event() is re-created to persist them. The signature grows,
--      so it is DROPped first (CREATE OR REPLACE cannot add parameters) and all
--      grants are re-issued (a dropped function loses its ACL).
--   3. billing_self_service_log: one row per user-initiated cancel/refund, with
--      the eligibility verdict and evidence frozen at request time, plus the
--      partial unique index that makes a refund request idempotent per Paddle
--      transaction.
--   4. refund_eligibility(uuid): the single source of truth for "is a refund
--      owed", returning the verdict AND the numbers behind it so the UI can
--      show the user exactly why, never a bare "no".
--
-- WHAT COUNTS AS "USED BEYOND FREE" (the one judgement call here, stated plainly
-- because it decides money). The order asked for a count of reasoning-ish calls
-- in ai_audit_log measured against the free weekly cap. Those two are different
-- units: the free cap of 2/week is a cap on RUNS (0089/0092 meter
-- reasoning_runs + usage_counters), while one run emits several ai_audit_log
-- rows (a manual run carries 1..5 items, 0092:184, and /reasoning makes more
-- than one labelled call per run). Comparing calls to a run cap would deny
-- refunds to users who stayed inside the free allowance, so:
--     primary meter  = reasoning_runs since the payment (exact, transactional,
--                      the same ledger the free cap itself spends from)
--     fallback meter = ai_audit_log reasoning-purpose rows, used ONLY when the
--                      run ledger has nothing for the window (so a path that
--                      logged a call without reserving a run cannot buy a free
--                      refund)
-- BOTH numbers are returned either way and both are shown in the UI. C3's
-- ai_audit_log stays the evidence ledger it was designed to be.
--
-- Allowance is pro-rated by week, and the 7-day window means it is always
-- exactly one week's worth (2 runs). The pro-rating arithmetic is kept anyway so
-- widening the window later cannot silently turn into a flat cap.
--
-- The cap number itself mirrors src/lib/entitlements/tier-map.ts
-- REASONING_PER_WEEK.free and is pinned by the structural test in
-- src/lib/billing/__tests__/billing-self-service-migration.test.ts, the same
-- contract 0089 has with that file.
--
-- WHAT THIS MIGRATION INHERITS AND MUST NOT UNDO (0109 + 0112, both shipped
-- after this work started and both landing on exactly the code below):
--   * 0109 made the entitlement write MONOTONIC on subscription_event_at and
--     records a skipped write as paddle_webhook_events.stale_entitlement. That
--     guard is reproduced verbatim in the re-created function. Dropping it would
--     re-open the two live bugs it closed: a retried older updated(active)
--     re-granting a cancelled tier, and a retried older event permanently
--     downgrading an upgraded subscriber.
--   * 0112 found that `request.jwt.claim.role` is NOT set on the current
--     PostgREST stack, which is why the FIRST real live purchase (2026-08-08)
--     500'd. Every service_role check in this file therefore goes through
--     public.billing_request_role() below, never the raw legacy GUC.
--
-- NOTE ON 0087's TEST. src/lib/entitlements/__tests__/paddle-billing-migration.test.ts
-- reads 0087's SQL text only, so it keeps passing while describing the 12-argument
-- apply_billing_event this migration replaces. That is a green test describing a
-- dead shape; the new structural test above pins the LIVE 18-argument signature and
-- says so, and 0087 is left untouched because its own test asserts it verbatim.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- 1. Paddle object identity on the webhook ledger
----------------------------------------------------------------------

-- Every column is nullable with no default: rows written before this migration
-- keep working, and a self-serve action that cannot resolve an id falls back to
-- "contact support" instead of guessing.
ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS paddle_transaction_id  text,
  ADD COLUMN IF NOT EXISTS occurred_at            timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method         text,
  ADD COLUMN IF NOT EXISTS payment_card_brand     text,
  ADD COLUMN IF NOT EXISTS payment_card_last4     text,
  ADD COLUMN IF NOT EXISTS scheduled_cancel_at    timestamptz;

COMMENT ON COLUMN public.paddle_webhook_events.paddle_subscription_id IS
  'Paddle sub_... id. data.id on subscription.* events, data.subscription_id on transaction.*. Required to cancel.';
COMMENT ON COLUMN public.paddle_webhook_events.paddle_transaction_id IS
  'Paddle txn_... id (data.id on transaction.*). Required to create a refund adjustment; also the refund idempotency key.';
COMMENT ON COLUMN public.paddle_webhook_events.occurred_at IS
  'Paddle event time. processed_at is the DB write time and is NOT a payment date.';
COMMENT ON COLUMN public.paddle_webhook_events.payment_method IS
  'Payment method type reported by Paddle (card / paypal / ...), for the settings summary only.';
COMMENT ON COLUMN public.paddle_webhook_events.scheduled_cancel_at IS
  'data.scheduled_change.effective_at when the scheduled change is a cancel; NULL means auto-renewal is live. Read from the LATEST event, not max(), because Paddle clears it to null on resume.';

-- The refund-window lookup is "latest transaction.completed for this user",
-- and the cancel lookup is "latest subscription id for this user". Both scan
-- by user and time; the table had no index at all before this.
CREATE INDEX IF NOT EXISTS paddle_webhook_events_user_time_idx
  ON public.paddle_webhook_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

-- Renewal-anchor recovery (see apply_billing_event below) looks the owner up by
-- subscription id, so that column needs its own index.
CREATE INDEX IF NOT EXISTS paddle_webhook_events_subscription_idx
  ON public.paddle_webhook_events (paddle_subscription_id, occurred_at DESC)
  WHERE paddle_subscription_id IS NOT NULL;

----------------------------------------------------------------------
-- 1b. Role detection, once (0112's lesson)
----------------------------------------------------------------------

-- 0112 found that `request.jwt.claim.role` is NOT set by the current PostgREST
-- stack (claims live in the request.jwt.claims JSON GUC), and the legacy check
-- had been silently failing: apply_billing_event raised 42501 and Paddle got
-- 500s on the FIRST real live purchase (2026-08-08). Every service_role check
-- in this file goes through this one function so there is exactly one place to
-- fix if the shape moves again.
--
-- Not SECURITY DEFINER: it only reads session GUCs, so it needs no elevated
-- rights, and every caller below is a DEFINER body that executes it as the
-- function owner. Revoked from anon/authenticated all the same.
CREATE OR REPLACE FUNCTION public.billing_request_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

REVOKE ALL     ON FUNCTION public.billing_request_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_request_role() FROM anon, authenticated;

----------------------------------------------------------------------
-- 2. apply_billing_event(): persist the identifiers
----------------------------------------------------------------------

-- The 12-argument form is dropped rather than overloaded: two live overloads
-- differing only by trailing defaults make the PostgREST call ambiguous, and
-- the webhook is the only caller.
DROP FUNCTION IF EXISTS public.apply_billing_event(
  text, text, uuid, text, timestamptz, text, integer, text, timestamptz,
  boolean, public.customer_relation, text
);

CREATE OR REPLACE FUNCTION public.apply_billing_event(
  p_event_id          text,
  p_event_type        text,
  p_user_id           uuid,
  p_tier              text,          -- NULL = leave tier unchanged (e.g. pure revenue/log event)
  p_expires_at        timestamptz,
  p_provider          text,
  p_amount_cents      integer,       -- NULL = do not log a revenue row (e.g. status-only change)
  p_currency          text,
  p_occurred_at       timestamptz,
  p_is_related_party  boolean DEFAULT false,
  p_relation          public.customer_relation DEFAULT 'arms_length',
  p_source            text DEFAULT 'paddle',
  p_subscription_id   text DEFAULT NULL,
  p_transaction_id    text DEFAULT NULL,
  p_payment_method    text DEFAULT NULL,
  p_card_brand        text DEFAULT NULL,
  p_card_last4        text DEFAULT NULL,
  p_scheduled_cancel_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
  -- 0109's ordering baseline. Every entitlement decision below compares against
  -- this, NOT against arrival order.
  v_at timestamptz := COALESCE(p_occurred_at, now());
  v_sub_id text := NULLIF(btrim(p_subscription_id), '');
  v_txn_id text := NULLIF(btrim(p_transaction_id), '');
  v_user_id uuid := p_user_id;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;
  IF p_tier IS NOT NULL AND p_tier NOT IN ('free', 'soma', 'cortex', 'brain') THEN
    RAISE EXCEPTION 'invalid tier: %', p_tier USING ERRCODE = '22023';
  END IF;

  -- RENEWAL ANCHOR. custom_data.user_id is attached at checkout; Paddle does not
  -- reliably carry it onto later renewal transactions. Before 0115 that only cost
  -- us an unattributed revenue row, but the refund window now anchors on the
  -- latest transaction.completed for a user, so an unattributed renewal would
  -- leave a paying subscriber with no anchor at all. Recover the owner from an
  -- earlier event on the same subscription.
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id
      INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_subscription_id = v_sub_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;

  -- Idempotency: record the event; only proceed on FIRST sight of this event id.
  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id,
    paddle_subscription_id, paddle_transaction_id, occurred_at,
    payment_method, payment_card_brand, payment_card_last4, scheduled_cancel_at
  )
  VALUES (
    p_event_id, COALESCE(p_event_type, 'unknown'), v_user_id,
    v_sub_id, v_txn_id, p_occurred_at,
    NULLIF(btrim(p_payment_method), ''), NULLIF(btrim(p_card_brand), ''), NULLIF(btrim(p_card_last4), ''),
    p_scheduled_cancel_at
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Replay / Paddle retry: already processed -> apply nothing.
  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  -- Reflect entitlement. THE ORDERING GUARD BELOW IS 0109's, PRESERVED VERBATIM.
  -- Paddle gives no delivery-ordering guarantee and retries with backoff, so a
  -- stale subscription.updated(active) landing after a cancel would otherwise
  -- re-grant a paid tier to a non-paying user, and a retried older event would
  -- permanently downgrade an upgraded subscriber. Event-id idempotency does not
  -- help: those are DIFFERENT events, each seen once. Do not "simplify" this
  -- back into an unconditional UPDATE.
  IF p_tier IS NOT NULL AND v_user_id IS NOT NULL THEN
    -- Existence is checked separately from the ordering guard (0109): without
    -- this, a deliberately-skipped stale event would look identical to an
    -- unknown user and raise, making Paddle retry an event we correctly ignored.
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
      RAISE EXCEPTION 'unknown user %', v_user_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.users
       SET subscription_tier       = p_tier,
           subscription_expires_at = p_expires_at,
           subscription_provider   = p_provider,
           subscription_event_at   = v_at
     WHERE id = v_user_id
       AND (subscription_event_at IS NULL OR v_at >= subscription_event_at);
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      UPDATE public.paddle_webhook_events
         SET stale_entitlement = true
       WHERE event_id = p_event_id;
    END IF;
  END IF;

  -- Log real revenue (C4 columns) only for money-moving events. Always logged,
  -- even for a stale entitlement: the money moved regardless of arrival order.
  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (v_user_id, p_amount_cents, COALESCE(p_currency, 'USD'), v_at,
       COALESCE(p_is_related_party, false), COALESCE(p_relation, 'arms_length'), p_source, p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  -- Contract preserved on purpose (0109): the caller only distinguishes
  -- 'duplicate'. Staleness is observable on paddle_webhook_events.stale_entitlement
  -- rather than via a new return value the edge function would read as a failure.
  RETURN 'applied';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) TO service_role;

----------------------------------------------------------------------
-- 3. billing_self_service_log: the audit ledger + the idempotency claim
----------------------------------------------------------------------

-- One row per user-initiated billing action, written BEFORE the Paddle call
-- (outcome 'pending') and updated with the result. Writing first is what makes
-- the operation idempotent: the partial unique index below rejects a second
-- refund claim on the same transaction while the first is pending or accepted,
-- so a double tap or a retried request cannot produce two refunds.
--
-- eligibility / eligibility_detail freeze the verdict AS SERVED. Usage keeps
-- accumulating after the request, so a verdict recomputed later would not
-- explain a decision already made.
CREATE TABLE IF NOT EXISTS public.billing_self_service_log (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action                 text NOT NULL CHECK (action IN ('cancel', 'refund_request')),
  outcome                text NOT NULL DEFAULT 'pending'
                         CHECK (outcome IN ('pending', 'accepted', 'rejected', 'provider_error', 'misconfigured')),
  effective_from         text CHECK (effective_from IS NULL OR effective_from IN ('next_billing_period', 'immediately')),
  paddle_subscription_id text,
  paddle_transaction_id  text,
  eligibility            text,
  eligibility_detail     jsonb,
  provider_status        integer,
  provider_ref           text,
  provider_error         text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- THE idempotency guard: at most one live refund claim per Paddle transaction.
-- A claim that ends in provider_error/rejected leaves the index, so a genuine
-- failure can be retried; an accepted one blocks every later request forever.
CREATE UNIQUE INDEX IF NOT EXISTS billing_self_service_refund_once_uidx
  ON public.billing_self_service_log (paddle_transaction_id)
  WHERE action = 'refund_request'
    AND outcome IN ('pending', 'accepted')
    AND paddle_transaction_id IS NOT NULL;

-- Same shape for cancel: one live cancel claim per subscription.
CREATE UNIQUE INDEX IF NOT EXISTS billing_self_service_cancel_once_uidx
  ON public.billing_self_service_log (paddle_subscription_id, effective_from)
  WHERE action = 'cancel'
    AND outcome IN ('pending', 'accepted')
    AND paddle_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_self_service_user_time_idx
  ON public.billing_self_service_log (user_id, created_at DESC);

-- RLS: owners read their own billing actions (the user is entitled to see what
-- was decided about their money); every write goes through the SECURITY DEFINER
-- functions below under service_role. 0061/0102 initplan rule: (select auth.uid()).
ALTER TABLE public.billing_self_service_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_self_service_owner_select ON public.billing_self_service_log;
CREATE POLICY billing_self_service_owner_select ON public.billing_self_service_log
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.billing_self_service_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_self_service_log FROM anon;

----------------------------------------------------------------------
-- 4. refund_eligibility(): the single server-side verdict
----------------------------------------------------------------------

-- Returns the verdict AND its evidence. The UI renders the numbers verbatim:
-- a user told "no" is told exactly which count produced that answer.
--
--   status:
--     'eligible'          full refund is owed and can be self-served
--     'used_beyond_free'  consumption since the payment exceeded what the free
--                         plan would have allowed over the same span
--     'window_passed'     more than REFUND_WINDOW_DAYS since the payment
--     'no_payment'        no completed Paddle payment on record for this user
--
-- SECURITY DEFINER because it reads paddle_webhook_events (RLS, no policies)
-- and reasoning_runs across the whole window. Callable by the owner (the
-- settings screen renders the verdict) and by service_role (the
-- subscription-manage edge function re-derives it before spending money; the
-- client's copy is never trusted).
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
-- 5. subscription_overview(): the settings summary card
----------------------------------------------------------------------

-- Read-only display data for [설정 → 구독 관리]. Exists so the screen can show
-- the next charge date and the payment method WITHOUT opening
-- paddle_webhook_events to authenticated reads (it holds every user's billing
-- event ledger and has deliberately had zero policies since 0087).
--
-- AUTO-RENEWAL STATE (Simon, 2026-08-09: "자동으로 구독을 이어가고 결제하는
-- 시스템"). A Paddle subscription renews on its own; what the user actually needs
-- to see is whether that is still true for them, and the app had no way to say
-- so. Two independent signals, because they become true at different moments:
--   scheduled_cancel_at  Paddle's own answer, from data.scheduled_change on the
--                        LATEST subscription event. Authoritative, but only
--                        after the webhook round-trips.
--   cancel_requested_at  our accepted cancel in billing_self_service_log, so the
--                        screen stops claiming "renews automatically" the
--                        instant the user cancels rather than a minute later.
-- auto_renew is false if EITHER fires. A stale "자동 결제 중" is the one wrong
-- answer here: it reads as "we will charge you again".
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
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
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

  SELECT l.created_at
    INTO v_req
    FROM public.billing_self_service_log l
   WHERE l.user_id = p_user_id
     AND l.action = 'cancel'
     AND l.outcome = 'accepted'
   ORDER BY l.created_at DESC
   LIMIT 1;

  v_tier := public.effective_subscription_tier(p_user_id);
  -- Only a paying subscription can auto-renew, and only while neither signal
  -- says a cancellation is on the books.
  v_auto := v_tier <> 'free' AND v_sched IS NULL AND v_req IS NULL;

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

----------------------------------------------------------------------
-- 6. Claim / settle helpers for the subscription-manage edge function
----------------------------------------------------------------------

-- claim_billing_self_service(): reserve the action BEFORE calling Paddle.
-- Returns the new row id, or NULL when the partial unique index rejects the
-- claim because an identical action is already pending or accepted. NULL is the
-- idempotency answer, not an error, so a retried request is a no-op rather than
-- a second refund. It also resolves the Paddle ids server-side: the client
-- never names a subscription or a transaction.
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

REVOKE ALL     ON FUNCTION public.claim_billing_self_service(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_billing_self_service(uuid, text, text, text, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_billing_self_service(uuid, text, text, text, jsonb) TO service_role;

-- settle_billing_self_service(): record what the provider actually did.
-- An outcome other than 'accepted' releases the idempotency claim so a real
-- failure can be retried.
CREATE OR REPLACE FUNCTION public.settle_billing_self_service(
  p_id              uuid,
  p_outcome         text,
  p_provider_status integer,
  p_provider_ref    text,
  p_provider_error  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('accepted', 'rejected', 'provider_error', 'misconfigured') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome USING ERRCODE = '22023';
  END IF;

  UPDATE public.billing_self_service_log
     SET outcome         = p_outcome,
         provider_status = p_provider_status,
         provider_ref    = NULLIF(btrim(p_provider_ref), ''),
         provider_error  = left(NULLIF(btrim(p_provider_error), ''), 500),
         updated_at      = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.settle_billing_self_service(uuid, text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settle_billing_self_service(uuid, text, integer, text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settle_billing_self_service(uuid, text, integer, text, text) TO service_role;

-- log_billing_self_service(): terminal record for an action that never reached
-- Paddle (fail-closed misconfiguration, ineligible refund). Same ledger, no
-- claim held, so it can never block a later legitimate request.
CREATE OR REPLACE FUNCTION public.log_billing_self_service(
  p_user_id            uuid,
  p_action             text,
  p_outcome            text,
  p_eligibility        text,
  p_eligibility_detail jsonb,
  p_provider_error     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('cancel', 'refund_request') THEN
    RAISE EXCEPTION 'invalid action: %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_outcome NOT IN ('rejected', 'provider_error', 'misconfigured') THEN
    RAISE EXCEPTION 'invalid terminal outcome: %', p_outcome USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.billing_self_service_log
    (user_id, action, outcome, eligibility, eligibility_detail, provider_error)
  VALUES
    (p_user_id, p_action, p_outcome, p_eligibility, p_eligibility_detail,
     left(NULLIF(btrim(p_provider_error), ''), 500));
END;
$$;

REVOKE ALL     ON FUNCTION public.log_billing_self_service(uuid, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_billing_self_service(uuid, text, text, text, jsonb, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_billing_self_service(uuid, text, text, text, jsonb, text) TO service_role;
