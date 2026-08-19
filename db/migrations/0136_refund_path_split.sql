-- 0136_refund_path_split.sql
-- The refund path learns what was bought.
--
-- ── NUMBERING ────────────────────────────────────────────────────────────────
-- The planning docs (0134's header, docs/cowork-console-260820.md §7) call this
-- migration "0138", behind the purchase path (0136) and the expiry cron (0137).
-- The order was inverted deliberately: this is the fix that has to EXIST BEFORE
-- the purchase path ships, so it took the next free number instead of a
-- reserved one. Anyone grepping for 0138 should land here.
--
-- ── WHAT IS WRONG TODAY ──────────────────────────────────────────────────────
--
-- Three functions decide refunds, and all three answer the question "which
-- payment are we talking about?" the same way: the user's newest
-- transaction.completed row. None of them can say WHAT that payment bought,
-- because nothing in paddle_webhook_events records it - there is no price,
-- product, sku or amount column, and apply_billing_event never wrote one.
--
--   1. claim_billing_self_service (0115) resolves the transaction id that
--      subscription-manage then POSTs to Paddle as
--      {action:'refund', type:'full', transaction_id: <that id>}.
--      -> WRONG MONEY. A user asking to refund their 9,900원 subscription would
--         have their 4,900원 credit pack refunded instead, and the subscription
--         would keep billing. This is the worst of the three and it was not in
--         the original write-up.
--
--   2. refund_eligibility (0124) anchors BOTH the 7-day window and the
--      usage-since-payment gate on that same unqualified pick.
--      -> A pack bought on day 20 makes a 20-day-old subscription look freshly
--         paid, re-opening a refund window that had closed, and resets the
--         usage meter to "nothing used since payment".
--
--   3. apply_billing_refund (0118) revokes the tier on ANY full refund:
--      subscription_tier := 'free', subscription_expires_at := NULL.
--      -> Refunding a 4,900원 credit pack cancels a live 9,900원 subscription.
--
-- None of this fires today: there is no one-time product, no PADDLE_PRICE_PACK_*
-- env, and the credit ledger (0134/0135) is inert. All three arm themselves on
-- the day the purchase path records its first pack transaction, which is why
-- this lands first.
--
-- ── THE DISCRIMINATOR, AND WHY IT IS THE LEDGER ──────────────────────────────
--
-- The obvious fix is a product column on paddle_webhook_events. It was rejected:
-- it needs a new apply_billing_event argument, which needs an edge-function
-- redeploy before the DB change is useful, which is the 0127/0130 ordering trap
-- again - and it would be NULL for every row that already exists, so it could
-- not answer the question for the very rows a refund arrives against.
--
-- The credit ledger already IS the registry of "which transactions bought
-- credits": a purchase writes exactly one opening row keyed by
-- (provider, provider_event_id) under a unique index (0134 credit_ledger_provider_event_uidx).
-- So:
--
--     a transaction that opened a credit_ledger purchase lot is a one-time
--     product; everything else is exactly what it is today.
--
-- That is FAIL-OPEN TOWARD TODAY. With no packs in existence the NOT EXISTS
-- matches nothing and all three functions behave identically to 0124 / 0115 /
-- 0118. This migration cannot change the outcome of any refund that could
-- happen this week, which is the property that makes it safe to apply ahead of
-- the purchase path rather than alongside it.
--
-- ── THE KEY CONTRACT THE PURCHASE PATH MUST HONOUR ───────────────────────────
--
-- 0134's comment at grant_credits_purchase says provider_event_id "carries the
-- webhook event id so a retry is a unique-violation rather than a second grant".
-- A refund adjustment does NOT carry that event id - Paddle sends
-- {transaction_id, adjustment_id} and nothing else (paddle-webhook/index.ts,
-- the adjustment branch). So keying the lot on the event id alone would leave
-- the refund path unable to find the lot it must claw back.
--
-- PREFERRED, and what the purchase path should write:
--     credit_ledger.provider_event_id = the provider's TRANSACTION id.
-- It is what the refund carries, and it is a STRICTLY STRONGER idempotency key
-- than the event id: two different events about one transaction
-- (transaction.completed then transaction.updated) would each pass an
-- event-id-keyed unique index and grant the pack twice.
--
-- ACCEPTED ANYWAY: the webhook event id. Every lookup below matches on EITHER,
-- so a purchase path that follows 0134's original wording still refunds
-- correctly. This is tolerance, not indecision - the preference is stated once,
-- in a COMMENT ON that survives the comment stripping (see 0124's header for why
-- that matters), and the fallback exists so a wrong choice degrades into a slow
-- lookup rather than an unrefundable pack.
--
-- ── PARTIAL REFUNDS OF A PACK ────────────────────────────────────────────────
--
-- clawback_credits removes ALL unspent units of the lot (0134). That is right
-- for a full refund and wrong for a partial one: returning half the money must
-- not remove all the credits. Proportional clawback is a product decision nobody
-- has made, so this migration does not invent one. A partial refund of a pack
-- records the money, touches no credits, and sets refund_review so it is a row
-- an operator can find rather than a silent nothing.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- 1. The operator's inbox for a refund we deliberately did not automate
----------------------------------------------------------------------

ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS refund_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.paddle_webhook_events.refund_review IS
  'true when a refund was recorded but its consequence was left to a human on purpose - today only: a PARTIAL refund of a one-time credit pack, where clawing back every unspent unit would take more than the money returned. Distinct from stale_entitlement (same provider, out of order) and provider_conflict (a different provider owns the entitlement).';

-- Mirrors the 0123 unhandled-event and 0133 conflict indexes: the rows a person
-- has to find are the ones worth an index.
CREATE INDEX IF NOT EXISTS paddle_webhook_events_refund_review_idx
  ON public.paddle_webhook_events (occurred_at DESC)
  WHERE refund_review;

-- The preference stated where a reader of the live database will see it.
COMMENT ON COLUMN public.credit_ledger.provider_event_id IS
  'For kind=purchase this SHOULD be the provider TRANSACTION id, not the webhook event id: a refund adjustment carries only {transaction_id, adjustment_id}, and one transaction can raise more than one event (so an event-id key would let a redelivery grant the pack twice). 0136 accepts either key when it looks up a lot to claw back, but the transaction id is the one to write.';

----------------------------------------------------------------------
-- 2. claim_billing_self_service: refund the subscription, not the pack
----------------------------------------------------------------------

-- 0115's body, with ONE added predicate on the transaction pick. The
-- subscription lookup above it is untouched.
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

  -- The id below is handed to Paddle as the thing to refund. A one-time credit
  -- pack must never be it: this claim is raised from the subscription screen,
  -- which is about the subscription. Pack refunds get their own path in the shop.
  SELECT e.paddle_transaction_id
    INTO v_txn_id
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type = 'transaction.completed'
     AND e.paddle_transaction_id IS NOT NULL
     AND NOT EXISTS (
           SELECT 1
             FROM public.credit_ledger cl
            WHERE cl.kind = 'purchase'
              AND cl.provider = e.provider
              AND cl.provider_event_id IN (e.paddle_transaction_id, e.event_id)
         )
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


----------------------------------------------------------------------
-- 3. refund_eligibility: anchor the window on the subscription payment
----------------------------------------------------------------------

-- 0124's body - including the recorded-decision constants (c_window_days = 7,
-- c_free_per_week = 2, policy 'revised' on every path, usage_gate_applies always
-- true; Simon 2026-08-11, unchanged here) - with the same single predicate added
-- where the anchor is picked. The COMMENT ON from 0124 is re-attached below with
-- the 0136 note appended, because CREATE OR REPLACE keeps the old comment and a
-- stale one is worse than none.
--
-- (The wording above avoids one bare two-letter destination word for a real
-- reason: check:definer-grants Rule A is comment-blind and scans across
-- statement boundaries, so prose sitting between a GRANT and the next CREATE
-- can trip it. Same family of trap as the i18n literal pins.)
CREATE OR REPLACE FUNCTION public.refund_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
  v_is_owner := (public.billing_request_role() = 'service_role');
  IF NOT v_is_owner THEN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_tier := public.effective_subscription_tier(p_user_id);

  -- A one-time credit pack is not the payment this window is about. Without
  -- this the pack would both re-open a closed window and reset the usage gate,
  -- because both are measured from v_paid_at.
  SELECT e.paddle_transaction_id,
         e.paddle_subscription_id,
         COALESCE(e.occurred_at, e.processed_at) AS paid_at
    INTO v_txn
    FROM public.paddle_webhook_events e
   WHERE e.user_id = p_user_id
     AND e.event_type = 'transaction.completed'
     AND e.paddle_transaction_id IS NOT NULL
     AND NOT EXISTS (
           SELECT 1
             FROM public.credit_ledger cl
            WHERE cl.kind = 'purchase'
              AND cl.provider = e.provider
              AND cl.provider_event_id IN (e.paddle_transaction_id, e.event_id)
         )
   ORDER BY COALESCE(e.occurred_at, e.processed_at) DESC
   LIMIT 1;

  IF v_txn IS NULL THEN
    RETURN jsonb_build_object(
      'status',             'no_payment',
      'tier',               v_tier,
      'policy',             'revised',
      'usage_gate_applies', true,
      'refund_window_days', c_window_days,
      'free_runs_per_week', c_free_per_week
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.billing_self_service_log l
     WHERE l.user_id = p_user_id
       AND l.action = 'refund_request'
       AND l.outcome IN ('pending', 'accepted')
       AND l.paddle_transaction_id IS NOT DISTINCT FROM v_txn.paddle_transaction_id
  ) THEN
    RETURN jsonb_build_object(
      'status',             'refund_already_requested',
      'tier',               v_tier,
      'policy',             'revised',
      'usage_gate_applies', true,
      'paid_at',            v_txn.paid_at,
      'transaction_id',     v_txn.paddle_transaction_id,
      'refund_window_days', c_window_days,
      'free_runs_per_week', c_free_per_week
    );
  END IF;

  v_paid_at := v_txn.paid_at;

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
  v_weeks     := GREATEST(1, CEIL(v_age_days / 7.0))::int;
  v_allowance := c_free_per_week * v_weeks;

  SELECT count(*)
    INTO v_runs
    FROM public.reasoning_runs r
   WHERE r.user_id = p_user_id
     AND r.created_at >= v_paid_at
     AND r.status NOT IN ('cancelled', 'failed', 'recovered');

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
    'policy',              'revised',
    'usage_gate_applies',  true,
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

