-- 0118_billing_refund_reconciliation.sql
-- Closes the remaining findings from the 2026-08-10 adversarial audit of the
-- self-serve billing rail, all of them still ahead of the 2026-09-08 go-live.
--
-- 1. AN APPROVED REFUND WAS INVISIBLE TO THE APP (the biggest one). The refund
--    path creates a Paddle ADJUSTMENT; Paddle reviews it and approves it later,
--    and paddle-webhook acted on exactly four event types, acknowledging and
--    dropping everything else. So an approved refund returned the money and left
--    the paid tier untouched for the whole remaining period (up to ~12 months on
--    a yearly plan) while auto-renewal kept billing. It also never reversed the
--    revenue row, so C4 reporting permanently overstated net revenue by every
--    refunded won. apply_billing_refund() below records the adjustment, writes
--    the offsetting revenue row, and revokes the entitlement.
--
-- 2. A DRY RUN LOOKED EXACTLY LIKE A REAL SUBMISSION AND BLOCKED THE REAL ONE.
--    PADDLE_SELF_SERVICE_DRYRUN=1 is set in production right now. If it survives
--    the 2026-09-08 flip, every refund settles as outcome='accepted' with a
--    'dryrun:' provider_ref -- which sits inside the refund idempotency index, so
--    the user is told "submitted", nothing reaches Paddle, and their real request
--    is blocked forever after. 'dry_run' becomes its own outcome, deliberately
--    OUTSIDE both partial unique indexes, so a rehearsal is repeatable and can
--    never consume a real claim.
--
-- 3. A CLAIM STRANDED IN 'pending' WAS PERMANENT. If the isolate dies between
--    the claim and the settle, the row holds the index forever and the user is
--    answered 'duplicate' for a request that was never submitted, inside a
--    7-day window. sweep_stale_billing_claims() releases them.
--
-- 4. 0116 REINTRODUCED THE GUC 0112 PROVED IS NEVER SET. block_self_tier_insert()
--    reads request.jwt.claim.role alone, so its service_role bypass cannot fire
--    on this stack. billing_request_role() becomes SECURITY DEFINER + callable by
--    authenticated so a SECURITY INVOKER trigger can use it, and the trigger now
--    does. (It reads two session GUCs and nothing else; the caller can already
--    read its own JWT, so there is nothing to leak.)
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- 1. billing_request_role(): callable from a SECURITY INVOKER trigger
----------------------------------------------------------------------

-- 0115 created this as SECURITY INVOKER and revoked it from authenticated, which
-- is fine for DEFINER callers (they execute it as the function owner) but makes
-- it unusable from block_self_tier_insert(), a SECURITY INVOKER trigger that
-- runs as the inserting end user. DEFINER + an authenticated grant fixes that
-- without widening anything meaningful: the body reads two request GUCs that
-- describe the caller's own token.
CREATE OR REPLACE FUNCTION public.billing_request_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

REVOKE ALL     ON FUNCTION public.billing_request_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_request_role() FROM anon;
GRANT  EXECUTE ON FUNCTION public.billing_request_role() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.billing_request_role() TO service_role;

-- 0116's body verbatim except for the role derivation. Keeping the clamp itself
-- unchanged: it is what stops a self-inserted users row from seeding a future
-- subscription_event_at and permanently starving 0109's ordering predicate.
CREATE OR REPLACE FUNCTION public.block_self_tier_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.subscription_tier := 'free';
  NEW.subscription_expires_at := NULL;
  NEW.subscription_provider := NULL;
  NEW.subscription_event_at := NULL;
  NEW.total_xp := 0;
  NEW.onboarding_quest_completed_at := NULL;
  RETURN NEW;
END;
$$;

----------------------------------------------------------------------
-- 2. 'dry_run' is its own outcome, and it holds no claim
----------------------------------------------------------------------

ALTER TABLE public.billing_self_service_log
  DROP CONSTRAINT IF EXISTS billing_self_service_log_outcome_check;

ALTER TABLE public.billing_self_service_log
  ADD CONSTRAINT billing_self_service_log_outcome_check
  CHECK (outcome IN ('pending', 'accepted', 'rejected', 'provider_error', 'misconfigured', 'dry_run'));

-- When the provider actually settled a refund, and for how much. Both are NULL
-- until an adjustment event arrives, which is also how an operator tells a
-- submitted refund from a settled one.
ALTER TABLE public.billing_self_service_log
  ADD COLUMN IF NOT EXISTS provider_refunded_at     timestamptz,
  ADD COLUMN IF NOT EXISTS provider_refund_cents    integer;

COMMENT ON COLUMN public.billing_self_service_log.provider_refunded_at IS
  'When Paddle APPROVED the refund adjustment. NULL = submitted but not settled. Written by apply_billing_refund().';

-- The partial indexes are unchanged in predicate, but restate them so the intent
-- is visible next to the new outcome: 'dry_run' is not in ('pending','accepted'),
-- so a rehearsal never holds a claim.
DROP INDEX IF EXISTS public.billing_self_service_refund_once_uidx;
CREATE UNIQUE INDEX billing_self_service_refund_once_uidx
  ON public.billing_self_service_log (paddle_transaction_id)
  WHERE action = 'refund_request'
    AND outcome IN ('pending', 'accepted')
    AND paddle_transaction_id IS NOT NULL;

