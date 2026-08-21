-- rollback/0137_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- ⚠ READ THIS BEFORE RUNNING IT.
--
-- 0137 changed no data. Rolling it back is therefore trivial in mechanics and
-- serious in consequence: it RE-OPENS A CROSS-USER READ that was verified live
-- against production on 2026-08-20.
--
-- credit_available(uuid, timestamptz) and credit_ad_earned_this_month(uuid,
-- timestamptz) are SECURITY DEFINER, take the user id as a PARAMETER, and have
-- no ownership check. Granting them to `authenticated` publishes them at
-- /rest/v1/rpc/<name>, where any signed-in user can pass any other user's uuid
-- and read that person's credit balance. The measured probe, signed in as the
-- shared QA account:
--
--     POST /rest/v1/rpc/credit_available {"p_user_id":"<not the caller>"} -> 200
--
-- If the reason for rolling back is "a client needs to read a balance", the
-- answer is credit_summary_self(), which this file drops. Do not re-grant the
-- parameterised readers to get there.
--
-- The only defensible reason to run this file is that credit_summary_self()
-- itself is broken and something depends on the old grants. Nothing in the repo
-- did at the time 0137 was written.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 1. Drop the self-scoped reader
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.credit_summary_self();

----------------------------------------------------------------------
-- 2. Restore 0134's grants, hole included
----------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.credit_available(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.credit_available(uuid, timestamptz) IS NULL;
COMMENT ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) IS NULL;

COMMIT;
