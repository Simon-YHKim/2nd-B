-- 0087_paddle_billing_entitlement.sql
-- Phase 4 (commerce) - the missing "purchase -> entitlement" write path + idempotency.
--
-- Audit BLOCKER 1: a successful purchase only set an in-component `isPro`; nothing
-- ever wrote users.subscription_tier and there was no billing webhook, so a payer
-- stayed 'free' forever. Paddle (Merchant of Record) is the chosen rail; its webhook
-- (supabase/functions/paddle-webhook) calls apply_billing_event() below.
--
-- Mirrors the 0079 SSV pattern: a dedup ledger + a SECURITY DEFINER, service_role-only
-- function whose caller is a signature-verified webhook (no auth.uid). Every Paddle
-- event is recorded ON CONFLICT DO NOTHING, so a replayed / retried delivery is
-- processed at most once (Phase 2 axes 3 + 5). Tier reflection and revenue logging
-- are each optional so one function serves both subscription-status and money events.
--
-- subscription_tier is service_role-only (block_self_tier_change, 0038); this function
-- runs under the webhook's service_role JWT, so request.jwt.claim.role = 'service_role'
-- and the guard permits the UPDATE. The 0040 INSERT guard is INSERT-only and does not
-- block this UPDATE. Tiers use the DB-canonical set 'free','soma','cortex','brain'
-- (the webhook maps Paddle price ids to these; plus=cortex, pro=brain per tiers.ts).

-- Dedup ledger for Paddle webhook events (idempotency across ALL event types).
CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  user_id      uuid,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) ever touches this table.

-- Idempotency for the revenue row too (belt-and-suspenders; the event ledger above is
-- primary). external_id = Paddle event id. Partial so older NULL rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS revenue_events_source_external_uidx
  ON public.revenue_events (source, external_id)
  WHERE external_id IS NOT NULL;

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
  p_source            text DEFAULT 'paddle'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;
  IF p_tier IS NOT NULL AND p_tier NOT IN ('free', 'soma', 'cortex', 'brain') THEN
    RAISE EXCEPTION 'invalid tier: %', p_tier USING ERRCODE = '22023';
  END IF;

  -- Idempotency: record the event; only proceed on FIRST sight of this event id.
  INSERT INTO public.paddle_webhook_events (event_id, event_type, user_id)
  VALUES (p_event_id, COALESCE(p_event_type, 'unknown'), p_user_id)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Replay / Paddle retry: already processed -> apply nothing.
  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  -- Reflect entitlement (service_role passes block_self_tier_change 0038).
  IF p_tier IS NOT NULL AND p_user_id IS NOT NULL THEN
    UPDATE public.users
       SET subscription_tier      = p_tier,
           subscription_expires_at = p_expires_at,
           subscription_provider   = p_provider
     WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown user %', p_user_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Log real revenue (C4 columns) only for money-moving events.
  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (p_user_id, p_amount_cents, COALESCE(p_currency, 'USD'), COALESCE(p_occurred_at, now()),
       COALESCE(p_is_related_party, false), COALESCE(p_relation, 'arms_length'), p_source, p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text) FROM PUBLIC;
-- Belt-and-suspenders (house style: 0036/0039/0040): an anon probe against the live
-- project returns 42501 for the 0079 sibling, so PUBLIC-only would suffice today --
-- but default privileges can change, and a billing writer is the wrong place to find out.
REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text) TO service_role;