COMMENT ON FUNCTION public.refund_eligibility(uuid) IS
$c$RECORDED DECISION, Simon, 2026-08-11: keep this behaviour as is.

WHAT THIS FUNCTION DOES: applies the revised refund rule (7 days AND usage since
payment within the free-plan allowance) to EVERY payment. There is no
effective-date comparison and no grace branch. c_window_days = 7,
policy = 'revised' and usage_gate_applies = true on every return path.

WHY THAT IS WORTH A NOTE. The previous policy promised 30 days unconditionally.
Narrowing it is a change unfavourable to the user, and 이용약관 제3조② promises
"이용자에게 불리한 변경은 30일 전 공지". The live notice (public.notices d3ff81e6)
was published 2026-08-11 02:06 KST for an effective date of 2026-08-11: zero days
of advance notice. An earlier notice a3d822d5 (published 2026-08-09 20:26 KST) DID
carry a grace clause preserving the 30-day standard for payments made before the
effective date; it was lost in the re-issues a3d822d5 to 22eedef0 to d3ff81e6, not
consciously dropped.

THE SUBSTANCE IS DEFENSIBLE; ONLY THE PROCEDURE IS EXPOSED. 전자상거래법 제17조
제1항 sets the statutory withdrawal period at 7 days and 제17조제2항제5호 permits
restricting it for digital content already provided, so the revised rule is not
below the statutory floor. The old 30-day promise was more generous than required.
The single open item is the notice period, not the rule.

