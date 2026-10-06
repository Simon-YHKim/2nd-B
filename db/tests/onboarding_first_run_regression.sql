-- Scratch-only regression for 0219 (users.onboarding_completed_at and
-- users.ttfv_seen_at, written only by mark_onboarding_completed(uuid) and
-- mark_ttfv_seen(uuid)). Runs after the staged CLI push has applied the
-- numbered 0219 migration. The CI database is discarded and everything below
-- is rolled back; this never touches a real Supabase DB.
--
-- What it pins:
--   1. the backfill marks exactly the accounts with a records or sources row,
--      with their created_at, never moves an existing mark, never sets
--      ttfv_seen_at, and replaying 0219 is harmless;
--   2. the catalog: nullable timestamptz columns, no client INSERT/UPDATE on
--      them, SECURITY DEFINER RPCs with an empty search_path that anon and
--      PUBLIC cannot execute;
--   3. behaviour as the real authenticated role: a direct write is refused,
--      another account's mark is refused, a signed-out caller is refused, the
--      owner's own mark is stored with the server clock, and the first value
--      wins.

BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('a0219000-0000-4000-8000-00000000000a', 'first-run-a@example.test'),
  ('a0219000-0000-4000-8000-00000000000b', 'first-run-b@example.test'),
  ('a0219000-0000-4000-8000-00000000000c', 'first-run-c@example.test'),
  ('a0219000-0000-4000-8000-00000000000d', 'first-run-d@example.test');
SET LOCAL session_replication_role = origin;

-- A has a record, B a source, C nothing, D a mark from before this replay.
INSERT INTO public.users (id, email, birth_date, locale, created_at) VALUES
  ('a0219000-0000-4000-8000-00000000000a', 'first-run-a@example.test', '1990-01-01', 'en', '2026-01-01 00:00:00+00'),
  ('a0219000-0000-4000-8000-00000000000b', 'first-run-b@example.test', '1990-01-01', 'en', '2026-02-02 00:00:00+00'),
  ('a0219000-0000-4000-8000-00000000000c', 'first-run-c@example.test', '1990-01-01', 'en', '2026-03-03 00:00:00+00'),
  ('a0219000-0000-4000-8000-00000000000d', 'first-run-d@example.test', '1990-01-01', 'en', '2026-04-04 00:00:00+00');
INSERT INTO public.records (user_id, kind, body)
VALUES ('a0219000-0000-4000-8000-00000000000a', 'note', 'first-run fixture record');
INSERT INTO public.sources (user_id, kind, title, storage_path)
VALUES ('a0219000-0000-4000-8000-00000000000b', 'inbox', 'first-run fixture', 'raw/clipped/inbox/first-run-fixture.md');
INSERT INTO public.records (user_id, kind, body)
VALUES ('a0219000-0000-4000-8000-00000000000d', 'note', 'first-run fixture record d');
UPDATE public.users SET onboarding_completed_at = '2026-05-05 05:05:05+00'
WHERE id = 'a0219000-0000-4000-8000-00000000000d';

-- Replay twice: the backfill runs on these rows, and a second run changes nothing.
\ir ../migrations/0219_users_first_run_marks.sql
\ir ../migrations/0219_users_first_run_marks.sql

DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, created_at, onboarding_completed_at, ttfv_seen_at
      FROM public.users
     WHERE id IN (
       'a0219000-0000-4000-8000-00000000000a',
       'a0219000-0000-4000-8000-00000000000b',
       'a0219000-0000-4000-8000-00000000000c',
       'a0219000-0000-4000-8000-00000000000d'
     )
  LOOP
    IF r.ttfv_seen_at IS NOT NULL THEN
      RAISE EXCEPTION 'backfill set ttfv_seen_at for %', r.id;
    END IF;
    IF r.id = 'a0219000-0000-4000-8000-00000000000a'
       AND r.onboarding_completed_at IS DISTINCT FROM r.created_at THEN
      RAISE EXCEPTION 'account with a record was not backfilled with created_at';
    END IF;
    IF r.id = 'a0219000-0000-4000-8000-00000000000b'
       AND r.onboarding_completed_at IS DISTINCT FROM r.created_at THEN
      RAISE EXCEPTION 'account with a source was not backfilled with created_at';
    END IF;
    IF r.id = 'a0219000-0000-4000-8000-00000000000c'
       AND r.onboarding_completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'account without evidence was marked complete';
    END IF;
    IF r.id = 'a0219000-0000-4000-8000-00000000000d'
       AND r.onboarding_completed_at IS DISTINCT FROM '2026-05-05 05:05:05+00'::timestamptz THEN
      RAISE EXCEPTION 'backfill moved an existing completion mark';
    END IF;
  END LOOP;
END
$backfill$;

