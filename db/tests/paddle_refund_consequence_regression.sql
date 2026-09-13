\set ON_ERROR_STOP on

-- Executed only inside the supabase-dry-run job's outer BEGIN/ROLLBACK after
-- UNNUMBERED_paddle_refund_consequence_integrity.sql has been applied. The IDs
-- are disposable and every write is rolled back by the caller.
CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$;

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('7add0000-0000-4000-8000-000000000001', 'paddle-adjustment-ci@example.invalid');
SET LOCAL session_replication_role = origin;

INSERT INTO public.users (
  id, email, birth_date, locale,
  subscription_tier, subscription_provider, subscription_event_at
) VALUES (
  '7add0000-0000-4000-8000-000000000001',
  'paddle-adjustment-ci@example.invalid',
  DATE '1990-01-01',
  'en',
  'cortex',
  'paddle',
  TIMESTAMPTZ '2026-09-10 00:00:00+00'
);

INSERT INTO public.paddle_webhook_events (
  event_id, event_type, user_id, paddle_subscription_id,
  paddle_transaction_id, occurred_at, provider
) VALUES
  (
    'evt_ci_transaction_order', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_order',
    'txn_ci_order', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  ),
  (
    'evt_ci_transaction_retry', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_retry',
    'txn_ci_retry', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  ),
  (
    'evt_ci_transaction_multi', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_multi',
    'txn_ci_multi', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  ),
  (
    'evt_ci_transaction_review', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_review',
    'txn_ci_review', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  ),
  (
    'evt_ci_transaction_equal', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_equal',
    'txn_ci_equal', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  ),
  (
    'evt_ci_transaction_race', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_race',
    'txn_ci_race', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  ),
  (
    'evt_ci_transaction_duplicate_review', 'transaction.completed',
    '7add0000-0000-4000-8000-000000000001', 'sub_ci_duplicate_review',
    'txn_ci_duplicate_review', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
  );

-- A newer reversal must win over an older approved delivery. The source event
-- is retained for audit, but no consequence claim, revenue, or tier mutation is
-- allowed after the lifecycle row says reversed.
DO $order_test$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_order_reversed', 'adjustment.updated', 'adj_ci_order',
    'txn_ci_order', 'reversed', TIMESTAMPTZ '2026-09-10 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'initial reversed lifecycle was not applied: %', v_result;
  END IF;

  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_order_approved_old', 'adjustment.created', 'adj_ci_order',
    'txn_ci_order', 'approved', TIMESTAMPTZ '2026-09-10 01:00:00+00'
  );
  IF v_result <> 'stale' THEN
    RAISE EXCEPTION 'older approved lifecycle was not stale: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_order_approved_old', 'adjustment.created', 'adj_ci_order',
    'txn_ci_order', 'sub_ci_order', TIMESTAMPTZ '2026-09-10 01:00:00+00',
    500, 'USD', false
  );
  IF v_result <> 'adjustment_not_approved_review' THEN
    RAISE EXCEPTION 'obsolete approved consequence was not rejected: %', v_result;
  END IF;
END;
$order_test$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.paddle_webhook_events
     WHERE event_id = 'adj_ci_order:consequence'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue_events
     WHERE source = 'paddle' AND external_id = 'adj_ci_order:consequence'
  )
  AND (SELECT subscription_tier FROM public.users
        WHERE id = '7add0000-0000-4000-8000-000000000001') = 'cortex'
  AND (SELECT paddle_adjustment_status FROM public.billing_self_service_log
        WHERE paddle_adjustment_id = 'adj_ci_order') = 'reversed',
  'reversed then older approved applied a forbidden consequence'
);

-- Equal provider timestamps use the lifecycle lattice, not arrival order.
-- pending -> approved is valid; approved -> rejected is not (reversed is the
-- only terminal transition after approval).
DO $same_time_lifecycle$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_equal_pending', 'adjustment.created', 'adj_ci_equal',
    'txn_ci_equal', 'pending_approval', TIMESTAMPTZ '2026-09-10 03:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'same-time pending fixture failed: %', v_result;
  END IF;

  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_equal_approved', 'adjustment.updated', 'adj_ci_equal',
    'txn_ci_equal', 'approved', TIMESTAMPTZ '2026-09-10 03:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'same-time pending to approved transition was rejected: %', v_result;
  END IF;

  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_equal_rejected', 'adjustment.updated', 'adj_ci_equal',
    'txn_ci_equal', 'rejected', TIMESTAMPTZ '2026-09-10 03:00:00+00'
  );
  IF v_result <> 'stale' THEN
    RAISE EXCEPTION 'same-time approved to rejected transition was accepted: %', v_result;
  END IF;
