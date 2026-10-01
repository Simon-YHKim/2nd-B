-- UNNUMBERED_paddle_refund_consequence_integrity.sql
-- LOCAL DRAFT ONLY: reserve the next migration number with a fresh remote scan
-- and push the reservation before this can enter a release candidate.
--
-- A provider adjustment's signed top-level `data.type` is the only authority
-- for full versus partial. 0136 also promoted an accepted self-service row to
-- `v_full = true`; that made an unrelated accepted row capable of turning a
-- provider-originated partial refund into a full revoke or credit clawback.
--
-- The Edge handler now passes the strictly validated provider type and marks
-- the source event for review whenever evidence is ambiguous or a consequence
-- cannot be confirmed. Paddle receives a retryable 5xx for consequence errors.
-- `apply_billing_refund` preserves its 9-argument SQL signature only; it does
-- not preserve the previous p_event_id semantics. The Edge handler now passes
-- the exact source event id; the function checks it against the locked lifecycle
-- row and derives one adjustment-scoped claim. Old Edge and new SQL intentionally
-- fail closed. Because that old Edge logged the second-RPC error and still
-- acknowledged the webhook, every approved source is first left in a durable
-- refund_consequence_pending review state; only the matching Edge clears it
-- after a confirmed consequence.

-- This draft rebuilds indexes on hot billing tables. Promotion must run inside
-- one explicit transaction; fail instead of waiting indefinitely behind a
-- webhook writer or holding a partial migration open.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

-- Older Edge deployments keyed the consequence row by Paddle event id. Preserve
-- those committed claims when switching to the adjustment id: one adjustment is
-- one money/entitlement consequence even when Paddle emits created + updated.
ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS refund_consequence_adjustment_id text;

COMMENT ON COLUMN public.paddle_webhook_events.refund_consequence_adjustment_id IS
  'Immutable Paddle adj_... identity for a refund consequence claim. NULL on source events; unique when populated so legacy event-scoped and current adjustment-scoped deliveries cannot both apply.';

-- Resolve every pre-draft consequence before installing the uniqueness gate.
-- Old Edge code keyed claims by provider event id and the billing log retained
-- only the newest event id. Transaction and owner are insufficient to infer an
-- adjustment because one transaction may have multiple provider adjustments.
-- Anything without a direct identity link is an operator reconciliation case:
-- the migration aborts instead of silently blessing a wrong revenue ledger.
CREATE TEMP TABLE paddle_refund_claim_map
AS
WITH legacy_event_source AS (
  SELECT c.event_id AS consequence_event_id,
         s.event_id AS source_event_id,
         c.user_id AS consequence_user_id,
         c.paddle_transaction_id AS consequence_transaction_id,
         s.user_id AS source_user_id,
         s.paddle_transaction_id AS source_transaction_id
    FROM public.paddle_webhook_events c
    JOIN public.paddle_webhook_events s
      ON c.event_id = s.event_id || ':consequence'
   WHERE s.event_type IN ('adjustment.created', 'adjustment.updated')
     AND s.provider = 'paddle'
),
exact_log_candidates AS (
  SELECT c.event_id AS consequence_event_id,
         l.paddle_adjustment_id
    FROM public.billing_self_service_log l
    JOIN public.paddle_webhook_events c
      ON c.event_id = l.paddle_adjustment_event_id || ':consequence'
      OR c.event_id = l.paddle_adjustment_id || ':consequence'
   WHERE l.paddle_adjustment_id IS NOT NULL
),
exact_log_link AS (
  SELECT consequence_event_id,
         min(paddle_adjustment_id) AS adjustment_id,
         count(DISTINCT paddle_adjustment_id) AS adjustment_count
    FROM exact_log_candidates
   GROUP BY consequence_event_id
)
SELECT c.event_id,
       COALESCE(
         NULLIF(btrim(c.refund_consequence_adjustment_id), ''),
         e.adjustment_id
       ) AS adjustment_id,
       s.source_event_id,
       COALESCE(s.source_user_id, c.user_id) AS user_id,
       COALESCE(s.source_transaction_id, c.paddle_transaction_id) AS transaction_id,
       (
         COALESCE(e.adjustment_count, 0) > 1
         OR (
           c.refund_consequence_adjustment_id IS NOT NULL
           AND e.adjustment_id IS NOT NULL
           AND c.refund_consequence_adjustment_id <> e.adjustment_id
         )
         OR (
           s.source_event_id IS NOT NULL
           AND (
             s.consequence_user_id IS DISTINCT FROM s.source_user_id
             OR s.consequence_transaction_id IS DISTINCT FROM s.source_transaction_id
           )
         )
       ) AS identity_mismatch,
       (
         s.source_event_id IS NOT NULL
         AND COALESCE(
           NULLIF(btrim(c.refund_consequence_adjustment_id), ''),
           e.adjustment_id
         ) IS NULL
       ) AS unresolved
  FROM public.paddle_webhook_events c
  LEFT JOIN legacy_event_source s
    ON s.consequence_event_id = c.event_id
  LEFT JOIN exact_log_link e
    ON e.consequence_event_id = c.event_id
 WHERE c.refund_consequence_adjustment_id IS NOT NULL
    OR e.consequence_event_id IS NOT NULL
    OR s.consequence_event_id IS NOT NULL;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_temp.paddle_refund_claim_map WHERE identity_mismatch
  ) THEN
    RAISE EXCEPTION 'refund consequence identity mismatch; reconcile before applying this draft';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_temp.paddle_refund_claim_map
     WHERE adjustment_id IS NOT NULL
     GROUP BY adjustment_id
    HAVING count(DISTINCT event_id) > 1
    UNION ALL
    SELECT 1
      FROM pg_temp.paddle_refund_claim_map unresolved_claim
      JOIN pg_temp.paddle_refund_claim_map mapped_claim
        ON mapped_claim.event_id <> unresolved_claim.event_id
       AND mapped_claim.adjustment_id IS NOT NULL
       AND mapped_claim.user_id IS NOT DISTINCT FROM unresolved_claim.user_id
       AND mapped_claim.transaction_id IS NOT DISTINCT FROM unresolved_claim.transaction_id
     WHERE unresolved_claim.unresolved
  ) THEN
    RAISE EXCEPTION 'duplicate refund consequences already exist; reconcile before applying this draft';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp.paddle_refund_claim_map WHERE unresolved
  ) THEN
    RAISE EXCEPTION 'unmapped legacy refund consequence exists; reconcile before applying this draft';
  END IF;
END;
$do$;

UPDATE public.paddle_webhook_events c
   SET refund_consequence_adjustment_id = m.adjustment_id
  FROM pg_temp.paddle_refund_claim_map m
 WHERE m.event_id = c.event_id
   AND m.adjustment_id IS NOT NULL
   AND c.refund_consequence_adjustment_id IS NULL;

