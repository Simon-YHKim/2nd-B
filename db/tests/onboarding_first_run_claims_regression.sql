\set ON_ERROR_STOP on

-- Scratch-only regression for 0219 (first-run claims, Q-261004-40 strict).
-- Runs after the staged CLI push has applied the numbered 0219 migration, then
-- replays it twice on fixtures. The CI database is discarded and everything
-- below is rolled back; this never touches a real Supabase DB.
--
-- What it pins (design docs/design/onboarding-server-261006.md):
--   1. backfill (4.4): exactly the accounts with a records or sources row get
--      claimed = completed = created_at; no other column, no other account, no
--      existing mark moves; replaying 0219 is harmless;
--   2. catalog (8): five nullable columns, no client INSERT/UPDATE on any of
--      them for authenticated or anon (CD-03), SECURITY DEFINER functions with
--      an empty search_path that only authenticated can execute, an internal
--      helper nobody can call;
--   3. the state machine (4.2) as the real authenticated role: one grant per
--      kind, the reasons, the 24-hour window, first value wins, hand-back only
--      with the matching receipt, a visit without a grant still uses the chance;
--   4. every answer carries the caller's JWT session_id (P3);
--   5. the deletion fence (P6, CD-05): the 0192 shared advisory lock is taken
--      and a tombstone refuses both functions without writing;
--   6. refusals: another account, no owner claim, anon, a bad kind or outcome.
-- The two-tab race (one grant out of two concurrent claims) needs two sessions
-- and runs in its own workflow step.

BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('a0219c00-0000-4000-8000-00000000000a', 'claims-a@example.test'),
  ('a0219c00-0000-4000-8000-00000000000b', 'claims-b@example.test'),
  ('a0219c00-0000-4000-8000-00000000000c', 'claims-c@example.test'),
  ('a0219c00-0000-4000-8000-00000000000d', 'claims-d@example.test'),
  ('a0219c00-0000-4000-8000-00000000000e', 'claims-e@example.test'),
  ('a0219c00-0000-4000-8000-00000000000f', 'claims-f@example.test'),
  ('a0219c00-0000-4000-8000-000000000010', 'claims-g@example.test');
SET LOCAL session_replication_role = origin;

-- A has a record, B a source, C nothing (a new account), D a completion from
-- before this replay, E a record and a grant from before this replay, F nothing
-- and is used for the deletion fence.
INSERT INTO public.users (id, email, birth_date, locale, created_at) VALUES
  ('a0219c00-0000-4000-8000-00000000000a', 'claims-a@example.test', '1990-01-01', 'en', '2026-01-01 00:00:00+00'),
  ('a0219c00-0000-4000-8000-00000000000b', 'claims-b@example.test', '1990-01-01', 'en', '2026-02-02 00:00:00+00'),
  ('a0219c00-0000-4000-8000-00000000000c', 'claims-c@example.test', '1990-01-01', 'en', '2026-03-03 00:00:00+00'),
  ('a0219c00-0000-4000-8000-00000000000d', 'claims-d@example.test', '1990-01-01', 'en', '2026-04-04 00:00:00+00'),
  ('a0219c00-0000-4000-8000-00000000000e', 'claims-e@example.test', '1990-01-01', 'en', '2026-05-05 00:00:00+00'),
  ('a0219c00-0000-4000-8000-00000000000f', 'claims-f@example.test', '1990-01-01', 'en', '2026-06-06 00:00:00+00'),
  ('a0219c00-0000-4000-8000-000000000010', 'claims-g@example.test', '1990-01-01', 'en', '2026-07-07 00:00:00+00');
INSERT INTO public.records (user_id, kind, body) VALUES
  ('a0219c00-0000-4000-8000-00000000000a', 'note', 'first-run claims fixture a'),
  ('a0219c00-0000-4000-8000-00000000000d', 'note', 'first-run claims fixture d'),
  ('a0219c00-0000-4000-8000-00000000000e', 'note', 'first-run claims fixture e');
INSERT INTO public.sources (user_id, kind, title, storage_path)
VALUES ('a0219c00-0000-4000-8000-00000000000b', 'inbox', 'first-run claims fixture', 'raw/clipped/inbox/first-run-claims-fixture.md');
UPDATE public.users SET onboarding_completed_at = '2026-04-05 05:05:05+00'
 WHERE id = 'a0219c00-0000-4000-8000-00000000000d';
UPDATE public.users SET onboarding_claimed_at = '2026-05-06 06:06:06+00'
 WHERE id = 'a0219c00-0000-4000-8000-00000000000e';