DO $catalog$
DECLARE
  fn regprocedure;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
         AND column_name IN ('onboarding_completed_at', 'ttfv_seen_at')
         AND data_type = 'timestamp with time zone' AND is_nullable = 'YES') <> 2 THEN
    RAISE EXCEPTION 'nullable timestamptz first-run columns are missing';
  END IF;

  IF has_column_privilege('authenticated', 'public.users', 'onboarding_completed_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.users', 'ttfv_seen_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.users', 'onboarding_completed_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.users', 'ttfv_seen_at', 'INSERT')
     OR has_column_privilege('anon', 'public.users', 'onboarding_completed_at', 'UPDATE')
     OR has_column_privilege('anon', 'public.users', 'ttfv_seen_at', 'UPDATE') THEN
    RAISE EXCEPTION 'a client role can write a first-run column directly';
  END IF;

  FOREACH fn IN ARRAY ARRAY[
    'public.mark_onboarding_completed(uuid)'::regprocedure,
    'public.mark_ttfv_seen(uuid)'::regprocedure
  ] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
      RAISE EXCEPTION '% is not SECURITY DEFINER', fn;
    END IF;
    IF NOT COALESCE((SELECT 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE oid = fn), false) THEN
      RAISE EXCEPTION '% does not pin an empty search_path', fn;
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
END
$catalog$;

-- This scratch database lacks Supabase's production table-wide SELECT grant.
-- Supply the read floor needed to exercise the already-installed owner RLS.
GRANT SELECT ON public.users TO authenticated;

-- Caller C: an account that has not finished the welcome yet.
SET LOCAL request.jwt.claim.sub = 'a0219000-0000-4000-8000-00000000000c';
SET LOCAL ROLE authenticated;

DO $owner$
DECLARE
  marks jsonb;
  stored timestamptz;
BEGIN
  IF (SELECT count(*) FROM public.users WHERE id IN (
    'a0219000-0000-4000-8000-00000000000a',
    'a0219000-0000-4000-8000-00000000000c',
    'a0219000-0000-4000-8000-00000000000d'
  )) <> 1 THEN
    RAISE EXCEPTION 'first-run read leaked another account row';
  END IF;

  BEGIN
    UPDATE public.users SET onboarding_completed_at = now()
    WHERE id = 'a0219000-0000-4000-8000-00000000000c';
    RAISE EXCEPTION 'a direct client write of onboarding_completed_at was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.mark_onboarding_completed('a0219000-0000-4000-8000-00000000000a');
    RAISE EXCEPTION 'marked another account complete';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'owner_required' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.mark_ttfv_seen('a0219000-0000-4000-8000-00000000000a');
    RAISE EXCEPTION 'marked another account seen';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'owner_required' THEN RAISE; END IF;
  END;

  marks := public.mark_onboarding_completed('a0219000-0000-4000-8000-00000000000c');
  IF (marks ->> 'onboarding_completed_at') IS NULL OR (marks ->> 'ttfv_seen_at') IS NOT NULL THEN
    RAISE EXCEPTION 'owner completion was not stored or returned: %', marks;
  END IF;
  SELECT onboarding_completed_at INTO stored FROM public.users
   WHERE id = 'a0219000-0000-4000-8000-00000000000c';
  IF stored IS DISTINCT FROM now() OR (marks ->> 'onboarding_completed_at')::timestamptz IS DISTINCT FROM stored THEN
    RAISE EXCEPTION 'owner completion is not the server clock: %', marks;
  END IF;

  marks := public.mark_ttfv_seen('a0219000-0000-4000-8000-00000000000c');
  IF (marks ->> 'ttfv_seen_at') IS NULL
     OR (marks ->> 'onboarding_completed_at')::timestamptz IS DISTINCT FROM stored THEN
    RAISE EXCEPTION 'owner first-day review mark was not stored or returned: %', marks;
  END IF;
END
$owner$;

-- Caller D: the first value wins. D was marked before this transaction's clock.
SET LOCAL request.jwt.claim.sub = 'a0219000-0000-4000-8000-00000000000d';

DO $first_wins$
DECLARE
  marks jsonb;
BEGIN
  marks := public.mark_onboarding_completed('a0219000-0000-4000-8000-00000000000d');
  IF (marks ->> 'onboarding_completed_at')::timestamptz
       IS DISTINCT FROM '2026-05-05 05:05:05+00'::timestamptz THEN
    RAISE EXCEPTION 'a second completion moved the first one: %', marks;
  END IF;
  IF (SELECT onboarding_completed_at FROM public.users
       WHERE id = 'a0219000-0000-4000-8000-00000000000d')
     IS DISTINCT FROM '2026-05-05 05:05:05+00'::timestamptz THEN
    RAISE EXCEPTION 'a second completion rewrote the stored mark';
  END IF;
END
$first_wins$;

-- A signed-in session without an owner claim, then the anon role.
SET LOCAL request.jwt.claim.sub = '';

DO $no_owner$
BEGIN
  BEGIN
    PERFORM public.mark_onboarding_completed('a0219000-0000-4000-8000-00000000000c');
    RAISE EXCEPTION 'a caller without an owner claim marked an account';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'owner_required' THEN RAISE; END IF;
  END;
END
$no_owner$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $anon$
BEGIN
  BEGIN
    PERFORM public.mark_ttfv_seen('a0219000-0000-4000-8000-00000000000c');
    RAISE EXCEPTION 'anon executed mark_ttfv_seen';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anon$;

RESET ROLE;
ROLLBACK;