END;
$same_time_lifecycle$;

SELECT pg_temp.assert_true(
  (SELECT paddle_adjustment_status = 'approved'
     FROM public.billing_self_service_log
    WHERE paddle_adjustment_id = 'adj_ci_equal'),
  'same-time lifecycle lattice did not preserve approved state'
);

-- A previously approved consequence may have rolled back while its source fact
-- committed. If a reversal arrives before the approved retry, the duplicate
-- approved event must re-check the current locked status and remain inert.
DO $retry_after_reversal$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_retry_approved', 'adjustment.updated', 'adj_ci_retry',
    'txn_ci_retry', 'approved', TIMESTAMPTZ '2026-09-10 01:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'retry fixture approved lifecycle failed: %', v_result;
  END IF;

  BEGIN
    v_result := public.apply_billing_refund(
      'evt_ci_retry_approved', 'adjustment.updated', 'adj_ci_retry',
      'txn_ci_retry', 'sub_ci_retry', TIMESTAMPTZ '2026-09-10 01:00:00+00',
      700, 'USD', false
    );
    IF v_result <> 'recorded' THEN
      RAISE EXCEPTION 'retry fixture consequence did not execute before rollback: %', v_result;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'force consequence rollback';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    NULL;
  END;

  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_retry_reversed', 'adjustment.updated', 'adj_ci_retry',
    'txn_ci_retry', 'reversed', TIMESTAMPTZ '2026-09-10 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'retry fixture reversal failed: %', v_result;
  END IF;

  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_retry_approved', 'adjustment.updated', 'adj_ci_retry',
    'txn_ci_retry', 'approved', TIMESTAMPTZ '2026-09-10 01:00:00+00'
  );
  IF v_result <> 'stale' THEN
    RAISE EXCEPTION 'approved redelivery did not yield to reversal: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_retry_approved', 'adjustment.updated', 'adj_ci_retry',
    'txn_ci_retry', 'sub_ci_retry', TIMESTAMPTZ '2026-09-10 01:00:00+00',
    700, 'USD', false
  );
  IF v_result <> 'adjustment_not_approved_review' THEN
    RAISE EXCEPTION 'retry ignored current reversal: %', v_result;
  END IF;
END;
$retry_after_reversal$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.paddle_webhook_events
     WHERE event_id = 'adj_ci_retry:consequence'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue_events
     WHERE source = 'paddle' AND external_id = 'adj_ci_retry:consequence'
  ),
  'rolled-back approved retry applied after reversal'
);

-- The recorder and consequence are separate RPC transactions. If a second
-- approved lifecycle event wins between them, the first event's signed amount
-- must not claim the adjustment consequence. The current source can then apply
-- exactly once with the canonical adjustment-scoped key.
DO $approved_toctou$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_race_approved_1', 'adjustment.created', 'adj_ci_race',
    'txn_ci_race', 'approved', TIMESTAMPTZ '2026-09-10 01:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'first approved race fixture failed: %', v_result;
  END IF;

  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_race_approved_2', 'adjustment.updated', 'adj_ci_race',
    'txn_ci_race', 'approved', TIMESTAMPTZ '2026-09-10 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'second approved race fixture failed: %', v_result;
  END IF;

  -- The 9-argument SQL signature is unchanged, but the actual old Edge passed
  -- source_event_id:consequence as p_event_id and then acknowledged even if
  -- this RPC errored. New SQL rejects that caller while the recorder's pending
  -- marker makes the otherwise swallowed consequence gap durable.
  BEGIN
    PERFORM public.apply_billing_refund(
      'evt_ci_race_approved_2:consequence', 'adjustment.updated', 'adj_ci_race',
      'txn_ci_race', 'sub_ci_race', TIMESTAMPTZ '2026-09-10 02:00:00+00',
      222, 'USD', false
    );
    RAISE EXCEPTION USING
      ERRCODE = 'ZX001',
      MESSAGE = 'old canonical-key caller was accepted';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
      FROM public.paddle_webhook_events
     WHERE event_id = 'evt_ci_race_approved_2'
       AND refund_review
       AND billing_review_reason = 'refund_consequence_pending'
  ) THEN
    RAISE EXCEPTION 'old Edge cutover gap was not retained for review';
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_race_approved_1', 'adjustment.created', 'adj_ci_race',
    'txn_ci_race', 'sub_ci_race', TIMESTAMPTZ '2026-09-10 01:00:00+00',
    111, 'USD', false
  );
  IF v_result <> 'stale_consequence_review' THEN
    RAISE EXCEPTION 'older approved source won inter-RPC race: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_race_approved_2', 'adjustment.updated', 'adj_ci_race',
    'txn_ci_race', 'sub_ci_race', TIMESTAMPTZ '2026-09-10 02:00:00+00',
    222, 'USD', false
  );
  IF v_result <> 'recorded' THEN
    RAISE EXCEPTION 'current approved source did not apply: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_race_approved_2', 'adjustment.updated', 'adj_ci_race',
    'txn_ci_race', 'sub_ci_race', TIMESTAMPTZ '2026-09-10 02:00:00+00',
    222, 'USD', false
  );
  IF v_result <> 'duplicate' THEN
    RAISE EXCEPTION 'current approved source was not idempotent: %', v_result;
  END IF;