-- Replay twice: the backfill runs on these rows, and a second run changes nothing.
\ir ../migrations/0219_users_first_run_claims.sql
\ir ../migrations/0219_users_first_run_claims.sql

DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, created_at, onboarding_claimed_at, onboarding_completed_at,
           ttfv_claimed_at, ttfv_claim_token, ttfv_seen_at
      FROM public.users
     WHERE id::text LIKE 'a0219c00-%'
  LOOP
    IF r.ttfv_claimed_at IS NOT NULL OR r.ttfv_claim_token IS NOT NULL OR r.ttfv_seen_at IS NOT NULL THEN
      RAISE EXCEPTION 'backfill touched a first-day column for %', r.id;
    END IF;
    IF r.id IN ('a0219c00-0000-4000-8000-00000000000a', 'a0219c00-0000-4000-8000-00000000000b')
       AND (r.onboarding_claimed_at IS DISTINCT FROM r.created_at
            OR r.onboarding_completed_at IS DISTINCT FROM r.created_at) THEN
      RAISE EXCEPTION 'account with evidence was not backfilled with created_at: %', r.id;
    END IF;
    IF r.id IN ('a0219c00-0000-4000-8000-00000000000c', 'a0219c00-0000-4000-8000-00000000000f')
       AND (r.onboarding_claimed_at IS NOT NULL OR r.onboarding_completed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'account without evidence was marked: %', r.id;
    END IF;
    IF r.id = 'a0219c00-0000-4000-8000-00000000000d'
       AND (r.onboarding_completed_at IS DISTINCT FROM '2026-04-05 05:05:05+00'::timestamptz
            OR r.onboarding_claimed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'backfill moved an existing completion mark';
    END IF;
    IF r.id = 'a0219c00-0000-4000-8000-00000000000e'
       AND (r.onboarding_claimed_at IS DISTINCT FROM '2026-05-06 06:06:06+00'::timestamptz
            OR r.onboarding_completed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'backfill moved an existing grant';
    END IF;
  END LOOP;
END
$backfill$;

DO $catalog$
DECLARE
  fn regprocedure;
  v_role text;
  v_column text;
  v_privilege text;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND is_nullable = 'YES'
         AND column_default IS NULL
         AND ((column_name IN ('onboarding_claimed_at', 'onboarding_completed_at', 'ttfv_claimed_at', 'ttfv_seen_at')
               AND data_type = 'timestamp with time zone')
           OR (column_name = 'ttfv_claim_token' AND data_type = 'uuid'))) <> 5 THEN
    RAISE EXCEPTION 'the five nullable first-run columns are missing';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    FOREACH v_column IN ARRAY ARRAY[
      'onboarding_claimed_at', 'onboarding_completed_at', 'ttfv_claimed_at', 'ttfv_claim_token', 'ttfv_seen_at'
    ] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['INSERT', 'UPDATE'] LOOP
        IF has_column_privilege(v_role, 'public.users', v_column, v_privilege) THEN
          RAISE EXCEPTION 'a client role can write a first-run column directly: % % %', v_role, v_privilege, v_column;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.claim_first_run(uuid, text)'::regprocedure,
    'public.finish_first_run(uuid, text, text, uuid)'::regprocedure
  ] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
      RAISE EXCEPTION '% is not SECURITY DEFINER', fn;
    END IF;
    IF NOT COALESCE((SELECT 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE oid = fn), false) THEN
      RAISE EXCEPTION '% does not pin an empty search_path', fn;
    END IF;
    IF NOT COALESCE((SELECT 'row_security=off' = ANY (proconfig) FROM pg_proc WHERE oid = fn), false) THEN
      RAISE EXCEPTION '% does not fail loudly on row security', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can execute %', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %', fn;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc AS p, LATERAL aclexplode(p.proacl) AS acl
       WHERE p.oid = fn AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC can execute %', fn;
    END IF;
  END LOOP;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.first_run_marks_json(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'the marks helper must not be SECURITY DEFINER';
  END IF;
  IF has_function_privilege('authenticated', 'public.first_run_marks_json(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.first_run_marks_json(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a client role can call the marks helper';
  END IF;
END
$catalog$;

-- This scratch database lacks Supabase's production table-wide SELECT grant.
-- Supply the read floor needed to exercise the already-installed owner RLS.
GRANT SELECT ON public.users TO authenticated;

-- G: a seen mark with no grant beside it, inside the first-day window. No
-- client path makes this row (shown always fills the grant too); it pins that a
-- seen review stays closed on its own, not only through ttfv_claimed_at.
UPDATE public.users
   SET onboarding_completed_at = now() - interval '1 hour',
       ttfv_seen_at = now() - interval '30 minutes'
 WHERE id = 'a0219c00-0000-4000-8000-000000000010';

-- Caller C, a brand-new account, signed in with session s-c-1.
SET LOCAL request.jwt.claims = '{"sub": "a0219c00-0000-4000-8000-00000000000c", "role": "authenticated", "session_id": "s-c-1"}';
SET LOCAL ROLE authenticated;

DO $owner$
DECLARE
  answer jsonb;
  token1 uuid;
  token2 uuid;
  stored record;
BEGIN
  IF (SELECT count(*) FROM public.users WHERE id::text LIKE 'a0219c00-%') <> 1 THEN
    RAISE EXCEPTION 'first-run read leaked another account row';
  END IF;

  BEGIN
    UPDATE public.users SET onboarding_claimed_at = now()
     WHERE id = 'a0219c00-0000-4000-8000-00000000000c';
    RAISE EXCEPTION 'a direct client write of onboarding_claimed_at was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE public.users SET ttfv_claim_token = gen_random_uuid()
     WHERE id = 'a0219c00-0000-4000-8000-00000000000c';
    RAISE EXCEPTION 'a direct client write of ttfv_claim_token was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.claim_first_run('a0219c00-0000-4000-8000-00000000000a', 'onboarding');
    RAISE EXCEPTION 'claimed for another account';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'owner_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.finish_first_run('a0219c00-0000-4000-8000-00000000000a', 'onboarding', 'completed', NULL);
    RAISE EXCEPTION 'finished for another account';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'owner_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'tour');
    RAISE EXCEPTION 'an unknown first-run kind was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding', 'shown', NULL);
    RAISE EXCEPTION 'an outcome of the other kind was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  -- A new account cannot be sent to the first-day review before the welcome.
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'not_onboarded' THEN
    RAISE EXCEPTION 'first-day review granted before the welcome: %', answer;
  END IF;

  -- One welcome grant, with the server clock and the caller's session.
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding');
  IF NOT (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'granted' OR answer ->> 'token' IS NOT NULL THEN
    RAISE EXCEPTION 'the first welcome claim was not granted: %', answer;
  END IF;
  IF answer ->> 'session_id' IS DISTINCT FROM 's-c-1' THEN
    RAISE EXCEPTION 'the answer did not carry the caller session: %', answer;
  END IF;
  IF (answer -> 'marks' ->> 'onboarding_claimed_at')::timestamptz IS DISTINCT FROM now()
     OR answer -> 'marks' ->> 'onboarding_completed_at' IS NOT NULL THEN
    RAISE EXCEPTION 'the welcome grant is not the server clock: %', answer;
  END IF;
  IF answer -> 'marks' ? 'ttfv_claim_token' THEN
    RAISE EXCEPTION 'the marks expose the receipt: %', answer;
  END IF;

  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'held' THEN
    RAISE EXCEPTION 'a second welcome claim was granted: %', answer;
  END IF;

  -- Finished: first value wins.
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding', 'skipped', NULL);
  IF NOT (answer ->> 'applied')::boolean
     OR (answer -> 'marks' ->> 'onboarding_completed_at')::timestamptz IS DISTINCT FROM now()
     OR answer ->> 'session_id' IS DISTINCT FROM 's-c-1' THEN
    RAISE EXCEPTION 'finishing the welcome was not stored: %', answer;
  END IF;
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding', 'completed', NULL);
  IF (answer ->> 'applied')::boolean THEN
    RAISE EXCEPTION 'a second finish moved the first one: %', answer;
  END IF;
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'done' THEN
    RAISE EXCEPTION 'a finished welcome was granted again: %', answer;
  END IF;

  -- The first-day review: one grant with a receipt.
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv');
  token1 := (answer ->> 'token')::uuid;
  IF NOT (answer ->> 'granted')::boolean OR token1 IS NULL
     OR (answer -> 'marks' ->> 'ttfv_claimed_at')::timestamptz IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'the first-day claim was not granted with a receipt: %', answer;
  END IF;
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'held' OR answer ->> 'token' IS NOT NULL THEN
    RAISE EXCEPTION 'a second first-day claim was granted: %', answer;
  END IF;

  -- A hand-back with someone else's receipt changes nothing.
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'not_shown', gen_random_uuid());
  IF (answer ->> 'applied')::boolean OR answer -> 'marks' ->> 'ttfv_claimed_at' IS NULL THEN
    RAISE EXCEPTION 'a stale receipt released the grant: %', answer;
  END IF;
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'not_shown', NULL);
  IF (answer ->> 'applied')::boolean OR answer -> 'marks' ->> 'ttfv_claimed_at' IS NULL THEN
    RAISE EXCEPTION 'a hand-back without a receipt released the grant: %', answer;
  END IF;

  -- The matching receipt hands it back, and the chance can be granted again.
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'not_shown', token1);
  IF NOT (answer ->> 'applied')::boolean OR answer -> 'marks' ->> 'ttfv_claimed_at' IS NOT NULL THEN
    RAISE EXCEPTION 'the matching receipt did not release the grant: %', answer;
  END IF;
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv');
  token2 := (answer ->> 'token')::uuid;
  IF NOT (answer ->> 'granted')::boolean OR token2 IS NULL OR token2 = token1 THEN
    RAISE EXCEPTION 'a released first-day review was not granted again with a new receipt: %', answer;
  END IF;
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'not_shown', token1);
  IF (answer ->> 'applied')::boolean THEN
    RAISE EXCEPTION 'the old receipt released the newer grant: %', answer;
  END IF;

  -- Shown: first value wins, and a shown review is never handed back.
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'shown', token2);
  IF NOT (answer ->> 'applied')::boolean
     OR (answer -> 'marks' ->> 'ttfv_seen_at')::timestamptz IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'the first-day review was not stored as seen: %', answer;
  END IF;
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'not_shown', token2);
  IF (answer ->> 'applied')::boolean OR answer -> 'marks' ->> 'ttfv_claimed_at' IS NULL THEN
    RAISE EXCEPTION 'a seen review was handed back: %', answer;
  END IF;
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'done' THEN
    RAISE EXCEPTION 'a seen first-day review was granted again: %', answer;
  END IF;

  SELECT onboarding_claimed_at, onboarding_completed_at, ttfv_claimed_at, ttfv_seen_at
    INTO stored FROM public.users WHERE id = 'a0219c00-0000-4000-8000-00000000000c';
  IF stored.onboarding_claimed_at IS NULL OR stored.onboarding_completed_at IS NULL
     OR stored.ttfv_claimed_at IS NULL OR stored.ttfv_seen_at IS NULL THEN
    RAISE EXCEPTION 'the owner read does not see the stored marks: %', stored;
  END IF;
