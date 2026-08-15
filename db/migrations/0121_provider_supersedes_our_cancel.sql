-- 0121_provider_supersedes_our_cancel.sql
-- A resumed subscription could never be cancelled again, and the app kept saying
-- auto-renewal was off while Paddle billed every month.
--
-- Found by the completed adversarial audit (2026-08-11). 0119 scoped our own
-- cancel signal to the SUBSCRIPTION it cancelled, which fixed the "cancelled in
-- March, re-subscribed in May under a NEW subscription" case. It did not fix the
-- case where the SAME subscription is resumed:
--
--   1. user cancels sub_A at the next renewal  -> billing_self_service_log row,
--      action='cancel', outcome='accepted', paddle_subscription_id=sub_A
--   2. user changes their mind and resumes sub_A through the Paddle receipt
--      portal - a route docs/legal/refund-policy.md:28/70 explicitly advertises
--   3. Paddle clears scheduled_change, so the webhook stores scheduled_cancel_at
--      = NULL and Paddle's own signal is correct
--   4. but our accepted row is still there, still scoped to sub_A, so
--      subscription_overview returns auto_renew=false forever
--
-- The user then sees "자동 결제가 꺼져 있어요 / Auto-renewal is off", the cancel
-- card is hidden (the screen keys it off renewal === 'auto_renew'), and
-- billing_self_service_cancel_once_uidx still holds (sub_A, next_billing_period)
-- so a fresh cancel claim comes back 'duplicate'. Paddle charges them every month
-- while the app states in writing that it will not, and offers no way out.
--
-- THE RULE: Paddle is authoritative about Paddle. Our ledger row is an optimism
-- so the screen can react before the webhook round-trips, nothing more. The
-- moment Paddle's own answer arrives and contradicts it, the optimism loses.
--
-- Two independent guards, mirroring how auto_renew already uses two signals:
--
--   a. apply_billing_event() supersedes the row when a subscription event says
--      the subscription is ACTIVE with no scheduled cancellation. That is
--      Paddle's answer arriving, and it also frees the partial unique index so a
--      genuine second cancel can be claimed.
--   b. subscription_overview() ignores a cancel row that is OLDER than the
--      latest subscription event which shows no scheduled cancellation. This
--      covers rows already in the table before (a) shipped.
--
-- Superseded rows are marked outcome='rejected' with a stated reason rather than
-- deleted: the ledger is an audit trail, and "the user cancelled and then
-- resumed" is exactly the sort of thing an operator needs to be able to read.
--
-- Idempotent, forward-only. Safe to re-apply.

DROP FUNCTION IF EXISTS public.apply_billing_event(
  text, text, uuid, text, timestamptz, text, integer, text, timestamptz,
  boolean, public.customer_relation, text, text, text, text, text, text, timestamptz
);

CREATE OR REPLACE FUNCTION public.apply_billing_event(
  p_event_id          text,
  p_event_type        text,
  p_user_id           uuid,
  p_tier              text,
  p_expires_at        timestamptz,
  p_provider          text,
  p_amount_cents      integer,
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

  -- RENEWAL ANCHOR (0115). custom_data.user_id is attached at checkout; Paddle
  -- does not reliably carry it onto later renewal transactions, and the refund
  -- window anchors on the latest transaction.completed for a user.
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id
      INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_subscription_id = v_sub_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;

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

  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  -- 0121: Paddle's answer supersedes our optimism. An ACTIVE subscription with
  -- no scheduled cancellation means the user resumed it (or never really
  -- cancelled), so a still-'accepted' cancel row of ours is stale. Clearing it
  -- restores auto_renew=true, brings the in-app cancel control back, and frees
  -- billing_self_service_cancel_once_uidx for a genuine second cancel.
  IF v_sub_id IS NOT NULL
     AND p_scheduled_cancel_at IS NULL
     AND p_tier IS NOT NULL
     AND p_tier <> 'free' THEN
    UPDATE public.billing_self_service_log
       SET outcome        = 'rejected',
           provider_error = 'superseded_by_provider',
           updated_at     = now()
     WHERE action = 'cancel'
       AND outcome = 'accepted'
       AND paddle_subscription_id = v_sub_id
       AND created_at <= v_at;
  END IF;

  -- Reflect entitlement. THE ORDERING GUARD IS 0109's, PRESERVED VERBATIM.
  IF p_tier IS NOT NULL AND v_user_id IS NOT NULL THEN
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

  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (v_user_id, p_amount_cents, COALESCE(p_currency, 'USD'), v_at,
       COALESCE(p_is_related_party, false), COALESCE(p_relation, 'arms_length'), p_source, p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) TO service_role;

----------------------------------------------------------------------
-- Guard (b): the reader ignores a cancel Paddle has already contradicted
----------------------------------------------------------------------

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
  v_sched_seen timestamptz;
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
  -- when a cancellation is reversed. Its TIME is captured too (0121), because
  -- that is what lets a newer "no cancellation booked" answer overrule an older
  -- cancel row of ours.
  SELECT e.scheduled_cancel_at, COALESCE(e.occurred_at, e.processed_at)
    INTO v_sched, v_sched_seen
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
     AND v_sub_id IS NOT NULL
     AND l.paddle_subscription_id = v_sub_id
   ORDER BY l.created_at DESC
   LIMIT 1;

  -- 0121: Paddle already answered, after we recorded our cancel, and its answer
  -- was "no cancellation booked". Our row is stale; drop it from the decision.
  IF v_req IS NOT NULL AND v_sched IS NULL AND v_sched_seen IS NOT NULL AND v_sched_seen > v_req THEN
    v_req := NULL;
  END IF;

  v_tier := public.effective_subscription_tier(p_user_id);
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
