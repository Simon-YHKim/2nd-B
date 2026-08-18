-- 0133_billing_provider_ownership.sql
-- Make the entitlement write path safe for a SECOND payment provider.
--
-- Simon decided 2026-08-19: a user belongs to exactly ONE payment provider at a
-- time, enforced in the database. This migration is that enforcement, plus the
-- three defects a second provider would otherwise trip.
--
-- ── THE DEFECT THAT MATTERS ──────────────────────────────────────────────────
--
-- 0109 made the entitlement write monotonic with a single per-USER clock,
-- users.subscription_event_at, and 0121 preserved it verbatim:
--
--   UPDATE public.users SET ... subscription_event_at = v_at
--    WHERE id = v_user_id
--      AND (subscription_event_at IS NULL OR v_at >= subscription_event_at);
--   IF ROW_COUNT = 0 THEN mark paddle_webhook_events.stale_entitlement END IF;
--
-- That clock does not know which provider stamped it. With two providers the
-- comparison is between UNRELATED timelines, and the loser is not rejected - it
-- is SKIPPED and recorded as `stale_entitlement`, a flag whose stated meaning is
-- "upstream delivery is reordering; the tier is still correct".
--
-- So: user pays Toss at 10:18, a Paddle renewal for 10:30 is processed first,
-- the Toss webhook lands late, 10:18 >= 10:30 is false, zero rows update, no
-- exception is raised, and a real payment disappears wearing the costume of an
-- upstream ordering artifact. Money in, no entitlement, and the ledger blames
-- the wrong thing.
--
-- Ownership fixes this at the root rather than patching the comparison: a
-- foreign provider never reaches the ordering guard at all, so within any one
-- provider 0109's semantics are exactly preserved.
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────
--
--   1. users.subscription_provider gains a CHECK. It was free-form text since
--      0020 and apply_billing_event validated only p_tier, so one typo in a new
--      webhook would silently mint a provider nobody owns.
--   2. paddle_webhook_events.provider records who sent each event, so a row is
--      attributable after the fact. Defaults to 'paddle': every existing row
--      predates any second provider.
--   3. apply_billing_event() takes ownership into account:
--        incumbent IS NULL            -> take ownership
--        incumbent = p_provider       -> unchanged 0109 path
--        incumbent <> p_provider AND the incumbent entitlement has lapsed
--                                     -> TAKEOVER (see the clock note below)
--        incumbent <> p_provider AND it is still live
--                                     -> CONFLICT: tier untouched, revenue still
--                                        logged, event flagged for a human
--   4. The 0121 supersede UPDATE gains a user_id predicate. It matched on
--      paddle_subscription_id alone, which is only safe while exactly one
--      provider mints those ids. That predicate should have been there anyway.
--   5. The 0115 renewal anchor is scoped by provider, so a subscription id
--      minted by one provider can never resolve an owner recorded by another.
--
-- ── THE CLOCK ON TAKEOVER ────────────────────────────────────────────────────
--
-- A takeover deliberately BYPASSES the ordering guard. The two providers' clocks
-- are unrelated, so the outgoing provider's last event (often a cancellation or
-- expiry, stamped late) would otherwise make the incoming provider's first event
-- look stale and swallow the very first paid renewal of the new subscription.
-- Bypassing is safe precisely because a takeover is only reached after the
-- incumbent entitlement is confirmed lapsed.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
--
-- The dedup key stays `event_id` alone rather than becoming (provider,
-- event_id). Making it composite would force rewriting apply_billing_refund
-- (0118 -> 0123 -> 0124) and every other `WHERE event_id = p_event_id`, none of
-- which have behavioural tests, to buy protection against two providers minting
-- byte-identical opaque ids. That is a real risk but a negligible one, and it is
-- not the risk that was hurting us. The `provider` column added here is what
-- makes rows attributable; promoting it into the key is a separate change that
-- should carry its own rewrite of the refund path.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- 1. Constrain the provider vocabulary
----------------------------------------------------------------------

-- Anything already in the column must pass, or the ADD CONSTRAINT fails on a
-- table we cannot afford to have unmigrated. Normalise first; prod only ever
-- had NULL or 'paddle', so this is a no-op there and a safety net elsewhere.
UPDATE public.users
   SET subscription_provider = lower(btrim(subscription_provider))
 WHERE subscription_provider IS NOT NULL
   AND subscription_provider <> lower(btrim(subscription_provider));

UPDATE public.users
   SET subscription_provider = NULL
 WHERE subscription_provider IS NOT NULL
   AND subscription_provider NOT IN ('paddle', 'toss', 'revenuecat', 'manual');

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_provider_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_provider_check
  CHECK (subscription_provider IS NULL
         OR subscription_provider IN ('paddle', 'toss', 'revenuecat', 'manual'));