CURRENT EXPOSURE IS ZERO BY ACCIDENT, NOT BY DESIGN. One real payment exists
(2026-08-08 09:24 KST) but all pre-0115 webhook rows have paddle_transaction_id
NULL, and this function requires that id, so that user falls through to
'no_payment' and reaches human support instead. From paddle-webhook v15 onward the
id is captured normally.

RE-OPEN THIS JUDGEMENT when the first transaction.completed row with a non-null
transaction id appears, because that is when the ungraced rule starts reaching
real users:
  select count(*) from public.paddle_webhook_events
   where event_type = 'transaction.completed' and paddle_transaction_id is not null;

AMENDED BY 0136 (2026-08-20), scope only, no constant changed: the transaction
this function anchors on now excludes any transaction that opened a credit_ledger
purchase lot. A one-time credit pack is not the payment the subscription refund
window is about; before 0136 a pack would have re-opened a closed window and reset
the usage gate to zero. With no packs in existence the predicate matches nothing
and the behaviour is identical to the body recorded above.

See docs/legal/refund-policy.md section 개정 경위, db/migrations/0124,
db/migrations/0136, and supabase/functions/subscription-manage/index.ts.$c$;


----------------------------------------------------------------------
-- 4. apply_billing_refund: revoke a subscription, claw back a pack
----------------------------------------------------------------------

