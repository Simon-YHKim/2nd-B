-- 0246 behavior, not a copy of the implementation. Disposable local DB only.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('26101146-0000-4000-8000-000000000001','consent-a@example.invalid',now()),
 ('26101146-0000-4000-8000-000000000002','consent-b@example.invalid',now());
INSERT INTO public.users(id,email,birth_date) VALUES
 ('26101146-0000-4000-8000-000000000001','consent-a@example.invalid','1990-01-01'),
 ('26101146-0000-4000-8000-000000000002','consent-b@example.invalid','1990-01-01');
CREATE FUNCTION pg_temp.expect_consent_error(statement text, code text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM code THEN RAISE EXCEPTION 'expected %, got %: %',code,actual,statement; END IF;
END $$;

DO $$
DECLARE owner uuid := '26101146-0000-4000-8000-000000000001'; s jsonb; before_profile tid;
BEGIN
  s := public.weather_consent(owner,'revoke',0);
  IF s->>'revision' <> '0' OR s->>'enabled' <> 'false'
     OR EXISTS(SELECT 1 FROM public.weather_consent_state WHERE user_id=owner)
     OR EXISTS(SELECT 1 FROM public.weather_access_events WHERE user_id=owner) THEN
    RAISE EXCEPTION 'initial OFF revoke must not create state/events';
  END IF;
  PERFORM public.weather_consent(owner,'status');
  PERFORM public.weather_consent(owner,'grant',0);
  UPDATE public.weather_consent_state SET updated_at=now()-interval '1 hour' WHERE user_id=owner;
  SELECT ctid INTO before_profile FROM public.users WHERE id=owner;
  s := public.weather_consent(owner,'grant',1);
  IF s->>'revision' <> '1' OR s->>'enabled' <> 'true'
     OR (SELECT count(*) FROM public.weather_access_events WHERE user_id=owner) <> 1
     OR (SELECT ctid FROM public.users WHERE id=owner) <> before_profile
     OR (SELECT updated_at FROM public.weather_consent_state WHERE user_id=owner) <> now()-interval '1 hour' THEN
    RAISE EXCEPTION 'same-state grant changed consent/profile/events';
  END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''grant'',0)',owner),'PT409');
  -- A saw N=1. B toggled OFF (2), then ON (3). A's stale withdrawal must win.
  PERFORM public.weather_consent(owner,'revoke',1);
  PERFORM public.weather_consent(owner,'grant',2);
  s := public.weather_consent(owner,'revoke',1);
  IF s->>'enabled' <> 'false' OR s->>'revision' <> '4'
     OR (SELECT privacy_prefs->>'location_weather' FROM public.users WHERE id=owner) <> 'false' THEN
    RAISE EXCEPTION 'stale A withdrawal did not converge after B changed consent';
  END IF;
  SELECT ctid INTO before_profile FROM public.users WHERE id=owner;
  s := public.weather_consent(owner,'revoke',1);
  IF s->>'revision' <> '4' OR (SELECT count(*) FROM public.weather_access_events WHERE user_id=owner) <> 4
     OR (SELECT ctid FROM public.users WHERE id=owner) <> before_profile THEN
    RAISE EXCEPTION 'same-state revoke wrote profile/revision/event';
  END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''grant'',1)',owner),'PT409');
  IF public.authorize_weather_request(owner) THEN RAISE EXCEPTION 'withdrawn account authorized'; END IF;
END $$;
SELECT 'PASS: idempotent grant/revoke and A(N)/B(N+1) stale withdrawal' AS result;

DO $$
DECLARE owner uuid := '26101146-0000-4000-8000-000000000001'; s jsonb;
BEGIN
  -- One remaining user allowance: the next succeeds, then both actions fail.
  UPDATE public.public_data_provider_quota_daily SET weather_check_times='{}' WHERE provider='weather_consent';
  UPDATE public.weather_consent_state SET consent_check_day=current_date,consent_check_count=119 WHERE user_id=owner;
  PERFORM public.weather_consent(owner,'grant',4);
  PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''status'')',owner),'PT429');
  PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''grant'',5)',owner),'PT429');
  s := public.weather_consent(owner,'revoke',0);
  IF s->>'enabled' <> 'false' OR s->>'revision' <> '6' THEN RAISE EXCEPTION 'user cap blocked revoke'; END IF;
  IF (SELECT consent_check_count FROM public.weather_consent_state WHERE user_id=owner) <> 120 THEN
    RAISE EXCEPTION 'denied calls/revoke changed quota';
  END IF;
  -- Calendar-day rollover resets just the day counter, never consent.
  UPDATE public.weather_consent_state SET consent_check_day=current_date-1 WHERE user_id=owner;
  s := public.weather_consent(owner,'status');
  IF s->>'revision' <> '6' OR (SELECT consent_check_count FROM public.weather_consent_state WHERE user_id=owner) <> 1 THEN
    RAISE EXCEPTION 'day counter did not reset';
  END IF;
