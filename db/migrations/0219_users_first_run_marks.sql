-- 0219_users_first_run_marks.sql
--
-- Q-261004-40 = A (Simon, DECISIONS 26.10.05 19:53): finishing the welcome
-- (onboarding) is a fact about the ACCOUNT, recorded on the server, and the app
-- follows the server value. The first-day review (/ttfv) is once per account too.
--
-- Why (QA-LEGACY W-12, P3): the completion flag lived only in device storage
-- (src/lib/onboarding/state.ts ONBOARDING_KEY, one global key). A new browser,
-- a private window or a reinstall showed an existing account the welcome again,
-- and then the first-day screen again. Splitting the device key per account was
-- tried in #2043 and did not converge over three gate rounds (cross-tab claim
-- races, write failures, the deletion fence), so it was taken out and this
-- server column replaces it.
--
-- What this adds to public.users (the profile row, one per account):
--   onboarding_completed_at  the first time the account finished the welcome
--   ttfv_seen_at             the first time the first-day review showed content
-- Both are NULL by default. NULL means "not yet". No client path can set a value
-- back to NULL or move it: there is no client INSERT/UPDATE grant on either
-- column (0140 removed table-wide writes; the postcondition below checks it).
--
-- Writes: two SECURITY DEFINER RPCs, owner only (auth.uid() = p_user_id), the
-- server clock, and the FIRST write wins (UPDATE ... WHERE <col> IS NULL; a
-- concurrent second device re-checks the filter after the row lock and changes
-- nothing). Each returns both marks so the app adopts the stored values.
-- Reads: the existing users_self_select policy (0009) and the table-level SELECT
-- that 0140 deliberately left alone. No new read path.
--
-- Erasure and export: both columns live on the users row. Account deletion
-- removes that row (supabase/functions/delete-account) and export-account
-- selects users.*, so neither needs a change. db/erasure-registry.json
-- classifies tables, not columns, and no table is added.
--
-- Backfill (existing accounts), decided here with its evidence:
--   An existing account with at least one row in records or sources is marked
--   complete, with its account creation time. Every other existing account
--   stays NULL and sees the welcome once more, like a new account.
-- Why records/sources: it is the evidence the home coachmark gate already uses
-- for "this is not a first run" (src/lib/onboarding/coachmarks-gate.ts
-- hasCoachmarkContent, #1883). Capture lives on home, which a signed-in account
-- reaches only after the welcome, so a saved row means the account got past it
-- on some device. An account with no row carries no such evidence; marking it
-- complete would be a guess, and the cost of not guessing is one three-slide
-- welcome.
-- Why created_at and not now(): the /ttfv first-day window is anchored on this
-- value. now() would reopen that window for 24 hours for every backfilled
-- account and send long-time users to /ttfv. created_at is a true lower bound of
-- the real completion time and closes the window for any account older than a
-- day. ttfv_seen_at is NOT backfilled: it is written only when a review was seen.
-- Production, read-only, 2026-10-06 11:29 KST: 15 accounts, 5 with a records or
-- sources row, 0 created in the previous 24 hours, neither column present yet.
-- The backfill touches users.updated_at of those rows (trg_users_updated_at);
-- nothing reads updated_at as a user action.
--
-- Order: the app reads these columns and calls these RPCs, but uses the device
-- value whenever the read fails (missing column 42703, missing RPC PGRST202,
-- network). So the client is safe before this migration and this migration is
-- safe before the client. The PR still merges only after the production GO
-- (DECISIONS 26.10.05 19:53, the five-migration bundle).
--
-- Idempotent: safe to re-apply (db/tests/onboarding_first_run_regression.sql
-- replays it). No top-level BEGIN/COMMIT: the migration runner owns the
-- transaction.

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ttfv_seen_at timestamptz;

COMMENT ON COLUMN public.users.onboarding_completed_at IS
  'First time this account finished the welcome (onboarding), server clock. '
  'NULL means not yet. Written only by mark_onboarding_completed(uuid); the '
  'first write wins. For accounts that existed before 0219 and had a records '
  'or sources row, this is the account creation time (backfill), a lower bound '
  'of the real completion time.';

COMMENT ON COLUMN public.users.ttfv_seen_at IS
  'First time this account''s first-day review (/ttfv) showed content, server '
  'clock. NULL means not yet. Written only by mark_ttfv_seen(uuid); the first '
  'write wins. Never backfilled.';

-- records is FORCE ROW LEVEL SECURITY (0178). A role that does not bypass RLS
-- would see no rows here and silently backfill nobody. row_security = off turns
-- that into an error instead. Production's postgres role has rolbypassrls = true
-- (read-only check, 2026-10-06 11:3x KST), so the backfill runs there.
SET LOCAL row_security = off;

UPDATE public.users AS u
   SET onboarding_completed_at = u.created_at
 WHERE u.onboarding_completed_at IS NULL
   AND (
     EXISTS (SELECT 1 FROM public.records AS r WHERE r.user_id = u.id)
     OR EXISTS (SELECT 1 FROM public.sources AS s WHERE s.user_id = u.id)
   );

-- Do not leave RLS off for anything after the backfill in this transaction.
SET LOCAL row_security = on;

CREATE OR REPLACE FUNCTION public.mark_onboarding_completed(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_onboarding timestamptz;
  v_ttfv timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users AS u
     SET onboarding_completed_at = pg_catalog.now()
   WHERE u.id = p_user_id
     AND u.onboarding_completed_at IS NULL;

  SELECT u.onboarding_completed_at, u.ttfv_seen_at
    INTO v_onboarding, v_ttfv
    FROM public.users AS u
   WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'onboarding_completed_at', v_onboarding,
    'ttfv_seen_at', v_ttfv
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_ttfv_seen(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_onboarding timestamptz;
  v_ttfv timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users AS u
     SET ttfv_seen_at = pg_catalog.now()
   WHERE u.id = p_user_id
     AND u.ttfv_seen_at IS NULL;

  SELECT u.onboarding_completed_at, u.ttfv_seen_at
    INTO v_onboarding, v_ttfv
    FROM public.users AS u
   WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'onboarding_completed_at', v_onboarding,
    'ttfv_seen_at', v_ttfv
  );
END;
$$;

-- Postcondition: clients cannot write either column directly. If a table-wide
-- grant ever came back (the 0138 lesson: a column REVOKE cannot cut it), the
-- RPCs would no longer be the only writer, so stop here instead.
DO $postcondition$
BEGIN
  IF pg_catalog.has_column_privilege('authenticated', 'public.users', 'onboarding_completed_at', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.users', 'ttfv_seen_at', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.users', 'onboarding_completed_at', 'INSERT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.users', 'ttfv_seen_at', 'INSERT')
     OR pg_catalog.has_column_privilege('anon', 'public.users', 'onboarding_completed_at', 'UPDATE')
     OR pg_catalog.has_column_privilege('anon', 'public.users', 'ttfv_seen_at', 'UPDATE') THEN
    RAISE EXCEPTION '0219: a client role can write the first-run marks directly';
  END IF;
END
$postcondition$;

-- Supabase auto-grants EXECUTE on new public functions by name, so REVOKE FROM
-- PUBLIC alone is not enough (check:definer-grants). Keep the GRANT last.
REVOKE ALL ON FUNCTION public.mark_onboarding_completed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_ttfv_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_completed(uuid), public.mark_ttfv_seen(uuid) TO authenticated;