COMMENT ON COLUMN public.users.subscription_provider IS
  'Which payment provider owns this user''s entitlement. Exactly one at a time (Simon 2026-08-19). apply_billing_event refuses a tier write from any other provider while this one is still live; see 0133.';

----------------------------------------------------------------------
-- 2. Make each recorded event attributable to a provider
----------------------------------------------------------------------

ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS provider_conflict boolean NOT NULL DEFAULT false;

ALTER TABLE public.paddle_webhook_events
  DROP CONSTRAINT IF EXISTS paddle_webhook_events_provider_check;

ALTER TABLE public.paddle_webhook_events
  ADD CONSTRAINT paddle_webhook_events_provider_check
  CHECK (provider IN ('paddle', 'toss', 'revenuecat', 'manual'));

COMMENT ON COLUMN public.paddle_webhook_events.provider IS
  'Which provider delivered this event. Defaults to paddle because every row predating 0133 is a Paddle delivery. The table keeps its name: renaming it would break apply_billing_refund and the self-service ledger for no behavioural gain.';

COMMENT ON COLUMN public.paddle_webhook_events.provider_conflict IS
  'true when the event was recorded but its entitlement was refused because a DIFFERENT provider still owns a live subscription for that user. Distinct from stale_entitlement, which means "same provider, arrived out of order". A non-zero count here is a person-shaped problem: the user is likely paying twice.';

-- The rows an operator has to find. Mirrors the 0123 unhandled-event index.
CREATE INDEX IF NOT EXISTS paddle_webhook_events_conflict_idx
  ON public.paddle_webhook_events (occurred_at DESC)
  WHERE provider_conflict;

----------------------------------------------------------------------
-- 3. apply_billing_event: ownership before entitlement
----------------------------------------------------------------------