END;
$approved_toctou$;

SELECT pg_temp.assert_true(
  (SELECT refund_review AND billing_review_reason = 'stale_consequence_source'
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_race_approved_1')
  AND (SELECT count(*) FROM public.paddle_webhook_events
        WHERE event_id = 'adj_ci_race:consequence'
          AND refund_consequence_adjustment_id = 'adj_ci_race') = 1
  AND (SELECT count(*) FROM public.revenue_events
        WHERE source = 'paddle'
          AND external_id = 'adj_ci_race:consequence'
          AND amount_cents = -222) = 1,
  'approved inter-RPC race was not source-bound and idempotent'
);

SELECT public.set_paddle_refund_review('evt_ci_race_approved_2', false);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 2
     FROM public.paddle_webhook_events
    WHERE provider = 'paddle'
      AND event_type IN ('adjustment.created', 'adjustment.updated')
      AND paddle_adjustment_id = 'adj_ci_race'
      AND NOT refund_review
      AND billing_review_resolved_at IS NOT NULL)
  AND (SELECT NOT refund_review AND billing_review_resolved_at IS NOT NULL
         FROM public.paddle_webhook_events
        WHERE event_id = 'adj_ci_race:consequence'
          AND refund_consequence_adjustment_id = 'adj_ci_race'),
  'older adjustment source review survived consequence success'
);

-- A review outcome also commits the canonical adjustment claim. Its retry must
-- remain review-bearing until an operator resolves the source; only then may a
-- duplicate replay be treated as a completed success and clear normally.
DO $duplicate_review_lifecycle$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_duplicate_review_current', 'adjustment.updated',
    'adj_ci_duplicate_review', 'txn_ci_duplicate_review', 'approved',
    TIMESTAMPTZ '2026-09-10 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'duplicate-review lifecycle fixture failed: %', v_result;
  END IF;

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id, paddle_transaction_id, occurred_at, provider
  ) VALUES
    (
      'evt_ci_duplicate_review_legacy', 'adjustment.created',
      '7add0000-0000-4000-8000-000000000001', 'txn_ci_duplicate_review',
      TIMESTAMPTZ '2026-09-10 01:00:00+00', 'paddle'
    ),
    (
      'evt_ci_duplicate_review_legacy:consequence', 'adjustment.created',
      '7add0000-0000-4000-8000-000000000001', 'txn_ci_duplicate_review',
      TIMESTAMPTZ '2026-09-10 01:00:00+00', 'paddle'
    );

  v_result := public.apply_billing_refund(
    'evt_ci_duplicate_review_current', 'adjustment.updated',
    'adj_ci_duplicate_review', 'txn_ci_duplicate_review',
    'sub_ci_duplicate_review', TIMESTAMPTZ '2026-09-10 02:00:00+00',
    333, 'USD', false
  );
  IF v_result <> 'legacy_consequence_review' THEN
    RAISE EXCEPTION 'legacy review outcome was not retained: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_duplicate_review_current', 'adjustment.updated',
    'adj_ci_duplicate_review', 'txn_ci_duplicate_review',
    'sub_ci_duplicate_review', TIMESTAMPTZ '2026-09-10 02:00:00+00',
    333, 'USD', false
  );
  IF v_result <> 'duplicate_review' THEN
    RAISE EXCEPTION 'review-bearing duplicate was treated as success: %', v_result;
  END IF;

  v_result := public.set_paddle_refund_review(
    'evt_ci_duplicate_review_current', false
  );
  IF v_result <> 'cleared' THEN
    RAISE EXCEPTION 'operator review resolution failed: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_duplicate_review_current', 'adjustment.updated',
    'adj_ci_duplicate_review', 'txn_ci_duplicate_review',
    'sub_ci_duplicate_review', TIMESTAMPTZ '2026-09-10 02:00:00+00',
    333, 'USD', false
  );
  IF v_result <> 'duplicate' THEN
    RAISE EXCEPTION 'resolved duplicate did not become completed success: %', v_result;
  END IF;
