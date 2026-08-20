-- 0138_retire_judge_auto_flag.sql
-- The XPRIZE judge auto-flag is retired (REQ-260820-04, Simon GO 2026-08-21).
--
-- ── WHAT THIS REMOVES ────────────────────────────────────────────────────────
--
-- 0010 and 0011 derived users.judge_mode from the email domain
-- (xprize.org / devpost.com / hacker.fund) on INSERT and re-derived it on every
-- UPDATE. The contest ended on 2026-08-15; the domains mean nothing now.
--
-- Safe to do today for a measured reason: production has ZERO users with
-- judge_mode = true (0 of 15). Nobody loses a comp.
--
-- ── ⚠ THE PART THAT IS NOT JUST A DELETION ───────────────────────────────────
--
-- enforce_judge_mode() was doing TWO jobs, and only one of them was the flag.
-- The other was a privilege guard, and dropping it alone would open a live
-- self-escalation. The chain:
--
--   effective_subscription_tier(): WHEN u.judge_mode THEN 'brain'
--   -> judge_mode = true is the TOP PAID TIER: uncapped reasoning, every
--      premium purpose, the brain daily spend ceiling.
--
-- 0011's own comment says a "column-level revoke ensures even direct UPDATE of
-- judge_mode by the row owner has no effect". MEASURED AGAINST PRODUCTION on
-- 2026-08-21, THAT REVOKE DOES NOT EXIST:
--
--   select grantee, privilege_type from information_schema.column_privileges
--    where table_name='users' and column_name='judge_mode';
--   -> anon and authenticated each hold INSERT, UPDATE, SELECT, REFERENCES.
--
-- So the trigger was not belt-and-suspenders. It was the only belt. Any signed
-- in user could have run `update users set judge_mode = true where id =
-- auth.uid()` and been comped to brain, except that the trigger overwrote the
-- value back on the way through.
--
-- Therefore this migration REVOKES FIRST and drops second. Removing the trigger
-- without the revoke would have turned a cleanup into a privilege escalation.
--
-- ── WHAT THIS DELIBERATELY KEEPS ─────────────────────────────────────────────
--
-- The users.judge_mode column and the comp branch in
-- effective_subscription_tier() both stay. The request is explicit that the
-- replacement for comped free access is RBAC's job (REQ-260821-02), not this
-- one. With no trigger writing the column and no client able to write it, it is
-- now inert: false for everyone, settable only by service_role, and ready to be
-- re-pointed at a role claim.
--
-- Idempotent, forward-only. Safe to re-apply.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 1. Close the hole BEFORE removing the thing that was covering it
----------------------------------------------------------------------

REVOKE INSERT (judge_mode) ON public.users FROM anon, authenticated;
REVOKE UPDATE (judge_mode) ON public.users FROM anon, authenticated;

COMMENT ON COLUMN public.users.judge_mode IS
  'Comp entitlement flag read by effective_subscription_tier (true => brain). RETIRED as an auto-derived value in 0138: the XPRIZE domain triggers are gone and no client role may write this column. Only service_role can set it. Its replacement is a role-based comp in the RBAC work (REQ-260821-02); until then it is false for everyone.';

----------------------------------------------------------------------
-- 2. Now the triggers and their functions
----------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_users_auto_judge        ON public.users;
DROP TRIGGER IF EXISTS trg_users_auto_judge_update ON public.users;
DROP TRIGGER IF EXISTS trg_users_enforce_judge     ON public.users;

DROP FUNCTION IF EXISTS public.auto_judge_mode();
DROP FUNCTION IF EXISTS public.enforce_judge_mode();

----------------------------------------------------------------------
-- 3. Leave no comped row behind
----------------------------------------------------------------------

-- Expected to affect 0 rows (measured: 0 of 15 users). Written anyway so that
-- re-applying this file against any environment - a branch database, a restored
-- backup, a future clone - cannot leave a permanent uncapped account behind now
-- that nothing re-derives the value.
UPDATE public.users SET judge_mode = false WHERE judge_mode;

COMMIT;
