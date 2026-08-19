-- 0135_credit_cutover.sql
-- Rewarded reasoning credits move from usage_counters.(reward_credits,
-- reward_consumed) onto the 0134 credit ledger.
--
-- ── THE SHAPE OF THIS CUTOVER, AND WHY IT IS NOT THE OBVIOUS ONE ─────────────
--
-- The obvious cutover stops writing the two counter columns and moves every
-- reader to the ledger. That forces this SQL and a NATIVE app release to land in
-- lockstep, and native lag here is weeks. In that window a rewarded ad watch
-- produces no visible change on an installed build, the "이번 달 보상을 모두
-- 받았어요" state never fires, and the limit sheet keeps requesting ad fills that
-- deliver nothing to the user who watched them.
--
-- So the columns are NOT abandoned. They are DEMOTED: the ledger becomes the only
-- store, and a trigger on credit_ledger re-derives the two columns from it. Every
-- deployed client keeps reading exactly what it reads today and keeps being
-- right. A second trigger then FREEZES the columns against every other writer, so
-- the demotion cannot be undone by accident.
--
-- That freeze also solves the hardest problem in this file. Postgres does not
-- re-resolve a function mid-execution, so the table locks below manufacture a
-- queue of backends still running the OLD bodies; they resume after COMMIT and
-- would write the legacy columns. An old reserve would grant itself a run the
-- ledger never charged for. An old grant would bank credits nothing reads. An old
-- SSV grant would consume its rewarded_ssv_txns dedup row, so AdMob's retry would
-- grant nothing. With the freeze they ABORT instead: the reserve retries onto the
-- new body, and the SSV transaction rolls back so AdMob's retry succeeds.
--
-- ── LOCK ORDER, ESTABLISHED HERE, TO BE KEPT BY EVERY FUTURE MIGRATION ───────
--
--   advisory('reasoning_run:'||user)
--     -> usage_counters week row
--     -> credit_balance row
--     -> credit_ledger
--     -> (mirror) usage_counters month row
--
-- and at table granularity: reasoning_runs BEFORE usage_counters, because that is
-- the order reserve / fail / cancel / recover already take them in. credit_balance
-- is ALWAYS taken before the usage_counters month row, on every path. Nothing
-- anywhere takes them the other way round. Do not add a path that does.
--
-- ── WHAT IS NOT MIGRATED, AND WHY ───────────────────────────────────────────
--
-- Only the CURRENT KST month. Today's credits die at month end with no record,
-- and every consumer reads only the current month row (0089, 0092, usage.ts). A
-- backfill that summed history would MINT credits the old system had already let
-- lapse. Current-month-only is the faithful translation.
--
-- chat_ad_credits (0090) stays exactly where it is. It shares the same physical
-- month row, but 0134 forbids metering chat on this unit scale: one reasoning run
-- and one chat message differ by ~2 orders of magnitude in cost, and a unit's
-- meaning is the one thing that can never be migrated.
--
-- Requires 0134. Idempotent. Forward-only; the down path is
-- db/migrations/rollback/0135_down.sql.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 0. Refuse to run on a database that has not applied 0134
----------------------------------------------------------------------
-- plpgsql does not resolve callees at CREATE time, so without this the whole file
-- applies cleanly and then fails at RUNTIME on every reserve. Same trap as
-- 0127/0130, and here it would take the reasoning path down.
DO $guard$
BEGIN
  IF to_regclass('public.credit_ledger') IS NULL
     OR to_regclass('public.credit_balance') IS NULL
     OR to_regprocedure('public.spend_credits(uuid,int,text,text)') IS NULL THEN
    RAISE EXCEPTION
      '0135 requires 0134_credit_ledger. Apply 0134 first and verify with: '
      'SELECT to_regprocedure(''public.spend_credits(uuid,int,text,text)'');';
  END IF;
END
$guard$;

----------------------------------------------------------------------
-- 1. Locks, in the order the application already takes them
----------------------------------------------------------------------
-- reasoning_runs FIRST: section 11's ALTER needs ACCESS EXCLUSIVE on it anyway,
-- and every live path touches reasoning_runs before usage_counters. Taking
-- usage_counters first would give this migration the OPPOSITE order and deadlock
-- against a reserve that is queued on the usage_counters write while holding
-- ACCESS SHARE on reasoning_runs.
LOCK TABLE public.reasoning_runs IN ACCESS EXCLUSIVE MODE;
-- SHARE ROW EXCLUSIVE queues every INSERT/UPDATE (so the backfill's read is
-- stable) without blocking reads, and it is the level CREATE TRIGGER needs.
LOCK TABLE public.usage_counters IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.credit_ledger  IN SHARE ROW EXCLUSIVE MODE;

