-- 0138_retire_judge_auto_flag.sql
-- The XPRIZE judge auto-flag is retired (REQ-260820-04, Simon GO 2026-08-21).
--
-- ⚠ REVISED 2026-08-21 03:xx BEFORE EVER BEING APPLIED. The first draft of this
-- file was dry-run against production by the console session (BEGIN ... ROLLBACK)
-- and HELD, because it would have opened the very hole its own header warned
-- about. What the dry run measured, and why the fix is what it is, is section 0
-- below. Production is still on 0137; nothing was applied and rolled back into
-- a half state.
--
-- ── 0. WHY THIS FILE CHANGED ─────────────────────────────────────────────────
--
-- The first draft revoked the column and then dropped both triggers. The revoke
-- was measured to do NOTHING:
--
--   pg_class.relacl(users)          -> anon=arwdDxtm/postgres,
--                                      authenticated=arwdDxtm/postgres
--   pg_attribute.attacl(judge_mode) -> NULL
--   after REVOKE UPDATE (judge_mode) ... :
--     has_column_privilege('authenticated','public.users','judge_mode','UPDATE')
--     -> still true
--
-- anon and authenticated hold TABLE-level privileges on public.users. A
-- column-level REVOKE cannot cut a table-level GRANT: it removes column ACL
-- entries, and there were none to remove (attacl was NULL). Table privileges
-- imply every column, so the revoke is a no-op against this ACL shape.
--
-- That turns the first draft inside out. It dropped enforce_judge_mode(), which
-- the same header correctly identified as "the only belt", on the strength of a
-- revoke that does not hold. Applying it would have made
-- `update users set judge_mode = true where id = auth.uid()` succeed.
--
-- So the fix keeps a trigger in that seat, and changes WHAT it does:
--
--   before: NEW.judge_mode := (email domain is in the XPRIZE list)
--   after:  a client may not change judge_mode at all; anything else may
--
-- The XPRIZE derivation is gone either way, which is what REQ-260820-04 asked
-- for. What is NOT gone is the guard, because nothing else is holding it yet.
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
-- ── WHY THE COLUMN IS WORTH GUARDING AT ALL ──────────────────────────────────
--
--   effective_subscription_tier(): WHEN u.judge_mode THEN 'brain'
--   -> judge_mode = true is the TOP PAID TIER: uncapped reasoning, every
--      premium purpose, the brain daily spend ceiling.
--
-- Comp from a column the client can write is the same shape as comp from an
-- email domain the client picks at sign-up. Retiring one and leaving the other
-- open would not be a retirement.
--
-- ── WHAT THIS DELIBERATELY KEEPS ─────────────────────────────────────────────
--
-- The users.judge_mode column and the comp branch in
-- effective_subscription_tier() both stay. The request is explicit that the
-- replacement for comped free access is RBAC's job (REQ-260821-02), not this
-- one. With no trigger deriving the column and no client able to write it, it
-- is inert: false for everyone, settable only by an operator path, and ready to
-- be re-pointed at a role claim.
--
-- ── HANDED TO RBAC (REQ-260821-02), NOT SOLVED HERE ──────────────────────────
--
-- The table-level ACL itself. anon holds arwdDxtm on public.users, which
-- includes DELETE and TRUNCATE; RLS is the only thing standing in front of it.
-- Fixing that means revoking the table grant and re-granting the exact columns
-- the client legitimately writes, which needs a census of those columns first
-- and has a blast radius on a different axis from RLS. It belongs with the work
-- that redraws the permission model, not with a flag retirement.
--
-- Idempotent, forward-only. Safe to re-apply.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 1. Replace the derivation with a guard, in the same trigger seat
----------------------------------------------------------------------
-- Not SECURITY DEFINER, and it does NOT call billing_request_role(). That
-- helper is REVOKEd from anon, and a trigger that any role can fire must not
-- depend on a function some roles cannot execute. The claims read is the same
-- one billing_request_role() performs, inlined.
--
-- ⚠ 0112's trap, and the shape of it. `request.jwt.claim.role` (singular GUC)
-- is no longer set by the platform, so a guard reading only that GUC sees NULL
-- for everyone and either blocks everything or nothing. The claims JSON has to
-- be read too. That mistake cost the first real payment a 500 on 2026-08-20.

