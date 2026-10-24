\set ON_ERROR_STOP on
-- Fresh disposable database only. Real 0108 + 0113, no production connection.
DO $$ BEGIN
  IF current_database() !~ '^t06_signup_test_[a-z0-9_]+$'
     OR to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION 'fresh disposable T06 database required';
  END IF;
END $$;
CREATE EXTENSION pgcrypto;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'supabase_auth_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;
-- Reproduce Supabase default grants, including the easily missed service role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz, email_confirmed_at timestamptz);
CREATE TABLE public.users (id uuid PRIMARY KEY, email text);
CREATE TABLE public.users_orphan_backup_0107 (id uuid);
INSERT INTO auth.users VALUES
  ('00000000-0000-4000-8000-000000000001','owner@gmail.com',NULL,now()),
  ('00000000-0000-4000-8000-000000000002','pending@example.invalid',NULL,NULL),
  ('00000000-0000-4000-8000-000000000003','gone@example.invalid',now(),now()),
  ('00000000-0000-4000-8000-000000000004','first+work@example.invalid',NULL,now()),
  ('00000000-0000-4000-8000-000000000005','self@example.invalid',NULL,now());
INSERT INTO public.users VALUES
  ('00000000-0000-4000-8000-000000000006','profile@example.invalid'),
  ('00000000-0000-4000-8000-000000000005','self@example.invalid'),
  ('00000000-0000-4000-8000-000000000007','');
\ir ../../migrations/0108_canonical_email_one_account_per_mailbox.sql
\ir ../../migrations/0113_lock_orphan_backup_and_confirmed_alias_guard.sql
CREATE TABLE t06_backstop_before AS
  SELECT pg_get_functiondef('public.block_alias_duplicate_signup()'::regprocedure) AS body,
    proacl, pg_get_triggerdef(t.oid) AS trigger_body, t.tgenabled
  FROM pg_proc p JOIN pg_trigger t ON t.tgfoid = p.oid
  WHERE p.oid = 'public.block_alias_duplicate_signup()'::regprocedure;
\ir ../UNNUMBERED_before_user_created_signup.sql

