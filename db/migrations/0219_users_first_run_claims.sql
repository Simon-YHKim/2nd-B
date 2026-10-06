-- 0219_users_first_run_claims.sql
--
-- Q-261004-40 = A (Simon, DECISIONS 26.10.05 19:53), strict variant chosen on
-- 26.10.06 22:33 (docs/design/onboarding-server-261006.md, sections 3-9): the
-- welcome (onboarding) and the first-day review (/ttfv) open by themselves at
-- most ONCE PER ACCOUNT, and the server decides that once, before the screen
-- opens.
--
-- Why (QA-LEGACY W-12, P3): both "already shown" flags lived only in device
-- storage, under one global key each (src/lib/onboarding/state.ts ONBOARDING_KEY,
-- ttfv-gate.ts TTFV_SEEN_KEY). A new browser, a private window or a reinstall
-- showed an existing account both screens again, and a second account on the
-- same device skipped them on the first account's flag. Splitting the device key
-- per account (#2043) and a server mark written AFTER the screen (#2092) both
-- failed their gates: two tabs, a stale cache, a slow answer or a new sign-in
-- could still open a screen a second time, because a later write cannot stop an
-- entry that already happened.
--
-- So the server now hands out the entry itself (a claim). A claim is one
-- conditional UPDATE on the caller's own users row; only the request whose
-- UPDATE changes the row is granted. Two tabs that claim at once queue on the
-- row lock, and the second re-checks the condition after the first commits, so
-- exactly one of them is granted. The app opens a first-run screen only with a
-- grant (src/lib/onboarding/account-first-run.ts), and never when the server
-- cannot answer.
--
-- Columns on public.users (one row per account), all NULL by default:
--   onboarding_claimed_at    the welcome was granted (the chance is used)
--   onboarding_completed_at  the welcome was finished or skipped (first value wins)
--   ttfv_claimed_at          the first-day review was granted; NULL again only
--                            when that same grant hands it back unseen
--   ttfv_claim_token         the grant's receipt, so a stale hand-back cannot
--                            release a newer grant
--   ttfv_seen_at             the review showed content (first value wins)
--
-- State machine (design 4.2):
--   welcome    needed    onboarding_claimed_at IS NULL AND onboarding_completed_at IS NULL
--   first day  open      ttfv_seen_at IS NULL AND ttfv_claimed_at IS NULL
--                        AND now() is within 24 hours after
--                        COALESCE(onboarding_completed_at, onboarding_claimed_at)
--   A grant that is never finished (the app closed, the answer came late, the
--   network dropped) stays granted: the screen does not open by itself again.
--   That loss was accepted over a second showing (design Q2 = yes).
--
-- Functions (owner only, SECURITY DEFINER, empty search_path):
--   claim_first_run(uuid, text)                 -> {granted, reason, token, session_id, marks}
--   finish_first_run(uuid, text, text, uuid)    -> {applied, session_id, marks}
-- Every answer carries the JWT session_id it was sent with, so the app adopts it
-- only while that same sign-in is still current (design P3).
-- Both refuse while the account's deletion fence (0192 tombstone) is up, under
-- the same owner-keyed advisory lock begin_account_deletion takes (design P6,
-- Q7 = the 0192 fence as it is now).
--
-- Reads: the existing users_self_select policy (0009) and the table-level SELECT
-- that 0140 left. No new read path. Writes: only the two functions. No client
-- role holds INSERT or UPDATE on any of the five columns; the postcondition
-- below stops the migration if one ever does.
--
-- Erasure and export: the columns live on the users row. Account deletion
-- removes that row and export-account selects users.*, so neither changes.
-- db/erasure-registry.json classifies tables, not columns; no table is added.
--
-- Backfill (existing accounts, design 4.4, the #2092 rule): an existing account
-- with at least one records or sources row is marked claimed and completed at
-- its own created_at. That is the evidence the home coachmark gate already uses
-- for "not a first run" (coachmarks-gate.ts hasCoachmarkContent, #1883): capture
-- lives on home, which a signed-in account reaches only after the welcome.
-- created_at and not now(): the first-day window is anchored on these values,
-- and now() would reopen it for 24 hours for every backfilled account. The ttfv_*
-- columns are not backfilled. Every other existing account stays NULL and sees
-- the welcome once more, like a new account (production 2026-10-06 11:29 KST,
-- read only: 15 accounts, 5 with evidence; count again right before applying).
-- The backfill touches users.updated_at of those rows (trg_users_updated_at).
--
-- Order (design 9): apply this BEFORE the app that calls it ships. An app that
-- finds no columns or no functions does not open either screen by itself
-- (fail-closed), so in the other order new accounts would miss the welcome.
--
-- Idempotent: safe to re-apply (db/tests/onboarding_first_run_claims_regression.sql
-- replays it). No top-level BEGIN/COMMIT: the migration runner owns the
-- transaction. Rollback: rollback/0219_down.sql, single-transaction only.

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ttfv_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ttfv_claim_token uuid,
  ADD COLUMN IF NOT EXISTS ttfv_seen_at timestamptz;

COMMENT ON COLUMN public.users.onboarding_claimed_at IS
  'When the server granted this account its one automatic welcome (onboarding), '
  'server clock. NULL means not granted yet. Written only by '
  'claim_first_run(uuid, text). Backfilled with created_at for accounts that '
  'existed before 0219 and had a records or sources row.';

COMMENT ON COLUMN public.users.onboarding_completed_at IS
  'First time this account finished or skipped the welcome, server clock. NULL '
  'means not yet. Written only by finish_first_run(uuid, text, text, uuid); the '
  'first value wins. Backfilled with created_at, like onboarding_claimed_at.';

COMMENT ON COLUMN public.users.ttfv_claimed_at IS
  'When the server granted this account its one automatic first-day review '
  '(/ttfv), server clock. Set by claim_first_run(uuid, text); cleared only when '
  'the same grant hands the review back unseen (finish_first_run outcome '
  'not_shown with the matching ttfv_claim_token). Never backfilled.';

COMMENT ON COLUMN public.users.ttfv_claim_token IS
  'Receipt of the current first-day review grant. finish_first_run releases a '
  'grant only when the caller presents this value, so a stale hand-back cannot '
  'release a newer grant. Never backfilled.';

COMMENT ON COLUMN public.users.ttfv_seen_at IS
  'First time this account''s first-day review showed content, server clock. '
  'NULL means not yet. Written only by finish_first_run(uuid, text, text, uuid); '
  'the first value wins. Never backfilled.';

-- records is FORCE ROW LEVEL SECURITY (0178). A role that does not bypass RLS
-- would see no rows here and silently backfill nobody. row_security = off turns
-- that into an error instead. Production's postgres role has rolbypassrls = true
-- (read-only check, 2026-10-06 11:3x KST, #2092), so the backfill runs there.
SET LOCAL row_security = off;

UPDATE public.users AS u
   SET onboarding_claimed_at = COALESCE(u.onboarding_claimed_at, u.created_at),
       onboarding_completed_at = u.created_at
 WHERE u.onboarding_completed_at IS NULL
   AND u.onboarding_claimed_at IS NULL
   AND (
     EXISTS (SELECT 1 FROM public.records AS r WHERE r.user_id = u.id)
     OR EXISTS (SELECT 1 FROM public.sources AS s WHERE s.user_id = u.id)
   );

-- Do not leave RLS off for anything after the backfill in this transaction.
SET LOCAL row_security = on;

-- The four timestamps the app reads, as one JSON object. Internal helper, run
-- only inside the two functions below (as their owner); no client role may call
-- it. The token is deliberately left out of every answer except the grant.
CREATE OR REPLACE FUNCTION public.first_run_marks_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'onboarding_claimed_at', u.onboarding_claimed_at,
    'onboarding_completed_at', u.onboarding_completed_at,
    'ttfv_claimed_at', u.ttfv_claimed_at,
    'ttfv_seen_at', u.ttfv_seen_at
  )
  FROM public.users AS u
  WHERE u.id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.claim_first_run(p_user_id uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session text := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
  v_now timestamptz := pg_catalog.now();
  v_granted boolean := false;
  v_token uuid;
  v_marks jsonb;
  v_reason text;
  v_anchor timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('onboarding', 'ttfv') THEN
    RAISE EXCEPTION 'first_run_kind_invalid' USING ERRCODE = '22023';
  END IF;

  -- The shared side of begin_account_deletion's exclusive lock (0192), taken
  -- before the row lock in the same order the deletion takes them. A fence that
  -- committed first is seen by the next statement; a deletion that starts after
  -- this waits for this transaction.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(p_user_id::text, 260913)
  );
  IF EXISTS (
    SELECT 1 FROM public.account_deletion_tombstones AS t WHERE t.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'account_deletion_in_progress' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'onboarding' THEN
    UPDATE public.users AS u
       SET onboarding_claimed_at = v_now
     WHERE u.id = p_user_id
       AND u.onboarding_claimed_at IS NULL
       AND u.onboarding_completed_at IS NULL;
    v_granted := FOUND;
  ELSE
    v_token := pg_catalog.gen_random_uuid();
    UPDATE public.users AS u
       SET ttfv_claimed_at = v_now,
           ttfv_claim_token = v_token
     WHERE u.id = p_user_id
       AND u.ttfv_seen_at IS NULL
       AND u.ttfv_claimed_at IS NULL
       AND COALESCE(u.onboarding_completed_at, u.onboarding_claimed_at) IS NOT NULL
       AND v_now < COALESCE(u.onboarding_completed_at, u.onboarding_claimed_at) + interval '24 hours';
    v_granted := FOUND;
    IF NOT v_granted THEN
      v_token := NULL;
    END IF;
  END IF;

  v_marks := public.first_run_marks_json(p_user_id);
  IF v_marks IS NULL THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = 'P0002';
  END IF;

  IF v_granted THEN
    v_reason := 'granted';
  ELSIF p_kind = 'onboarding' THEN
    v_reason := CASE
      WHEN v_marks ->> 'onboarding_completed_at' IS NOT NULL THEN 'done'
      ELSE 'held'
    END;
  ELSE
    v_anchor := COALESCE(
      (v_marks ->> 'onboarding_completed_at')::timestamptz,
      (v_marks ->> 'onboarding_claimed_at')::timestamptz
    );
    v_reason := CASE
      WHEN v_marks ->> 'ttfv_seen_at' IS NOT NULL THEN 'done'
      WHEN v_marks ->> 'ttfv_claimed_at' IS NOT NULL THEN 'held'
      WHEN v_anchor IS NULL THEN 'not_onboarded'
      ELSE 'window'
    END;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'granted', v_granted,
    'reason', v_reason,
    'token', v_token,
    'session_id', v_session,
    'marks', v_marks
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_first_run(
  p_user_id uuid,
  p_kind text,
  p_outcome text,
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session text := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
  v_now timestamptz := pg_catalog.now();
  v_applied boolean := false;
  v_marks jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    (p_kind = 'onboarding' AND p_outcome IN ('completed', 'skipped'))
    OR (p_kind = 'ttfv' AND p_outcome IN ('shown', 'not_shown'))
  ) THEN
    RAISE EXCEPTION 'first_run_outcome_invalid' USING ERRCODE = '22023';
  END IF;

  -- Same lock order and fence as claim_first_run.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(p_user_id::text, 260913)
  );
  IF EXISTS (
    SELECT 1 FROM public.account_deletion_tombstones AS t WHERE t.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'account_deletion_in_progress' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'onboarding' THEN
    -- Finished or skipped: the same fact for the account. A direct visit to
    -- /onboarding can finish without a grant; the welcome is no longer needed
    -- either way.
    UPDATE public.users AS u
       SET onboarding_completed_at = v_now
     WHERE u.id = p_user_id
       AND u.onboarding_completed_at IS NULL;
    v_applied := FOUND;
  ELSIF p_outcome = 'shown' THEN
    -- Content was on screen. A visit without a grant (the address typed in)
    -- also uses up the automatic one.
    UPDATE public.users AS u
       SET ttfv_seen_at = COALESCE(u.ttfv_seen_at, v_now),
           ttfv_claimed_at = COALESCE(u.ttfv_claimed_at, v_now)
     WHERE u.id = p_user_id
       AND (u.ttfv_seen_at IS NULL OR u.ttfv_claimed_at IS NULL);
    v_applied := FOUND;
  ELSE
    -- not_shown: the granted review had nothing it could show (its read
    -- failed), so the grant goes back (#1530: a screen that showed nothing
    -- does not use the one chance). Only the grant that holds the matching
    -- receipt, and only while nothing was seen.
    UPDATE public.users AS u
       SET ttfv_claimed_at = NULL,
           ttfv_claim_token = NULL
     WHERE u.id = p_user_id
       AND p_token IS NOT NULL
       AND u.ttfv_seen_at IS NULL
       AND u.ttfv_claim_token = p_token;
    v_applied := FOUND;
  END IF;

  v_marks := public.first_run_marks_json(p_user_id);
  IF v_marks IS NULL THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = 'P0002';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'applied', v_applied,
    'session_id', v_session,
    'marks', v_marks
  );
END;
$$;

-- Postcondition (design 8 ⑤, CD-03): no client role can write any of the five
-- columns directly, so the two functions stay the only writers. A column REVOKE
-- cannot cut a table-wide grant (the 0138 lesson), so check the effective
-- privilege, for INSERT and UPDATE, for both client roles.
DO $postcondition$
DECLARE
  v_role text;
  v_column text;
  v_privilege text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    FOREACH v_column IN ARRAY ARRAY[
      'onboarding_claimed_at', 'onboarding_completed_at',
      'ttfv_claimed_at', 'ttfv_claim_token', 'ttfv_seen_at'
    ] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['INSERT', 'UPDATE'] LOOP
        IF pg_catalog.has_column_privilege(v_role, 'public.users', v_column, v_privilege) THEN
          RAISE EXCEPTION '0219: % holds % on public.users.%', v_role, v_privilege, v_column;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$postcondition$;

-- Supabase auto-grants EXECUTE on new public functions by name, so REVOKE FROM
-- PUBLIC alone is not enough (check:definer-grants). The marks helper is
-- internal: only the two functions call it, as their owner. Keep the GRANT last.
REVOKE ALL ON FUNCTION public.first_run_marks_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_first_run(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_first_run(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_run(uuid, text), public.finish_first_run(uuid, text, text, uuid) TO authenticated;
