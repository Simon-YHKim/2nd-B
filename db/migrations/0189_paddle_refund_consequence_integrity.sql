-- 0189_paddle_refund_consequence_integrity.sql
--
-- A provider adjustment's signed top-level `data.type` is the only authority
-- for full versus partial. 0136 also promoted an accepted self-service row to
-- `v_full = true`; that made an unrelated accepted row capable of turning a
-- provider-originated partial refund into a full revoke or credit clawback.
--
-- The Edge handler now passes the strictly validated provider type and marks
-- the source event for review whenever evidence is ambiguous or a consequence
-- cannot be confirmed. Paddle receives a retryable 5xx for consequence errors.
-- `apply_billing_refund` keeps its stable 9-argument contract and its atomic
-- event-id claim, so the same consequence is safe to run again on redelivery.

CREATE OR REPLACE FUNCTION public.apply_billing_refund(
  p_event_id        text,
  p_event_type      text,
  p_adjustment_id   text,
  p_transaction_id  text,
  p_subscription_id text,
  p_occurred_at     timestamptz,
  p_amount_cents    integer,
  p_currency        text,
  p_is_full         boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows       int;
  v_at         timestamptz := COALESCE(p_occurred_at, now());
  v_txn_id     text := NULLIF(btrim(p_transaction_id), '');
  v_sub_id     text := NULLIF(btrim(p_subscription_id), '');
  v_user_id    uuid;
  v_full       boolean := COALESCE(p_is_full, false);
  v_provider   text;
  v_pack_event text;
  v_claw       jsonb;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;

  -- The refunded transaction owns the adjustment. The subscription is only the
  -- fallback because adjustment payloads do not carry checkout custom_data.
  IF v_txn_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_transaction_id = v_txn_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_subscription_id = v_sub_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;

  -- Claim the consequence before every side effect. Any later exception rolls
  -- this insert back with the transaction, while a committed retry returns
  -- duplicate before it can write money, credits, or entitlement a second time.
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

  -- Settlement metadata describes what Paddle returned, including partial
  -- refunds. It must never infer or mutate v_full: only p_is_full may do that.
  IF v_txn_id IS NOT NULL THEN
    UPDATE public.billing_self_service_log
       SET provider_refunded_at   = v_at,
           provider_refund_cents = p_amount_cents,
           updated_at            = now()
     WHERE action = 'refund_request'
       AND outcome = 'accepted'
       AND paddle_transaction_id = v_txn_id
       AND provider_refunded_at IS NULL;
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

  -- A credit purchase lot distinguishes a one-time pack from a subscription.
  -- Both historic key conventions remain supported, and the consequence row
  -- just inserted is excluded from the event-id lookup.
  IF v_txn_id IS NOT NULL THEN
    SELECT e.provider INTO v_provider
      FROM public.paddle_webhook_events e
     WHERE e.paddle_transaction_id = v_txn_id
       AND e.event_id <> p_event_id
     ORDER BY COALESCE(e.occurred_at, e.processed_at) ASC
     LIMIT 1;
    v_provider := COALESCE(v_provider, 'paddle');

    SELECT cl.provider_event_id INTO v_pack_event
      FROM public.credit_ledger cl
     WHERE cl.kind = 'purchase'
       AND cl.provider = v_provider
       AND (
             cl.provider_event_id = v_txn_id
          OR cl.provider_event_id IN (
               SELECT e.event_id
                 FROM public.paddle_webhook_events e
                WHERE e.paddle_transaction_id = v_txn_id
                  AND e.event_id <> p_event_id
             )
           )
     LIMIT 1;
  END IF;

  -- A pack refund never mutates the subscription entitlement. A partial pack
  -- refund has no invented proportional clawback and stays in review.
  IF v_pack_event IS NOT NULL THEN
    IF v_full THEN
      v_claw := public.clawback_credits(
        v_provider,
        v_pack_event,
        'refund adjustment ' || COALESCE(p_adjustment_id, p_event_id)
      );
      IF COALESCE((v_claw ->> 'found')::boolean, false) THEN
        RETURN 'clawed_back';
      END IF;
      UPDATE public.paddle_webhook_events
         SET refund_review = true
       WHERE event_id = p_event_id;
      RETURN 'pack_clawback_missed';
    END IF;

    UPDATE public.paddle_webhook_events
       SET refund_review = true
     WHERE event_id = p_event_id;
    RETURN 'pack_partial_review';
  END IF;

  -- Only an unambiguous full subscription refund can revoke the entitlement.
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

COMMENT ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) IS
$c$Applies one settled Paddle refund consequence with an atomic event-id claim.
The signed provider type is validated by the Edge handler and passed only as
p_is_full; accepted self-service history is settlement metadata, never evidence
that a provider-originated adjustment was full. Partial subscription refunds
record money without revocation. Partial pack refunds require review.$c$;

CREATE OR REPLACE FUNCTION public.set_paddle_refund_review(
  p_event_id text,
  p_needs_review boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id text := NULLIF(btrim(p_event_id), '');
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;
  IF p_needs_review IS NULL THEN
    RAISE EXCEPTION 'p_needs_review required' USING ERRCODE = '22004';
  END IF;

  UPDATE public.paddle_webhook_events
     SET refund_review = p_needs_review
   WHERE event_id = v_event_id
     AND event_type IN ('adjustment.created', 'adjustment.updated');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded Paddle adjustment event not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN CASE WHEN p_needs_review THEN 'marked' ELSE 'cleared' END;
END;
$$;

COMMENT ON FUNCTION public.set_paddle_refund_review(text, boolean) IS
  'Service-only reconciliation marker for the already-recorded source adjustment event.';

COMMENT ON COLUMN public.paddle_webhook_events.refund_review IS
  'true when a refund needs operator reconciliation: ambiguous signed type evidence, an unconfirmed consequence, a partial pack refund, or a missed pack clawback. Distinct from stale_entitlement and provider_conflict.';

REVOKE ALL ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.set_paddle_refund_review(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_paddle_refund_review(text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_paddle_refund_review(text, boolean) TO service_role;