END;
$duplicate_review_lifecycle$;

SELECT pg_temp.assert_true(
  (SELECT NOT refund_review AND billing_review_resolved_at IS NOT NULL
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_duplicate_review_current')
  AND (SELECT NOT refund_review AND billing_review_resolved_at IS NOT NULL
         FROM public.paddle_webhook_events
        WHERE event_id = 'adj_ci_duplicate_review:consequence')
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue_events
     WHERE source = 'paddle'
       AND external_id = 'adj_ci_duplicate_review:consequence'
  ),
  'duplicate review state did not survive replay and explicit resolution'
);

-- Two distinct provider adjustments for one transaction are both valid facts;
-- neither may consume or collide with the single user-initiated request mutex.
DO $multiple_adjustments$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_multi_a', 'adjustment.updated', 'adj_ci_multi_a',
    'txn_ci_multi', 'approved', TIMESTAMPTZ '2026-09-10 01:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'first adjustment failed: %', v_result;
  END IF;
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_multi_b', 'adjustment.updated', 'adj_ci_multi_b',
    'txn_ci_multi', 'approved', TIMESTAMPTZ '2026-09-10 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'second adjustment failed: %', v_result;
  END IF;

  PERFORM public.apply_billing_refund(
    'evt_ci_multi_a', 'adjustment.updated', 'adj_ci_multi_a',
    'txn_ci_multi', 'sub_ci_multi', TIMESTAMPTZ '2026-09-10 01:00:00+00',
    100, 'USD', false
  );
  PERFORM public.apply_billing_refund(
    'evt_ci_multi_b', 'adjustment.updated', 'adj_ci_multi_b',
    'txn_ci_multi', 'sub_ci_multi', TIMESTAMPTZ '2026-09-10 02:00:00+00',
    200, 'USD', false
  );
END;
$multiple_adjustments$;

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.billing_self_service_log
    WHERE paddle_transaction_id = 'txn_ci_multi'
      AND provider_adjustment_only) = 2
  AND (SELECT provider_refund_cents FROM public.billing_self_service_log
        WHERE paddle_adjustment_id = 'adj_ci_multi_a') = 100
  AND (SELECT provider_refund_cents FROM public.billing_self_service_log
        WHERE paddle_adjustment_id = 'adj_ci_multi_b') = 200
  AND (SELECT count(*) FROM public.revenue_events
        WHERE source = 'paddle'
          AND external_id IN (
            'adj_ci_multi_a:consequence', 'adj_ci_multi_b:consequence'
          )) = 2,
  'multiple adjustments collided or stamped one another'
);

INSERT INTO public.billing_self_service_log (
  user_id, action, outcome, paddle_transaction_id,
  eligibility, provider_adjustment_only
) VALUES (
  '7add0000-0000-4000-8000-000000000001',
  'refund_request', 'accepted', 'txn_ci_multi', 'eligible', false
);

DO $self_service_mutex$
BEGIN
  BEGIN
    INSERT INTO public.billing_self_service_log (
      user_id, action, outcome, paddle_transaction_id,
      eligibility, provider_adjustment_only
    ) VALUES (
      '7add0000-0000-4000-8000-000000000001',
      'refund_request', 'accepted', 'txn_ci_multi', 'eligible', false
    );
    RAISE EXCEPTION 'second self-service request unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$self_service_mutex$;

-- A self-service provider_ref is the identity returned by Paddle. Another
-- adjustment for the same transaction must get a provider-only row rather than
-- steal and overwrite that request's audit association.
INSERT INTO public.paddle_webhook_events (
  event_id, event_type, user_id, paddle_subscription_id,
  paddle_transaction_id, occurred_at, provider
) VALUES (
  'evt_ci_transaction_self_service_identity', 'transaction.completed',
  '7add0000-0000-4000-8000-000000000001', 'sub_ci_self_service_identity',
  'txn_ci_self_service_identity', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
);

