-- 0134_credit_ledger.sql
-- The credit ledger, inert.
--
-- Simon decided 2026-08-19: build 1개월 이용권 · 회차권 · 크레딧 · 상점.
-- The driver is not a currency for its own sake - 삼성페이 and 페이코 cannot do
-- RECURRING payment on ANY processor (Paddle documents them as one-time only;
-- 토스 supports 자동결제 for 네이버페이·토스페이 only), so a one-time product is
-- the only way to open those methods at all.
--
-- Simon's three answers that shape this file:
--   1. 남의것 불가하게  -> credits buy OUR services and nothing else. See §0.
--   2. 상점 ok          -> the shop is built; the surface split is in 0136+.
--   3. 표준을 따른다     -> 신유형 상품권 표준약관 제10073호 is the floor. See §3.
--
-- ── §0. THE ONE INVARIANT THAT IS A LEGAL BOUNDARY, NOT A PREFERENCE ─────────
--
-- 전자금융거래법 제2조제14호 defines 선불전자지급수단 as value used to buy goods
-- or services "발행인 ... 외의 제3자로부터" - FROM A THIRD PARTY OTHER THAN THE
-- ISSUER. A credit spendable only on the issuer's own service has no third
-- party, so it falls outside the definition entirely: no 등록, no 자본금 20억,
-- no 선불충전금 별도관리, no 제19조 환급의무.
--
-- The moment credits can buy anything from anyone else - an affiliate, another
-- user's template, a marketplace listing - that is no longer true AT ANY
-- REVENUE, including zero. Registration then requires a 법인 with 자본금 20억
-- (제30조제2항 + 시행령 제17조제1항제3호); an 개인사업자 cannot register at all.
-- Operating unregistered is 3년 이하 징역 또는 2천만원 이하 벌금 (제49조제5항제5호).
--
-- So the boundary is enforced STRUCTURALLY, not by policy: this table has no
-- `to_user_id`, no `transferable`, no `payee`. There is no column in which a
-- third party could be named. Adding one is not a feature - it is a change of
-- regulatory status, and it must go past Simon and a lawyer, not past code
-- review. The `feature` CHECK is the same fence from the other side: credits are
-- spent on an enumerated list of OUR capabilities.
--
-- ── WHY A LEDGER AND NOT A COUNTER ───────────────────────────────────────────
--
-- usage_counters.reward_credits / reward_consumed are two monotonic integers on
-- a (user_id, month_bucket) row. They can state a balance and nothing else. They
-- cannot answer "which of the three packs this person bought does this ₩4,900
-- refund belong to, and how much of it was unused when they asked" - and that is
-- the only question that matters when a 15-year-old's guardian invokes 민법
-- 제141조 years later (제146조 leaves that open for up to 8 years, 상법 제64조
-- for 5). A partial refund is not expressible over a counter at all.
--
-- Hence: append-only entries, grouped into lots, balance DERIVED, and a cache
-- row that exists to be a mutex and a tripwire rather than a source of truth.
--
-- ── INERT ON PURPOSE ─────────────────────────────────────────────────────────
--
-- NOTHING CALLS ANY OF THIS YET. No existing function is modified, no existing
-- column is written, no behaviour changes. That is deliberate: this migration
-- cannot break the app, so it can be applied and verified before the cutover
-- (0135), the purchase path (0136), the expiry cron (0137), and the refund-path
-- split (0138) are written. Applying it early is the safe move, not the risky one.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- 1. credit_ledger - the append-only truth
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULLABLE + ON DELETE SET NULL, deliberately mirroring revenue_events.
  -- A deleted account must not erase the evidence that a purchase happened and
  -- how much of it was unspent, because the 민법 제146조 window outlives the
  -- account by years. delete-account must not be "fixed" to CASCADE here.
  user_id           uuid REFERENCES public.users (id) ON DELETE SET NULL,

  kind              text NOT NULL CHECK (kind IN (
                      'purchase',        -- money in            -> opens a lot
                      'promo',           -- 무상 제공            -> opens a lot
                      'ad_reward',       -- rewarded video      -> opens a lot
                      'spend',           -- consumed by a feature      (negative)
                      'spend_refund',    -- failed run returns it      (positive)
                      'expire',          -- lot remainder expired      (negative)
                      'refund_clawback', -- money refunded, unspent removed (negative)
                      'adjust'           -- operator correction, memo required
                    )),

  -- ONE UNIT = ONE REASONING RUN. Chat is NOT on this scale and must not be:
  -- one reasoning run and one chat message differ by ~2 orders of magnitude in
  -- cost, and a unit's meaning is the one thing that can never be migrated -
  -- changing it silently rewrites every historical row. If chat ever needs to be
  -- purchasable, credits BUY a chat bonus; they do not meter chat.
  units             int NOT NULL CHECK (units <> 0),

  -- Lot identity. An opening row points at ITSELF; every consuming row points at
  -- the opening row it draws from. This is what makes a partial refund
  -- expressible: the lot's SUM(units) is "how much of that purchase is left".
  lot_id            uuid NOT NULL,
  lot_opened_at     timestamptz NOT NULL,
  lot_expires_at    timestamptz,   -- NULL = never; required for IAP lots, see §3

  feature           text CHECK (feature IS NULL OR feature IN ('reasoning')),
  sku               text,          -- set on opening rows for purchases

  -- Money attribution. Same (provider, event id) pair the billing path keys on,
  -- so this ledger and revenue_events reconcile without adding a SKU column to
  -- revenue_events (C4's required columns stay untouched).
  provider          text CHECK (provider IS NULL OR provider IN ('paddle', 'toss', 'revenuecat', 'manual')),
  provider_event_id text,
  amount_cents      integer,       -- gross paid for THIS lot; NULL for promo/ad
  currency          char(3),

  idempotency_key   text,          -- caller-supplied; see spend_credits()
  memo              text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credit_ledger_sign CHECK (
    (kind IN ('purchase', 'promo', 'ad_reward', 'spend_refund') AND units > 0) OR
    (kind IN ('spend', 'expire', 'refund_clawback')             AND units < 0) OR
    (kind = 'adjust')
  ),
  -- "A lot IS its opening entry" checked by the database rather than by
  -- convention. The RPCs generate the uuid explicitly so both columns can be set.
  CONSTRAINT credit_ledger_opening CHECK (
    kind NOT IN ('purchase', 'promo', 'ad_reward') OR lot_id = id
  ),
  CONSTRAINT credit_ledger_money CHECK (
    (kind = 'purchase') = (provider IS NOT NULL AND amount_cents IS NOT NULL)
  ),
  CONSTRAINT credit_ledger_memo CHECK (kind <> 'adjust' OR memo IS NOT NULL)
);

