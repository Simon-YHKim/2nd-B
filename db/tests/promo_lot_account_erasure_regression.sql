\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0204 and 0205.
-- Account deletion must remove the deleted user's PROMO credit lots (the
-- opening promo row and every row drawn from that lot) together with the
-- ad-reward lots 0202 already removes, while purchase lots keep 0134's
-- ON DELETE SET NULL evidence. Another user's promo lot must be untouched.
-- The registry reason and the user_id column comment must say exactly that.
-- Sibling of ad_reward_account_erasure_regression.sql (0202), same fixture
-- shape; kept separate so each file pins one migration's contract.
BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('30000000-0000-0000-0000-000000000011', 'promo-erase-one@example.com'),
  ('30000000-0000-0000-0000-000000000012', 'promo-erase-two@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('30000000-0000-0000-0000-000000000011', 'promo-erase-one@example.com', DATE '1990-01-01', 'en'),
  ('30000000-0000-0000-0000-000000000012', 'promo-erase-two@example.com', DATE '1990-01-01', 'en');
-- grant_reward_credits_ssv pays only adults who turned ads on.
UPDATE public.users
   SET privacy_prefs = privacy_prefs || '{"ads": "true"}'::jsonb
 WHERE id = '30000000-0000-0000-0000-000000000011';

SET LOCAL request.jwt.claim.role = 'service_role';
DO $seed$
DECLARE
  v_one constant uuid := '30000000-0000-0000-0000-000000000011';
  v_two constant uuid := '30000000-0000-0000-0000-000000000012';
  v_month constant text := pg_catalog.to_char(pg_catalog.now(), 'YYYY-MM');
  v_purchase uuid := pg_catalog.gen_random_uuid();
BEGIN
  -- User one holds all three kinds. The ad lot expires at month end, the promo
  -- lot in 400 days, the purchase lot never, so FIFO drains them in that order.
  IF public.grant_reward_credits_ssv(v_one, v_month, 2, 'txn-promo-erase-one-1') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'fixture: ad reward was not granted to user one';
  END IF;
  PERFORM public.grant_credits_free(v_one, 3, 'promo',
                                    pg_catalog.now() + interval '400 days', 'promo-erase-one fixture');
  INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, provider, amount_cents, currency, sku, memo)
  VALUES (v_purchase, v_one, 'purchase', 5, v_purchase, 'manual', 990, 'KRW', 'fixture_sku', 'purchase fixture');

  -- User two holds only a promo lot, with its own spend.
  PERFORM public.grant_credits_free(v_two, 2, 'promo',
                                    pg_catalog.now() + interval '400 days', 'promo-erase-two fixture');

  -- Three single-unit spends: two drain the ad lot, the third draws on promo.
  PERFORM public.spend_credits(v_one, 1, 'reasoning', 'promo-erase-spend-one-1');
  PERFORM public.spend_credits(v_one, 1, 'reasoning', 'promo-erase-spend-one-2');
  PERFORM public.spend_credits(v_one, 1, 'reasoning', 'promo-erase-spend-one-3');
  PERFORM public.spend_credits(v_two, 1, 'reasoning', 'promo-erase-spend-two-1');
END
$seed$;

-- Remember what must disappear and what must survive, then prove the fixture
-- is not vacuous: the promo lot has its opening row AND a consuming row.
CREATE TEMP TABLE promo_erase_expect ON COMMIT DROP AS
SELECT
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000011' AND l.kind = 'promo') AS one_promo,
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000011' AND l.kind = 'ad_reward') AS one_ad,
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000011' AND l.kind = 'purchase') AS one_purchase,
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000012' AND l.kind = 'promo') AS two_promo;

DO $before$
DECLARE
  e promo_erase_expect%ROWTYPE;
  v_rows int;