INSERT INTO public.billing_self_service_log (
  user_id, action, outcome, paddle_transaction_id,
  eligibility, provider_ref, provider_adjustment_only
) VALUES (
  '7add0000-0000-4000-8000-000000000001',
  'refund_request', 'accepted', 'txn_ci_self_service_identity',
  'eligible', 'adj_ci_self_service_a', false
);

DO $self_service_provider_identity$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_self_service_b', 'adjustment.updated', 'adj_ci_self_service_b',
    'txn_ci_self_service_identity', 'approved',
    TIMESTAMPTZ '2026-09-10 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'second provider adjustment fixture failed: %', v_result;
  END IF;
END;
$self_service_provider_identity$;

SELECT pg_temp.assert_true(
  (SELECT provider_ref = 'adj_ci_self_service_a'
          AND paddle_adjustment_id IS NULL
          AND NOT provider_adjustment_only
     FROM public.billing_self_service_log
    WHERE paddle_transaction_id = 'txn_ci_self_service_identity'
      AND NOT provider_adjustment_only)
  AND (SELECT count(*) = 1
         FROM public.billing_self_service_log
        WHERE paddle_transaction_id = 'txn_ci_self_service_identity'
          AND paddle_adjustment_id = 'adj_ci_self_service_b'
          AND provider_ref = 'adj_ci_self_service_b'
          AND provider_adjustment_only),
  'second adjustment stole a self-service row with another provider_ref'
);

-- The synchronous self-service response and the webhook are independent
-- writers. If a webhook claims the row first, settlement for a different
-- adjustment must fail closed rather than split provider_ref from lifecycle.
INSERT INTO public.paddle_webhook_events (
  event_id, event_type, user_id, paddle_subscription_id,
  paddle_transaction_id, occurred_at, provider
) VALUES (
  'evt_ci_transaction_settle_race', 'transaction.completed',
  '7add0000-0000-4000-8000-000000000001', 'sub_ci_settle_race',
  'txn_ci_settle_race', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
);

INSERT INTO public.billing_self_service_log (
  id, user_id, action, outcome, paddle_transaction_id,
  eligibility, provider_adjustment_only
) VALUES (
  '7add0000-0000-4000-8000-0000000000a1',
  '7add0000-0000-4000-8000-000000000001',
  'refund_request', 'pending', 'txn_ci_settle_race',
  'eligible', false
);

SELECT public.record_paddle_refund_adjustment(
  'evt_ci_settle_race_a', 'adjustment.created', 'adj_ci_settle_race_a',
  'txn_ci_settle_race', 'pending_approval',
  TIMESTAMPTZ '2026-09-10 01:00:00+00'
);

DO $settle_provider_identity_race$
BEGIN
  BEGIN
    PERFORM public.settle_billing_self_service(
      '7add0000-0000-4000-8000-0000000000a1',
      'accepted', 200, 'adj_ci_settle_race_b', NULL
    );
    RAISE EXCEPTION 'settlement accepted a conflicting provider identity';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN NULL;
  END;
END;
$settle_provider_identity_race$;

SELECT pg_temp.assert_true(
  (SELECT provider_ref = 'adj_ci_settle_race_a'
          AND paddle_adjustment_id = 'adj_ci_settle_race_a'
     FROM public.billing_self_service_log
    WHERE id = '7add0000-0000-4000-8000-0000000000a1'),
  'settlement overwrote an earlier webhook provider identity'
);

-- A timeout can arrive after the signed webhook has already advanced the row.
-- The late synchronous result must not release the one-live-request claim by
-- downgrading accepted to provider_error.
INSERT INTO public.paddle_webhook_events (
  event_id, event_type, user_id, paddle_subscription_id,
  paddle_transaction_id, occurred_at, provider
) VALUES (
  'evt_ci_transaction_late_settle', 'transaction.completed',
  '7add0000-0000-4000-8000-000000000001', 'sub_ci_late_settle',
  'txn_ci_late_settle', TIMESTAMPTZ '2026-09-10 00:00:00+00', 'paddle'
);

