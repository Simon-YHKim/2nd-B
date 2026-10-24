-- Test-only clock injection into real definitions, rolled back by the caller.
-- Preserve each routine's SET options, so a fixed timezone cannot hide here.
DO $$ DECLARE routine regprocedure; definition text; BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.scrub_under14_signup_birth_date(jsonb)'::regprocedure,
    'public.enforce_user_age_tier()'::regprocedure,
    'public.complete_verified_email_signup()'::regprocedure,
    'public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    PERFORM pg_temp.assert_t07(position('current_date' IN definition) > 0, 'session date injection anchor');
    EXECUTE replace(definition, 'current_date',
      '(pg_catalog.current_setting(''t07.test_instant'')::timestamptz AT TIME ZONE pg_catalog.current_setting(''TimeZone''))::date');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
  SELECT current_setting('t07.test_user')::uuid
$$;

-- A delete trigger observes the cleanup's execution context, not just the caller
-- after RETURN. A timezone pin in the cleanup would otherwise go unnoticed.
CREATE FUNCTION pg_temp.cleanup_session_t07() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.assert_t07(current_setting('TimeZone')=current_setting('t07.test_zone'),
    'cleanup inherits the server age gate session timezone');
  PERFORM pg_temp.assert_t07(
    (public.scrub_under14_signup_birth_date('{"signup_birth_date":"2012-10-25"}') ? 'signup_birth_date')
      = (current_setting('t07.test_today')::date >= DATE '2026-10-25'),
    'cleanup nested scrubber agrees with server date');
  RETURN OLD;
END $$;
CREATE TRIGGER t07_cleanup_session BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION pg_temp.cleanup_session_t07();

DO $$
DECLARE
  zone text;
  instant timestamptz;
  today date;
  birth date;
  expected boolean;
  admitted boolean;
  scrubbed jsonb;
  metadata jsonb;
  v_user_id uuid;
  n integer := 700;
  cases integer := 0;
BEGIN
  FOREACH zone IN ARRAY ARRAY['UTC','Asia/Seoul','America/Los_Angeles'] LOOP
    PERFORM set_config('TimeZone',zone,true);
    PERFORM set_config('t07.test_zone',zone,true);
    -- Immediately before/at midnight in KST, UTC and Los Angeles.
    FOREACH instant IN ARRAY ARRAY[
      TIMESTAMPTZ '2026-10-24 14:59:59+00', TIMESTAMPTZ '2026-10-24 15:00:00+00',
      TIMESTAMPTZ '2026-10-24 23:59:59+00', TIMESTAMPTZ '2026-10-25 00:00:00+00',
      TIMESTAMPTZ '2026-10-25 06:59:59+00', TIMESTAMPTZ '2026-10-25 07:00:00+00'
    ] LOOP
      today := (instant AT TIME ZONE zone)::date;
      PERFORM set_config('t07.test_instant',instant::text,true);
      PERFORM set_config('t07.test_today',today::text,true);
      FOREACH birth IN ARRAY ARRAY[DATE '2012-10-24',DATE '2012-10-25',DATE '2012-10-26'] LOOP
        expected := today >= (birth + interval '14 years')::date;
        metadata := jsonb_build_object('signup_birth_date',birth::text,'keep',true);
        scrubbed := public.scrub_under14_signup_birth_date(metadata);
        PERFORM pg_temp.assert_t07((scrubbed ? 'signup_birth_date')=expected
          AND scrubbed->'keep'='true', 'session birthday scrubber boundary');

        n := n+1; v_user_id := pg_temp.add_t07(n,0); admitted := true;
        BEGIN
          INSERT INTO public.users(id,email,birth_date)
          SELECT id,email,birth FROM auth.users WHERE id=v_user_id;
        EXCEPTION WHEN check_violation THEN admitted := false; END;
        PERFORM pg_temp.assert_t07(admitted=expected
          AND admitted=(scrubbed ? 'signup_birth_date'), 'C10 and scrubber agree on session birthday');

        -- Confirmation path: both Auth copies and resulting profile/consent.
        n := n+1; v_user_id := pg_temp.add_t07(n,0);
        metadata := metadata || '{
          "signup_flow":"email-v3", "signup_locale":"ko",
          "signup_consent_service":true, "signup_consent_llm_processing":true,
          "signup_consent_overseas_transfer":true, "signup_consent_sensitive_data":true,
          "signup_consent_safety_notice":true, "signup_consent_marketing":false
        }'::jsonb;
        UPDATE auth.users SET raw_user_meta_data=metadata WHERE id=v_user_id;
        UPDATE auth.identities i SET identity_data=metadata WHERE i.user_id=v_user_id;
        PERFORM pg_temp.assert_t07((SELECT raw_user_meta_data ? 'signup_birth_date'
          FROM auth.users WHERE id=v_user_id)=expected, 'session birthday Auth DOB');
        PERFORM pg_temp.assert_t07((SELECT identity_data ? 'signup_birth_date'
          FROM auth.identities i WHERE i.user_id=v_user_id)=expected, 'session birthday identity DOB');
        -- Also exercise the confirmation gate on legacy metadata; otherwise
        -- earlier scrubbing could mask an accidental change to that gate.
        ALTER TABLE auth.users DISABLE TRIGGER trg_scrub_signup_birth_date;
        UPDATE auth.users SET raw_user_meta_data=metadata WHERE id=v_user_id;
        ALTER TABLE auth.users ENABLE TRIGGER trg_scrub_signup_birth_date;
        UPDATE auth.users SET email_confirmed_at=now() WHERE id=v_user_id;
        PERFORM pg_temp.assert_t07(EXISTS(SELECT FROM public.users WHERE id=v_user_id)=expected,
          'session birthday confirmation profile');
        PERFORM pg_temp.assert_t07(EXISTS(SELECT FROM public.consent_records c WHERE c.user_id=v_user_id)=expected,
          'session birthday confirmation consent');

        -- Profile completion must make the same decision, including rejection.
        n := n+1; v_user_id := pg_temp.add_t07(n,0); admitted := true;
        PERFORM set_config('t07.test_user',v_user_id::text,true);
        UPDATE auth.users SET email_confirmed_at=now() WHERE id=v_user_id;
        BEGIN
          PERFORM public.complete_profile_signup_consent(birth::text,'ko',NULL,'complete-profile-v1',
            true,true,true,true,true,false);
        EXCEPTION WHEN check_violation THEN admitted := false; END;
        PERFORM pg_temp.assert_t07(admitted=expected, 'session birthday profile completion');
        PERFORM pg_temp.assert_t07(EXISTS(SELECT FROM public.users WHERE id=v_user_id)=expected,
          'session birthday completed profile');
        PERFORM pg_temp.assert_t07(EXISTS(SELECT FROM public.consent_records c WHERE c.user_id=v_user_id)=expected,
          'session birthday completion consent');
        cases := cases+1;
      END LOOP;
      n := n+1; PERFORM pg_temp.add_t07(n,79800);
      PERFORM pg_temp.assert_t07(deleted=1 AND failed=0, 'cleanup preserves session date during deletion')
        FROM public.purge_unconfirmed_signups();
      PERFORM pg_temp.assert_t07(current_setting('TimeZone')=zone,'session timezone unchanged');
    END LOOP;
  END LOOP;
  PERFORM pg_temp.assert_t07(cases=54, 'all 54 session date birthday cases executed');
END $$;
DROP TRIGGER t07_cleanup_session ON auth.users;
SET LOCAL timezone = 'UTC';
