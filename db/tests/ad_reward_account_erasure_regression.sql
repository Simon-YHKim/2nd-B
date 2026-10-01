\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0202.
-- The shipped account-deletion path deletes auth.users, cascading to public.users.
-- Account deletion must remove the deleted user's ad-reward credit lots (the
-- opening ad_reward row that carries the AdMob transaction id in its memo, and
-- every row drawn from that lot) while purchase lots keep 0134's ON DELETE
-- SET NULL evidence. Another user's ad-reward lot must be untouched.
BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('30000000-0000-0000-0000-000000000001', 'reward-erase-one@example.com'),
  ('30000000-0000-0000-0000-000000000002', 'reward-erase-two@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('30000000-0000-0000-0000-000000000001', 'reward-erase-one@example.com', DATE '1990-01-01', 'en'),
  ('30000000-0000-0000-0000-000000000002', 'reward-erase-two@example.com', DATE '1990-01-01', 'en');
-- grant_reward_credits_ssv pays only adults who turned ads on.
UPDATE public.users
   SET privacy_prefs = privacy_prefs || '{"ads": "true"}'::jsonb
 WHERE id IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');

SET LOCAL request.jwt.claim.role = 'service_role';
DO $seed$
DECLARE
  v_one constant uuid := '30000000-0000-0000-0000-000000000001';
  v_two constant uuid := '30000000-0000-0000-0000-000000000002';
  v_month constant text := pg_catalog.to_char(pg_catalog.now(), 'YYYY-MM');
  v_purchase uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF public.grant_reward_credits_ssv(v_one, v_month, 2, 'txn-erase-one-1') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'fixture: ad reward was not granted to user one';
  END IF;
  IF public.grant_reward_credits_ssv(v_two, v_month, 2, 'txn-erase-two-1') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'fixture: ad reward was not granted to user two';
  END IF;

  -- A purchase lot for user one. Money rows need provider + amount (0134 check).
  INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, provider, amount_cents, currency, sku, memo)
  VALUES (v_purchase, v_one, 'purchase', 5, v_purchase, 'manual', 990, 'KRW', 'fixture_sku', 'purchase fixture');

  -- Spend one unit. The ad lot expires first (month end), so FIFO draws from it.
  PERFORM public.spend_credits(v_one, 1, 'reasoning', 'erase-spend-one-1');
END
$seed$;

-- Remember what must disappear and what must survive, then prove the fixture
-- is not vacuous: the ad lot has its opening row AND a consuming row, and the
-- opening row really carries the transaction id.
CREATE TEMP TABLE ad_erase_expect ON COMMIT DROP AS
SELECT
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000001' AND l.kind = 'ad_reward') AS one_lot,
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000001' AND l.kind = 'purchase') AS one_purchase,
  (SELECT l.id FROM public.credit_ledger l
    WHERE l.user_id = '30000000-0000-0000-0000-000000000002' AND l.kind = 'ad_reward') AS two_lot;

DO $before$
DECLARE
  v_one_lot uuid;
  v_rows int;
BEGIN
  SELECT one_lot INTO v_one_lot FROM ad_erase_expect;
  IF v_one_lot IS NULL OR (SELECT one_purchase FROM ad_erase_expect) IS NULL
     OR (SELECT two_lot FROM ad_erase_expect) IS NULL THEN
    RAISE EXCEPTION 'fixture: expected ledger rows are missing';
  END IF;
  SELECT pg_catalog.count(*) INTO v_rows FROM public.credit_ledger WHERE lot_id = v_one_lot;
  IF v_rows < 2 THEN
    RAISE EXCEPTION 'fixture: user one ad lot has % rows, expected opening + spend', v_rows;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_ledger
                  WHERE id = v_one_lot AND memo LIKE '%txn-erase-one-1%') THEN
    RAISE EXCEPTION 'fixture: ad reward memo does not carry the transaction id';
  END IF;
END
$before$;

DELETE FROM auth.users WHERE id = '30000000-0000-0000-0000-000000000001';

DO $after$
DECLARE
  v_one_lot uuid;
  v_one_purchase uuid;
  v_two_lot uuid;
BEGIN
  SELECT one_lot, one_purchase, two_lot INTO v_one_lot, v_one_purchase, v_two_lot FROM ad_erase_expect;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = '30000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'auth.users deletion did not cascade to public.users';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE lot_id = v_one_lot) THEN
    RAISE EXCEPTION 'account deletion left rows of the deleted user ad-reward lot';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE memo LIKE '%txn-erase-one-1%') THEN
    RAISE EXCEPTION 'account deletion left the AdMob transaction id in credit_ledger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_ledger
                  WHERE id = v_one_purchase AND user_id IS NULL AND kind = 'purchase') THEN
    RAISE EXCEPTION 'purchase lot lost its SET NULL evidence on account deletion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_ledger
                  WHERE id = v_two_lot AND user_id = '30000000-0000-0000-0000-000000000002'
                    AND memo LIKE '%txn-erase-two-1%') THEN
    RAISE EXCEPTION 'another user ad-reward lot was touched';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-erase-one-1') THEN
    RAISE EXCEPTION 'account deletion left the SSV replay row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-erase-two-1') THEN
    RAISE EXCEPTION 'another user SSV replay row was touched';
  END IF;
  -- The trigger function is not callable by client roles.
  IF pg_catalog.has_function_privilege('authenticated', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE') THEN
    RAISE EXCEPTION 'erasure trigger function is executable by a client role';
  END IF;
END
$after$;

-- Operator deletion of a public profile must invoke the same 0202 trigger,
-- while leaving the auth account itself intact until its own deletion.
DELETE FROM public.users WHERE id = '30000000-0000-0000-0000-000000000002';

DO $direct$
BEGIN
  IF EXISTS (SELECT 1 FROM public.credit_ledger
              WHERE lot_id = (SELECT two_lot FROM ad_erase_expect)) THEN
    RAISE EXCEPTION 'direct public.users deletion left an ad-reward lot';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-erase-two-1') THEN
    RAISE EXCEPTION 'direct public.users deletion left the SSV replay row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'direct public.users deletion removed the auth account';
  END IF;
END
$direct$;

ROLLBACK;