END $$;
SELECT 'PASS: user day boundary, capped grant/status, uncapped revoke' AS result;

DO $$
DECLARE owner uuid := '26101146-0000-4000-8000-000000000001'; action text; s jsonb;
BEGIN
  -- Each global cap is independently saturated. No other limit masks it.
  FOREACH action IN ARRAY ARRAY['second','minute','day'] LOOP
    UPDATE public.weather_consent_state SET consent_check_count=0;
    UPDATE public.public_data_provider_quota_daily SET
      calls=CASE WHEN action='day' THEN 20000 ELSE 0 END,
      weather_check_times=CASE WHEN action='second' THEN array_fill(clock_timestamp(),ARRAY[20])
        WHEN action='minute' THEN array_fill(clock_timestamp()-interval '30 seconds',ARRAY[120])
        ELSE '{}'::timestamptz[] END WHERE provider='weather_consent' AND usage_day=current_date;
    PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''status'')',owner),'PT429');
    PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''grant'',6)',owner),'PT429');
    s := public.weather_consent(owner,'revoke',0);
    IF s->>'enabled' <> 'false' OR s->>'revision' <> '6' THEN RAISE EXCEPTION 'global % cap blocked revoke',action; END IF;
  END LOOP;
  -- Previous-day quota rows participate in rolling windows across midnight.
  INSERT INTO public.public_data_provider_quota_daily(provider,usage_day,calls,weather_check_times)
    VALUES('weather_consent',current_date-1,120,array_fill(clock_timestamp()-interval '30 seconds',ARRAY[120]));
  UPDATE public.public_data_provider_quota_daily SET calls=0,weather_check_times='{}'
    WHERE provider='weather_consent' AND usage_day=current_date;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''status'')',owner),'PT429');
  UPDATE public.public_data_provider_quota_daily SET weather_check_times=array_fill(clock_timestamp()-interval '61 seconds',ARRAY[120])
    WHERE provider='weather_consent';
  PERFORM public.weather_consent(owner,'status');
  IF (SELECT cardinality(weather_check_times) FROM public.public_data_provider_quota_daily
      WHERE provider='weather_consent' AND usage_day=current_date) <> 1 THEN RAISE EXCEPTION 'old timestamps not pruned'; END IF;
END $$;
SELECT 'PASS: global rolling second/minute/day, midnight overlap and expired-window pruning' AS result;

DO $$
DECLARE owner uuid := '26101146-0000-4000-8000-000000000001'; other_owner uuid := '26101146-0000-4000-8000-000000000002';
BEGIN
  UPDATE public.public_data_provider_quota_daily SET calls=20000,weather_check_times='{}'
    WHERE provider='weather_consent' AND usage_day=current_date;
  DELETE FROM public.users WHERE id=owner;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.weather_consent(%L,''status'')',other_owner),'PT429');
  IF EXISTS(SELECT 1 FROM public.weather_consent_state WHERE user_id=owner)
     OR EXISTS(SELECT 1 FROM public.weather_access_events WHERE user_id=owner) THEN RAISE EXCEPTION 'owner erasure changed'; END IF;
  IF has_table_privilege('authenticated','public.public_data_provider_quota_daily','SELECT')
     OR has_table_privilege('service_role','public.public_data_provider_quota_daily','UPDATE')
     OR has_function_privilege('anon','public.weather_consent(uuid,text,bigint,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'quota ACL changed';
  END IF;
  -- Quota infrastructure reuse does not make weather an external-data provider.
  PERFORM pg_temp.expect_consent_error(format('SELECT public.consume_public_data_quota(%L,''weather_consent'',current_date,1)',other_owner),'22023');
  INSERT INTO public.public_data_provider_quota_daily(provider,usage_day,calls) VALUES('mfds_food',current_date-3,4);
  UPDATE public.public_data_provider_quota_daily SET calls=0 WHERE provider='weather_consent' AND usage_day=current_date;
  INSERT INTO public.public_data_provider_quota_daily(provider,usage_day,calls) VALUES('weather_consent',current_date-3,4);
  PERFORM public.weather_consent(other_owner,'status');
  IF EXISTS(SELECT 1 FROM public.public_data_provider_quota_daily WHERE provider='weather_consent' AND usage_day<current_date-1)
     OR NOT EXISTS(SELECT 1 FROM public.public_data_provider_quota_daily WHERE provider='mfds_food' AND usage_day=current_date-3 AND calls=4) THEN
    RAISE EXCEPTION 'quota pruning touched another provider or retained old weather rows';
  END IF;
END $$;
SELECT 'PASS: account erasure preserves global quota, private ACL and other-provider isolation' AS result;
ROLLBACK;