-- 0118's body with one new branch between the revenue offset and the revoke.
-- The 9-argument signature is UNCHANGED on purpose: paddle-webhook already
-- calls it with exactly these names, so this migration needs no edge-function
-- redeploy and cannot hit the 0127/0130 deploy-order trap.
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
  -- adjustment event id so a redelivery cannot double-count it. This half is
  -- identical for a subscription and for a pack: money came back either way.
  IF p_amount_cents IS NOT NULL AND p_amount_cents <> 0 THEN
    INSERT INTO public.revenue_events
      (user_id, amount_cents, currency, occurred_at,
       is_related_party, customer_relation_type, source, external_id)
    VALUES
      (v_user_id, -abs(p_amount_cents), COALESCE(p_currency, 'USD'), v_at,
       false, 'arms_length', 'paddle', p_event_id)
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
  END IF;

  -- (b2) 0136: WHAT DID THE REFUNDED TRANSACTION BUY?
  --
  -- The credit ledger answers it, because a pack purchase is the only thing
  -- that opens a purchase lot. Both key conventions are accepted (see this
  -- file's header): the provider transaction id, which is what a refund
  -- carries, and the webhook event id, which is what 0134's comment proposed.
  -- The exclusion of p_event_id keeps the row we inserted at (a) - which shares
  -- this transaction id - out of the event-id side of the lookup.
  IF v_txn_id IS NOT NULL THEN
    SELECT e.provider INTO v_provider
      FROM public.paddle_webhook_events e
     WHERE e.paddle_transaction_id = v_txn_id
       AND e.event_id <> p_event_id
     ORDER BY COALESCE(e.occurred_at, e.processed_at) ASC LIMIT 1;
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

  -- (c) A ONE-TIME PACK. Never touch the tier: the subscription was not what
  -- was refunded, and revoking it here is precisely the defect 0136 exists to
  -- remove.
  IF v_pack_event IS NOT NULL THEN
    IF v_full THEN
      v_claw := public.clawback_credits(
        v_provider, v_pack_event,
        'refund adjustment ' || COALESCE(p_adjustment_id, p_event_id)
      );
      -- found=false means the lot moved between the lookup and the call. Do not
      -- guess; leave it for a person.
      IF COALESCE((v_claw ->> 'found')::boolean, false) THEN
        RETURN 'clawed_back';
      END IF;
      UPDATE public.paddle_webhook_events
         SET refund_review = true
       WHERE event_id = p_event_id;
      RETURN 'pack_clawback_missed';
    END IF;

    -- Partial refund of a pack: clawback_credits takes ALL unspent units, which
    -- is more than the money returned. Proportional clawback is unspecified, so
    -- record the money and flag the row instead of inventing a rule.
    UPDATE public.paddle_webhook_events
       SET refund_review = true
     WHERE event_id = p_event_id;
    RETURN 'pack_partial_review';
  END IF;

  -- (d) revoke, full refunds only, under 0109's ordering guard. Unchanged from
  -- 0118 - this is now reached only when the refunded transaction did NOT open a
  -- credit lot, i.e. for the subscription payments this branch always meant.
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
$c$Applies the consequence of a settled refund. Returns one of:
  duplicate            - this adjustment event was already applied
  revoked              - full refund of a SUBSCRIPTION payment; tier set to free
  recorded             - partial refund of a subscription payment; money only
  clawed_back          - full refund of a one-time credit pack; unspent units removed, tier untouched
  pack_partial_review  - partial refund of a pack; money recorded, refund_review set, credits untouched
  pack_clawback_missed - the pack lot vanished between lookup and clawback; refund_review set

0136 (2026-08-20) added the pack branches. Before it, EVERY full refund revoked
the tier, so refunding a credit pack would have cancelled a live subscription.
The discriminator is the credit ledger: a transaction that opened a
credit_ledger purchase lot is a one-time product. With no packs in existence the
lookup matches nothing and the behaviour is 0118's exactly.$c$;

----------------------------------------------------------------------
-- 5. Security posture, restated for all three functions
----------------------------------------------------------------------

-- Every REVOKE/GRANT in this migration sits here, at the end, rather than under
-- each function. Two reasons, and the second is the load-bearing one:
--
--   1. CREATE OR REPLACE preserves existing privileges, so re-stating them is
--      documentation of the intended posture rather than a change. Keeping them
--      in one block makes the whole posture readable at a glance.
--   2. check:definer-grants Rule A scans forward from a GRANT across statement
--      boundaries and is comment-blind. With the grants interleaved, the
--      recorded-decision prose in section 3 sat after a GRANT and matched the
--      rule, which is a false positive but a real red build. Grants last means
--      nothing but grants follows a grant.
--
-- Supabase auto-grants EXECUTE for anon AND authenticated the moment a function
-- is created, so REVOKE FROM PUBLIC alone is not enough: each signature revokes
-- anon explicitly (0036 / 0082 / 0098).

REVOKE ALL     ON FUNCTION public.claim_billing_self_service(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_billing_self_service(uuid, text, text, text, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_billing_self_service(uuid, text, text, text, jsonb) TO service_role;

-- refund_eligibility is the one a signed-in person may call about themselves;
-- the body still refuses any p_user_id other than auth.uid().
REVOKE ALL     ON FUNCTION public.refund_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_eligibility(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_billing_refund(text, text, text, text, text, timestamptz, integer, text, boolean) TO service_role;