-- 0121's exact 18-argument signature. DROP first because CREATE OR REPLACE
-- cannot change a function's default arguments in place.
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
  v_rows      int;
  v_at        timestamptz := COALESCE(p_occurred_at, now());
  v_sub_id    text := NULLIF(btrim(p_subscription_id), '');
  v_txn_id    text := NULLIF(btrim(p_transaction_id), '');
  v_user_id   uuid := p_user_id;
  v_provider  text := lower(NULLIF(btrim(p_provider), ''));
  v_source    text := lower(NULLIF(btrim(p_source), ''));
  v_owner     text;
  v_own_tier  text;
  v_own_until timestamptz;
  v_takeover  boolean := false;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) = 0 THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22004';
  END IF;
  IF p_tier IS NOT NULL AND p_tier NOT IN ('free', 'soma', 'cortex', 'brain') THEN
    RAISE EXCEPTION 'invalid tier: %', p_tier USING ERRCODE = '22023';
  END IF;

  -- 0133: the discriminator is validated now. It used to be free-form, so a
  -- typo in a new webhook would mint a provider silently and route nothing.
  IF v_provider IS NULL OR v_provider NOT IN ('paddle', 'toss', 'revenuecat', 'manual') THEN
    RAISE EXCEPTION 'invalid provider: %', p_provider USING ERRCODE = '22023';
  END IF;
  v_source := COALESCE(v_source, v_provider);
  IF v_source NOT IN ('paddle', 'toss', 'revenuecat', 'manual') THEN
    RAISE EXCEPTION 'invalid source: %', p_source USING ERRCODE = '22023';
  END IF;

  -- RENEWAL ANCHOR (0115). custom_data.user_id is attached at checkout; Paddle
  -- does not reliably carry it onto later renewal transactions, and the refund
  -- window anchors on the latest transaction.completed for a user.
  -- 0133: scoped by provider, so one provider's subscription id can never
  -- resolve an owner that a different provider recorded.
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN
    SELECT e.user_id
      INTO v_user_id
      FROM public.paddle_webhook_events e
     WHERE e.paddle_subscription_id = v_sub_id
       AND e.provider = v_provider
       AND e.user_id IS NOT NULL
     ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
     LIMIT 1;
  END IF;

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, user_id, provider,
    paddle_subscription_id, paddle_transaction_id, occurred_at,
    payment_method, payment_card_brand, payment_card_last4, scheduled_cancel_at
  )
  VALUES (
    p_event_id, COALESCE(p_event_type, 'unknown'), v_user_id, v_provider,
    v_sub_id, v_txn_id, p_occurred_at,
    NULLIF(btrim(p_payment_method), ''), NULLIF(btrim(p_card_brand), ''), NULLIF(btrim(p_card_last4), ''),
    p_scheduled_cancel_at
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  -- 0121: the provider's answer supersedes our optimism. An ACTIVE subscription
  -- with no scheduled cancellation means the user resumed it (or never really
  -- cancelled), so a still-'accepted' cancel row of ours is stale. Clearing it
  -- restores auto_renew=true, brings the in-app cancel control back, and frees
  -- billing_self_service_cancel_once_uidx for a genuine second cancel.
  -- 0133: scoped to the user. Matching on subscription id alone was only safe
  -- while exactly one provider minted those ids.
  IF v_sub_id IS NOT NULL
     AND v_user_id IS NOT NULL
     AND p_scheduled_cancel_at IS NULL
     AND p_tier IS NOT NULL
     AND p_tier <> 'free' THEN
    UPDATE public.billing_self_service_log
       SET outcome        = 'rejected',
           provider_error = 'superseded_by_provider',
           updated_at     = now()
     WHERE action = 'cancel'
       AND outcome = 'accepted'
       AND user_id = v_user_id
       AND paddle_subscription_id = v_sub_id
       AND created_at <= v_at;
  END IF;

  -- Reflect entitlement.
  IF p_tier IS NOT NULL AND v_user_id IS NOT NULL THEN
    -- Existence is checked separately from the ordering guard: without this, a
    -- deliberately-skipped stale event would look identical to an unknown user
    -- and raise, which makes the provider retry an event we correctly ignored.
    -- FOR UPDATE so two providers' webhooks cannot both read "not owned" and
    -- both proceed to claim the same user.
    SELECT u.subscription_provider, u.subscription_tier, u.subscription_expires_at
      INTO v_owner, v_own_tier, v_own_until
      FROM public.users u
     WHERE u.id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown user %', v_user_id USING ERRCODE = 'P0002';
    END IF;

    IF v_owner IS NOT NULL AND v_owner <> v_provider THEN
      IF COALESCE(v_own_tier, 'free') <> 'free'
         AND (v_own_until IS NULL OR v_own_until > v_at) THEN
        -- A different provider still holds a LIVE entitlement for this user.
        -- Refuse the tier write rather than letting two rails fight over one
        -- column. The money is still logged below: it moved regardless, and a
        -- user paying two providers at once is exactly what someone needs to
        -- see in order to refund one of them.
        UPDATE public.paddle_webhook_events
           SET provider_conflict = true
         WHERE event_id = p_event_id;

        RAISE WARNING '[apply_billing_event][ALERT] provider conflict: user % is owned by % but % sent event %',
          v_user_id, v_owner, v_provider, p_event_id;

        IF p_amount_cents IS NOT NULL THEN
          INSERT INTO public.revenue_events
            (user_id, amount_cents, currency, occurred_at,
             is_related_party, customer_relation_type, source, external_id)
          VALUES
            (v_user_id, p_amount_cents, COALESCE(p_currency, 'USD'), v_at,
             COALESCE(p_is_related_party, false), COALESCE(p_relation, 'arms_length'), v_source, p_event_id)
          ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
        END IF;

        RETURN 'provider_conflict';
      END IF;

      -- The incumbent has lapsed, so this is an ordinary handover.
      v_takeover := true;
    END IF;

    IF v_takeover THEN
      -- Ownership changed: the outgoing provider's clock is not comparable with
      -- the incoming one's, and applying 0109's guard across that boundary would
      -- swallow the first event of the new subscription. Safe to bypass here and
      -- only here, because the incumbent was just confirmed lapsed.
      UPDATE public.users
         SET subscription_tier       = p_tier,
             subscription_expires_at = p_expires_at,
             subscription_provider   = v_provider,
             subscription_event_at   = v_at
       WHERE id = v_user_id;

      RAISE WARNING '[apply_billing_event] provider handover: user % moved from % to % (event %)',
        v_user_id, v_owner, v_provider, p_event_id;
    ELSE
      -- 0109's ordering guard, PRESERVED VERBATIM. Now only ever compares two
      -- events from the SAME provider, which is the only comparison it was ever
      -- able to make sense of.
      UPDATE public.users
         SET subscription_tier       = p_tier,
             subscription_expires_at = p_expires_at,
             subscription_provider   = v_provider,
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
  END IF;

  -- Log real revenue (C4 columns) only for money-moving events. Always logged,
  -- even for a stale entitlement: the money moved regardless of arrival order.
  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (v_user_id, p_amount_cents, COALESCE(p_currency, 'USD'), v_at,
       COALESCE(p_is_related_party, false), COALESCE(p_relation, 'arms_length'), v_source, p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE ALL     ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
-- Supabase grants EXECUTE to anon on creation, so REVOKE FROM PUBLIC alone is
-- not enough; check:definer-grants enforces this line.
REVOKE EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.apply_billing_event(text, text, uuid, text, timestamptz, text, integer, text, timestamptz, boolean, public.customer_relation, text, text, text, text, text, text, timestamptz) IS
  'Single entitlement writer for every payment provider. Returns applied | duplicate | provider_conflict. One user is owned by one provider at a time (0133); a foreign provider may take over only once the incumbent entitlement has lapsed, and is refused while it is live.';