DROP TABLE pg_temp.paddle_refund_claim_map;

ALTER TABLE public.paddle_webhook_events
  DROP CONSTRAINT IF EXISTS paddle_webhook_events_refund_consequence_adjustment_check;
ALTER TABLE public.paddle_webhook_events
  ADD CONSTRAINT paddle_webhook_events_refund_consequence_adjustment_check
  CHECK (refund_consequence_adjustment_id IS NULL
         OR length(btrim(refund_consequence_adjustment_id)) > 0);

CREATE UNIQUE INDEX IF NOT EXISTS paddle_webhook_events_refund_consequence_adjustment_uidx
  ON public.paddle_webhook_events (refund_consequence_adjustment_id)
  WHERE refund_consequence_adjustment_id IS NOT NULL;

-- A self-service refund request and a provider adjustment are different facts.
-- The former owns the one-live-request mutex; the latter is an append-only
-- provider lifecycle row. Keeping both under the old partial unique index made
-- a second partial refund (or refund followed by chargeback) fail forever.
ALTER TABLE public.billing_self_service_log
  ADD COLUMN IF NOT EXISTS provider_adjustment_only boolean NOT NULL DEFAULT false;

UPDATE public.billing_self_service_log
   SET provider_adjustment_only = true
 WHERE paddle_adjustment_id IS NOT NULL
   AND eligibility_detail ->> 'source' = 'paddle_adjustment';

COMMENT ON COLUMN public.billing_self_service_log.provider_adjustment_only IS
  'true only for provider-originated adjustment lifecycle rows. Such rows remain auditable but do not consume the one-live self-service refund-request mutex.';

DROP INDEX IF EXISTS public.billing_self_service_refund_once_uidx;
CREATE UNIQUE INDEX billing_self_service_refund_once_uidx
  ON public.billing_self_service_log (paddle_transaction_id)
  WHERE action = 'refund_request'
    AND outcome IN ('pending', 'accepted')
    AND paddle_transaction_id IS NOT NULL
    AND NOT provider_adjustment_only;

