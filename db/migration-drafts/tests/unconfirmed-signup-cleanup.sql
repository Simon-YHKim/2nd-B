\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone = 'UTC';
CREATE FUNCTION pg_temp.assert_t07(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='P0707', MESSAGE='T07_ASSERT: ' || label; END IF;
END $$;
SELECT pg_temp.assert_t07(NOT raw_user_meta_data ? 'signup_birth_date' AND raw_user_meta_data -> 'keep' = 'true', 'legacy user DOB scrubbed') FROM auth.users;
SELECT pg_temp.assert_t07(NOT identity_data ? 'signup_birth_date' AND identity_data -> 'keep' = 'true', 'legacy identity DOB scrubbed') FROM auth.identities;
DELETE FROM auth.users;

-- Ordinals make failures name scenarios, without printing any original data.
CREATE FUNCTION pg_temp.add_t07(n integer, seconds_ago integer DEFAULT 79801) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := ('07000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
BEGIN
  INSERT INTO auth.users(id,email,confirmation_sent_at)
  VALUES (v_id, 'fixture-' || n || '@example.invalid', statement_timestamp() - seconds_ago * interval '1 second');
  INSERT INTO auth.identities(user_id,provider) VALUES(v_id,'email');
  RETURN v_id;
END $$;
SELECT pg_temp.add_t07(n) FROM generate_series(1,24) n;
UPDATE auth.users SET email_confirmed_at=now() WHERE email='fixture-2@example.invalid';
INSERT INTO public.users(id,email,birth_date) SELECT id,email,DATE '1990-01-01' FROM auth.users WHERE email='fixture-3@example.invalid';
UPDATE auth.identities SET provider='google' WHERE user_id=(SELECT id FROM auth.users WHERE email='fixture-4@example.invalid');
UPDATE auth.users SET confirmation_sent_at=statement_timestamp()-interval '79740 seconds' WHERE email='fixture-5@example.invalid';
UPDATE auth.users SET confirmation_sent_at=NULL WHERE email='fixture-6@example.invalid';
UPDATE auth.users SET confirmation_sent_at=statement_timestamp() WHERE email='fixture-7@example.invalid';
UPDATE auth.users SET raw_app_meta_data='{"provider":"email","providers":["email","apple"]}' WHERE email='fixture-8@example.invalid';
UPDATE auth.users SET raw_app_meta_data='{"provider":"google","providers":["email"]}' WHERE email='fixture-9@example.invalid';
UPDATE auth.users SET phone='+10000000000' WHERE email='fixture-10@example.invalid';
UPDATE auth.users SET phone_confirmed_at=now() WHERE email='fixture-11@example.invalid';
UPDATE auth.users SET last_sign_in_at=now() WHERE email='fixture-12@example.invalid';
UPDATE auth.users SET is_sso_user=true WHERE email='fixture-13@example.invalid';
UPDATE auth.users SET is_anonymous=true WHERE email='fixture-14@example.invalid';
UPDATE auth.users SET invited_at=now() WHERE email='fixture-15@example.invalid';
UPDATE auth.users SET deleted_at=now() WHERE email='fixture-16@example.invalid';
INSERT INTO auth.sessions(user_id) SELECT id FROM auth.users WHERE email='fixture-17@example.invalid';
INSERT INTO public.t07_retained SELECT id FROM auth.users WHERE email='fixture-18@example.invalid';
INSERT INTO public.t07_content SELECT id FROM auth.users WHERE email='fixture-19@example.invalid';
INSERT INTO public.t07_account_only SELECT id FROM auth.users WHERE email='fixture-20@example.invalid';
INSERT INTO storage.objects(owner_id) SELECT id::text FROM auth.users WHERE email='fixture-21@example.invalid';
INSERT INTO storage.objects(bucket_id,name) SELECT 'raw-clippings',id::text || '/one' FROM auth.users WHERE email='fixture-22@example.invalid';
UPDATE auth.users SET raw_app_meta_data='{}' WHERE email='fixture-23@example.invalid';
UPDATE auth.users SET recovery_sent_at=statement_timestamp()-interval '60 seconds' WHERE email='fixture-24@example.invalid';
SELECT pg_temp.assert_t07(deleted=1 AND failed=0, 'only expired email-only orphan deleted') FROM public.purge_unconfirmed_signups();
SELECT pg_temp.assert_t07(count(*)=23, 'all 23 excluded scenarios survive') FROM auth.users;
SELECT pg_temp.assert_t07(count(*)=0, 'email identity cascaded') FROM auth.identities WHERE user_id='07000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_t07(deleted=0 AND failed=0, 'second run unchanged') FROM public.purge_unconfirmed_signups();
-- One top-level statement shares an exact timestamp with the function, so the
-- inclusive boundary cannot pass merely because the test took time to run.
DO $$ DECLARE v_deleted integer; BEGIN
  PERFORM pg_temp.add_t07(500,79800);
  SELECT deleted INTO v_deleted FROM public.purge_unconfirmed_signups();
  PERFORM pg_temp.assert_t07(v_deleted=1,'exact expiry plus22h inclusive boundary');
END $$;

-- The recovery/magic-link clock uses the same expiry and retention boundary.
DO $$ DECLARE v_deleted integer; BEGIN
  UPDATE auth.users SET recovery_sent_at=statement_timestamp()-interval '79800 seconds'
    WHERE email='fixture-24@example.invalid';
  SELECT deleted INTO v_deleted FROM public.purge_unconfirmed_signups();
  PERFORM pg_temp.assert_t07(v_deleted=1,'recovery exact expiry plus22h inclusive boundary');
END $$;

-- Exactly 14 and adults have the same deadline; under-14 DOBs disappear at write.
SELECT pg_temp.add_t07(31,79800), pg_temp.add_t07(32,79800), pg_temp.add_t07(33,0), pg_temp.add_t07(34,0);
UPDATE auth.users SET raw_user_meta_data=jsonb_build_object('signup_birth_date',to_char(current_date-interval '14 years','YYYY-MM-DD'),'keep',true) WHERE email='fixture-31@example.invalid';
UPDATE auth.users SET raw_user_meta_data='{"signup_birth_date":"1990-01-01"}' WHERE email='fixture-32@example.invalid';
UPDATE auth.users SET raw_user_meta_data=jsonb_build_object('signup_birth_date',to_char(current_date-interval '13 years','YYYY-MM-DD'),'keep',true) WHERE email='fixture-33@example.invalid';
UPDATE auth.identities SET identity_data=jsonb_build_object('signup_birth_date',to_char(current_date-interval '13 years','YYYY-MM-DD'),'keep',true) WHERE user_id='07000000-0000-0000-0000-000000000033';
SELECT pg_temp.assert_t07(NOT raw_user_meta_data ? 'signup_birth_date' AND raw_user_meta_data -> 'keep' = 'true', 'user write scrubs only under14 DOB') FROM auth.users WHERE email='fixture-33@example.invalid';
SELECT pg_temp.assert_t07(NOT identity_data ? 'signup_birth_date' AND identity_data -> 'keep' = 'true', 'identity write scrubs only under14 DOB') FROM auth.identities WHERE user_id='07000000-0000-0000-0000-000000000033';
SELECT pg_temp.assert_t07(raw_user_meta_data ? 'signup_birth_date', 'exact14 DOB retained') FROM auth.users WHERE email='fixture-31@example.invalid';
SELECT pg_temp.assert_t07(deleted=2, 'adult and exact14 deadline inclusive') FROM public.purge_unconfirmed_signups();
SELECT pg_temp.assert_t07(count(*)=1, 'under14 account uses same email deadline') FROM auth.users WHERE email='fixture-33@example.invalid';
UPDATE auth.users SET raw_user_meta_data='{"signup_birth_date":"2024-02-31"}' WHERE email='fixture-34@example.invalid';
SELECT pg_temp.assert_t07(raw_user_meta_data ->> 'signup_birth_date'='2024-02-31','malformed DOB does not abort signup') FROM auth.users WHERE email='fixture-34@example.invalid';
INSERT INTO auth.users(email,raw_user_meta_data) VALUES('under14-insert@example.invalid',jsonb_build_object('signup_birth_date',to_char(current_date-interval '10 years','YYYY-MM-DD')));
SELECT pg_temp.assert_t07(NOT raw_user_meta_data ? 'signup_birth_date','insert DOB scrub') FROM auth.users WHERE email='under14-insert@example.invalid';
INSERT INTO auth.identities(user_id,provider,identity_data)
SELECT id,'email',jsonb_build_object('signup_birth_date',to_char(current_date-interval '10 years','YYYY-MM-DD'))
FROM auth.users WHERE email='under14-insert@example.invalid';
SELECT pg_temp.assert_t07(NOT i.identity_data ? 'signup_birth_date','identity insert DOB scrub')
FROM auth.identities i JOIN auth.users a ON a.id=i.user_id WHERE a.email='under14-insert@example.invalid';
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT INSERT, SELECT ON auth.users TO supabase_auth_admin;
SET LOCAL ROLE supabase_auth_admin;
INSERT INTO auth.users(email,raw_user_meta_data)
VALUES('auth-role@example.invalid',jsonb_build_object('signup_birth_date',to_char(current_date-interval '10 years','YYYY-MM-DD')));
RESET ROLE;
SELECT pg_temp.assert_t07(NOT raw_user_meta_data ? 'signup_birth_date','Auth role invokes private trigger') FROM auth.users WHERE email='auth-role@example.invalid';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.users(id,email,birth_date) SELECT id,email,current_date-interval '10 years' FROM auth.users WHERE email='fixture-33@example.invalid';
    RAISE EXCEPTION USING ERRCODE='P0707', MESSAGE='T07_ASSERT: real age gate refused under14';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Explicit caller limits, hard ceiling, default limit, repeatability, failures.
SELECT pg_temp.add_t07(n) FROM generate_series(100,202) n;
SELECT pg_temp.assert_t07(deleted=2, 'requested batch limit') FROM public.purge_unconfirmed_signups(2);
SELECT pg_temp.assert_t07(deleted=100, 'default batch limit') FROM public.purge_unconfirmed_signups();
SELECT pg_temp.assert_t07(deleted=1, 'later run continues backlog') FROM public.purge_unconfirmed_signups();
SELECT pg_temp.assert_t07(deleted=0, 'empty backlog idempotent') FROM public.purge_unconfirmed_signups();
DO $$ DECLARE v integer; BEGIN
  FOREACH v IN ARRAY ARRAY[NULL,0,-1,1001] LOOP
    BEGIN
      PERFORM public.purge_unconfirmed_signups(v);
      RAISE EXCEPTION USING ERRCODE='P0707', MESSAGE='T07_ASSERT: invalid limit rejected';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
END $$;
SELECT pg_temp.add_t07(301),pg_temp.add_t07(302),pg_temp.add_t07(303);
CREATE FUNCTION pg_temp.reject_t07() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.email='fixture-301@example.invalid' THEN RAISE EXCEPTION 'synthetic deletion failure'; END IF;
  IF OLD.email='fixture-303@example.invalid' THEN RETURN NULL; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER t07_failure BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_t07();
SELECT pg_temp.assert_t07(deleted=1 AND skipped=1 AND failed=1, 'one failure does not roll back other deletion or hide skips') FROM public.purge_unconfirmed_signups();
DROP TRIGGER t07_failure ON auth.users;
SELECT pg_temp.assert_t07(deleted=2 AND skipped=0 AND failed=0, 'failed and skipped rows retried next invocation') FROM public.purge_unconfirmed_signups();
-- A newly registered table is automatically respected, without a new code list.
CREATE TABLE public.t07_future (member_id uuid);
INSERT INTO public.erasure_registry VALUES('t07_future','member_id','retained');
INSERT INTO public.t07_future VALUES(pg_temp.add_t07(401));
SELECT pg_temp.assert_t07(deleted=0, 'future registry entry excludes account') FROM public.purge_unconfirmed_signups();
INSERT INTO public.erasure_registry VALUES('missing_table','owner_id','retained');
DO $$ BEGIN
  BEGIN
    PERFORM public.purge_unconfirmed_signups();
    RAISE EXCEPTION USING ERRCODE='P0707',MESSAGE='T07_ASSERT: schema drift fails closed';
  EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;
DELETE FROM public.erasure_registry WHERE table_name='missing_table';

SELECT pg_temp.assert_t07(p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
  AND p.proconfig @> ARRAY['search_path=""','row_security=off'], 'owner definer and fixed search path')
FROM pg_proc p WHERE p.oid='public.purge_unconfirmed_signups(integer)'::regprocedure;
DO $$ DECLARE v_role text; v_func text; BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin'] LOOP
    FOREACH v_func IN ARRAY ARRAY['public.purge_unconfirmed_signups(integer)',
      'public.scrub_signup_birth_date_on_write()','public.scrub_under14_signup_birth_date(jsonb)'] LOOP
      PERFORM pg_temp.assert_t07(NOT has_function_privilege(v_role,v_func,'EXECUTE'),'private ACL ' || v_role || ' ' || v_func);
    END LOOP;
  END LOOP;
END $$;
SELECT pg_temp.assert_t07(to_regnamespace('cron') IS NULL,'installed without pg_cron');
\ir unconfirmed-signup-session-date.sql
ROLLBACK;
SELECT 'T07 SQL behavior PASS';
