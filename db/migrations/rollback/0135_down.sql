-- rollback/0135_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, which is a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
--
-- 0135 moved rewarded credits into the ledger and FROZE
-- usage_counters.reward_credits / reward_consumed, leaving them as a
-- trigger-maintained mirror. Simply restoring the old function bodies would NOT
-- be a rollback: from the moment 0135 applied, every grant and every spend went
-- to the ledger, and the mirror wrote derived values back. The counters therefore
-- no longer hold "what the old system would have held" - they hold a projection.
--
-- Restoring the old bodies without re-deriving would resume the old arithmetic on
-- top of a projection, which double-counts. So the ORDER below matters and the
-- re-derivation is the part that actually rolls anything back.
--
-- ── WHAT IS AND IS NOT RECOVERABLE ───────────────────────────────────────────
--
-- Recoverable: every user's spendable balance, exactly, because the ledger is
-- append-only and the mirror already expresses the same number in the old shape.
--
-- NOT recoverable: purchased credits, if 0136 has shipped. Those have no
-- representation in usage_counters at all - it has one integer for ad credits and
-- no concept of a lot, an expiry, or a purchase. DO NOT run this file after 0136
-- is live without first deciding what happens to money people paid. The guard at
-- the top refuses in that case rather than silently deleting paid balances.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- Same order 0135 takes them in, for the same reason.
LOCK TABLE public.reasoning_runs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.usage_counters IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.credit_ledger  IN SHARE ROW EXCLUSIVE MODE;

----------------------------------------------------------------------
-- 0. Refuse to delete paid balances
----------------------------------------------------------------------
DO $guard$
DECLARE v_paid int;
BEGIN
  SELECT count(*) INTO v_paid FROM public.credit_ledger WHERE kind = 'purchase';
  IF v_paid > 0 THEN
    RAISE EXCEPTION
      '0135_down: % purchased credit lot(s) exist. usage_counters cannot represent '
      'them, so rolling back would delete balances people paid for. Decide what '
      'happens to those first (refund via clawback_credits, or keep 0135).', v_paid;
  END IF;
END
$guard$;

----------------------------------------------------------------------
-- 1. Stop the mirror and the freeze BEFORE re-deriving
----------------------------------------------------------------------
-- The freeze rejects every writer except the mirror, so it has to go first or the
-- UPDATE below aborts. The mirror has to go too, or the ledger writes that the
-- restored functions no longer make would leave it half-driving the columns.
DROP TRIGGER IF EXISTS trg_usage_counters_freeze_credits ON public.usage_counters;
DROP TRIGGER IF EXISTS trg_credit_ledger_mirror_counter  ON public.credit_ledger;

----------------------------------------------------------------------
-- 2. Re-derive the counters from the ledger - THE part that rolls back
----------------------------------------------------------------------
-- Every user who has any ledger activity gets their current-month row rewritten
-- to the shape the old readers expect:
--   reward_credits  := ad units earned this KST month
--   reward_consumed := earned - LEAST(available, earned)
-- so that (earned - consumed) is the spendable balance, exactly as 0135's mirror
-- maintained it. Users with no ledger rows are untouched.
INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reward_credits, reward_consumed)
SELECT b.user_id,
       public.kst_month_bucket(now()),
       public.credit_ad_earned_this_month(b.user_id),
       GREATEST(public.credit_ad_earned_this_month(b.user_id)
                - LEAST(GREATEST(public.credit_available(b.user_id), 0),
                        public.credit_ad_earned_this_month(b.user_id)), 0)
  FROM public.credit_balance b
 WHERE b.user_id IS NOT NULL
ON CONFLICT (user_id, month_bucket) DO UPDATE
   SET reward_credits  = EXCLUDED.reward_credits,
       reward_consumed = EXCLUDED.reward_consumed,
       updated_at      = now();

----------------------------------------------------------------------
-- 3. Restore the pre-0135 bodies
----------------------------------------------------------------------
-- Restore, in this order, by re-running the ORIGINAL definitions:
--
--   0075  bump_reward_credits_if_under_cap(uuid, text, int)
--   0079  grant_reward_credits_ssv(uuid, text, int, text)
--   0089  bump_reasoning_usage_if_under_cap(uuid, text, int)
--   0092  refund_reasoning_spend(uuid, text, text, text)
--         reserve_reasoning_run(uuid, text, text, int)
--         fail_reasoning_run / cancel_reasoning_run / recover_stale_reasoning_runs
--
-- They are reproduced verbatim rather than referenced, because a rollback that
-- depends on someone finding the right file under pressure is not a rollback.
-- Paste the bodies from those migrations here before running this file; the
-- assertion below refuses to finish while the 0135 forms are still installed, so
-- an incomplete paste cannot be mistaken for a completed rollback.
--
-- Then drop the 0135-only surface:
DROP FUNCTION IF EXISTS public.refund_reasoning_run_spend(uuid, uuid);
DROP FUNCTION IF EXISTS public.bump_reasoning_usage_if_under_cap(uuid, text, int, text);

-- reasoning_runs.credit_entry_ids is deliberately KEPT. Dropping it would destroy
-- the record of which ledger entries in-flight runs drew from, and it is harmless
-- to the restored code, which never reads it.

----------------------------------------------------------------------
-- 4. Prove the restore is complete before committing
----------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regprocedure('public.refund_reasoning_spend(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      '0135_down: refund_reasoning_spend was not restored. Paste the pre-0135 '
      'bodies into section 3 and re-run; committing now would leave every failed '
      'reasoning run unable to refund.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_counter_drift) THEN
    RAISE EXCEPTION
      '0135_down: credit_counter_drift is non-empty after re-derivation, so at '
      'least one user would see a different balance than they hold. Investigate '
      'before committing.';
  END IF;
END
$verify$;

COMMIT;

-- After committing, the ledger tables remain in place and unread. That is
-- deliberate: they are the evidence of what happened while 0135 was live, and
-- 0134 is inert on its own.