END
$owner$;

-- Caller D: finished long ago (and so outside the first-day window).
SET LOCAL request.jwt.claims = '{"sub": "a0219c00-0000-4000-8000-00000000000d", "role": "authenticated", "session_id": "s-d-1"}';

DO $window$
DECLARE
  answer jsonb;
BEGIN
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000d', 'onboarding');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'done' THEN
    RAISE EXCEPTION 'a backfilled-style finished welcome was granted again: %', answer;
  END IF;
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000d', 'ttfv');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'window' THEN
    RAISE EXCEPTION 'a first-day review was granted outside the 24-hour window: %', answer;
  END IF;
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000d', 'onboarding', 'completed', NULL);
  IF (answer ->> 'applied')::boolean
     OR (answer -> 'marks' ->> 'onboarding_completed_at')::timestamptz IS DISTINCT FROM '2026-04-05 05:05:05+00'::timestamptz THEN
    RAISE EXCEPTION 'a later finish moved the first completion: %', answer;
  END IF;
END
$window$;

-- Caller E: granted the welcome but never finished it (the app closed). The
-- welcome does not open again, and the first-day window is anchored on the
-- grant (design 4.2). Its grant is from 2026-05-06, so the window is closed.
-- A visit without a grant (/ttfv typed in) still uses up the chance.
SET LOCAL request.jwt.claims = '{"sub": "a0219c00-0000-4000-8000-00000000000e", "role": "authenticated"}';