CREATE OR REPLACE FUNCTION public.enforce_judge_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  -- Untouched column: nothing to police. Most updates to this table take this
  -- branch, so the guard costs a comparison on the common path.
  IF NEW.judge_mode IS NOT DISTINCT FROM OLD.judge_mode THEN
    RETURN NEW;
  END IF;

  v_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  -- The operator path. Support tooling and the eventual RBAC comp grant both
  -- arrive as service_role.
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- No role claim at all means this is not a PostgREST request: pg_cron, psql,
  -- a migration, a SECURITY DEFINER function running without a JWT. Those must
  -- pass. Blocking them is the 42501 trap the spend_credits guard hit on
  -- 2026-08-20, where a guard written for clients also fired for the nightly
  -- job and failed it silently. The UPDATE in section 3 of this very file runs
  -- on that path.
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Everything else is a client. Revert rather than raise: raising would fail
  -- an unrelated profile update that merely round-trips the whole row, turning
  -- a privilege guard into a broken settings screen. The write is refused, the
  -- rest of the update stands.
  NEW.judge_mode := OLD.judge_mode;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_enforce_judge ON public.users;
CREATE TRIGGER trg_users_enforce_judge
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_judge_mode();

COMMENT ON FUNCTION public.enforce_judge_mode() IS
  'Blocks client writes to users.judge_mode. Was the XPRIZE email-domain '
  'derivation until 2026-08-21 (REQ-260820-04); the derivation is gone, the '
  'guard is not, because anon/authenticated still hold table-level UPDATE on '
  'public.users and a column-level REVOKE cannot cut that (measured). Delete '
  'this only when RBAC has fixed the table ACL.';

----------------------------------------------------------------------
-- 2. Remove the INSERT-side derivation outright
----------------------------------------------------------------------
-- Nothing replaces this one. An INSERT cannot compare against an OLD row, and
-- the column defaults to false, so the guard for inserts is the default plus
-- section 3's sweep. auto_judge_mode() existed only to read the email domain.

DROP TRIGGER IF EXISTS trg_users_auto_judge        ON public.users;
DROP TRIGGER IF EXISTS trg_users_auto_judge_update ON public.users;
DROP FUNCTION IF EXISTS public.auto_judge_mode();

----------------------------------------------------------------------
-- 3. Clear the flag
----------------------------------------------------------------------
-- Zero rows on production at the time of writing, so this is a no-op there and
-- an assertion everywhere else. It runs with no JWT, which is exactly the path
-- section 1 lets through.

UPDATE public.users SET judge_mode = false WHERE judge_mode;

----------------------------------------------------------------------
-- 4. Column revokes: kept, and honest about being inert TODAY
----------------------------------------------------------------------
-- ⚠ THESE DO NOT CURRENTLY BLOCK ANYTHING, and that is measured, not assumed
-- (section 0). anon and authenticated hold table-level privileges on
-- public.users, and a column-level REVOKE cannot cut them.
--
-- They are kept for two reasons. They are correct in intent and become load
-- bearing the moment RBAC revokes the table grant and re-grants per column.
-- And leaving the statement here keeps the intent attached to the column
-- rather than living only in a doc.
--
-- What they are NOT is the guard. The guard is the trigger in section 1. If a
-- future reader deletes that trigger because "the column is revoked", they will
-- reproduce exactly the bug this revision fixed.
--
-- Grants live at the end of the file: check:definer-grants Rule A scans without
-- stripping comments and matches across statement boundaries, so a GRANT/REVOKE
-- followed by prose containing a bare "to" and a later "public." produces a
-- false positive.

REVOKE INSERT (judge_mode) ON public.users FROM anon, authenticated;
REVOKE UPDATE (judge_mode) ON public.users FROM anon, authenticated;

COMMIT;
