-- 0109 -- Paddle gives no delivery-ordering guarantee and retries failures with
-- backoff, so a delayed event routinely lands after a newer one. The
-- entitlement write in apply_billing_event was unconditional, and nothing
-- recorded which event the current tier came from, so a stale delivery won and
-- stayed won:
--   * subscription.canceled -> 'free' processed, then a retried older
--     subscription.updated(active) re-grants the paid tier. A non-paying user
--     keeps access until the old expiry.
--   * cortex -> brain upgrade processed, then a retried updated(cortex) lands
--     and silently downgrades a paying brain subscriber, permanently.
-- Event-id idempotency does not help: these are DIFFERENT events, each seen once.

alter table public.users
  add column if not exists subscription_event_at timestamptz;

comment on column public.users.subscription_event_at is
  'occurred_at of the billing event that produced the current tier. Makes the entitlement write monotonic so a late/retried older event cannot overwrite a newer one.';

alter table public.paddle_webhook_events
  add column if not exists stale_entitlement boolean not null default false;

comment on column public.paddle_webhook_events.stale_entitlement is
  'true when the event was recorded but its entitlement was skipped for arriving out of order. Non-zero counts here mean upstream delivery is reordering; the tier is still correct.';

-- Seed from history so the guard has a baseline instead of letting the next
-- stale event through on a NULL.
update public.users u
   set subscription_event_at = (select max(r.occurred_at) from public.revenue_events r where r.user_id = u.id)
 where u.subscription_tier <> 'free'
   and u.subscription_event_at is null
   and exists (select 1 from public.revenue_events r where r.user_id = u.id);

-- Defaults on the trailing three params are preserved verbatim; CREATE OR
-- REPLACE cannot drop them.
create or replace function public.apply_billing_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_tier text,
  p_expires_at timestamptz,
  p_provider text,
  p_amount_cents integer,
  p_currency text,
  p_occurred_at timestamptz,
  p_is_related_party boolean default false,
  p_relation customer_relation default 'arms_length'::customer_relation,
  p_source text default 'paddle'::text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_rows  int;
  v_at    timestamptz := COALESCE(p_occurred_at, now());
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
    -- Existence is checked separately from the ordering guard: without this, a
    -- deliberately-skipped stale event would look identical to an unknown user
    -- and raise, which makes Paddle retry an event we correctly ignored.
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'unknown user %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.users
       SET subscription_tier       = p_tier,
           subscription_expires_at = p_expires_at,
           subscription_provider   = p_provider,
           subscription_event_at   = v_at
     WHERE id = p_user_id
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
      (p_user_id, p_amount_cents, COALESCE(p_currency, 'USD'), v_at,
       COALESCE(p_is_related_party, false), COALESCE(p_relation, 'arms_length'), p_source, p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  -- Contract preserved on purpose: the caller only distinguishes 'duplicate'.
  -- Staleness is observable on paddle_webhook_events.stale_entitlement instead
  -- of via a new return value that the edge function would treat as a failure.
  RETURN 'applied';
END;
$$;

revoke all on function public.apply_billing_event(text,text,uuid,text,timestamptz,text,integer,text,timestamptz,boolean,customer_relation,text) from public;
revoke all on function public.apply_billing_event(text,text,uuid,text,timestamptz,text,integer,text,timestamptz,boolean,customer_relation,text) from anon;
revoke all on function public.apply_billing_event(text,text,uuid,text,timestamptz,text,integer,text,timestamptz,boolean,customer_relation,text) from authenticated;

-- subscription_event_at joins the protected set. Without this a user could
-- self-write a far-future value and freeze their tier against all future
-- downgrades, including cancellation.
create or replace function public.block_self_tier_change()
returns trigger
language plpgsql
set search_path = ''
as $$
DECLARE
  v_xp_write boolean := current_setting('app.allow_xp_write', true) IS NOT DISTINCT FROM '1';
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.subscription_provider IS DISTINCT FROM OLD.subscription_provider
     OR NEW.subscription_event_at IS DISTINCT FROM OLD.subscription_event_at
     OR NEW.judge_mode IS DISTINCT FROM OLD.judge_mode THEN
    RAISE EXCEPTION 'protected user column may only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.minor_tier IS DISTINCT FROM OLD.minor_tier
     AND NEW.birth_date IS NOT DISTINCT FROM OLD.birth_date THEN
    RAISE EXCEPTION 'minor_tier may only be changed by the age gate (via birth_date) or service_role'
      USING ERRCODE = '42501';
  END IF;
  IF NOT v_xp_write AND (
       NEW.total_xp IS DISTINCT FROM OLD.total_xp
       OR NEW.onboarding_quest_completed_at IS DISTINCT FROM OLD.onboarding_quest_completed_at
     ) THEN
    RAISE EXCEPTION 'total_xp / onboarding_quest_completed_at may only be changed by award_xp'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
