-- 0123_record_unhandled_billing_events.sql
-- An adjustment status we did not anticipate must not vanish.
--
-- The webhook validates a refund adjustment against four statuses
-- (pending_approval / approved / rejected / reversed) and returns 400 for
-- anything else. That set is an ASSUMPTION: this repo has no adjustment webhook
-- precedent, the sandbox comparison is still outstanding, and the shape was
-- written from model knowledge. A 400 makes Paddle retry and then mark the
-- delivery failed, so an unexpected status leaves no row in
-- paddle_webhook_events, no row in billing_self_service_log, and nothing to
-- reconcile from on our side - visible only in Paddle's own dashboard, which is
-- not where anyone would look for a missing refund.
--
-- The fix is to stop making an unverified assumption load-bearing:
--
--   unknown status          -> 200, record the event AND its payload, log a
--                              greppable ALERT, touch NO tier and NO revenue
--   missing adjustment id   -> still 400. Without an id there is nothing to
--   or transaction id          address, and guessing which payment a refund
--                              belongs to is the one thing that must never be
--                              inferred.
--
-- WHY THE RAW PAYLOAD, AND ONLY HERE. The whole problem is that we do not know
-- the real shape; a redacted subset would redact away the very evidence needed
-- to correct the assumption. It is stored ONLY for events we could not handle
-- (expected: zero rows in normal operation), and purged after 90 days by the
-- cron job below, so this is a diagnostic buffer rather than a payload archive.
--
-- Idempotent, forward-only. Safe to re-apply.

ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

COMMENT ON COLUMN public.paddle_webhook_events.raw_payload IS
  'Diagnostic only, and only for events the webhook could NOT handle (unknown adjustment status). Lets an unverified payload assumption be corrected from real data instead of guessed at again. Purged after 90 days by purge_unhandled_billing_payloads().';

-- Rows written here are exactly the ones an operator needs to find.
CREATE INDEX IF NOT EXISTS paddle_webhook_events_unhandled_idx
  ON public.paddle_webhook_events (occurred_at DESC)
  WHERE raw_payload IS NOT NULL;

-- record_unhandled_billing_event(): the trace, and nothing else.
--
-- Deliberately NOT apply_billing_refund(): that function stamps a matching
-- accepted self-serve refund row and, on finding one, treats the refund as FULL
-- and revokes the entitlement. For a status we do not understand, revoking is
-- exactly the wrong move. This writes the event row and stops.
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
  v_rows    int;
  v_sub_id  text := NULLIF(btrim(p_subscription_id), '');
  v_txn_id  text := NULLIF(btrim(p_transaction_id), '');
  v_user_id uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR length(btrim(p_event_id)) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;

  -- Best-effort attribution so the row is findable by user; never required.
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

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id,
    paddle_subscription_id, paddle_transaction_id, occurred_at, raw_payload
  )
  VALUES (
    btrim(p_event_id), COALESCE(p_event_type, 'unknown'), v_user_id,
    v_sub_id, v_txn_id, p_occurred_at, p_payload
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN CASE WHEN v_rows = 0 THEN 'duplicate' ELSE 'recorded' END;
END;
$$;

REVOKE ALL     ON FUNCTION public.record_unhandled_billing_event(text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_unhandled_billing_event(text, text, text, text, timestamptz, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_unhandled_billing_event(text, text, text, text, timestamptz, jsonb) TO service_role;

-- The payload is a diagnostic buffer, not an archive. The event row itself stays
-- (it is the dedupe ledger); only the stored body ages out.
CREATE OR REPLACE FUNCTION public.purge_unhandled_billing_payloads(p_retention_days int DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.paddle_webhook_events
     SET raw_payload = NULL
   WHERE raw_payload IS NOT NULL
     AND COALESCE(occurred_at, processed_at) < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL     ON FUNCTION public.purge_unhandled_billing_payloads(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_unhandled_billing_payloads(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_unhandled_billing_payloads(int) TO service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-unhandled-billing-payloads')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-unhandled-billing-payloads');
    PERFORM cron.schedule(
      'purge-unhandled-billing-payloads',
      '17 4 * * *',
      'SELECT public.purge_unhandled_billing_payloads(90);'
    );
  END IF;
END;
$do$;