INSERT INTO public.billing_self_service_log (
  id, user_id, action, outcome, paddle_transaction_id,
  eligibility, provider_adjustment_only
) VALUES (
  '7add0000-0000-4000-8000-0000000000a2',
  '7add0000-0000-4000-8000-000000000001',
  'refund_request', 'pending', 'txn_ci_late_settle',
  'eligible', false
);

SELECT public.record_paddle_refund_adjustment(
  'evt_ci_late_settle', 'adjustment.updated', 'adj_ci_late_settle',
  'txn_ci_late_settle', 'approved',
  TIMESTAMPTZ '2026-09-10 01:00:00+00'
);
SELECT public.settle_billing_self_service(
  '7add0000-0000-4000-8000-0000000000a2',
  'provider_error', 504, NULL, 'late_timeout'
);

SELECT pg_temp.assert_true(
  (SELECT outcome = 'accepted'
          AND provider_ref = 'adj_ci_late_settle'
          AND provider_error IS NULL
     FROM public.billing_self_service_log
    WHERE id = '7add0000-0000-4000-8000-0000000000a2'),
  'late settlement downgraded webhook-owned outcome'
);

-- The raw body may expire, but the normalized review identity and open marker
-- must survive until a service-owned reconciliation explicitly clears it.
SELECT public.record_paddle_adjustment_review(
  'evt_ci_review_reverse', 'adjustment.updated', 'adj_ci_review_reverse',
  'txn_ci_review', 'sub_ci_review', 'chargeback_reverse', 'approved',
  TIMESTAMPTZ '2026-09-01 00:00:00+00', 'chargeback_reversal',
  '{"data":{"id":"adj_ci_review_reverse","action":"chargeback_reverse","status":"approved"}}'::jsonb
);

SELECT public.purge_unhandled_billing_payloads(0);

SELECT pg_temp.assert_true(
  (SELECT raw_payload IS NULL
          AND refund_review
          AND paddle_adjustment_id = 'adj_ci_review_reverse'
          AND paddle_adjustment_action = 'chargeback_reverse'
          AND paddle_adjustment_status = 'approved'
          AND billing_review_reason = 'chargeback_reversal'
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_review_reverse'),
  'raw payload purge erased the durable chargeback reversal queue'
);

SELECT public.set_paddle_refund_review('evt_ci_review_reverse', false);
SELECT public.record_paddle_adjustment_review(
  'evt_ci_review_reverse', 'adjustment.updated', 'adj_ci_review_reverse',
  'txn_ci_review', 'sub_ci_review', 'chargeback_reverse', 'approved',
  TIMESTAMPTZ '2026-09-01 00:00:00+00', 'chargeback_reversal',
  '{"data":{"id":"adj_ci_review_reverse","action":"chargeback_reverse","status":"approved"}}'::jsonb
);

SELECT pg_temp.assert_true(
  (SELECT NOT refund_review
          AND billing_review_reason = 'chargeback_reversal'
          AND billing_review_resolved_at IS NOT NULL
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_review_reverse'),
  'resolved review replay reopened the queue'
);

-- Exercise the actual Edge order: lifecycle recorder first, then durable
-- reversal review. The transaction.completed owner is intentionally absent.
DO $ownerless_reversal$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_orphan_reverse', 'adjustment.updated', 'adj_ci_orphan_reverse',
    'txn_ci_orphan', 'reversed', TIMESTAMPTZ '2026-09-02 02:00:00+00'
  );
  IF v_result <> 'owner_missing_review' THEN
    RAISE EXCEPTION 'ownerless reversed lifecycle was not retained: %', v_result;
  END IF;
END;
$ownerless_reversal$;

SELECT public.record_paddle_adjustment_review(
  'evt_ci_orphan_reverse', 'adjustment.updated', 'adj_ci_orphan_reverse',
  'txn_ci_orphan', 'sub_ci_orphan', 'chargeback', 'reversed',
  TIMESTAMPTZ '2026-09-02 02:00:00+00', 'reversed_adjustment',
  '{"data":{"id":"adj_ci_orphan_reverse","action":"chargeback","status":"reversed"}}'::jsonb
);

SELECT pg_temp.assert_true(
  (SELECT user_id IS NULL AND refund_review
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_orphan_reverse')
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_self_service_log
     WHERE paddle_adjustment_id = 'adj_ci_orphan_reverse'
  ),
  'ownerless chargeback reversal was not retained for review'
);

INSERT INTO public.paddle_webhook_events (
  event_id, event_type, user_id, paddle_subscription_id,
  paddle_transaction_id, occurred_at, provider
) VALUES (
  'evt_ci_transaction_orphan', 'transaction.completed',
  '7add0000-0000-4000-8000-000000000001', 'sub_ci_orphan',
  'txn_ci_orphan', TIMESTAMPTZ '2026-09-01 00:00:00+00', 'paddle'
);

-- The later owner anchor must not let an older approved delivery overtake the
-- ledger-only reversed tombstone.
DO $ownerless_stale_approved$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_orphan_approved_old', 'adjustment.created', 'adj_ci_orphan_reverse',
    'txn_ci_orphan', 'approved', TIMESTAMPTZ '2026-09-02 01:00:00+00'
  );
  IF v_result <> 'stale' THEN
    RAISE EXCEPTION 'older approved delivery bypassed ownerless tombstone: %', v_result;
  END IF;