DROP INDEX IF EXISTS public.billing_self_service_cancel_once_uidx;
CREATE UNIQUE INDEX billing_self_service_cancel_once_uidx
  ON public.billing_self_service_log (paddle_subscription_id, effective_from)
  WHERE action = 'cancel'
    AND outcome IN ('pending', 'accepted')
    AND paddle_subscription_id IS NOT NULL;

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
  IF p_outcome NOT IN ('accepted', 'rejected', 'provider_error', 'misconfigured', 'dry_run') THEN
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

----------------------------------------------------------------------
-- 3. apply_billing_refund(): an approved refund finally lands
----------------------------------------------------------------------

-- Called by paddle-webhook for adjustment.created / adjustment.updated.
--
-- THREE THINGS, in one transaction, all idempotent on the Paddle event id:
--   a. record the event (same ledger + dedupe as apply_billing_event)
--   b. write the OFFSETTING revenue row - always, regardless of whether the
--      entitlement is revoked, because the money moved either way (C4)
--   c. revoke the entitlement, but only for a FULL refund
--
-- WHY (c) IS CONDITIONAL. A partial refund is a real thing (proration, a
-- goodwill credit, a tax correction) and must not end a subscription the user is
-- still paying for. p_is_full is decided by the caller from two independent
-- signals, either of which is sufficient: Paddle marking an adjustment item
-- 'full', or the refund matching an accepted self-serve request of ours (we only
-- ever submit type:'full'). When neither says full, the money is recorded and
-- the tier is left alone - the conservative direction, since an operator can
-- always revoke by hand but cannot un-revoke a subscription the user still has.
--
-- The revoke reuses 0109's monotonic guard: an adjustment always occurs AFTER
-- the payment it reverses, so it wins the ordering comparison, and a late or
-- replayed adjustment cannot clobber a NEWER subscription the user has since
-- started.
CREATE OR REPLACE FUNCTION public.apply_billing_refund(
  p_event_id       text,
  p_event_type     text,
  p_adjustment_id  text,
  p_transaction_id text,
  p_subscription_id text,
  p_occurred_at    timestamptz,
  p_amount_cents   integer,       -- POSITIVE amount refunded; stored negated
  p_currency       text,
  p_is_full        boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows    int;
  v_at      timestamptz := COALESCE(p_occurred_at, now());
  v_txn_id  text := NULLIF(btrim(p_transaction_id), '');
  v_sub_id  text := NULLIF(btrim(p_subscription_id), '');
  v_user_id uuid;
  v_full    boolean := COALESCE(p_is_full, false);
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;

  -- Owner: the transaction we refunded, else the subscription it belongs to.
  -- An adjustment payload carries no custom_data, so this lookup IS the only
  -- attribution path.
  IF v_txn_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_transaction_id = v_txn_id AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC LIMIT 1;
  END IF;
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_subscription_id = v_sub_id AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC LIMIT 1;
  END IF;

  -- (a) dedupe on the Paddle event id, exactly as apply_billing_event does.
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

  -- A refund we submitted ourselves is by construction a full refund; stamp the
  -- ledger row so an operator can tell a submitted request from a settled one.
  IF v_txn_id IS NOT NULL THEN
    UPDATE public.billing_self_service_log
       SET provider_refunded_at  = v_at,
           provider_refund_cents = p_amount_cents,
           updated_at            = now()
     WHERE action = 'refund_request'
       AND outcome = 'accepted'
       AND paddle_transaction_id = v_txn_id
       AND provider_refunded_at IS NULL;
    IF FOUND THEN
      v_full := true;
    END IF;
  END IF;

  -- (b) offsetting revenue row (C4). Negative, same currency, keyed by the
  -- adjustment event id so a redelivery cannot double-count it.
  IF p_amount_cents IS NOT NULL AND p_amount_cents <> 0 THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (v_user_id, -abs(p_amount_cents), COALESCE(p_currency, 'USD'), v_at,
       false, 'arms_length', 'paddle', p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  -- (c) revoke, full refunds only, under 0109's ordering guard.
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

REVOKE ALL     ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) TO service_role;

----------------------------------------------------------------------
-- 4. sweep_stale_billing_claims(): nothing stays 'pending' forever
----------------------------------------------------------------------

-- A claim is written BEFORE the Paddle call so a double tap cannot double-refund.
-- The cost of that ordering is that a crash between the two leaves a row holding
-- the idempotency index with nothing behind it, and the user is answered
-- 'duplicate' for a request that was never submitted -- inside a 7-day window
-- they cannot get back. Anything still 'pending' well past the 15s provider
-- timeout is not in flight; it is abandoned.
--
-- Settled as provider_error, which is exactly the "genuine failure, retry is
-- allowed" state the indexes already model.
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
     AND created_at < now() - p_older_than;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL     ON FUNCTION public.sweep_stale_billing_claims(interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sweep_stale_billing_claims(interval) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sweep_stale_billing_claims(interval) TO service_role;

-- Every 10 minutes (0067 is the precedent for scheduling from a migration).
-- Unschedule first so re-applying does not stack duplicate jobs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sweep-stale-billing-claims')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-stale-billing-claims');
    PERFORM cron.schedule(
      'sweep-stale-billing-claims',
      '*/10 * * * *',
      $job$SELECT public.sweep_stale_billing_claims();$job$
    );
  END IF;
END;
$$;