----------------------------------------------------------------------
-- 2. KST helpers - one authority for "when do credits die"
----------------------------------------------------------------------
-- STABLE, not IMMUTABLE: timezone conversion depends on the tz database.
CREATE OR REPLACE FUNCTION public.kst_month_start(p_at timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT date_trunc('month', p_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
$$;

CREATE OR REPLACE FUNCTION public.kst_month_end(p_at timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (date_trunc('month', p_at AT TIME ZONE 'Asia/Seoul') + interval '1 month')
         AT TIME ZONE 'Asia/Seoul';
$$;

CREATE OR REPLACE FUNCTION public.kst_month_bucket(p_at timestamptz DEFAULT now())
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_char(p_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
$$;

REVOKE ALL ON FUNCTION public.kst_month_start(timestamptz)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kst_month_start(timestamptz)  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.kst_month_end(timestamptz)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kst_month_end(timestamptz)    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.kst_month_bucket(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kst_month_bucket(timestamptz) FROM anon, authenticated;

----------------------------------------------------------------------
-- 3. Do not apply next to a KST month boundary
----------------------------------------------------------------------
-- Backfilled lots expire at KST month end (section 8). Applying at 23:59 gives
-- every migrated user a lot with seconds of life. That is faithful to today's
-- behaviour, but it makes the post-apply verification fail for 100% of rows and
-- an operator cannot tell that apart from a broken backfill. Skipped when there
-- is nothing to migrate, so CI's empty database never trips it.
DO $boundary$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usage_counters WHERE reward_credits > 0)
     AND (public.kst_month_end(now()) - now() < interval '2 hours'
          OR now() - public.kst_month_start(now()) < interval '2 hours') THEN
    RAISE EXCEPTION
      '0135: refusing to apply within 2h of a KST month boundary. Backfilled lots '
      'would expire immediately and the post-apply check would be uninterpretable. '
      'Wait and re-run.';
  END IF;
END
$boundary$;

----------------------------------------------------------------------
-- 4. Refuse to confiscate a live balance from a profile-less account
----------------------------------------------------------------------
-- credit_ledger.user_id REFERENCES public.users, but usage_counters.user_id
-- REFERENCES auth.users, and public.users rows are created CLIENT-SIDE with no
-- trigger (0002). An auth account whose profile insert never landed therefore has
-- a spendable balance today that cannot be represented in the ledger. Skipping it
-- silently would delete money-adjacent value from a real person, so this refuses
-- to start instead and names the rows.
DO $orphan$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.usage_counters uc
    LEFT JOIN public.users u ON u.id = uc.user_id
   WHERE u.id IS NULL
     AND uc.month_bucket = public.kst_month_bucket(now())
     AND uc.reward_credits > GREATEST(uc.reward_consumed, 0);
  IF v_n > 0 THEN
    RAISE EXCEPTION
      '0135: % account(s) hold rewarded credits but have no public.users row, so '
      'their balance cannot be migrated. Resolve first. To list them: SELECT '
      'uc.user_id, uc.reward_credits, uc.reward_consumed FROM public.usage_counters '
      'uc LEFT JOIN public.users u ON u.id = uc.user_id WHERE u.id IS NULL AND '
      'uc.month_bucket = public.kst_month_bucket(now()) AND uc.reward_credits > '
      'GREATEST(uc.reward_consumed, 0);', v_n;
  END IF;
END
$orphan$;

----------------------------------------------------------------------
-- 5. Internal ledger helpers (no grants; DEFINER callers only)
----------------------------------------------------------------------
-- 0134's grant_credits_free / refund_credit_spend gate on billing_request_role()
-- = 'service_role', which reads the REQUEST JWT. reserve / fail / cancel / the
-- client grant RPC all run under an 'authenticated' JWT even though they are
-- SECURITY DEFINER, so calling those directly would be 42501 every time. These
-- internals carry the same posture 0092 chose for refund_reasoning_spend: revoked
-- from PUBLIC, anon AND authenticated, reachable only from other DEFINER bodies.
--
-- Supabase auto-GRANTs EXECUTE on every new function to anon and authenticated,
-- so the REVOKEs in section 17 are not optional garnish. Without them an
-- authenticated user could call grant_credits_free_internal and mint credits.
CREATE OR REPLACE FUNCTION public.grant_credits_free_internal(
  p_user_id         uuid,
  p_units           int,
  p_kind            text,
  p_expires_at      timestamptz DEFAULT NULL,
  p_memo            text        DEFAULT NULL,
  p_idempotency_key text        DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id uuid := gen_random_uuid(); v_prev uuid;
BEGIN
  IF p_kind NOT IN ('ad_reward', 'promo') THEN
    RAISE EXCEPTION 'invalid free grant kind: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'units must be positive' USING ERRCODE = '22023';
  END IF;

  -- Mutex first, always, before any read of the balance.
  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  IF p_idempotency_key IS NOT NULL THEN
    SELECT l.id INTO v_prev FROM public.credit_ledger l
     WHERE l.user_id = p_user_id AND l.idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_prev; END IF;
  END IF;

  INSERT INTO public.credit_ledger
    (id, user_id, kind, units, lot_id, lot_opened_at, lot_expires_at, memo, idempotency_key)
  VALUES
    (v_id, p_user_id, p_kind, p_units, v_id, now(), p_expires_at, p_memo, p_idempotency_key);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_refund_spend_internal(
  p_entry_id uuid, p_memo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_src record; v_key text; v_prev uuid; v_id uuid := gen_random_uuid();
BEGIN
  SELECT l.user_id, l.units, l.lot_id, l.feature, l.lot_expires_at
    INTO v_src
    FROM public.credit_ledger l
   WHERE l.id = p_entry_id AND l.kind = 'spend';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no spend entry %', p_entry_id USING ERRCODE = 'P0002';
  END IF;
  IF v_src.user_id IS NULL THEN RETURN NULL; END IF;  -- deleted account

  -- The lot is already gone. credit_available() excludes it, so the user gets
  -- nothing back either way, which matches the old behaviour of decrementing
  -- reward_consumed on a month row nobody reads any more. Writing the row anyway
  -- would only inflate credit_balance and make the drift view ring forever.
  IF v_src.lot_expires_at IS NOT NULL AND v_src.lot_expires_at <= now() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (v_src.user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  -- 0134's refund had no idempotency of its own; exactly-once was borrowed
  -- entirely from the caller's guarded UPDATE. Keying it to the entry it reverses
  -- makes a double refund a no-op instead of a mint.
  v_key := 'refund:' || p_entry_id::text;
  SELECT l.id INTO v_prev FROM public.credit_ledger l
   WHERE l.user_id = v_src.user_id AND l.idempotency_key = v_key;
  IF FOUND THEN RETURN v_prev; END IF;

  INSERT INTO public.credit_ledger
    (id, user_id, kind, units, lot_id, feature, idempotency_key, memo)
  VALUES
    (v_id, v_src.user_id, 'spend_refund', -v_src.units, v_src.lot_id,
     v_src.feature, v_key, p_memo);
  RETURN v_id;
END;
$$;

-- 0134's public entry points become thin guarded wrappers, so there is exactly
-- ONE implementation of each behaviour.
CREATE OR REPLACE FUNCTION public.grant_credits_free(
  p_user_id uuid, p_units int, p_kind text,
  p_expires_at timestamptz DEFAULT NULL, p_memo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  RETURN public.grant_credits_free_internal(p_user_id, p_units, p_kind, p_expires_at, p_memo, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credit_spend(p_entry_id uuid, p_memo text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  RETURN public.credit_refund_spend_internal(p_entry_id, p_memo);
END;
$$;

----------------------------------------------------------------------
-- 6. The monthly ad-earning ceiling, derived from the ledger
----------------------------------------------------------------------
-- 20/month must keep meaning "20 EARNED FROM ADS this KST month". kind is scoped
-- to 'ad_reward' so a purchased pack (0136) never makes the limit sheet claim the
-- ad cap is reached.
CREATE OR REPLACE FUNCTION public.credit_ad_earned_this_month(
  p_user_id uuid, p_at timestamptz DEFAULT now()
) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(SUM(l.units), 0)::int
    FROM public.credit_ledger l
   WHERE l.user_id = p_user_id
     AND l.kind = 'ad_reward'
     AND l.created_at >= public.kst_month_start(p_at)
     AND l.created_at <  public.kst_month_end(p_at);
$$;

----------------------------------------------------------------------
-- 7. THE MIRROR - usage_counters.reward_* becomes a derived view of the ledger
----------------------------------------------------------------------
-- This is what makes 0135 a pure server change. Every deployed client, including
-- native builds that will not be replaced for weeks, keeps reading usage_counters
-- and keeps getting the right answer.
--
--   reward_credits  := ad units earned this KST month
--   reward_consumed := earned - LEAST(available, earned)
--
-- so the client's own arithmetic (earned - consumed) yields LEAST(available,
-- earned): exactly the spendable balance today, and a SAFE UNDER-report once
-- purchased lots exist in 0136.
--
-- Lock order: this runs inside a credit_ledger INSERT, and every ledger writer
-- takes the credit_balance mutex first, so the usage_counters month row is always
-- acquired AFTER credit_balance. Nothing anywhere takes them the other way round.
CREATE OR REPLACE FUNCTION public.usage_counters_mirror_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_mon text; v_earned int; v_avail int;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  v_mon    := public.kst_month_bucket(now());
  v_earned := public.credit_ad_earned_this_month(p_user_id);
  v_avail  := GREATEST(public.credit_available(p_user_id), 0);

  PERFORM set_config('app.credit_mirror', '1', true);
  INSERT INTO public.usage_counters AS uc
    (user_id, month_bucket, reward_credits, reward_consumed)
  VALUES
    (p_user_id, v_mon, v_earned, GREATEST(v_earned - LEAST(v_avail, v_earned), 0))
  ON CONFLICT (user_id, month_bucket) DO UPDATE
     SET reward_credits  = EXCLUDED.reward_credits,
         reward_consumed = EXCLUDED.reward_consumed,
         updated_at      = now();
  PERFORM set_config('app.credit_mirror', '0', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_ledger_mirror_counter()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.usage_counters_mirror_credits(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_ledger_mirror_counter ON public.credit_ledger;
CREATE TRIGGER trg_credit_ledger_mirror_counter
  AFTER INSERT ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_mirror_counter();

----------------------------------------------------------------------
-- 8. THE BACKFILL
----------------------------------------------------------------------
-- A snapshot TABLE, not a view: a view re-reads the same live column it is trying
-- to compare against, so it could never answer "what did we read at cutover".
CREATE TABLE IF NOT EXISTS public.credit_backfill_0135 (
  user_id                    uuid NOT NULL,
  month_bucket               text NOT NULL,
  reward_credits_at_cutover  int  NOT NULL,
  reward_consumed_at_cutover int  NOT NULL,
  decision                   text NOT NULL,
  lot_id                     uuid,
  captured_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_bucket)
);
ALTER TABLE public.credit_backfill_0135 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_backfill_0135 FROM anon, authenticated;

COMMENT ON TABLE public.credit_backfill_0135 IS
  'What 0135 read out of usage_counters at cutover, and what it decided per row. Kept, not dropped: it is the only evidence of a user''s pre-cutover balance, and the rollback path re-derives from it.';

CREATE TEMP TABLE _0135_new_lots (user_id uuid PRIMARY KEY) ON COMMIT DROP;

-- 8a. Snapshot every row with ANY credit state, recording the decision.
--
-- The skips, one predicate each:
--   past months     - already unreachable (every consumer reads only the current
--                     month), so migrating them would MINT credits the old system
--                     had let lapse, and a past lot_expires_at would make
--                     credit_balance disagree with credit_available from day one.
--   week-shaped     - the 0075 client-supplied p_month hole. p_month was a caller
--                     parameter used verbatim as the upsert key, so a tampered
--                     client could bank credits on a week-shaped bucket. No
--                     consumer has ever read those; they were never spendable.
--   reward_credits 0 - chat-only month rows. chat_ad_credits stays where it is.
INSERT INTO public.credit_backfill_0135
  (user_id, month_bucket, reward_credits_at_cutover, reward_consumed_at_cutover, decision)
SELECT uc.user_id, uc.month_bucket, uc.reward_credits, uc.reward_consumed,
       CASE
         WHEN u.id IS NULL                                      THEN 'skipped_no_profile'
         WHEN uc.month_bucket LIKE '%W%'                        THEN 'skipped_week_shaped_bucket'
         WHEN uc.month_bucket <> public.kst_month_bucket(now()) THEN 'skipped_past_bucket'
         WHEN uc.reward_credits = 0                             THEN 'skipped_zero'
         WHEN uc.reward_consumed < 0                            THEN 'migrated_negative_consumed_dropped'
         WHEN uc.reward_consumed > uc.reward_credits            THEN 'migrated_excess_consumed_clamped'
         ELSE 'migrated'
       END
  FROM public.usage_counters uc
  LEFT JOIN public.users u ON u.id = uc.user_id
 WHERE uc.reward_credits <> 0 OR uc.reward_consumed <> 0
ON CONFLICT (user_id, month_bucket) DO NOTHING;

-- 8b. The opening lot, one per user. kind = 'ad_reward', not 'promo': section 6
-- reconstructs the 20/month earning ceiling from ad_reward units, so 'promo' here
-- would reset every user's headroom and hand out up to 20 extra credits.
WITH src AS (
  SELECT s.user_id, s.month_bucket, s.reward_credits_at_cutover AS earned,
         gen_random_uuid() AS lot_id
    FROM public.credit_backfill_0135 s
   WHERE s.decision LIKE 'migrated%'
     AND s.month_bucket = public.kst_month_bucket(now())
     AND NOT EXISTS (
       SELECT 1 FROM public.credit_ledger l
        WHERE l.user_id = s.user_id
          AND l.idempotency_key = 'backfill:0135:grant:' || s.month_bucket)
), ins AS (
  INSERT INTO public.credit_ledger
    (id, user_id, kind, units, lot_id, lot_opened_at, lot_expires_at, idempotency_key, memo)
  SELECT src.lot_id, src.user_id, 'ad_reward', src.earned, src.lot_id,
         now(), public.kst_month_end(now()),
         'backfill:0135:grant:' || src.month_bucket,
         'backfill 0135 from usage_counters ' || src.month_bucket
    FROM src
  RETURNING user_id
)
INSERT INTO _0135_new_lots (user_id) SELECT user_id FROM ins;

UPDATE public.credit_backfill_0135 s
   SET lot_id = l.id
  FROM public.credit_ledger l
 WHERE l.user_id = s.user_id
   AND l.idempotency_key = 'backfill:0135:grant:' || s.month_bucket
   AND s.lot_id IS DISTINCT FROM l.id;

-- 8c. The spend that already happened. TWO ledger rows, not one net row:
-- credit_balance_apply derives lifetime_granted / lifetime_spent from the SIGN of
-- each row, so a single net row would record lifetime_spent = 0 forever.
--
-- CLAMPED both ways. There is NO CHECK on reward_consumed anywhere (0089 added it
-- bare) and service_role still writes usage_counters directly, so the column is
-- untrusted: an over-large value would drive balance_available negative and abort
-- the WHOLE migration on one bad row.
INSERT INTO public.credit_ledger
  (id, user_id, kind, units, lot_id, feature, idempotency_key, memo)
SELECT gen_random_uuid(), s.user_id, 'spend',
       -LEAST(GREATEST(s.reward_consumed_at_cutover, 0), s.reward_credits_at_cutover),
       s.lot_id, 'reasoning',
       'backfill:0135:spend:' || s.month_bucket,
       'backfill 0135 from usage_counters ' || s.month_bucket
  FROM public.credit_backfill_0135 s
 WHERE s.decision LIKE 'migrated%'
   AND s.month_bucket = public.kst_month_bucket(now())
   AND s.lot_id IS NOT NULL
   AND GREATEST(s.reward_consumed_at_cutover, 0) > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.credit_ledger l2
      WHERE l2.user_id = s.user_id
        AND l2.idempotency_key = 'backfill:0135:spend:' || s.month_bucket);

-- 8d. Prove it, on the rows this transaction actually created. A user whose
-- balance changed is a support incident, so this aborts rather than reports.
DO $verify$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.credit_backfill_0135 s
    JOIN _0135_new_lots n ON n.user_id = s.user_id
   WHERE s.month_bucket = public.kst_month_bucket(now())
     AND (s.reward_credits_at_cutover
          - LEAST(GREATEST(s.reward_consumed_at_cutover, 0), s.reward_credits_at_cutover))
         <> public.credit_available(s.user_id);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '0135 backfill mismatch on % user(s); aborting', v_bad;
  END IF;
END
$verify$;

----------------------------------------------------------------------
-- 9. FREEZE the migrated columns
----------------------------------------------------------------------
-- Two jobs. (1) The mirror is the only legitimate writer from here on; anything
-- else desyncs it. (2) During THIS apply, backends queued on the locks above are
-- still executing the OLD function bodies, because Postgres does not re-resolve a
-- function mid-execution. Without this they resume after COMMIT and write the
-- legacy columns. With this they ABORT loudly, which is recoverable: the reserve
-- retries onto the new body, and an SSV transaction rolls back so AdMob's retry
-- still succeeds.
CREATE OR REPLACE FUNCTION public.usage_counters_freeze_credits()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('app.credit_mirror', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.reward_credits, 0) <> 0 OR COALESCE(NEW.reward_consumed, 0) <> 0 THEN
      RAISE EXCEPTION
        'usage_counters.reward_credits/reward_consumed are frozen by 0135; the '
        'credit ledger owns rewarded credits' USING ERRCODE = '55006';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.reward_credits IS DISTINCT FROM OLD.reward_credits
     OR NEW.reward_consumed IS DISTINCT FROM OLD.reward_consumed THEN
    RAISE EXCEPTION
      'usage_counters.reward_credits/reward_consumed are frozen by 0135; the '
      'credit ledger owns rewarded credits' USING ERRCODE = '55006';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usage_counters_freeze_credits ON public.usage_counters;
-- The name sorts before trg_usage_counters_updated_at, so the rejection happens
-- before the touch trigger does any work.
CREATE TRIGGER trg_usage_counters_freeze_credits
  BEFORE INSERT OR UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.usage_counters_freeze_credits();

----------------------------------------------------------------------
-- 10. spend_credits gets a DISTINCT sqlstate
----------------------------------------------------------------------
-- 0134 raised credit_insufficient with P0001, the same code
-- reasoning_limit_exceeded uses, so a plpgsql handler could not separate them
-- except by matching SQLERRM strings. 0134 is unapplied in prod and nothing calls
-- it, so changing the code costs nothing. The MESSAGE is unchanged, which matters
-- because src/lib/reasoning/runs.ts dispatches on message substrings and never
-- reads error.code.
CREATE OR REPLACE FUNCTION public.spend_credits(
  p_user_id uuid, p_units int, p_feature text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_is_service boolean := (public.billing_request_role() = 'service_role');
  v_existing uuid[];
  v_left int := p_units;
  v_take int;
  v_ids  uuid[] := ARRAY[]::uuid[];
  v_id   uuid;
  r      record;
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

  SELECT array_agg(l.id) INTO v_existing
    FROM public.credit_ledger l
   WHERE l.user_id = p_user_id AND l.idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('spent', p_units, 'entry_ids', to_jsonb(v_existing),
      'balance_after', public.credit_available(p_user_id), 'existing', true);
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  IF public.credit_available(p_user_id) < p_units THEN
    RAISE EXCEPTION 'credit_insufficient' USING ERRCODE = 'X0001';
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

    INSERT INTO public.credit_ledger
      (id, user_id, kind, units, lot_id, feature, idempotency_key)
    VALUES
      (v_id, p_user_id, 'spend', -v_take, r.lot_id, p_feature,
       CASE WHEN array_length(v_ids, 1) IS NULL THEN p_idempotency_key ELSE NULL END);

    v_ids  := v_ids || v_id;
    v_left := v_left - v_take;
  END LOOP;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'credit_insufficient' USING ERRCODE = 'X0001';
  END IF;

  RETURN jsonb_build_object('spent', p_units, 'entry_ids', to_jsonb(v_ids),
    'balance_after', public.credit_available(p_user_id), 'existing', false);
END;
$$;

----------------------------------------------------------------------
-- 11. reserve_reasoning_run - step 2 spends from the ledger
----------------------------------------------------------------------
ALTER TABLE public.reasoning_runs
  ADD COLUMN IF NOT EXISTS credit_entry_ids uuid[];

CREATE OR REPLACE FUNCTION public.reserve_reasoning_run(
  p_user_id uuid, p_key text, p_trigger text, p_item_count int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_existing public.reasoning_runs%ROWTYPE;
  v_kst timestamp; v_week text; v_mon text;
  v_tier text; v_cap int; v_spend text; v_rows int; v_id uuid;
  v_credit jsonb; v_entry_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_trigger NOT IN ('manual', 'auto') THEN
    RAISE EXCEPTION 'invalid trigger: %', p_trigger USING ERRCODE = '22023';
  END IF;
  IF p_key IS NULL OR char_length(p_key) < 8 OR char_length(p_key) > 120 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE = '22023';
  END IF;
  IF p_item_count IS NULL
     OR (p_trigger = 'auto' AND p_item_count != 1)
     OR (p_trigger = 'manual' AND (p_item_count < 1 OR p_item_count > 5)) THEN
    RAISE EXCEPTION 'invalid item count' USING ERRCODE = '22023';
  END IF;

  -- MUST stay the first lock-taking statement in this body. Everything above is
  -- pure validation. See the COMMENT ON FUNCTION at the foot of this file, which
  -- survives apply_migration's comment stripping.
  PERFORM pg_advisory_xact_lock(hashtext('reasoning_run:' || p_user_id::text));

  SELECT * INTO v_existing FROM public.reasoning_runs
   WHERE user_id = p_user_id AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN jsonb_build_object('run_id', v_existing.id, 'status', v_existing.status,
                              'spend', v_existing.spend, 'existing', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.reasoning_runs
              WHERE user_id = p_user_id AND status IN ('reserved', 'running')) THEN
    RAISE EXCEPTION 'reasoning_run_active' USING ERRCODE = 'P0001';
  END IF;

  v_kst  := now() AT TIME ZONE 'Asia/Seoul';
  v_week := to_char(v_kst, 'IYYY-"W"IW');
  v_mon  := to_char(v_kst, 'YYYY-MM');

  -- Effective tier (judge comp + expiry, 0088). Caps MUST match tier-map.ts.
  v_tier := public.effective_subscription_tier(p_user_id);
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN NULL   -- unlimited
    WHEN 'cortex' THEN 7
    WHEN 'soma'   THEN 7
    ELSE 2                    -- free (주 2회)
  END;

  IF v_cap IS NULL THEN
    v_spend := 'none';
  ELSIF p_trigger = 'auto' THEN
    -- AUTO never touches credits (Simon 2026-07-18). Unchanged by 0135.
    IF v_cap - 1 < 1 THEN
      RAISE EXCEPTION 'reasoning_auto_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_rows := NULL;
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, v_week, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1, updated_at = now()
      WHERE uc.reasoning_used < v_cap - 1
    RETURNING 1 INTO v_rows;
    IF v_rows IS NULL THEN
      RAISE EXCEPTION 'reasoning_auto_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_spend := 'base';
  ELSE
    -- MANUAL, step 1: weekly base (0089 order). Unchanged.
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, v_week, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1, updated_at = now()
      WHERE uc.reasoning_used < v_cap
    RETURNING 1 INTO v_rows;

    IF v_rows IS NOT NULL THEN
      v_spend := 'base';
    ELSE
      -- Step 2 (0135): spend ONE unit from the ledger. The usage_counters MONTH
      -- row is no longer touched here at all, which is what keeps the grant path
      -- and this path from sharing a lock object in opposite orders.
      --
      -- Profile guard first: credit_balance FKs public.users while usage_counters
      -- FKs auth.users, so a confirmed account with no profile row would get 23503
      -- out of spend_credits' mutex insert and the paywall would show a generic
      -- error. A user with no ledger row genuinely has no credits, so the limit
      -- sheet is the honest surface.
      IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
        RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
      END IF;

      BEGIN
        v_credit := public.spend_credits(p_user_id, 1, 'reasoning', 'reasoning_run:' || p_key);
      EXCEPTION
        -- NARROW on purpose. WHEN OTHERS would swallow 40P01 (deadlock) and 40001
        -- (serialization failure) and turn a retryable fault into a fake
        -- "out of credits". The client dispatches on MESSAGE TEXT, and only
        -- 'reasoning_limit_exceeded' reaches the sheet that owns the ad watch.
        WHEN sqlstate 'X0001' OR sqlstate '23503' THEN
          RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
      END;

      SELECT ARRAY(SELECT x::uuid
                     FROM jsonb_array_elements_text(v_credit -> 'entry_ids') AS t(x))
        INTO v_entry_ids;

      INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
      VALUES (p_user_id, v_week, 1)
      ON CONFLICT (user_id, month_bucket) DO UPDATE
        SET reasoning_used = uc.reasoning_used + 1, updated_at = now();
      v_spend := 'credit';
    END IF;
  END IF;

  INSERT INTO public.reasoning_runs
    (user_id, idempotency_key, trigger_kind, status, spend,
     week_bucket, month_bucket, item_count, credit_entry_ids)
  VALUES
    (p_user_id, p_key, p_trigger, 'reserved', v_spend,
     v_week, v_mon, p_item_count, v_entry_ids)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('run_id', v_id, 'status', 'reserved',
                            'spend', v_spend, 'existing', false);
END;
$$;

COMMENT ON COLUMN public.reasoning_runs.credit_entry_ids IS
  'The credit_ledger spend entries this run drew from (0135). NULL means the credit was NOT taken from the ledger: either spend <> ''credit'', or the run was reserved BEFORE the 0135 cutover. refund_reasoning_run_spend keys off exactly that distinction. An array, not a scalar: today one run costs one unit from one lot, but a multi-unit SKU would make a scalar silently under-refund.';

----------------------------------------------------------------------
-- 12. bump_reasoning_usage_if_under_cap - the SECOND live spender
----------------------------------------------------------------------
-- src/app/northstar.tsx is the only caller. Leaving it alone would make
-- "reward_credits > reward_consumed" false forever after the cutover, so northstar
-- would silently lose credit spending while /reasoning kept it.
--
-- NO ADVISORY LOCK IS ADDED HERE, DELIBERATELY. It is not needed: the credit is
-- taken atomically under spend_credits' credit_balance mutex, and step 1's guarded
-- upsert is already atomic. And it could not be added SAFELY next to the credit
-- step anyway. Step 1's INSERT..ON CONFLICT locks the week row even when its WHERE
-- is false and nothing updates, so a lock taken after it would give
-- week-row -> advisory, the inverse of reserve_reasoning_run's order, and one
-- northstar propose racing one manual run would be 40P01.
CREATE OR REPLACE FUNCTION public.bump_reasoning_usage_if_under_cap(
  p_user_id uuid,
  p_month   text,  -- IGNORED (back-compat); buckets are server-derived
  p_cap     int,   -- IGNORED (back-compat); the cap is server-derived
  p_key     text   -- caller idempotency key; see the 3-arg wrapper below
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_count int; v_tier text; v_cap int; v_week text; v_mon text; v_kst timestamp;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR length(btrim(p_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required' USING ERRCODE = '22004';
  END IF;

  v_kst  := now() AT TIME ZONE 'Asia/Seoul';
  v_week := to_char(v_kst, 'IYYY-"W"IW');
  v_mon  := to_char(v_kst, 'YYYY-MM');

  v_tier := public.effective_subscription_tier(p_user_id);
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN NULL
    WHEN 'cortex' THEN 7
    WHEN 'soma'   THEN 7
    ELSE 2
  END;

  IF v_cap IS NULL THEN
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, v_week, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1, updated_at = now()
    RETURNING reasoning_used INTO v_count;
    RETURN v_count;
  END IF;

  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
  VALUES (p_user_id, v_week, 1)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reasoning_used = uc.reasoning_used + 1, updated_at = now()
    WHERE uc.reasoning_used < v_cap
  RETURNING reasoning_used INTO v_count;
  IF v_count IS NOT NULL THEN RETURN v_count; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    PERFORM public.spend_credits(p_user_id, 1, 'reasoning', 'reasoning_bump:' || p_key);
  EXCEPTION
    WHEN sqlstate 'X0001' OR sqlstate '23503' THEN
      RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
  VALUES (p_user_id, v_week, 1)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reasoning_used = uc.reasoning_used + 1, updated_at = now()
  RETURNING reasoning_used INTO v_count;
  RETURN v_count;
END;
$$;

-- 3-arg back-compat for deployed binaries. Generates a fresh key, so it is exactly
-- as non-idempotent as today: a transport retry of one northstar propose charges
-- twice. That is PRE-EXISTING (it double-incremented reward_consumed before), and
-- the 4-arg form exists so the client can stop it with one parameter.
CREATE OR REPLACE FUNCTION public.bump_reasoning_usage_if_under_cap(
  p_user_id uuid, p_month text, p_cap int
) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.bump_reasoning_usage_if_under_cap(
           $1, $2, $3, 'legacy:' || gen_random_uuid()::text);
$$;

----------------------------------------------------------------------
-- 13. The two grant paths - same signatures, same ceilings, no edge redeploy
----------------------------------------------------------------------
-- p_month is now IGNORED in both. 0075 used the CLIENT-SUPPLIED bucket verbatim as
-- the upsert conflict key, so a tampered client could rotate credits onto a
-- week-shaped or future bucket. Deriving the window server-side closes that
-- WITHOUT touching the client contract: usage.ts keeps sending monthBucket() and
-- keeps being right, and rewarded-ssv/index.ts needs no redeploy.
--
-- NO PROFILE GUARD, deliberately. If public.users is missing the FK violation must
-- abort: on the SSV path that rolls the rewarded_ssv_txns dedup row back so
-- AdMob's retry can still succeed, whereas a soft RETURN would consume the
-- impression forever. On the client path addRewardCredits already swallows it.
CREATE OR REPLACE FUNCTION public.bump_reward_credits_if_under_cap(
  p_user_id uuid, p_month text, p_credits int
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_grant int; v_earned int; v_allow int;
  -- MUST match src/lib/entitlements/tiers.ts REWARD_MONTHLY_CAP / REWARD_PER_WATCH.
  c_monthly_cap constant int := 20;
  c_per_call    constant int := 2;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  v_grant := LEAST(GREATEST(COALESCE(p_credits, 0), 0), c_per_call);

  -- Mutex BEFORE the read. The old ceiling was atomic because clamp and write were
  -- one UPSERT; a derived ceiling is read-then-write, so without this two
  -- concurrent watches both read 18 and both grant 2.
  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  v_earned := public.credit_ad_earned_this_month(p_user_id);
  v_allow  := GREATEST(LEAST(v_grant, c_monthly_cap - v_earned), 0);
  IF v_allow = 0 THEN RETURN v_earned; END IF;

  PERFORM public.grant_credits_free_internal(
    p_user_id, v_allow, 'ad_reward', public.kst_month_end(now()), 'rewarded watch', NULL);
  RETURN v_earned + v_allow;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_reward_credits_ssv(
  p_user_id uuid, p_month text, p_grant int, p_txn_id text
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_rows int; v_grant int; v_earned int; v_allow int;
  c_monthly_cap constant int := 20;
  c_per_call    constant int := 2;
BEGIN
  IF p_txn_id IS NULL OR length(p_txn_id) = 0 THEN
    RAISE EXCEPTION 'transaction_id required' USING ERRCODE = '22004';
  END IF;
  v_grant := LEAST(GREATEST(COALESCE(p_grant, 0), 0), c_per_call);

  -- Dedup stays FIRST and stays on rewarded_ssv_txns: that ledger is SHARED with
  -- the chat SSV grant (0091), and moving it would let one AdMob transaction pay
  -- out on both surfaces.
  INSERT INTO public.rewarded_ssv_txns (transaction_id, user_id)
  VALUES (p_txn_id, p_user_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN public.credit_ad_earned_this_month(p_user_id);
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  v_earned := public.credit_ad_earned_this_month(p_user_id);
  v_allow  := GREATEST(LEAST(v_grant, c_monthly_cap - v_earned), 0);
  IF v_allow = 0 THEN RETURN v_earned; END IF;

  PERFORM public.grant_credits_free_internal(
    p_user_id, v_allow, 'ad_reward', public.kst_month_end(now()),
    'rewarded SSV ' || p_txn_id, NULL);
  RETURN v_earned + v_allow;
END;
$$;

----------------------------------------------------------------------
-- 14. The refund path
----------------------------------------------------------------------
-- CREATE OR REPLACE cannot add a parameter, and adding one with a default would
-- leave the old 4-arg body alive and still writing reward_consumed - which the
-- freeze trigger would then reject, turning every failed run into an error. Drop
-- it and use a new name so no overload can exist. The three callers reference it
-- inside plpgsql bodies (not resolved at CREATE time) and are all replaced below.
DROP FUNCTION IF EXISTS public.refund_reasoning_spend(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.refund_reasoning_run_spend(p_user_id uuid, p_run_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE; v_id uuid; v_lot record;
BEGIN
  SELECT * INTO v_run FROM public.reasoning_runs
   WHERE id = p_run_id AND user_id = p_user_id;
  IF NOT FOUND OR v_run.spend = 'none' THEN RETURN; END IF;

  -- Both spend kinds bumped the week row, so both decrement it. The weekly base is
  -- a CAP, not a currency; it stays a counter.
  UPDATE public.usage_counters
     SET reasoning_used = GREATEST(reasoning_used - 1, 0), updated_at = now()
   WHERE user_id = p_user_id AND month_bucket = v_run.week_bucket;

  IF v_run.spend <> 'credit' THEN RETURN; END IF;

  IF v_run.credit_entry_ids IS NOT NULL
     AND array_length(v_run.credit_entry_ids, 1) IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_run.credit_entry_ids LOOP
      PERFORM public.credit_refund_spend_internal(v_id, 'reasoning run refunded');
    END LOOP;
    RETURN;
  END IF;

  -- PRE-0135 IN-FLIGHT RUN. Its credit was a reward_consumed increment that the
  -- section 8 backfill ALREADY translated into a ledger spend against the backfill
  -- lot. Decrementing reward_consumed here would put the unit back into a frozen,
  -- derived column, which is nowhere. Give it back to the lot it came from.
  SELECT l.id, l.lot_expires_at INTO v_lot
    FROM public.credit_ledger l
   WHERE l.user_id = p_user_id
     AND l.idempotency_key = 'backfill:0135:grant:' || v_run.month_bucket;
  IF NOT FOUND THEN RETURN; END IF;                    -- nothing was migrated
  IF v_lot.lot_expires_at IS NOT NULL AND v_lot.lot_expires_at <= now() THEN
    RETURN;                                            -- the lot is gone
  END IF;

  -- 'spend_refund', not a new ad_reward grant: an ad_reward row would count toward
  -- credit_ad_earned_this_month and silently eat one unit of the user's 20/month
  -- earning headroom that the old system did not eat.
  INSERT INTO public.credit_ledger
    (id, user_id, kind, units, lot_id, feature, idempotency_key, memo)
  VALUES
    (gen_random_uuid(), p_user_id, 'spend_refund', 1, v_lot.id, 'reasoning',
     'legacy_refund:0135:' || p_run_id::text, 'pre-0135 in-flight run refunded')
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_reasoning_run(p_user_id uuid, p_run_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs
     SET status = 'failed', error_code = left(COALESCE(p_code, 'error'), 64)
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN RETURN false; END IF;
  PERFORM public.refund_reasoning_run_spend(p_user_id, v_run.id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_reasoning_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs SET status = 'cancelled'
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN RETURN false; END IF;
  PERFORM public.refund_reasoning_run_spend(p_user_id, v_run.id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_reasoning_runs(
  p_user_id uuid, p_stale_minutes int DEFAULT 30
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE; v_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  FOR v_run IN
    UPDATE public.reasoning_runs SET status = 'recovered', error_code = 'stale'
     WHERE user_id = p_user_id AND status IN ('reserved', 'running')
       AND updated_at < now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 30), 5))
    RETURNING *
  LOOP
    PERFORM public.refund_reasoning_run_spend(p_user_id, v_run.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

----------------------------------------------------------------------
-- 15. expire_credit_lots - ordered, chunked, non-overlapping, cron-callable
----------------------------------------------------------------------
-- 0135 creates the FIRST expiring lots this system has ever had, so the sweep
-- stops being theoretical and its three defects all bite at once:
--   * an unordered multi-user loop lets two overlapping runs deadlock;
--   * one transaction covering every affected user stalls the one path that must
--     not stall (spending a credit);
--   * billing_request_role() is NULL under pg_cron, so the service_role gate
--     rejected every scheduled run. The house pattern for cron functions
--     (sweep_stale_billing_claims, 0119) permits the no-JWT case and relies on the
--     anon/authenticated revoke; this keeps the check for PostgREST callers.
DROP FUNCTION IF EXISTS public.expire_credit_lots(timestamptz);

CREATE OR REPLACE FUNCTION public.expire_credit_lots(
  p_at timestamptz DEFAULT now(), p_limit int DEFAULT 500
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r record; v_n int := 0;
BEGIN
  IF public.billing_request_role() IS NOT NULL
     AND public.billing_request_role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  -- Non-blocking: two cron firings cannot overlap, and the loser is a no-op rather
  -- than a queue.
  IF NOT pg_try_advisory_xact_lock(pg_catalog.hashtextextended('credit_expire_sweep', 7)) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT l.lot_id, l.user_id, SUM(l.units)::int AS remaining
      FROM public.credit_ledger l
     WHERE l.lot_expires_at IS NOT NULL
       AND l.lot_expires_at <= p_at
       AND l.user_id IS NOT NULL
     GROUP BY l.lot_id, l.user_id
    HAVING SUM(l.units) > 0
     ORDER BY l.user_id, l.lot_id          -- deterministic lock order
     LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  LOOP
    INSERT INTO public.credit_balance (user_id) VALUES (r.user_id)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now();
    INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, memo)
    VALUES (gen_random_uuid(), r.user_id, 'expire', -r.remaining, r.lot_id, 'lot expired');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Every 10 minutes, so the mirror and the drift view are never stale for long
-- after a KST month boundary, and so no single transaction holds many users'
-- credit_balance rows.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('expire-credit-lots')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-credit-lots');
    PERFORM cron.schedule('expire-credit-lots', '*/10 * * * *',
      'SELECT public.expire_credit_lots();');
  END IF;
END
$cron$;

----------------------------------------------------------------------
-- 16. Reconciliation
----------------------------------------------------------------------
-- credit_balance.balance_available is the RAW ledger sum: credit_balance_apply
-- adds units unconditionally while credit_available() applies the expiry
-- predicate. 0134's view compared those two, so it would have gone non-empty for
-- every user at every expiry and stayed there until the sweep ran. A tripwire that
-- is always ringing is off. Compare the cache to what it actually caches; expiry
-- is credit_available()'s job.
CREATE OR REPLACE VIEW public.credit_balance_drift AS
  SELECT b.user_id, b.balance_available AS cached,
         COALESCE(l.total, 0) AS ledger_total,
         b.balance_available - COALESCE(l.total, 0) AS drift
    FROM public.credit_balance b
    LEFT JOIN (SELECT user_id, SUM(units)::int AS total
                 FROM public.credit_ledger WHERE user_id IS NOT NULL
                GROUP BY user_id) l ON l.user_id = b.user_id
   WHERE b.balance_available <> COALESCE(l.total, 0);

COMMENT ON VIEW public.credit_balance_drift IS
  'Empty when healthy. Compares the cache to the raw ledger sum, NOT to credit_available: expired-but-unswept lots are credit_available''s concern, and folding them in here would leave the tripwire permanently ringing after every month boundary.';

-- Does the mirror still tell deployed clients the truth?
CREATE OR REPLACE VIEW public.credit_counter_drift AS
  SELECT uc.user_id,
         uc.reward_credits  AS mirrored_earned,
         uc.reward_consumed AS mirrored_consumed,
         public.credit_ad_earned_this_month(uc.user_id) AS ledger_earned,
         GREATEST(public.credit_available(uc.user_id), 0) AS ledger_available
    FROM public.usage_counters uc
   WHERE uc.month_bucket = public.kst_month_bucket(now())
     AND (uc.reward_credits <> public.credit_ad_earned_this_month(uc.user_id)
          OR uc.reward_credits - uc.reward_consumed
             <> LEAST(GREATEST(public.credit_available(uc.user_id), 0),
                      public.credit_ad_earned_this_month(uc.user_id)));

COMMENT ON VIEW public.credit_counter_drift IS
  'Empty when healthy. A row means a deployed client reading usage_counters would see a different balance than the ledger holds, which is the failure mode 0135 exists to prevent.';

REVOKE ALL ON public.credit_balance_drift  FROM anon, authenticated;
REVOKE ALL ON public.credit_counter_drift  FROM anon, authenticated;

----------------------------------------------------------------------
-- 17. Grants
----------------------------------------------------------------------
-- Supabase auto-GRANTs EXECUTE on every newly created function to anon AND
-- authenticated. REVOKE FROM PUBLIC is NOT sufficient - that is the exact footgun
-- scripts/check-definer-grants.ts exists for, and the one that once made
-- grant_reward_credits_ssv anon-callable. Every internal below is revoked by exact
-- signature and granted to nobody: they are only ever called from other DEFINER
-- bodies, which execute as the owner.
REVOKE ALL     ON FUNCTION public.grant_credits_free_internal(uuid, int, text, timestamptz, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_credits_free_internal(uuid, int, text, timestamptz, text, text) FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.credit_refund_spend_internal(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_refund_spend_internal(uuid, text) FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.usage_counters_mirror_credits(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.usage_counters_mirror_credits(uuid) FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.credit_ledger_mirror_counter() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_ledger_mirror_counter() FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.usage_counters_freeze_credits() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.usage_counters_freeze_credits() FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) TO authenticated, service_role;

REVOKE ALL     ON FUNCTION public.refund_reasoning_run_spend(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_reasoning_run_spend(uuid, uuid) FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.grant_credits_free(uuid, int, text, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_credits_free(uuid, int, text, timestamptz, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_credits_free(uuid, int, text, timestamptz, text) TO service_role;

REVOKE ALL     ON FUNCTION public.refund_credit_spend(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credit_spend(uuid, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_credit_spend(uuid, text) TO service_role;

REVOKE ALL     ON FUNCTION public.expire_credit_lots(timestamptz, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_credit_lots(timestamptz, int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_credit_lots(timestamptz, int) TO service_role;

REVOKE ALL     ON FUNCTION public.spend_credits(uuid, int, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, int, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.spend_credits(uuid, int, text, text) TO authenticated, service_role;

-- Unchanged client contracts.
REVOKE ALL     ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) TO authenticated;

REVOKE ALL     ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) TO service_role;

REVOKE ALL     ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) TO authenticated;

REVOKE ALL     ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int, text) TO authenticated;

REVOKE ALL     ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) TO authenticated;

REVOKE ALL     ON FUNCTION public.fail_reasoning_run(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fail_reasoning_run(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fail_reasoning_run(uuid, uuid, text) TO authenticated;

REVOKE ALL     ON FUNCTION public.cancel_reasoning_run(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reasoning_run(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancel_reasoning_run(uuid, uuid) TO authenticated;

REVOKE ALL     ON FUNCTION public.recover_stale_reasoning_runs(uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recover_stale_reasoning_runs(uuid, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.recover_stale_reasoning_runs(uuid, int) TO authenticated;

----------------------------------------------------------------------
-- 18. Invariants that must survive comment stripping
----------------------------------------------------------------------
-- apply_migration removes `--` comments from function bodies (measured 7/7 on the
-- billing functions), so prod's pg_get_functiondef shows the code with none of the
-- reasoning above. COMMENT ON survives. These are the three facts a future author
-- must not learn the hard way.
COMMENT ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) IS
  '0135 invariant: pg_advisory_xact_lock MUST remain the FIRST lock-taking statement in this body. The established order is advisory -> usage_counters week row -> credit_balance -> credit_ledger -> (mirror) usage_counters month row. Taking any of those earlier inverts the order against bump_reasoning_usage_if_under_cap and deadlocks (40P01). The credit step catches ONLY X0001/23503; widening it to WHEN OTHERS would swallow 40P01/40001 and report a retryable fault as "out of credits".';

COMMENT ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int, text) IS
  '0135 invariant: do NOT add an advisory lock here. Step 1''s INSERT..ON CONFLICT locks the week row even when its WHERE is false, so a lock taken afterwards would give week-row -> advisory, the inverse of reserve_reasoning_run, and one northstar propose racing one manual run would deadlock. Atomicity already comes from spend_credits'' credit_balance mutex. p_month and p_cap are ignored back-compat placeholders.';

COMMENT ON FUNCTION public.usage_counters_mirror_credits(uuid) IS
  '0135: usage_counters.reward_credits/reward_consumed are DERIVED from credit_ledger, not stored. This is the only legitimate writer; trg_usage_counters_freeze_credits rejects every other one. It must always be reached with the credit_balance row lock already held, because that is what fixes the lock order between the grant path and the reserve path.';

COMMENT ON FUNCTION public.spend_credits(uuid, int, text, text) IS
  '0135: raises credit_insufficient with SQLSTATE X0001, deliberately distinct from P0001 (reasoning_limit_exceeded) so callers can separate "no credits" from "cap reached" without matching message strings. The MESSAGE is load-bearing for src/lib/reasoning/runs.ts, which dispatches on substrings and never reads error.code.';

COMMIT;