CREATE TEMP TABLE t06_assertions (label text);
CREATE FUNCTION pg_temp.assert_t06(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'T06 assertion: %', label; END IF;
  INSERT INTO t06_assertions VALUES (label);
END $$;
CREATE FUNCTION pg_temp.event_t06(email text, ip text DEFAULT '198.51.100.1',
  id uuid DEFAULT '10000000-0000-4000-8000-000000000001') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('metadata',jsonb_build_object('name','before-user-created','ip_address',ip),
    'user',jsonb_build_object('id',id,'email',email,'user_metadata',jsonb_build_object('signup_birth_date','2011-01-01')));
$$;
SELECT pg_temp.assert_t06(public.before_user_created_signup(pg_temp.event_t06('owner+other@gmail.com')) = '{}', 'default OFF');
SELECT pg_temp.assert_t06((SELECT count(*) = 0 FROM public.signup_hook_attempts), 'OFF leaves no attempt rows');
UPDATE public.signup_hook_policy SET enabled = true;

CREATE TEMP TABLE cases (email text, id uuid, refused boolean);
INSERT INTO cases VALUES
 ('fresh@example.invalid','10000000-0000-4000-8000-000000000001',false),
 ('owner+other@gmail.com','10000000-0000-4000-8000-000000000001',true),
 ('o.w.ner@gmail.com','10000000-0000-4000-8000-000000000001',true),
 ('OWNER@googlemail.com','10000000-0000-4000-8000-000000000001',true),
 ('pending+next@example.invalid','10000000-0000-4000-8000-000000000001',false),
 ('gone+next@example.invalid','10000000-0000-4000-8000-000000000001',false),
 ('profile+next@example.invalid','10000000-0000-4000-8000-000000000001',true),
 ('first@example.invalid','10000000-0000-4000-8000-000000000001',true),
 ('self+next@example.invalid','00000000-0000-4000-8000-000000000005',false),
 (NULL,'10000000-0000-4000-8000-000000000001',false),
 ('','10000000-0000-4000-8000-000000000001',true),
 ('o.wner@example.invalid','10000000-0000-4000-8000-000000000001',false);
-- Probe binds the unchanged real 0113 routine without PK collisions for self.
CREATE TEMP TABLE probe (id uuid, email text);
CREATE TRIGGER probe_0113 BEFORE INSERT ON probe FOR EACH ROW EXECUTE FUNCTION public.block_alias_duplicate_signup();
DO $$ DECLARE c record; got jsonb; refused boolean; n integer := 0; BEGIN
  FOR c IN SELECT * FROM cases LOOP
    n := n + 1;
    got := public.before_user_created_signup(pg_temp.event_t06(c.email, '198.51.100.' || n, c.id));
    PERFORM pg_temp.assert_t06(got = CASE WHEN c.refused THEN
      '{"error":{"http_code":403,"message":"polascope_signup_refused"}}'::jsonb ELSE '{}'::jsonb END, 'hook case ' || n);
    refused := false;
    BEGIN INSERT INTO probe VALUES (c.id, c.email);
    EXCEPTION WHEN unique_violation THEN refused := true; END;
    PERFORM pg_temp.assert_t06(refused = c.refused, '0113 parity case ' || n);
  END LOOP;
END $$;

-- The caller gets function access, never either private table or user rows.
SELECT pg_temp.assert_t06(has_function_privilege('supabase_auth_admin','public.before_user_created_signup(jsonb)','EXECUTE'), 'auth caller grant');
DO $$ DECLARE r text; t text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    PERFORM pg_temp.assert_t06(NOT has_function_privilege(r,'public.before_user_created_signup(jsonb)','EXECUTE'), r || ' hook denied');
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin'] LOOP
    FOREACH t IN ARRAY ARRAY['signup_hook_policy','signup_hook_attempts'] LOOP
      PERFORM pg_temp.assert_t06(NOT has_table_privilege(r,'public.' || t,'SELECT,INSERT,UPDATE,DELETE'), r || ' table denied');
    END LOOP;
    PERFORM pg_temp.assert_t06(NOT has_function_privilege(r,'public.prune_signup_hook_attempts()','EXECUTE'), r || ' prune denied');
  END LOOP;
END $$;
SET ROLE supabase_auth_admin;
SELECT public.before_user_created_signup('{"metadata":{"ip_address":"198.51.100.30"},"user":{"id":"10000000-0000-4000-8000-000000000030","email":"new@example.invalid"}}') AS allowed_shape;
SELECT public.before_user_created_signup('{"metadata":{"ip_address":"198.51.100.31"},"user":{"id":"10000000-0000-4000-8000-000000000031","email":"owner+alias@gmail.com"}}') AS refused_shape;
RESET ROLE;

-- Distinct SQL transactions, like the upstream PG hook dispatch. Refusal rows
-- survive the returned JSON error; no INSERT into auth.users is attempted.
BEGIN;
SELECT public.before_user_created_signup(pg_temp.event_t06('repeat@example.invalid','198.51.100.40'));
COMMIT;
BEGIN;
SELECT public.before_user_created_signup(pg_temp.event_t06('repeat@example.invalid','198.51.100.40'));
COMMIT;
SELECT pg_temp.assert_t06((SELECT count(*) >= 2 FROM public.signup_hook_attempts WHERE attempts = 2), 'repeat counters persisted across transactions');
DO $$ DECLARE n integer; got jsonb; BEGIN
  FOR n IN 1..11 LOOP
    got := public.before_user_created_signup(pg_temp.event_t06('owner+rate@gmail.com','198.51.100.50'));
    PERFORM pg_temp.assert_t06((got #>> '{error,http_code}')::integer = CASE WHEN n <= 10 THEN 403 ELSE 429 END, 'IP limit includes refused attempts ' || n);
  END LOOP;
  got := public.before_user_created_signup(pg_temp.event_t06('brand-new@example.invalid','198.51.100.50'));
  PERFORM pg_temp.assert_t06(got = '{"error":{"http_code":429,"message":"signup_request_limited"}}', 'limited known and unknown addresses indistinguishable');
END $$;
DO $$ DECLARE dob text; got jsonb; BEGIN
  FOREACH dob IN ARRAY ARRAY['2012-01-01','2009-01-01','1990-01-01'] LOOP
    got := public.before_user_created_signup(jsonb_set(pg_temp.event_t06('owner+age@gmail.com','198.51.100.60'),'{user,user_metadata,signup_birth_date}',to_jsonb(dob)));
    PERFORM pg_temp.assert_t06(got = '{"error":{"http_code":403,"message":"polascope_signup_refused"}}', 'same refusal across age bands');
  END LOOP;
END $$;
SELECT pg_temp.assert_t06(public.before_user_created_signup('{"user":{"id":"bad"},"metadata":{"ip_address":"bad"}}') =
  '{"error":{"http_code":400,"message":"signup_request_invalid"}}', 'malformed input is generic');
SELECT pg_temp.assert_t06((SELECT count(*) = 5 FROM auth.users) AND (SELECT count(*) = 3 FROM public.users), 'no rejected identity or profile retained');
SELECT pg_temp.assert_t06((SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='signup_hook_attempts') = ARRAY['window_start','dimension','key_hash','attempts'], 'only hashes and counters persisted');
SELECT pg_temp.assert_t06(EXISTS (
  SELECT 1 FROM public.signup_hook_attempts a CROSS JOIN public.signup_hook_policy p
  WHERE a.dimension = 'mailbox' AND a.attempts >= 4
    AND a.key_hash = public.hmac('mailbox:' || extract(epoch FROM a.window_start)::bigint::text || ':owner@gmail.com', p.hash_key, 'sha256')
), 'canonical repeats use keyed HMAC not a plain address digest');

-- A hook precheck cannot serialize later inserts. 0113 must still reject the
-- loser when the mailbox is taken after an allowed hook response.
SELECT pg_temp.assert_t06(public.before_user_created_signup(pg_temp.event_t06('race@example.invalid','198.51.100.70')) = '{}', 'precheck before race allows');
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000070','race@example.invalid',NULL,now());
DO $$ BEGIN
  BEGIN
    INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000071','race+alias@example.invalid',NULL,NULL);
    RAISE EXCEPTION '0113 race backstop did not reject';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

INSERT INTO public.signup_hook_attempts VALUES (now() - interval '1 day', 'ip', decode(repeat('ab',32),'hex'), 1);
SELECT public.prune_signup_hook_attempts();
SELECT pg_temp.assert_t06(NOT EXISTS(SELECT FROM public.signup_hook_attempts WHERE window_start < now() - interval '20 minutes'), 'pruning erases expired hashes');
UPDATE public.signup_hook_policy SET budget_window = date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2000-01-01 UTC'), budget_count = 1000;
CREATE TEMP TABLE count_before AS SELECT count(*) AS n FROM public.signup_hook_attempts;
SELECT pg_temp.assert_t06(public.before_user_created_signup(pg_temp.event_t06('overflow@example.invalid','198.51.100.80')) =
  '{"error":{"http_code":429,"message":"signup_request_limited"}}', 'global cap');
SELECT pg_temp.assert_t06((SELECT count(*) FROM public.signup_hook_attempts) = (SELECT n FROM count_before), 'global cap allocates no keys');

BEGIN;
\ir ../rollback/UNNUMBERED_before_user_created_signup_down.sql
SELECT pg_temp.assert_t06(to_regprocedure('public.before_user_created_signup(jsonb)') IS NULL
  AND to_regclass('public.signup_hook_attempts') IS NULL AND to_regclass('public.signup_hook_policy') IS NULL, 'rollback removes only draft objects');
SELECT pg_temp.assert_t06((SELECT count(*) = 1 FROM pg_trigger
  WHERE tgfoid = 'public.block_alias_duplicate_signup()'::regprocedure AND tgrelid = 'auth.users'::regclass)
  AND NOT EXISTS(
  (SELECT pg_get_functiondef(p.oid), p.proacl, pg_get_triggerdef(t.oid), t.tgenabled
   FROM pg_proc p JOIN pg_trigger t ON t.tgfoid = p.oid
   WHERE p.oid = 'public.block_alias_duplicate_signup()'::regprocedure AND NOT t.tgisinternal AND t.tgrelid = 'auth.users'::regclass)
  EXCEPT TABLE t06_backstop_before), '0113 body ACL binding and enablement unchanged after rollback');
COMMIT;
\echo T06 SQL contract PASS: 12 parity cases, ACL, hashes, limits, age, race, rollback
SELECT count(*) AS assertions_passed FROM t06_assertions;