BEGIN
  SELECT * INTO e FROM promo_erase_expect;
  IF e.one_promo IS NULL OR e.one_ad IS NULL OR e.one_purchase IS NULL OR e.two_promo IS NULL THEN
    RAISE EXCEPTION 'fixture: expected ledger rows are missing';
  END IF;
  SELECT pg_catalog.count(*) INTO v_rows FROM public.credit_ledger
   WHERE lot_id = e.one_promo AND kind = 'spend';
  IF v_rows < 1 THEN
    RAISE EXCEPTION 'fixture: user one promo lot has no spend row, so the lot rows are not exercised';
  END IF;
  SELECT pg_catalog.count(*) INTO v_rows FROM public.credit_ledger WHERE lot_id = e.two_promo;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'fixture: user two promo lot has % rows, expected opening + spend', v_rows;
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE lot_id = e.one_purchase AND kind = 'spend') THEN
    RAISE EXCEPTION 'fixture: a spend reached the purchase lot, so FIFO did not drain the free lots first';
  END IF;
END
$before$;

DELETE FROM public.users WHERE id = '30000000-0000-0000-0000-000000000011';

DO $after$
DECLARE
  e promo_erase_expect%ROWTYPE;
  v_rows int;
BEGIN
  SELECT * INTO e FROM promo_erase_expect;

  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE lot_id = e.one_promo) THEN
    RAISE EXCEPTION 'account deletion left rows of the deleted user promo lot';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE memo = 'promo-erase-one fixture') THEN
    RAISE EXCEPTION 'account deletion left the deleted user promo memo in credit_ledger';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE lot_id = e.one_ad) THEN
    RAISE EXCEPTION 'account deletion left rows of the deleted user ad-reward lot';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_ledger
                  WHERE id = e.one_purchase AND user_id IS NULL AND kind = 'purchase') THEN
    RAISE EXCEPTION 'purchase lot lost its SET NULL evidence on account deletion';
  END IF;
  SELECT pg_catalog.count(*) INTO v_rows FROM public.credit_ledger
   WHERE lot_id = e.two_promo AND user_id = '30000000-0000-0000-0000-000000000012';
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'another user promo lot was touched: % of 2 rows left', v_rows;
  END IF;

  -- The two descriptions a reader meets must say what now happens.
  IF (SELECT r.reason FROM public.erasure_registry AS r
       WHERE r.table_name = 'credit_ledger' AND r.class = 'retained')
     IS DISTINCT FROM
     '로트 종류마다 계정 삭제 때 운명이 다르다. 구매(purchase) 로트는 여는 행과 그 로트의 모든 행이 구매 사실과 미사용 잔량의 증거다. 취소권 기간이 계정보다 오래 살아남으므로 user_id 만 NULL 로 비우고 남긴다(0134 ON DELETE SET NULL · 설계서 F5). 광고 보상(ad_reward)·프로모(promo) 로트는 돈을 낸 기록이 아니므로, 계정 삭제 직전 public.users 의 BEFORE DELETE 트리거가 여는 행과 그 로트의 모든 행을 지운다(0202 · 0204). 콘텐츠 삭제(erase_my_data)는 이 표를 건드리지 않는다.' THEN
    RAISE EXCEPTION 'erasure_registry still describes credit_ledger as before 0204/0205';
  END IF;
  IF pg_catalog.col_description('public.credit_ledger'::regclass,
       (SELECT a.attnum FROM pg_catalog.pg_attribute AS a
         WHERE a.attrelid = 'public.credit_ledger'::regclass AND a.attname = 'user_id'))
     IS DISTINCT FROM
     'Account deletion treats lots by kind. Purchase lots (the opening row and every row drawn from it) stay with user_id NULL (ON DELETE SET NULL, like revenue_events): the 민법 제146조 window outlives the account, so do not change this FK to CASCADE. Ad-reward and promo lots (the opening row and every row drawn from it) are deleted instead, by the BEFORE DELETE trigger on public.users (0202, 0204).' THEN
    RAISE EXCEPTION 'credit_ledger.user_id comment still describes the column as before 0204';
  END IF;

  -- The trigger function is not callable by client roles.
  IF pg_catalog.has_function_privilege('authenticated', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE') THEN
    RAISE EXCEPTION 'erasure trigger function is executable by a client role';
  END IF;
END
$after$;

ROLLBACK;