COMMENT ON TABLE public.credit_ledger IS
  'Append-only credit ledger. Balance is DERIVED (credit_available); credit_balance is a cache. No to_user_id / transferable / payee column exists, and none may be added: a credit spendable on a third party becomes a 선불전자지급수단 under 전자금융거래법 제2조제14호 at any revenue, and registration then needs a 법인 with 자본금 20억.';

COMMENT ON COLUMN public.credit_ledger.units IS
  'One unit = one reasoning run. Never rescale this: the meaning of a unit cannot be migrated without silently rewriting every historical row.';

COMMENT ON COLUMN public.credit_ledger.lot_id IS
  'The opening entry this row draws from. Opening rows point at themselves. SUM(units) GROUP BY lot_id is "how much of that specific purchase is left", which is the number a partial refund needs and a counter cannot produce.';

COMMENT ON COLUMN public.credit_ledger.user_id IS
  'NULL after account deletion (ON DELETE SET NULL, like revenue_events). Deliberate: the 민법 제146조 window outlives the account. Do not change to CASCADE.';

-- Webhook retry idempotency. THE money-path guard.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_provider_event_uidx
  ON public.credit_ledger (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- Caller idempotency (a flaky client retrying a spend).
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_idem_uidx
  ON public.credit_ledger (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The FIFO scan in one index order. NULLS LAST puts never-expiring (IAP) lots at
-- the back, which is exactly the consumer-friendly order: spend the perishable
-- credits first.
CREATE INDEX IF NOT EXISTS credit_ledger_fifo_idx
  ON public.credit_ledger (user_id, lot_expires_at NULLS LAST, lot_opened_at, lot_id);

CREATE INDEX IF NOT EXISTS credit_ledger_lot_idx  ON public.credit_ledger (lot_id);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON public.credit_ledger (user_id, created_at DESC);

----------------------------------------------------------------------
-- 2. credit_balance - cache, mutex, and tripwire
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_balance (
  user_id           uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  balance_available int NOT NULL DEFAULT 0 CHECK (balance_available >= 0),
  lifetime_granted  int NOT NULL DEFAULT 0 CHECK (lifetime_granted  >= 0),
  lifetime_spent    int NOT NULL DEFAULT 0 CHECK (lifetime_spent    >= 0),
  next_expiry_at    timestamptz,
  next_expiry_units int NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_balance IS
  'NOT the source of truth - credit_ledger is. This row exists to be (1) the per-user mutex every credit RPC takes before scanning lots, (2) a tripwire: CHECK (balance_available >= 0) aborts any path that skipped the lock instead of silently minting credits, (3) a single-row read for the shop screen. If it ever disagrees with the ledger, the ledger wins.';

COMMENT ON COLUMN public.credit_balance.next_expiry_at IS
  'Denormalized so the 표준약관 제5조⑤ pre-expiry notice (30일 전 포함 3회 이상) is one indexed scan rather than a full aggregate.';

CREATE INDEX IF NOT EXISTS credit_balance_next_expiry_idx
  ON public.credit_balance (next_expiry_at)
  WHERE next_expiry_at IS NOT NULL;

----------------------------------------------------------------------
-- 3. credit_skus - what the shop sells
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_skus (
  sku            text PRIMARY KEY,
  units          int  NOT NULL CHECK (units > 0),
  price_krw      int  NOT NULL CHECK (price_krw > 0),
  validity_days  int  CHECK (validity_days IS NULL OR validity_days >= 365),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- validity_days is a DATABASE-ENFORCED LEGAL FLOOR, not a comment.
--
-- Simon chose "표준을 따른다" (2026-08-19). 신유형 상품권 표준약관 제10073호
-- 제5조② puts 금액형 at 1년 이상, and 제5조③ says a shorter term IS READ AS the
-- minimum anyway - so a smaller number here would be an unenforceable promise
-- that generates disputes and buys nothing. NULL means never expires, which is
-- what an IAP-purchased SKU MUST be: Apple 3.1.1 says "Any credits or in-game
-- currencies purchased via in-app purchase may not expire." The CHECK admits
-- NULL and 365+, and deliberately nothing in between - the two regimes have to
-- coexist in one table and there is no legitimate value between them.
COMMENT ON COLUMN public.credit_skus.validity_days IS
  'NULL = never expires (required for IAP lots per Apple 3.1.1). Otherwise >= 365 per 신유형 상품권 표준약관 제10073호 제5조②·③, which reads any shorter term as one year regardless. Nothing between is valid.';

COMMENT ON TABLE public.credit_skus IS
  'Shop catalogue. Paddle/Toss price ids map to a sku via edge-function env (PADDLE_PRICE_PACK_*), never hardcoded here - same discipline as PADDLE_PRICE_CORTEX.';

----------------------------------------------------------------------
-- 4. Triggers: lot stamping and the balance cache
----------------------------------------------------------------------

-- Denormalizing lot_opened_at / lot_expires_at onto every consuming row is what
-- makes the FIFO scan a single index range instead of a self-join. This trigger
-- is why that denormalization cannot drift: consuming rows get the values copied
-- from their opening row, and a caller that supplies different ones is rejected
-- rather than quietly believed.
CREATE OR REPLACE FUNCTION public.credit_ledger_stamp_lot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open record;
BEGIN
  IF NEW.kind IN ('purchase', 'promo', 'ad_reward') THEN
    -- Opening row: it IS the lot. lot_opened_at defaults to now() when unset.
    NEW.lot_id        := COALESCE(NEW.lot_id, NEW.id);
    NEW.lot_opened_at := COALESCE(NEW.lot_opened_at, now());
    RETURN NEW;
  END IF;

  SELECT l.lot_opened_at, l.lot_expires_at, l.user_id
    INTO v_open
    FROM public.credit_ledger l
   WHERE l.id = NEW.lot_id
     AND l.kind IN ('purchase', 'promo', 'ad_reward');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_ledger: lot % has no opening entry', NEW.lot_id
      USING ERRCODE = '23503';
  END IF;

  IF v_open.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'credit_ledger: lot % belongs to a different user', NEW.lot_id
      USING ERRCODE = '42501';
  END IF;

  IF NEW.lot_opened_at IS NOT NULL AND NEW.lot_opened_at <> v_open.lot_opened_at THEN
    RAISE EXCEPTION 'credit_ledger: lot_opened_at does not match lot %', NEW.lot_id
      USING ERRCODE = '22023';
  END IF;
  IF NEW.lot_expires_at IS DISTINCT FROM v_open.lot_expires_at
     AND NEW.lot_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'credit_ledger: lot_expires_at does not match lot %', NEW.lot_id
      USING ERRCODE = '22023';
  END IF;

  NEW.lot_opened_at  := v_open.lot_opened_at;
  NEW.lot_expires_at := v_open.lot_expires_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_ledger_stamp_lot ON public.credit_ledger;
CREATE TRIGGER trg_credit_ledger_stamp_lot
  BEFORE INSERT ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_stamp_lot();

-- Keeps the cache in step with the ledger. Runs inside the same transaction as
-- the insert, so the CHECK (balance_available >= 0) fires as part of the write
-- that would have gone negative - it aborts a bug instead of recording one.
CREATE OR REPLACE FUNCTION public.credit_balance_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_at    timestamptz;
  v_next_units int;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW; -- orphaned row from a deleted account; nothing to cache
  END IF;

  SELECT x.lot_expires_at, x.remaining
    INTO v_next_at, v_next_units
    FROM (
      SELECT l.lot_expires_at, SUM(l.units)::int AS remaining
        FROM public.credit_ledger l
       WHERE l.user_id = NEW.user_id
         AND l.lot_expires_at IS NOT NULL
         AND l.lot_expires_at > now()
       GROUP BY l.lot_id, l.lot_expires_at
      HAVING SUM(l.units) > 0
       ORDER BY l.lot_expires_at
       LIMIT 1
    ) x;

  INSERT INTO public.credit_balance AS b (
    user_id, balance_available, lifetime_granted, lifetime_spent,
    next_expiry_at, next_expiry_units, updated_at
  )
  VALUES (
    NEW.user_id,
    GREATEST(NEW.units, 0),
    GREATEST(NEW.units, 0),
    GREATEST(-NEW.units, 0),
    v_next_at, COALESCE(v_next_units, 0), now()
  )
  ON CONFLICT (user_id) DO UPDATE
     SET balance_available = b.balance_available + NEW.units,
         lifetime_granted  = b.lifetime_granted + GREATEST(NEW.units, 0),
         lifetime_spent    = b.lifetime_spent   + GREATEST(-NEW.units, 0),
         next_expiry_at    = v_next_at,
         next_expiry_units = COALESCE(v_next_units, 0),
         updated_at        = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_balance_apply ON public.credit_ledger;
CREATE TRIGGER trg_credit_balance_apply
  AFTER INSERT ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.credit_balance_apply();

----------------------------------------------------------------------
-- 5. Balance is derived
----------------------------------------------------------------------

-- The expiry predicate makes reads correct THE INSTANT a lot expires, without
-- waiting for the nightly job. The `expire` rows that job writes are the RECORD
-- of the breakage (needed for 낙전 accounting and the pre-expiry notice), not the
-- mechanism. Once an expire row lands the lot sums to zero and the predicate is
-- redundant for it, so the two agree by construction.
CREATE OR REPLACE FUNCTION public.credit_available(p_user_id uuid, p_at timestamptz DEFAULT now())
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(l.units), 0)::int
    FROM public.credit_ledger l
   WHERE l.user_id = p_user_id
     AND (l.lot_expires_at IS NULL OR l.lot_expires_at > p_at);
$$;

COMMENT ON FUNCTION public.credit_available(uuid, timestamptz) IS
  'Authoritative balance, derived from the ledger. credit_balance.balance_available is a cache of this; a reconciliation view asserts they agree.';

----------------------------------------------------------------------
-- 6. Grants of credit
----------------------------------------------------------------------

-- Free credit: rewarded video and operator promos. No money, so no provider.
CREATE OR REPLACE FUNCTION public.grant_credits_free(
  p_user_id      uuid,
  p_units        int,
  p_kind         text,                    -- 'ad_reward' | 'promo'
  p_expires_at   timestamptz DEFAULT NULL,
  p_memo         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('ad_reward', 'promo') THEN
    RAISE EXCEPTION 'invalid free grant kind: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'units must be positive' USING ERRCODE = '22023';
  END IF;

  -- Take the per-user mutex first, exactly like the spend path, so a grant and a
  -- spend cannot interleave between the lot scan and the cache update.
  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  INSERT INTO public.credit_ledger (
    id, user_id, kind, units, lot_id, lot_opened_at, lot_expires_at, memo
  ) VALUES (
    v_id, p_user_id, p_kind, p_units, v_id, now(), p_expires_at, p_memo
  );

  RETURN v_id;
END;
$$;

-- Paid credit. provider_event_id carries the webhook event id so a retry is a
-- unique-violation rather than a second grant.
CREATE OR REPLACE FUNCTION public.grant_credits_purchase(
  p_user_id           uuid,
  p_units             int,
  p_sku               text,
  p_provider          text,
  p_provider_event_id text,
  p_amount_cents      integer,
  p_currency          char(3),
  p_expires_at        timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'units must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('paddle', 'toss', 'revenuecat', 'manual') THEN
    RAISE EXCEPTION 'invalid provider: %', p_provider USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  INSERT INTO public.credit_ledger (
    id, user_id, kind, units, lot_id, lot_opened_at, lot_expires_at,
    sku, provider, provider_event_id, amount_cents, currency
  ) VALUES (
    v_id, p_user_id, 'purchase', p_units, v_id, now(), p_expires_at,
    p_sku, p_provider, p_provider_event_id, p_amount_cents, p_currency
  );

  RETURN v_id;
END;
$$;

----------------------------------------------------------------------
-- 7. The spend path and its concurrency story
----------------------------------------------------------------------

-- Order of operations, and why each step sits where it does:
--
--   1. Authorization. Reuse billing_request_role() rather than re-deriving the
--      role inline: the 0112 outage was exactly one function that read only
--      request.jwt.claim.role, a GUC Supabase stopped setting.
--   2. Idempotency read. A double-tap, an app restart mid-request, and a second
--      device all land here and spend nothing.
--   3. TAKE THE MUTEX - before the lot scan, not after. This is the whole
--      concurrency argument: two concurrent spends cannot both read the same lot
--      remainders, because the second blocks here until the first commits and
--      then re-scans.
--   4. Scan lots, soonest expiry first, NULLS LAST.
--   5. One spend row PER LOT drawn from. A 3-unit spend across a 2-unit lot and
--      a 5-unit lot writes two rows, which is what makes a later clawback
--      against either lot exact.
--   6. The AFTER trigger updates the cache; its CHECK catches any future path
--      that skipped step 3.
CREATE OR REPLACE FUNCTION public.spend_credits(
  p_user_id         uuid,
  p_units           int,
  p_feature         text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_service boolean := (public.billing_request_role() = 'service_role');
  v_existing   uuid[];
  v_avail      int;
  v_left       int := p_units;
  v_take       int;
  v_ids        uuid[] := ARRAY[]::uuid[];
  v_id         uuid;
  r            record;
BEGIN
  IF NOT v_is_service THEN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'units must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_feature IS NULL OR p_feature NOT IN ('reasoning') THEN
    RAISE EXCEPTION 'invalid feature: %', p_feature USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required' USING ERRCODE = '22004';
  END IF;

  SELECT array_agg(l.id)
    INTO v_existing
    FROM public.credit_ledger l
   WHERE l.user_id = p_user_id
     AND l.idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'spent', p_units, 'entry_ids', to_jsonb(v_existing),
      'balance_after', public.credit_available(p_user_id), 'existing', true
    );
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
  RETURNING balance_available INTO v_avail;

  IF public.credit_available(p_user_id) < p_units THEN
    RAISE EXCEPTION 'credit_insufficient' USING ERRCODE = 'P0001';
  END IF;

  FOR r IN
    SELECT l.lot_id, l.lot_expires_at, SUM(l.units)::int AS remaining
      FROM public.credit_ledger l
     WHERE l.user_id = p_user_id
       AND (l.lot_expires_at IS NULL OR l.lot_expires_at > now())
     GROUP BY l.lot_id, l.lot_expires_at, l.lot_opened_at
    HAVING SUM(l.units) > 0
     ORDER BY l.lot_expires_at NULLS LAST, MIN(l.lot_opened_at), l.lot_id
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, r.remaining);
    v_id   := gen_random_uuid();

    INSERT INTO public.credit_ledger (
      id, user_id, kind, units, lot_id, feature, idempotency_key
    ) VALUES (
      v_id, p_user_id, 'spend', -v_take, r.lot_id, p_feature,
      -- Only the FIRST row carries the caller's key: the partial unique index is
      -- on (user_id, idempotency_key) and a multi-lot spend is still one logical
      -- operation. The rest are found via lot + transaction.
      CASE WHEN array_length(v_ids, 1) IS NULL THEN p_idempotency_key ELSE NULL END
    );

    v_ids  := v_ids || v_id;
    v_left := v_left - v_take;
  END LOOP;

  IF v_left > 0 THEN
    -- Unreachable given the check above, but a credit system that can silently
    -- under-charge is worse than one that fails loudly.
    RAISE EXCEPTION 'credit_insufficient' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'spent', p_units, 'entry_ids', to_jsonb(v_ids),
    'balance_after', public.credit_available(p_user_id), 'existing', false
  );
END;
$$;

-- A run that failed returns its units to the SAME lots they came from, so a
-- refund later is still attributable to the right purchase.
CREATE OR REPLACE FUNCTION public.refund_credit_spend(p_entry_id uuid, p_memo text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_src record;
  v_id  uuid := gen_random_uuid();
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT l.user_id, l.units, l.lot_id, l.feature
    INTO v_src
    FROM public.credit_ledger l
   WHERE l.id = p_entry_id AND l.kind = 'spend';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no spend entry %', p_entry_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (v_src.user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, feature, memo)
  VALUES (v_id, v_src.user_id, 'spend_refund', -v_src.units, v_src.lot_id, v_src.feature, p_memo);

  RETURN v_id;
END;
$$;

-- Money refunded: remove what is left of that lot, and report what was already
-- spent. `unspent` is the number that settles a 청약철회 or a 민법 제141조 claim -
-- 전자상거래법 시행령 제24조2호 settles a divisible good by deducting only the
-- used portion, which is exactly this arithmetic.
CREATE OR REPLACE FUNCTION public.clawback_credits(
  p_provider          text,
  p_provider_event_id text,
  p_memo              text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot    record;
  v_remain int;
  v_id     uuid := gen_random_uuid();
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.user_id, l.units AS granted
    INTO v_lot
    FROM public.credit_ledger l
   WHERE l.kind = 'purchase'
     AND l.provider = p_provider
     AND l.provider_event_id = p_provider_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (v_lot.user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  SELECT COALESCE(SUM(l.units), 0)::int INTO v_remain
    FROM public.credit_ledger l WHERE l.lot_id = v_lot.id;

  IF v_remain > 0 THEN
    INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, memo)
    VALUES (v_id, v_lot.user_id, 'refund_clawback', -v_remain, v_lot.id, p_memo);
  END IF;

  RETURN jsonb_build_object(
    'found', true, 'lot_id', v_lot.id, 'granted', v_lot.granted,
    'unspent_at_refund', v_remain, 'used', v_lot.granted - v_remain
  );
END;
$$;

-- Nightly. Writes the RECORD of expiry; reads were already correct without it.
CREATE OR REPLACE FUNCTION public.expire_credit_lots(p_at timestamptz DEFAULT now())
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r     record;
  v_n   int := 0;
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT l.lot_id, l.user_id, SUM(l.units)::int AS remaining
      FROM public.credit_ledger l
     WHERE l.lot_expires_at IS NOT NULL
       AND l.lot_expires_at <= p_at
       AND l.user_id IS NOT NULL
     GROUP BY l.lot_id, l.user_id
    HAVING SUM(l.units) > 0
  LOOP
    -- Same mutex as every other writer, so this cannot race a spend: whoever
    -- takes the row lock first wins and the loser re-reads a zeroed lot.
    INSERT INTO public.credit_balance (user_id) VALUES (r.user_id)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

    INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, memo)
    VALUES (gen_random_uuid(), r.user_id, 'expire', -r.remaining, r.lot_id, 'lot expired');
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

----------------------------------------------------------------------
-- 8. Reconciliation
----------------------------------------------------------------------

-- The cache and the ledger must agree. This view is empty in a healthy system,
-- which makes it a one-line alert query rather than a report to interpret.
CREATE OR REPLACE VIEW public.credit_balance_drift AS
  SELECT b.user_id,
         b.balance_available AS cached,
         public.credit_available(b.user_id) AS derived,
         b.balance_available - public.credit_available(b.user_id) AS drift
    FROM public.credit_balance b
   WHERE b.balance_available <> public.credit_available(b.user_id);

COMMENT ON VIEW public.credit_balance_drift IS
  'Empty when healthy. A non-empty row means the cache and the append-only ledger disagree; the ledger is right and the cache must be rebuilt.';

----------------------------------------------------------------------
-- 9. RLS and grants
----------------------------------------------------------------------

ALTER TABLE public.credit_ledger  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_skus    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_ledger_owner_select ON public.credit_ledger;
CREATE POLICY credit_ledger_owner_select ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS credit_balance_owner_select ON public.credit_balance;
CREATE POLICY credit_balance_owner_select ON public.credit_balance
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- The catalogue is not personal data and the shop has to render it.
DROP POLICY IF EXISTS credit_skus_read_active ON public.credit_skus;
CREATE POLICY credit_skus_read_active ON public.credit_skus
  FOR SELECT TO authenticated
  USING (active);

-- No INSERT/UPDATE/DELETE policies anywhere: every write goes through the
-- SECURITY DEFINER functions above. The explicit REVOKEs matter because a policy
-- absence is not a privilege absence.
REVOKE INSERT, UPDATE, DELETE ON public.credit_ledger  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.credit_balance FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.credit_skus    FROM authenticated, anon;
REVOKE ALL ON public.credit_balance_drift FROM authenticated, anon;

-- Supabase grants EXECUTE to anon on creation, so REVOKE FROM PUBLIC alone is
-- insufficient; check:definer-grants enforces the explicit anon line.
REVOKE ALL     ON FUNCTION public.credit_ledger_stamp_lot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_ledger_stamp_lot() FROM anon, authenticated;
REVOKE ALL     ON FUNCTION public.credit_balance_apply() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_balance_apply() FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.credit_available(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_available(uuid, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.credit_available(uuid, timestamptz) TO authenticated, service_role;

REVOKE ALL     ON FUNCTION public.spend_credits(uuid, int, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, int, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.spend_credits(uuid, int, text, text) TO authenticated, service_role;

REVOKE ALL     ON FUNCTION public.grant_credits_free(uuid, int, text, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_credits_free(uuid, int, text, timestamptz, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_credits_free(uuid, int, text, timestamptz, text) TO service_role;

REVOKE ALL     ON FUNCTION public.grant_credits_purchase(uuid, int, text, text, text, integer, char, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_credits_purchase(uuid, int, text, text, text, integer, char, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_credits_purchase(uuid, int, text, text, text, integer, char, timestamptz) TO service_role;

REVOKE ALL     ON FUNCTION public.refund_credit_spend(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credit_spend(uuid, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_credit_spend(uuid, text) TO service_role;

REVOKE ALL     ON FUNCTION public.clawback_credits(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clawback_credits(text, text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.clawback_credits(text, text, text) TO service_role;

REVOKE ALL     ON FUNCTION public.expire_credit_lots(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_credit_lots(timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_credit_lots(timestamptz) TO service_role;