END;
$ownerless_stale_approved$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.paddle_webhook_events
     WHERE event_id = 'adj_ci_orphan_reverse:consequence'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue_events
     WHERE source = 'paddle'
       AND external_id = 'adj_ci_orphan_reverse:consequence'
  ),
  'ownerless reversed tombstone allowed an older approved consequence'
);

-- A same-event redelivery after attribution promotes the review row into the
-- user-owned lifecycle ledger without changing any provider identity.
DO $ownerless_promote$
DECLARE
  v_result text;
BEGIN
  v_result := public.record_paddle_refund_adjustment(
    'evt_ci_orphan_reverse', 'adjustment.updated', 'adj_ci_orphan_reverse',
    'txn_ci_orphan', 'reversed', TIMESTAMPTZ '2026-09-02 02:00:00+00'
  );
  IF v_result <> 'applied' THEN
    RAISE EXCEPTION 'ownerless tombstone was not promoted safely: %', v_result;
  END IF;

  v_result := public.apply_billing_refund(
    'evt_ci_orphan_reverse', 'adjustment.updated',
    'adj_ci_orphan_reverse', 'txn_ci_orphan', 'sub_ci_orphan',
    TIMESTAMPTZ '2026-09-02 01:00:00+00', 900, 'USD', false
  );
  IF v_result <> 'adjustment_not_approved_review' THEN
    RAISE EXCEPTION 'promoted reversed lifecycle allowed consequence: %', v_result;
  END IF;
END;
$ownerless_promote$;

SELECT pg_temp.assert_true(
  (SELECT user_id = '7add0000-0000-4000-8000-000000000001'::uuid
          AND paddle_adjustment_id = 'adj_ci_orphan_reverse'
          AND paddle_transaction_id = 'txn_ci_orphan'
          AND paddle_adjustment_status = 'reversed'
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_orphan_reverse')
  AND (SELECT paddle_adjustment_status = 'reversed'
         FROM public.billing_self_service_log
        WHERE paddle_adjustment_id = 'adj_ci_orphan_reverse'),
  'verified transaction did not safely promote the ownerless review row'
);

SELECT pg_temp.assert_true(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'public.record_paddle_adjustment_review(text,text,text,text,text,text,text,timestamptz,text,jsonb)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_paddle_adjustment_review(text,text,text,text,text,text,text,timestamptz,text,jsonb)',
    'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'service_role',
    'public.record_paddle_adjustment_review(text,text,text,text,text,text,text,timestamptz,text,jsonb)',
    'EXECUTE'
  ),
  'adjustment review RPC privileges are not service-role-only'
);

DO $review_identity_mismatch$
BEGIN
  BEGIN
    PERFORM public.record_paddle_adjustment_review(
      'evt_ci_review_reverse', 'adjustment.updated', 'adj_ci_wrong',
      'txn_ci_review', 'sub_ci_review', 'chargeback_reverse', 'approved',
      TIMESTAMPTZ '2026-09-01 00:00:00+00', 'chargeback_reversal',
      '{"data":{"id":"adj_ci_wrong","action":"chargeback_reverse","status":"approved"}}'::jsonb
    );
    RAISE EXCEPTION 'conflicting review identity unexpectedly overwrote the row';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$review_identity_mismatch$;

SELECT pg_temp.assert_true(
  (SELECT paddle_adjustment_id = 'adj_ci_review_reverse'
     FROM public.paddle_webhook_events
    WHERE event_id = 'evt_ci_review_reverse'),
  'review identity mismatch changed the durable adjustment id'
);
