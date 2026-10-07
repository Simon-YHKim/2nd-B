-- Runs after 0232 in CI, or through the isolated local fixture. Rolls back all probes.
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE FUNCTION pg_temp.weather_expect_error(statement text, code text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM code THEN RAISE EXCEPTION 'expected SQLSTATE %, got %',code,actual; END IF;
END $$;

DO $$ BEGIN
  IF has_function_privilege('authenticated','public.weather_consent(uuid,text,bigint,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.authorize_weather_request(uuid)','EXECUTE')
     OR has_table_privilege('authenticated','public.weather_consent_state','UPDATE')
     OR has_table_privilege('service_role','public.weather_access_events','INSERT')
     OR NOT has_function_privilege('service_role','public.weather_consent(uuid,text,bigint,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'weather ACL failed under Supabase default grants';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('weather_consent_state','weather_access_events')
    AND column_name ~ '(latitude|longitude|coordinate|address|ip|body|payload)'
    AND column_name <> 'recipient') THEN RAISE EXCEPTION 'location persistence column'; END IF;
END $$;

-- Fixed synthetic IDs are local fixture data, never production users.
INSERT INTO auth.users(id,email) VALUES
 ('26100739-0000-4000-8000-000000000001','weather-adult@example.invalid'),
 ('26100739-0000-4000-8000-000000000002','weather-minor@example.invalid'),
 ('26100739-0000-4000-8000-000000000003','weather-other@example.invalid');
-- Full-tree auth triggers ignore profiles without signup metadata; the scratch schema has none.
INSERT INTO public.users(id,email,birth_date,privacy_prefs) VALUES
 ('26100739-0000-4000-8000-000000000001','weather-adult@example.invalid','1990-01-01','{"location_weather":true,"external_analytics":true}'),
 ('26100739-0000-4000-8000-000000000002','weather-minor@example.invalid',(current_date-interval '16 years')::date,'{"location_weather":true}'),
 ('26100739-0000-4000-8000-000000000003','weather-other@example.invalid','1990-01-01','{}');
UPDATE auth.users SET email_confirmed_at=now() WHERE id::text LIKE '26100739-%';
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE owner uuid := '26100739-0000-4000-8000-000000000001'; s jsonb;
BEGIN
  s := public.weather_consent(owner,'status');
  IF s->'enabled' <> 'false'::jsonb OR s->>'revision' <> '0' THEN RAISE EXCEPTION 'new account enabled'; END IF;
  IF public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'unconsented request'; END IF;
  PERFORM pg_temp.weather_expect_error(format('SELECT public.weather_consent(%L,''grant'',0,''obsolete'')',owner),'22023');
  PERFORM pg_temp.weather_expect_error('SELECT public.weather_consent(''26100739-0000-4000-8000-000000000002'',''grant'',0)','42501');
  s := public.weather_consent(owner,'grant',0,'weather-v1-261007','ko');
  IF s->'enabled' <> 'true'::jsonb OR s->>'revision' <> '1' THEN RAISE EXCEPTION 'grant failed'; END IF;
  IF (SELECT privacy_prefs->'external_analytics' FROM public.users WHERE id=owner) <> 'true'::jsonb THEN RAISE EXCEPTION 'unrelated pref changed'; END IF;
  IF NOT public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'granted weather rejected'; END IF;
  PERFORM pg_temp.weather_expect_error(format('SELECT public.weather_consent(%L,''revoke'',0)',owner),'40001');
  s := public.weather_consent(owner,'revoke',1);
  IF s->'enabled' <> 'false'::jsonb OR public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'revoke failed'; END IF;
  PERFORM pg_temp.weather_expect_error(format('SELECT public.weather_consent(%L,''grant'',1)',owner),'40001');
  PERFORM public.weather_consent(owner,'grant',2);
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"location_weather":false}' WHERE id=owner;
  s := public.weather_consent(owner,'status');
  IF s->'enabled' <> 'false'::jsonb OR s->>'revision' <> '4' THEN RAISE EXCEPTION 'direct withdrawal not fenced'; END IF;
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"location_weather":true}' WHERE id=owner;
  IF (SELECT privacy_prefs->'location_weather' FROM public.users WHERE id=owner) <> 'false'::jsonb THEN RAISE EXCEPTION 'direct grant bypass'; END IF;
  PERFORM public.weather_consent(owner,'grant',4);
  UPDATE public.users SET birth_date=(current_date-interval '16 years')::date WHERE id=owner;
  IF public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'DOB correction kept weather'; END IF;
  UPDATE public.users SET minor_tier='adult',privacy_prefs='{"location_weather":true}' WHERE id=owner;
  IF public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'forged tier bypass'; END IF;
  PERFORM pg_temp.weather_expect_error(format('UPDATE public.users SET birth_date=current_date WHERE id=%L',owner),'23514');
END $$;

-- The Edge uses the service role; an authenticated direct caller cannot invoke it.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='26100739-0000-4000-8000-000000000003';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.weather_consent_state) OR EXISTS(SELECT 1 FROM public.weather_access_events) THEN
    RAISE EXCEPTION 'cross-owner RLS leak'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.role='authenticated';
SELECT pg_temp.weather_expect_error('SELECT public.weather_consent(''26100739-0000-4000-8000-000000000003'',''grant'',0)','42501');
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE owner uuid := '26100739-0000-4000-8000-000000000003';
BEGIN
  PERFORM public.weather_consent(owner,'grant',0);
  INSERT INTO public.weather_access_events(user_id,event,created_at)
    SELECT owner,'use',now()-interval '1 minute' FROM generate_series(1,60);
  IF public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'user quota bypass'; END IF;
  INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES(owner,gen_random_uuid());
  PERFORM pg_temp.weather_expect_error(format('SELECT public.weather_consent(%L,''grant'',1)',owner),'42501');
  INSERT INTO public.weather_access_events(user_id,event,created_at) VALUES(owner,'use',now()-interval '7 months');
  PERFORM public.purge_weather_access_events();
  IF EXISTS(SELECT 1 FROM public.weather_access_events WHERE created_at < now()-interval '6 months') THEN RAISE EXCEPTION 'retention purge failed'; END IF;
  DELETE FROM public.users WHERE id=owner;
  IF EXISTS(SELECT 1 FROM public.weather_consent_state WHERE user_id=owner)
     OR EXISTS(SELECT 1 FROM public.weather_access_events WHERE user_id=owner)
     OR NOT EXISTS(SELECT 1 FROM public.weather_access_events WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'account erasure did not unlink request facts'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: weather default OFF, adult-only consent, CAS, withdrawal, RLS, deletion fence, quota, retention and erasure' AS result;
