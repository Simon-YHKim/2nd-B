-- Test-only clock injection into the real definitions in the outer transaction.
-- 05:00 KST birthday is still the preceding UTC day. No production clock hook.
DO $$ DECLARE routine regprocedure; definition text; BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.scrub_under14_signup_birth_date(jsonb)'::regprocedure,
    'public.enforce_user_age_tier()'::regprocedure,
    'public.complete_verified_email_signup()'::regprocedure,
    'public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    PERFORM pg_temp.assert_t07(position('current_date' IN definition) > 0, 'KST clock injection anchor');
    EXECUTE replace(definition, 'current_date',
      '(TIMESTAMPTZ ''2026-10-24 20:00:00+00'' AT TIME ZONE pg_catalog.current_setting(''TimeZone''))::date');
  END LOOP;
END $$;
SELECT pg_temp.assert_t07(public.scrub_under14_signup_birth_date(
  '{"signup_birth_date":"2012-10-25"}') ? 'signup_birth_date', 'KST fourteenth birthday retained');
SELECT pg_temp.assert_t07(NOT public.scrub_under14_signup_birth_date(
  '{"signup_birth_date":"2012-10-26"}') ? 'signup_birth_date', 'KST day before birthday scrubbed');

SELECT pg_temp.add_t07(701,0), pg_temp.add_t07(702,0), pg_temp.add_t07(703,0);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.users(id,email,birth_date)
    SELECT id,email,DATE '2012-10-25' FROM auth.users WHERE email='fixture-701@example.invalid';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION USING ERRCODE='P0707', MESSAGE='T07_ASSERT: KST server gate birthday accepted';
  END;
  BEGIN
    INSERT INTO public.users(id,email,birth_date)
    SELECT id,email,DATE '2012-10-26' FROM auth.users WHERE email='fixture-702@example.invalid';
    RAISE EXCEPTION USING ERRCODE='P0707', MESSAGE='T07_ASSERT: KST server gate before birthday rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE auth.users SET raw_user_meta_data='{
  "signup_flow":"email-v3", "signup_birth_date":"2012-10-25", "signup_locale":"ko",
  "signup_consent_service":true, "signup_consent_llm_processing":true,
  "signup_consent_overseas_transfer":true, "signup_consent_sensitive_data":true,
  "signup_consent_safety_notice":true, "signup_consent_marketing":false
}' WHERE email='fixture-702@example.invalid';
UPDATE auth.users SET email_confirmed_at=now() WHERE email='fixture-702@example.invalid';
SELECT pg_temp.assert_t07(count(*)=1,'KST confirmation provisions birthday profile')
FROM public.users WHERE email='fixture-702@example.invalid';
SELECT pg_temp.assert_t07(count(*)=1,'KST confirmation records matching consent')
FROM public.consent_records WHERE user_id='07000000-0000-0000-0000-000000000702';

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
  SELECT '07000000-0000-0000-0000-000000000703'::uuid
$$;
UPDATE auth.users SET email_confirmed_at=now() WHERE email='fixture-703@example.invalid';
DO $$ BEGIN
  BEGIN
    PERFORM public.complete_profile_signup_consent('2012-10-25','ko',NULL,'complete-profile-v1',
      true,true,true,true,true,false);
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION USING ERRCODE='P0707', MESSAGE='T07_ASSERT: KST profile completion birthday accepted';
  END;
END $$;
SELECT pg_temp.assert_t07(count(*)=1,'KST completion provisions birthday profile')
FROM public.users WHERE email='fixture-703@example.invalid';
SELECT pg_temp.assert_t07(current_setting('TimeZone')='UTC','function timezone does not leak to caller');