DO $direct$
DECLARE
  answer jsonb;
BEGIN
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000e', 'onboarding');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'held' THEN
    RAISE EXCEPTION 'an unfinished granted welcome was granted again: %', answer;
  END IF;
  IF answer ->> 'session_id' IS NOT NULL THEN
    RAISE EXCEPTION 'an answer invented a session id: %', answer;
  END IF;
  answer := public.claim_first_run('a0219c00-0000-4000-8000-00000000000e', 'ttfv');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'window' THEN
    RAISE EXCEPTION 'the window did not fall back to the grant time: %', answer;
  END IF;
  answer := public.finish_first_run('a0219c00-0000-4000-8000-00000000000e', 'ttfv', 'shown', NULL);
  IF NOT (answer ->> 'applied')::boolean
     OR (answer -> 'marks' ->> 'ttfv_seen_at')::timestamptz IS DISTINCT FROM now()
     OR (answer -> 'marks' ->> 'ttfv_claimed_at')::timestamptz IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a visit without a grant did not use up the chance: %', answer;
  END IF;
END
$direct$;

-- Caller G: seen, never granted.
SET LOCAL request.jwt.claims = '{"sub": "a0219c00-0000-4000-8000-000000000010", "role": "authenticated", "session_id": "s-g-1"}';