-- The provider webhook can race the synchronous Paddle API response. Serialize
-- both writers on the exact self-service row and never let the later writer
-- replace a different adjustment identity. A NULL response may add status/error
-- metadata, but it must not erase an identity already claimed by the webhook.
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
DECLARE
  v_provider_ref          text := NULLIF(btrim(p_provider_ref), '');
  v_existing_ref          text;
  v_existing_outcome      text;
  v_existing_adjustment_id text;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('accepted', 'rejected', 'provider_error', 'misconfigured', 'dry_run') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome USING ERRCODE = '22023';
  END IF;

  SELECT l.provider_ref, l.outcome, l.paddle_adjustment_id
    INTO v_existing_ref, v_existing_outcome, v_existing_adjustment_id
    FROM public.billing_self_service_log l
   WHERE l.id = p_id
     AND NOT provider_adjustment_only
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'self-service billing claim not found'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_existing_ref IS NOT NULL
     AND v_provider_ref IS NOT NULL
     AND v_existing_ref IS DISTINCT FROM v_provider_ref THEN
    RAISE EXCEPTION 'self-service provider reference mismatch'
      USING ERRCODE = '22023';
  END IF;

  -- Once a signed webhook has attached its lifecycle, that state is the
  -- authority. Likewise, a duplicate/late transport failure cannot turn an
  -- already accepted request back into a retryable row. Identity validation
  -- above still runs before either no-op.
  IF v_existing_adjustment_id IS NOT NULL THEN
    RETURN;
  END IF;
  IF v_existing_outcome = 'accepted' AND p_outcome <> 'accepted' THEN
    RETURN;
  END IF;

  UPDATE public.billing_self_service_log
     SET outcome         = p_outcome,
         provider_status = p_provider_status,
         provider_ref    = COALESCE(v_existing_ref, v_provider_ref),
         provider_error  = left(NULLIF(btrim(p_provider_error), ''), 500),
         updated_at      = now()
   WHERE id = p_id
     AND NOT provider_adjustment_only;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_billing_self_service(uuid, text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settle_billing_self_service(uuid, text, integer, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_billing_self_service(uuid, text, integer, text, text) TO service_role;

-- Preserve the fields an operator needs after raw_payload reaches its 90-day
-- deletion deadline. refund_review is the durable open/closed state; the
-- normalized reason and provider identities remain after the body is purged.
ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS paddle_adjustment_id text,
  ADD COLUMN IF NOT EXISTS paddle_adjustment_action text,
  ADD COLUMN IF NOT EXISTS paddle_adjustment_status text,
  ADD COLUMN IF NOT EXISTS billing_review_reason text,
  ADD COLUMN IF NOT EXISTS billing_review_resolved_at timestamptz;

COMMENT ON COLUMN public.paddle_webhook_events.paddle_adjustment_id IS
  'Normalized Paddle adjustment identity retained after diagnostic raw payload deletion.';
COMMENT ON COLUMN public.paddle_webhook_events.paddle_adjustment_action IS
  'Normalized Paddle adjustment action retained for durable operator review.';
COMMENT ON COLUMN public.paddle_webhook_events.paddle_adjustment_status IS
  'Normalized Paddle adjustment status retained for durable operator review.';
COMMENT ON COLUMN public.paddle_webhook_events.billing_review_reason IS
  'Stable machine-readable reason for a billing review; retained after resolution and raw payload deletion.';
COMMENT ON COLUMN public.paddle_webhook_events.billing_review_resolved_at IS
  'When refund_review was explicitly cleared by the service-owned reconciliation RPC.';

-- Upgrade the old diagnostic buffer into a durable queue before any future
-- purge removes its only copy of the adjustment identifiers.
UPDATE public.paddle_webhook_events
   SET paddle_adjustment_id = COALESCE(
         paddle_adjustment_id,
         NULLIF(btrim(raw_payload #>> '{data,id}'), '')
       ),
       paddle_adjustment_action = COALESCE(
         paddle_adjustment_action,
         NULLIF(lower(btrim(raw_payload #>> '{data,action}')), '')
       ),
       paddle_adjustment_status = COALESCE(
         paddle_adjustment_status,
         NULLIF(lower(btrim(raw_payload #>> '{data,status}')), '')
       ),
       refund_review = true,
       billing_review_reason = COALESCE(
         billing_review_reason,
         CASE
           WHEN raw_payload #>> '{data,action}' IN (
             'chargeback_reverse', 'chargeback_warning_reverse'
           ) THEN 'chargeback_reversal'
           ELSE 'unhandled_adjustment_status'
         END
       ),
       billing_review_resolved_at = NULL
 WHERE raw_payload IS NOT NULL
   AND event_type IN ('adjustment.created', 'adjustment.updated');

UPDATE public.paddle_webhook_events e
   SET paddle_adjustment_id = COALESCE(
         e.paddle_adjustment_id,
         l.paddle_adjustment_id
       ),
       paddle_adjustment_status = COALESCE(
         e.paddle_adjustment_status,
         l.paddle_adjustment_status
       ),
       refund_review = e.refund_review OR l.paddle_adjustment_status = 'reversed',
       billing_review_reason = CASE
         WHEN l.paddle_adjustment_status = 'reversed'
           THEN COALESCE(e.billing_review_reason, 'reversed_adjustment')
         ELSE e.billing_review_reason
       END,
       billing_review_resolved_at = CASE
         WHEN l.paddle_adjustment_status = 'reversed' THEN NULL
         ELSE e.billing_review_resolved_at
       END
  FROM public.billing_self_service_log l
 WHERE l.paddle_adjustment_event_id = e.event_id
   AND l.paddle_adjustment_id IS NOT NULL;

-- An approved lifecycle without a mapped old or current consequence may be an
-- invocation caught between the old recorder and consequence RPC. Make the gap
-- operator-visible before replacing either function. A confirmed Edge path
-- clears this marker only after apply_billing_refund returns a known success.
UPDATE public.paddle_webhook_events e
   SET refund_review = true,
       billing_review_reason = COALESCE(
         e.billing_review_reason,
         'refund_consequence_pending'
       ),
       billing_review_resolved_at = NULL
 WHERE e.provider = 'paddle'
   AND e.event_type IN ('adjustment.created', 'adjustment.updated')
   AND e.paddle_adjustment_id IS NOT NULL
   AND e.paddle_adjustment_status = 'approved'
   AND e.billing_review_resolved_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.paddle_webhook_events c
      WHERE c.refund_consequence_adjustment_id = e.paddle_adjustment_id
         OR c.event_id IN (
           e.event_id || ':consequence',
           e.paddle_adjustment_id || ':consequence'
         )
   );

CREATE INDEX IF NOT EXISTS paddle_webhook_events_adjustment_review_idx
  ON public.paddle_webhook_events (occurred_at DESC, paddle_adjustment_id)
  WHERE refund_review OR billing_review_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS paddle_webhook_events_adjustment_lifecycle_idx
  ON public.paddle_webhook_events (paddle_adjustment_id, occurred_at DESC)
  WHERE paddle_adjustment_id IS NOT NULL
    AND paddle_adjustment_status IS NOT NULL
    AND billing_review_reason IS DISTINCT FROM 'stale_adjustment_lifecycle';

-- Replace 0123's recorder without changing its six-argument ABI. The signed
-- payload is already bounded by the Edge handler; extract the small normalized
-- fields here so the review survives purge_unhandled_billing_payloads().
CREATE OR REPLACE FUNCTION public.record_unhandled_billing_event(
  p_event_id        text,
  p_event_type      text,
  p_subscription_id text,
  p_transaction_id  text,
  p_occurred_at     timestamptz,
  p_payload         jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows              int;
  v_event_id          text := NULLIF(btrim(p_event_id), '');
  v_event_type        text := COALESCE(NULLIF(btrim(p_event_type), ''), 'unknown');
  v_sub_id            text := NULLIF(btrim(p_subscription_id), '');
  v_txn_id            text := NULLIF(btrim(p_transaction_id), '');
  v_user_id           uuid;
  v_adjustment_id     text := NULLIF(btrim(p_payload #>> '{data,id}'), '');
  v_adjustment_action text := NULLIF(btrim(p_payload #>> '{data,action}'), '');
  v_adjustment_status text := NULLIF(btrim(p_payload #>> '{data,status}'), '');
  v_review_reason     text;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;

  IF v_txn_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.event_type = 'transaction.completed'
       AND e.provider = 'paddle'
       AND e.paddle_transaction_id = v_txn_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC LIMIT 1;
  END IF;
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.event_type = 'transaction.completed'
       AND e.provider = 'paddle'
       AND e.paddle_subscription_id = v_sub_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC LIMIT 1;
  END IF;

  v_review_reason := CASE
    WHEN v_adjustment_action IN ('chargeback_reverse', 'chargeback_warning_reverse')
      THEN 'chargeback_reversal'
    ELSE 'unhandled_adjustment_status'
  END;

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id,
    paddle_subscription_id, paddle_transaction_id, occurred_at, raw_payload,
    paddle_adjustment_id, paddle_adjustment_action, paddle_adjustment_status,
    refund_review, billing_review_reason, billing_review_resolved_at, provider
  )
  VALUES (
    v_event_id, v_event_type, v_user_id,
    v_sub_id, v_txn_id, p_occurred_at, p_payload,
    v_adjustment_id, v_adjustment_action, v_adjustment_status,
    true, v_review_reason, NULL, 'paddle'
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Redelivery may enrich the same event, but an event id can never be used
    -- to overwrite a different transaction or adjustment identity.
    UPDATE public.paddle_webhook_events
       SET raw_payload = p_payload,
           user_id = COALESCE(user_id, v_user_id),
           paddle_subscription_id = COALESCE(paddle_subscription_id, v_sub_id),
           paddle_transaction_id = COALESCE(paddle_transaction_id, v_txn_id),
           paddle_adjustment_id = COALESCE(
             paddle_adjustment_id,
             v_adjustment_id
           ),
           paddle_adjustment_action = COALESCE(
             paddle_adjustment_action,
             v_adjustment_action
           ),
           paddle_adjustment_status = COALESCE(
             paddle_adjustment_status,
             v_adjustment_status
           ),
           refund_review = CASE
             WHEN NOT refund_review
              AND billing_review_resolved_at IS NOT NULL
              AND billing_review_reason IS NOT DISTINCT FROM v_review_reason
               THEN false
             ELSE true
           END,
           billing_review_reason = CASE
             WHEN NOT refund_review
              AND billing_review_resolved_at IS NOT NULL
              AND billing_review_reason IS NOT DISTINCT FROM v_review_reason
               THEN billing_review_reason
             ELSE v_review_reason
           END,
           billing_review_resolved_at = CASE
             WHEN NOT refund_review
              AND billing_review_resolved_at IS NOT NULL
              AND billing_review_reason IS NOT DISTINCT FROM v_review_reason
               THEN billing_review_resolved_at
             ELSE NULL
           END
     WHERE event_id = v_event_id
       AND event_type = v_event_type
       AND provider = 'paddle'
       AND (user_id IS NULL OR v_user_id IS NULL OR user_id = v_user_id)
       AND (
         paddle_subscription_id IS NULL
         OR v_sub_id IS NULL
         OR paddle_subscription_id = v_sub_id
       )
       AND (
         paddle_transaction_id IS NULL
         OR v_txn_id IS NULL
         OR paddle_transaction_id = v_txn_id
       )
       AND (
         paddle_adjustment_id IS NULL
         OR v_adjustment_id IS NULL
         OR paddle_adjustment_id = v_adjustment_id
       )
       AND (
         paddle_adjustment_action IS NULL
         OR v_adjustment_action IS NULL
         OR paddle_adjustment_action = v_adjustment_action
       )
       AND (
         paddle_adjustment_status IS NULL
         OR v_adjustment_status IS NULL
         OR paddle_adjustment_status = v_adjustment_status
       );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'billing event identity mismatch'
        USING ERRCODE = '23505';
    END IF;
    RETURN 'duplicate';
  END IF;

  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_unhandled_billing_event(text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_unhandled_billing_event(text, text, text, text, timestamptz, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_unhandled_billing_event(text, text, text, text, timestamptz, jsonb) TO service_role;

-- Durable normalized queue for known adjustment lifecycles whose entitlement
-- restoration or financial consequence needs an operator decision. This can
-- enrich a source event already inserted by record_paddle_refund_adjustment,
-- but refuses to overwrite a conflicting event identity.
CREATE OR REPLACE FUNCTION public.record_paddle_adjustment_review(
  p_event_id          text,
  p_event_type        text,
  p_adjustment_id     text,
  p_transaction_id    text,
  p_subscription_id   text,
  p_adjustment_action text,
  p_adjustment_status text,
  p_occurred_at       timestamptz,
  p_review_reason     text,
  p_payload           jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows              int;
  v_event_id          text := NULLIF(btrim(p_event_id), '');
  v_event_type        text := lower(NULLIF(btrim(p_event_type), ''));
  v_adjustment_id     text := NULLIF(btrim(p_adjustment_id), '');
  v_transaction_id    text := NULLIF(btrim(p_transaction_id), '');
  v_subscription_id   text := NULLIF(btrim(p_subscription_id), '');
  v_adjustment_action text := lower(NULLIF(btrim(p_adjustment_action), ''));
  v_adjustment_status text := lower(NULLIF(btrim(p_adjustment_status), ''));
  v_review_reason     text := lower(NULLIF(btrim(p_review_reason), ''));
  v_user_id           uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF v_event_id IS NULL OR v_adjustment_id IS NULL OR v_transaction_id IS NULL
     OR v_adjustment_action IS NULL OR v_adjustment_status IS NULL
     OR v_review_reason IS NULL OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'complete adjustment review identity required'
      USING ERRCODE = '22004';
  END IF;
  IF v_event_type NOT IN ('adjustment.created', 'adjustment.updated') THEN
    RAISE EXCEPTION 'invalid adjustment review event type'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.user_id INTO v_user_id
    FROM public.paddle_webhook_events e
   WHERE e.event_type = 'transaction.completed'
     AND e.provider = 'paddle'
     AND e.paddle_transaction_id = v_transaction_id
     AND e.user_id IS NOT NULL
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  -- This queue is evidence-only and applies no money or entitlement. A valid
  -- reversal can precede our retained transaction.completed row (or refer to a
  -- legacy transaction we missed), so owner attribution is deliberately
  -- best-effort. A later redelivery may enrich NULL with a verified owner; it
  -- can never replace one non-NULL owner with another.

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id,
    paddle_subscription_id, paddle_transaction_id, occurred_at, raw_payload,
    paddle_adjustment_id, paddle_adjustment_action, paddle_adjustment_status,
    refund_review, billing_review_reason, billing_review_resolved_at, provider
  ) VALUES (
    v_event_id, v_event_type, v_user_id,
    v_subscription_id, v_transaction_id, p_occurred_at, p_payload,
    v_adjustment_id, v_adjustment_action, v_adjustment_status,
    true, v_review_reason, NULL, 'paddle'
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    UPDATE public.paddle_webhook_events
       SET raw_payload = p_payload,
           user_id = COALESCE(user_id, v_user_id),
           paddle_subscription_id = COALESCE(paddle_subscription_id, v_subscription_id),
           paddle_adjustment_id = COALESCE(paddle_adjustment_id, v_adjustment_id),
           paddle_adjustment_action = COALESCE(paddle_adjustment_action, v_adjustment_action),
           paddle_adjustment_status = COALESCE(paddle_adjustment_status, v_adjustment_status),
           refund_review = CASE
             WHEN NOT refund_review
              AND billing_review_resolved_at IS NOT NULL
              AND billing_review_reason IS NOT DISTINCT FROM v_review_reason
               THEN false
             ELSE true
           END,
           billing_review_reason = CASE
             WHEN NOT refund_review
              AND billing_review_resolved_at IS NOT NULL
              AND billing_review_reason IS NOT DISTINCT FROM v_review_reason
               THEN billing_review_reason
             ELSE v_review_reason
           END,
           billing_review_resolved_at = CASE
             WHEN NOT refund_review
              AND billing_review_resolved_at IS NOT NULL
              AND billing_review_reason IS NOT DISTINCT FROM v_review_reason
               THEN billing_review_resolved_at
             ELSE NULL
           END
     WHERE event_id = v_event_id
       AND event_type = v_event_type
       AND provider = 'paddle'
       AND (user_id IS NULL OR v_user_id IS NULL OR user_id = v_user_id)
       AND paddle_transaction_id IS NOT DISTINCT FROM v_transaction_id
       AND (
         paddle_subscription_id IS NULL
         OR v_subscription_id IS NULL
         OR paddle_subscription_id = v_subscription_id
       )
       AND (paddle_adjustment_id IS NULL OR paddle_adjustment_id = v_adjustment_id)
       AND (paddle_adjustment_action IS NULL OR paddle_adjustment_action = v_adjustment_action)
       AND (paddle_adjustment_status IS NULL OR paddle_adjustment_status = v_adjustment_status);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'adjustment review identity mismatch'
        USING ERRCODE = '23505';
    END IF;
    RETURN 'updated';
  END IF;

  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_paddle_adjustment_review(text, text, text, text, text, text, text, timestamptz, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_paddle_adjustment_review(text, text, text, text, text, text, text, timestamptz, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paddle_adjustment_review(text, text, text, text, text, text, text, timestamptz, text, jsonb) TO service_role;

-- Replace 0117's lifecycle recorder. Provider-only rows now opt out of the
-- self-service mutex, so each distinct adjustment for one transaction gets its
-- own row and its own serialization lock.
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
  v_current_event_id     text;
  v_provider_ref         text;
  v_prior_event_id       text;
  v_prior_status         text;
  v_prior_event_at       timestamptz;
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

  -- A row lock cannot serialize the first event because no lifecycle row exists
  -- yet. Lock the immutable adjustment identity before reading either ledger so
  -- an ownerless terminal tombstone and a concurrent approved delivery cannot
  -- both decide they are first.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_adjustment_id, 0)
  );

  SELECT l.id, l.user_id, l.paddle_adjustment_status,
         l.paddle_adjustment_event_at, l.paddle_adjustment_event_id,
         l.provider_ref
    INTO v_log_id, v_user_id, v_current_status,
         v_current_event_at, v_current_event_id, v_provider_ref
    FROM public.billing_self_service_log l
   WHERE l.paddle_adjustment_id = v_adjustment_id
   FOR UPDATE;

  IF v_log_id IS NOT NULL
     AND v_provider_ref IS NOT NULL
     AND v_provider_ref <> v_adjustment_id THEN
    RAISE EXCEPTION 'refund adjustment provider reference mismatch'
      USING ERRCODE = '23505';
  END IF;

  IF v_log_id IS NULL THEN
    SELECT l.id, l.user_id, l.paddle_adjustment_status,
           l.paddle_adjustment_event_at, l.paddle_adjustment_event_id,
           l.provider_ref
      INTO v_log_id, v_user_id, v_current_status,
           v_current_event_at, v_current_event_id, v_provider_ref
      FROM public.billing_self_service_log l
     WHERE l.action = 'refund_request'
       AND l.paddle_transaction_id = v_transaction_id
       AND l.paddle_adjustment_id IS NULL
       AND (l.provider_ref IS NULL OR l.provider_ref = v_adjustment_id)
       AND NOT l.provider_adjustment_only
     ORDER BY CASE WHEN l.outcome IN ('pending', 'accepted') THEN 0 ELSE 1 END,
              l.created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  -- A signed lifecycle may have arrived before its transaction.completed owner
  -- anchor. Such an event lives only in the webhook ledger until attribution is
  -- possible, but it is still authoritative for ordering. Rows already marked
  -- stale are observations, not state, and must not become the next authority.
  SELECT e.event_id, e.paddle_adjustment_status, e.occurred_at
    INTO v_prior_event_id, v_prior_status, v_prior_event_at
    FROM public.paddle_webhook_events e
   WHERE e.provider = 'paddle'
     AND e.event_type IN ('adjustment.created', 'adjustment.updated')
     AND e.paddle_adjustment_id = v_adjustment_id
     AND e.paddle_adjustment_status IS NOT NULL
     AND e.billing_review_reason IS DISTINCT FROM 'stale_adjustment_lifecycle'
   ORDER BY e.occurred_at DESC NULLS LAST, e.processed_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_log_id IS NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.event_type = 'transaction.completed'
       AND e.provider = 'paddle'
       AND e.paddle_transaction_id = v_transaction_id
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;
  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id, paddle_transaction_id, occurred_at,
    paddle_adjustment_id, paddle_adjustment_status,
    refund_review, billing_review_reason, billing_review_resolved_at, provider
  ) VALUES (
    v_event_id, v_event_type, v_user_id, v_transaction_id, v_occurred_at,
    v_adjustment_id, v_status,
    v_user_id IS NULL OR v_status = 'approved',
    CASE
      WHEN v_user_id IS NULL THEN 'adjustment_owner_missing'
      WHEN v_status = 'approved' THEN 'refund_consequence_pending'
      ELSE NULL
    END,
    NULL, 'paddle'
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- A prior ownerless review may already own this provider event id. Verify
    -- every immutable identity, enrich NULL attribution only, then continue so
    -- the lifecycle row can be materialized once its owner becomes known.
    UPDATE public.paddle_webhook_events
       SET user_id = COALESCE(user_id, v_user_id),
           paddle_transaction_id = COALESCE(paddle_transaction_id, v_transaction_id),
           occurred_at = COALESCE(occurred_at, v_occurred_at),
           paddle_adjustment_id = COALESCE(paddle_adjustment_id, v_adjustment_id),
           paddle_adjustment_status = COALESCE(paddle_adjustment_status, v_status),
           refund_review = refund_review OR v_user_id IS NULL OR (
             v_status = 'approved'
             AND billing_review_resolved_at IS NULL
             AND NOT EXISTS (
               SELECT 1
                 FROM public.paddle_webhook_events c
                WHERE c.refund_consequence_adjustment_id = v_adjustment_id
                   OR c.event_id IN (
                     v_event_id || ':consequence',
                     v_adjustment_id || ':consequence'
                   )
             )
           ),
           billing_review_reason = CASE
             WHEN v_user_id IS NULL THEN COALESCE(
               billing_review_reason,
               'adjustment_owner_missing'
             )
             WHEN v_status = 'approved'
              AND billing_review_resolved_at IS NULL
              AND NOT EXISTS (
                SELECT 1
                  FROM public.paddle_webhook_events c
                 WHERE c.refund_consequence_adjustment_id = v_adjustment_id
                    OR c.event_id IN (
                      v_event_id || ':consequence',
                      v_adjustment_id || ':consequence'
                    )
              ) THEN COALESCE(
                billing_review_reason,
                'refund_consequence_pending'
              )
             ELSE billing_review_reason
           END,
           billing_review_resolved_at = CASE
             WHEN v_user_id IS NULL OR (
               v_status = 'approved'
               AND billing_review_resolved_at IS NULL
               AND NOT EXISTS (
                 SELECT 1
                   FROM public.paddle_webhook_events c
                  WHERE c.refund_consequence_adjustment_id = v_adjustment_id
                     OR c.event_id IN (
                       v_event_id || ':consequence',
                       v_adjustment_id || ':consequence'
                     )
               )
             ) THEN NULL
             ELSE billing_review_resolved_at
           END
     WHERE event_id = v_event_id
       AND event_type = v_event_type
       AND provider = 'paddle'
       AND (user_id IS NULL OR v_user_id IS NULL OR user_id = v_user_id)
       AND (
         paddle_transaction_id IS NULL
         OR paddle_transaction_id = v_transaction_id
       )
       AND (occurred_at IS NULL OR occurred_at = v_occurred_at)
       AND (
         paddle_adjustment_id IS NULL
         OR paddle_adjustment_id = v_adjustment_id
       )
       AND (
         paddle_adjustment_status IS NULL
         OR paddle_adjustment_status = v_status
       )
    RETURNING user_id INTO v_user_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'refund adjustment event identity mismatch'
        USING ERRCODE = '23505';
    END IF;

    IF v_log_id IS NOT NULL
       AND v_current_event_id = v_event_id
       AND v_current_status = v_status THEN
      RETURN 'duplicate';
    END IF;
  END IF;

  -- A ledger-only tombstone is enough to stop an older or post-terminal event,
  -- even before a user-owned billing row can be created. The current source is
  -- still retained and made operator-visible for reconciliation.
  IF v_prior_event_id IS NOT NULL
     AND v_prior_event_id <> v_event_id
     AND (
       (v_prior_event_at IS NOT NULL AND v_occurred_at < v_prior_event_at)
       OR (v_prior_status IN ('rejected', 'reversed') AND v_status <> v_prior_status)
       OR (v_prior_status = 'approved' AND v_status = 'pending_approval')
       OR (v_prior_status = 'approved' AND v_status = 'rejected')
     ) THEN
    UPDATE public.paddle_webhook_events
       SET refund_review = true,
           billing_review_reason = 'stale_adjustment_lifecycle',
           billing_review_resolved_at = NULL
     WHERE event_id = v_event_id;
    RETURN 'stale';
  END IF;

  IF v_user_id IS NULL THEN
    RETURN 'owner_missing_review';
  END IF;

  IF v_log_id IS NOT NULL THEN
    IF (v_current_event_at IS NOT NULL AND v_occurred_at < v_current_event_at)
       OR (v_current_status IN ('rejected', 'reversed') AND v_status <> v_current_status)
       OR (v_current_status = 'approved' AND v_status = 'pending_approval')
       OR (v_current_status = 'approved' AND v_status = 'rejected') THEN
      UPDATE public.paddle_webhook_events
         SET refund_review = true,
             billing_review_reason = 'stale_adjustment_lifecycle',
             billing_review_resolved_at = NULL
       WHERE event_id = v_event_id;
      RETURN 'stale';
    END IF;

    UPDATE public.billing_self_service_log
       SET outcome                    = v_outcome,
           paddle_adjustment_id       = v_adjustment_id,
           paddle_adjustment_status   = v_status,
           paddle_adjustment_event_id = v_event_id,
           paddle_adjustment_event_at = v_occurred_at,
           provider_ref               = COALESCE(provider_ref, v_adjustment_id),
           provider_error             = NULL,
           updated_at                 = now()
     WHERE id = v_log_id
       AND (provider_ref IS NULL OR provider_ref = v_adjustment_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'refund adjustment provider reference mismatch'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO public.billing_self_service_log (
      user_id, action, outcome, paddle_transaction_id,
      paddle_adjustment_id, paddle_adjustment_status,
      paddle_adjustment_event_id, paddle_adjustment_event_at,
      eligibility, eligibility_detail, provider_ref,
      provider_adjustment_only
    ) VALUES (
      v_user_id, 'refund_request', v_outcome, v_transaction_id,
      v_adjustment_id, v_status,
      v_event_id, v_occurred_at,
      'refund_already_requested',
      jsonb_build_object('source', 'paddle_adjustment', 'status', v_status),
      v_adjustment_id, true
    );
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.record_paddle_refund_adjustment(text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_paddle_refund_adjustment(text, text, text, text, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paddle_refund_adjustment(text, text, text, text, text, timestamptz) TO service_role;

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
  v_rows                    int;
  v_at                      timestamptz := COALESCE(p_occurred_at, now());
  v_adjustment_id           text := NULLIF(btrim(p_adjustment_id), '');
  v_source_event_id         text := NULLIF(btrim(p_event_id), '');
  v_consequence_event_id    text := v_adjustment_id || ':consequence';
  v_txn_id                  text := NULLIF(btrim(p_transaction_id), '');
  v_sub_id                  text := NULLIF(btrim(p_subscription_id), '');
  v_user_id                 uuid;
  v_target_subscription_id  text;
  v_transaction_at          timestamptz;
  v_current_provider        text;
  v_current_tier            text;
  v_current_event_at        timestamptz;
  v_current_subscription_id text;
  v_adjustment_status       text;
  v_adjustment_event_id     text;
  v_adjustment_user_id      uuid;
  v_adjustment_txn_id       text;
  v_existing_claim_event_id text;
  v_consequence_needs_review boolean := false;
  v_has_unmapped_legacy      boolean := false;
  v_has_later_payment       boolean := false;
  v_full                    boolean := COALESCE(p_is_full, false);
  v_provider                text := 'paddle';
  v_pack_event              text;
  v_claw                    jsonb;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF v_source_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;
  IF v_adjustment_id IS NULL THEN
    RAISE EXCEPTION 'adjustment_id required' USING ERRCODE = '22004';
  END IF;
  IF v_txn_id IS NULL THEN
    RAISE EXCEPTION 'transaction_id required' USING ERRCODE = '22004';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'positive amount_cents required' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN (
    'ARS', 'AUD', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK', 'DKK', 'EUR',
    'GBP', 'HKD', 'HUF', 'ILS', 'INR', 'JPY', 'KRW', 'MXN', 'NOK', 'NZD', 'PEN',
    'PLN', 'RUB', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'USD', 'VND', 'ZAR'
  ) THEN
    RAISE EXCEPTION 'supported currency required' USING ERRCODE = '22023';
  END IF;

  -- Serialize against lifecycle updates for this exact adjustment. A redelivery
  -- of an older approved event may arrive after Paddle has reversed it; the
  -- current locked status, not the incoming payload, decides whether money or
  -- entitlement may move. The recorder locks this same row before every update.
  SELECT l.user_id, l.paddle_transaction_id,
         l.paddle_adjustment_status, l.paddle_adjustment_event_id
    INTO v_adjustment_user_id, v_adjustment_txn_id,
         v_adjustment_status, v_adjustment_event_id
    FROM public.billing_self_service_log l
   WHERE l.paddle_adjustment_id = v_adjustment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund adjustment lifecycle not found'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_adjustment_txn_id IS DISTINCT FROM v_txn_id THEN
    RAISE EXCEPTION 'refund adjustment transaction mismatch'
      USING ERRCODE = '22023';
  END IF;
  -- The previous Edge version passed source_event_id:consequence as p_event_id
  -- and swallowed this RPC error before returning 200. The recorder's durable
  -- refund_consequence_pending marker prevents silent loss; the production
  -- runbook additionally keeps the webhook OFF until in-flight work reaches 0.
  IF v_source_event_id = v_adjustment_event_id || ':consequence'
     OR v_source_event_id = v_consequence_event_id THEN
    RAISE EXCEPTION 'source lifecycle event id required; deploy the matching paddle-webhook'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_adjustment_status IS DISTINCT FROM 'approved' THEN
    UPDATE public.paddle_webhook_events
       SET refund_review = true,
           billing_review_reason = CASE
             WHEN billing_review_reason IS NULL
               OR billing_review_reason = 'refund_consequence_pending'
               THEN 'consequence_skipped_not_approved'
             ELSE billing_review_reason
           END,
           billing_review_resolved_at = NULL
     WHERE event_id = v_adjustment_event_id;
    RETURN 'adjustment_not_approved_review';
  END IF;

  -- record_paddle_refund_adjustment and this function are separate RPC
  -- transactions. A newer approved lifecycle can therefore win between them.
  -- Bind the signed financial payload to the exact source event that still owns
  -- the locked lifecycle row before creating the adjustment-scoped claim.
  IF v_adjustment_event_id IS DISTINCT FROM v_source_event_id THEN
    UPDATE public.paddle_webhook_events
       SET refund_review = true,
           billing_review_reason = CASE
             WHEN billing_review_reason IS NULL
               OR billing_review_reason = 'refund_consequence_pending'
               THEN 'stale_consequence_source'
             ELSE billing_review_reason
           END,
           billing_review_resolved_at = NULL
     WHERE event_id = v_source_event_id
       AND event_type IN ('adjustment.created', 'adjustment.updated')
       AND provider = 'paddle'
       AND paddle_adjustment_id = v_adjustment_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'refund consequence source event not found'
        USING ERRCODE = 'P0002';
    END IF;
    RETURN 'stale_consequence_review';
  END IF;

  -- Bind money and entitlement to the completed transaction, never to a merely
  -- matching subscription row. This is the same provider-scoped ownership rule
  -- as 0133's apply_billing_event path.
  SELECT e.user_id,
         e.paddle_subscription_id,
         COALESCE(e.occurred_at, e.processed_at)
    INTO v_user_id, v_target_subscription_id, v_transaction_at
    FROM public.paddle_webhook_events e
   WHERE e.event_type = 'transaction.completed'
     AND e.provider = 'paddle'
     AND e.paddle_transaction_id = v_txn_id
     AND e.user_id IS NOT NULL
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'refund owner not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_user_id IS DISTINCT FROM v_adjustment_user_id THEN
    RAISE EXCEPTION 'refund adjustment owner mismatch'
      USING ERRCODE = '22023';
  END IF;

  -- Claim the consequence before every side effect. Any later exception rolls
  -- this insert back with the transaction, while a committed retry returns
  -- duplicate before it can write money, credits, or entitlement a second time.
  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id,
    paddle_subscription_id, paddle_transaction_id, occurred_at,
    refund_consequence_adjustment_id
  )
  VALUES (
    v_consequence_event_id, COALESCE(p_event_type, 'adjustment'), v_user_id,
    COALESCE(v_target_subscription_id, v_sub_id), v_txn_id, p_occurred_at,
    v_adjustment_id
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    SELECT c.event_id, c.refund_review
      INTO v_existing_claim_event_id, v_consequence_needs_review
      FROM public.paddle_webhook_events c
     WHERE c.refund_consequence_adjustment_id = v_adjustment_id
       AND c.user_id = v_user_id
       AND c.paddle_transaction_id = v_txn_id
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'refund consequence claim identity conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN CASE WHEN v_consequence_needs_review
      THEN 'duplicate_review' ELSE 'duplicate' END;
  END IF;

  -- billing_self_service_log retains only the newest lifecycle event id. An
  -- older deployment may therefore have committed an event-scoped consequence
  -- for an earlier created/updated delivery that cannot be mapped back to an
  -- adjustment with certainty. Never guess: claim the canonical adjustment for
  -- idempotency, apply no second side effect, and leave an operator-visible row.
  SELECT EXISTS (
    SELECT 1
      FROM public.paddle_webhook_events c
      JOIN public.paddle_webhook_events s
        ON c.event_id = s.event_id || ':consequence'
     WHERE c.event_id <> v_consequence_event_id
       AND c.refund_consequence_adjustment_id IS NULL
       AND c.user_id = v_user_id
       AND s.user_id = v_user_id
       AND s.event_type IN ('adjustment.created', 'adjustment.updated')
       AND s.provider = 'paddle'
       AND s.paddle_transaction_id = v_txn_id
  ) INTO v_has_unmapped_legacy;

  IF v_has_unmapped_legacy THEN
    UPDATE public.paddle_webhook_events
       SET refund_review = true,
           billing_review_reason = CASE
             WHEN billing_review_reason IS NULL
               OR billing_review_reason = 'refund_consequence_pending'
               THEN 'legacy_refund_consequence'
             ELSE billing_review_reason
           END,
           billing_review_resolved_at = NULL
     WHERE event_id IN (v_source_event_id, v_consequence_event_id);
    RETURN 'legacy_consequence_review';
  END IF;

  -- Use the same users-row mutex as every entitlement writer. Whichever of a
  -- renewal and a refund commits second re-evaluates the complete current state.
  SELECT u.subscription_provider, u.subscription_tier, u.subscription_event_at
    INTO v_current_provider, v_current_tier, v_current_event_at
    FROM public.users u
   WHERE u.id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown user %', v_user_id USING ERRCODE = 'P0002';
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
       AND paddle_adjustment_id = v_adjustment_id
       AND provider_refunded_at IS NULL;
  END IF;

  INSERT INTO public.revenue_events
    (user_id, amount_cents, currency, occurred_at,
     is_related_party, customer_relation_type, source, external_id)
  VALUES
    (v_user_id, -p_amount_cents, p_currency, v_at,
     false, 'arms_length', 'paddle', v_consequence_event_id)
  ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;

  -- A credit purchase lot distinguishes a one-time pack from a subscription.
  -- Both historic key conventions remain supported, and the consequence row
  -- just inserted is excluded from the event-id lookup.
  IF v_txn_id IS NOT NULL THEN
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
                  AND e.event_id <> v_consequence_event_id
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
        'refund adjustment ' || v_adjustment_id
      );
      IF COALESCE((v_claw ->> 'found')::boolean, false) THEN
        RETURN 'clawed_back';
      END IF;
      UPDATE public.paddle_webhook_events
         SET refund_review = true,
             billing_review_reason = CASE
               WHEN billing_review_reason IS NULL
                 OR billing_review_reason = 'refund_consequence_pending'
                 THEN 'pack_clawback_missed'
               ELSE billing_review_reason
             END,
             billing_review_resolved_at = NULL
       WHERE event_id IN (v_source_event_id, v_consequence_event_id);
      RETURN 'pack_clawback_missed';
    END IF;

    UPDATE public.paddle_webhook_events
       SET refund_review = true,
           billing_review_reason = CASE
             WHEN billing_review_reason IS NULL
               OR billing_review_reason = 'refund_consequence_pending'
               THEN 'pack_partial_refund'
             ELSE billing_review_reason
           END,
           billing_review_resolved_at = NULL
     WHERE event_id IN (v_source_event_id, v_consequence_event_id);
    RETURN 'pack_partial_review';
  END IF;

  -- Only an unambiguous full refund of the transaction that still owns the
  -- current Paddle entitlement may revoke it. A later renewal, another Paddle
  -- subscription, or a different provider is money-only + operator review.
  IF v_full AND v_user_id IS NOT NULL THEN
    SELECT e.paddle_subscription_id
      INTO v_current_subscription_id
      FROM public.paddle_webhook_events e
     WHERE e.event_type IN ('subscription.created', 'subscription.updated', 'subscription.canceled')
       AND e.provider = 'paddle'
       AND e.user_id = v_user_id
       AND e.paddle_subscription_id IS NOT NULL
       AND v_current_event_at IS NOT NULL
       AND COALESCE(e.occurred_at, e.processed_at) <= v_current_event_at
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;

    SELECT EXISTS (
      SELECT 1
        FROM public.paddle_webhook_events e
       WHERE e.event_type = 'transaction.completed'
         AND e.provider = 'paddle'
         AND e.user_id = v_user_id
         AND e.paddle_subscription_id = v_target_subscription_id
         AND e.paddle_transaction_id <> v_txn_id
         AND COALESCE(e.occurred_at, e.processed_at) > v_transaction_at
    ) INTO v_has_later_payment;

    IF COALESCE(v_current_tier, 'free') <> 'free'
       AND (
            v_current_provider IS DISTINCT FROM 'paddle'
         OR v_target_subscription_id IS NULL
         OR (v_sub_id IS NOT NULL AND v_sub_id IS DISTINCT FROM v_target_subscription_id)
         OR v_current_subscription_id IS DISTINCT FROM v_target_subscription_id
         OR v_has_later_payment
         OR (v_current_event_at IS NOT NULL AND v_at < v_current_event_at)
       ) THEN
      UPDATE public.paddle_webhook_events
         SET refund_review = true,
             billing_review_reason = CASE
               WHEN billing_review_reason IS NULL
                 OR billing_review_reason = 'refund_consequence_pending'
                 THEN 'entitlement_ownership_uncertain'
               ELSE billing_review_reason
             END,
             billing_review_resolved_at = NULL
       WHERE event_id IN (v_source_event_id, v_consequence_event_id);
      RETURN 'entitlement_review';
    END IF;

    -- Nothing remains to revoke. Money was still recorded above.
    IF COALESCE(v_current_tier, 'free') = 'free' THEN
      RETURN 'recorded';
    END IF;

    UPDATE public.users
       SET subscription_tier       = 'free',
           subscription_expires_at = NULL,
           subscription_event_at   = v_at
     WHERE id = v_user_id
       AND subscription_provider = 'paddle'
       AND subscription_tier <> 'free'
       AND subscription_event_at IS NOT DISTINCT FROM v_current_event_at
       AND (subscription_event_at IS NULL OR v_at >= subscription_event_at);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      UPDATE public.paddle_webhook_events
         SET refund_review = true,
             stale_entitlement = true,
             billing_review_reason = CASE
               WHEN billing_review_reason IS NULL
                 OR billing_review_reason = 'refund_consequence_pending'
                 THEN 'entitlement_write_race'
               ELSE billing_review_reason
             END,
             billing_review_resolved_at = NULL
       WHERE event_id IN (v_source_event_id, v_consequence_event_id);
      RETURN 'entitlement_review';
    END IF;
    RETURN 'revoked';
  END IF;

  RETURN 'recorded';
END;
$$;

COMMENT ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) IS
$c$Applies one settled Paddle refund consequence with an atomic adjustment claim.
The p_event_id argument is the exact source lifecycle event; the function checks
that it still owns the locked adjustment and derives adjustment_id:consequence.
The signed provider type is validated by the Edge handler and passed only as
p_is_full; accepted self-service history is settlement metadata, never evidence
that a provider-originated adjustment was full. Partial subscription refunds
record money without revocation. A full refund revokes only the current Paddle
entitlement for that transaction and subscription; otherwise it requires review.
Partial pack refunds require review.$c$;

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
  v_adjustment_id text;
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

  SELECT e.paddle_adjustment_id INTO v_adjustment_id
    FROM public.paddle_webhook_events e
   WHERE e.event_id = v_event_id
     AND e.event_type IN ('adjustment.created', 'adjustment.updated')
     AND e.provider = 'paddle'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded Paddle adjustment event not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Review state belongs to the adjustment, not only one delivery. Keep the
  -- canonical consequence claim in sync so a redelivery can distinguish an
  -- unresolved review from a committed-success duplicate. Operator resolution
  -- through any source event clears every lifecycle source plus the canonical
  -- claim while retaining normalized reasons. Marking remains event-scoped so
  -- one ambiguous delivery cannot taint already-settled sibling deliveries.
  UPDATE public.paddle_webhook_events
     SET refund_review = p_needs_review,
         billing_review_reason = CASE
           WHEN p_needs_review THEN COALESCE(
             billing_review_reason,
             'manual_refund_review'
           )
           ELSE billing_review_reason
         END,
         billing_review_resolved_at = CASE
           WHEN p_needs_review THEN NULL
           ELSE now()
         END
   WHERE event_id = v_event_id
      OR (
        v_adjustment_id IS NOT NULL
        AND refund_consequence_adjustment_id = v_adjustment_id
      )
      OR (
        NOT p_needs_review
        AND v_adjustment_id IS NOT NULL
        AND provider = 'paddle'
        AND event_type IN ('adjustment.created', 'adjustment.updated')
        AND paddle_adjustment_id = v_adjustment_id
      );

  RETURN CASE WHEN p_needs_review THEN 'marked' ELSE 'cleared' END;
END;
$$;

COMMENT ON FUNCTION public.set_paddle_refund_review(text, boolean) IS
  'Service-only reconciliation marker for a recorded source adjustment and its canonical consequence claim. Clearing resolves every source delivery for the adjustment and stamps billing_review_resolved_at while retaining normalized reasons.';

COMMENT ON COLUMN public.paddle_webhook_events.refund_review IS
  'true when a refund needs operator reconciliation: ambiguous signed type or financial evidence, an unconfirmed consequence, a legacy consequence, uncertain entitlement ownership, a partial pack refund, or a missed pack clawback. Distinct from stale_entitlement and provider_conflict.';

REVOKE ALL ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.set_paddle_refund_review(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_paddle_refund_review(text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_paddle_refund_review(text, boolean) TO service_role;