DO $seen_only$
DECLARE
  answer jsonb;
BEGIN
  answer := public.claim_first_run('a0219c00-0000-4000-8000-000000000010', 'ttfv');
  IF (answer ->> 'granted')::boolean OR answer ->> 'reason' <> 'done' THEN
    RAISE EXCEPTION 'a seen first-day review was granted because no grant sat beside it: %', answer;
  END IF;
END
$seen_only$;

-- Caller F: the deletion fence. The tombstone is written by the owner of the
-- table (begin_account_deletion's job), so drop to the session role for it.
RESET ROLE;
INSERT INTO public.account_deletion_tombstones (user_id, session_id)
VALUES ('a0219c00-0000-4000-8000-00000000000f', gen_random_uuid());
SET LOCAL request.jwt.claims = '{"sub": "a0219c00-0000-4000-8000-00000000000f", "role": "authenticated", "session_id": "s-f-1"}';
SET LOCAL ROLE authenticated;

DO $fence$
BEGIN
  BEGIN
    PERFORM public.claim_first_run('a0219c00-0000-4000-8000-00000000000f', 'onboarding');
    RAISE EXCEPTION 'a claim passed the deletion fence';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'account_deletion_in_progress' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.finish_first_run('a0219c00-0000-4000-8000-00000000000f', 'onboarding', 'completed', NULL);
    RAISE EXCEPTION 'a finish passed the deletion fence';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'account_deletion_in_progress' THEN RAISE; END IF;
  END;
END
$fence$;

RESET ROLE;

DO $fence_state$
DECLARE
  stored record;
  -- C's calls above succeeded at the top level, so their transaction-scoped
  -- lock is still held. (A call that raised inside an EXCEPTION block released
  -- its lock with the rolled-back subtransaction, so F cannot show it.)
  v_key bigint := pg_catalog.hashtextextended('a0219c00-0000-4000-8000-00000000000c', 260913);
BEGIN
  SELECT onboarding_claimed_at, onboarding_completed_at INTO stored
    FROM public.users WHERE id = 'a0219c00-0000-4000-8000-00000000000f';
  IF stored.onboarding_claimed_at IS NOT NULL OR stored.onboarding_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'the fenced account was written: %', stored;
  END IF;
  -- The fence check ran under the 0192 key, in its shared mode (the deletion
  -- takes the exclusive one), and the lock lives until this transaction ends.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_locks AS l
     WHERE l.locktype = 'advisory' AND l.pid = pg_catalog.pg_backend_pid()
       AND l.mode = 'ShareLock' AND l.granted AND l.objsubid = 1
       AND l.classid = ((v_key >> 32) & 4294967295)::oid
       AND l.objid = (v_key & 4294967295)::oid
  ) THEN
    RAISE EXCEPTION 'the first-run functions did not take the 0192 shared advisory lock';
  END IF;
END
$fence_state$;

-- A signed-in session without an owner claim, then the anon role.
SET LOCAL request.jwt.claims = '{"role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $no_owner$
BEGIN
  BEGIN
    PERFORM public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding');
    RAISE EXCEPTION 'a caller without an owner claim claimed an account';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'owner_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.first_run_marks_json('a0219c00-0000-4000-8000-00000000000c');
    RAISE EXCEPTION 'authenticated called the marks helper';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$no_owner$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $anon$
BEGIN
  BEGIN
    PERFORM public.claim_first_run('a0219c00-0000-4000-8000-00000000000c', 'onboarding');
    RAISE EXCEPTION 'anon executed claim_first_run';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.finish_first_run('a0219c00-0000-4000-8000-00000000000c', 'ttfv', 'shown', NULL);
    RAISE EXCEPTION 'anon executed finish_first_run';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anon$;

RESET ROLE;
ROLLBACK;
