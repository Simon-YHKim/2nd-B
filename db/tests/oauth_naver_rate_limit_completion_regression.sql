\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0183 and 0199 migrations.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
DELETE FROM public.oauth_preauth_rate_limits WHERE provider = 'naver';
DELETE FROM public.oauth_naver_states;

DO $regression$
DECLARE
  v_allowed boolean;
  v_retry integer;
  v_count integer;
  v_attempt integer;
  v_second numeric;
  v_callback constant text := 'https://simon-yhkim.github.io/2nd-B/oauth-callback';
BEGIN
  -- Keep the limiter calls in one UTC minute without a CI clock-boundary flake.
  v_second := EXTRACT(SECOND FROM pg_catalog.clock_timestamp());
  IF v_second >= 45 THEN
    PERFORM pg_catalog.pg_sleep(61 - v_second);
  END IF;

  INSERT INTO public.oauth_preauth_rate_limits
    (provider, dimension, key_hash, window_start, request_count)
  VALUES ('naver', 'global_minute', pg_catalog.repeat('0', 64),
          pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp()), 600);
  SELECT result.allowed, result.retry_after_seconds
    INTO v_allowed, v_retry
    FROM public.consume_oauth_naver_rate_limit(
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64)) AS result;
  IF v_allowed IS DISTINCT FROM false OR v_retry <= 0 THEN
    RAISE EXCEPTION 'global cap admitted a new peer';
  END IF;
  SELECT count(*) INTO v_count
    FROM public.oauth_preauth_rate_limits
   WHERE provider = 'naver' AND dimension <> 'global_minute';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'global rejection allocated peer rows: %', v_count;
  END IF;

  DELETE FROM public.oauth_preauth_rate_limits
   WHERE provider = 'naver' AND dimension = 'global_minute';
  FOR v_attempt IN 1..11 LOOP
    SELECT result.allowed, result.retry_after_seconds
      INTO v_allowed, v_retry
      FROM public.consume_oauth_naver_rate_limit(
        pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64)) AS result;
    IF (v_attempt <= 10 AND (v_allowed IS DISTINCT FROM true OR v_retry <> 0))
       OR (v_attempt = 11 AND (v_allowed IS DISTINCT FROM false OR v_retry <= 0)) THEN
      RAISE EXCEPTION 'peer cap mismatch at call %: allowed %, retry %',
        v_attempt, v_allowed, v_retry;
    END IF;
  END LOOP;
  SELECT request_count INTO v_count
    FROM public.oauth_preauth_rate_limits
   WHERE provider = 'naver' AND dimension = 'global_minute';
  IF v_count IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'rejected peer spent global quota: %', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.oauth_preauth_rate_limits
              WHERE dimension = 'state_10m') THEN
    RAISE EXCEPTION 'caller-chosen state created a rate-limit row';
  END IF;

  v_allowed := public.issue_oauth_naver_state(pg_catalog.repeat('e', 64), v_callback);
  IF v_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OAuth state was not single-use: issue';
  END IF;
  v_allowed := public.issue_oauth_naver_state(pg_catalog.repeat('e', 64), v_callback);
  IF v_allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OAuth state was not single-use: duplicate issue';
  END IF;
  v_allowed := public.consume_oauth_naver_state(pg_catalog.repeat('e', 64), v_callback);
  IF v_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OAuth state was not single-use: consume';
  END IF;
  v_allowed := public.consume_oauth_naver_state(pg_catalog.repeat('e', 64), v_callback);
  IF v_allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OAuth state was not single-use: replay';
  END IF;
  BEGIN
    PERFORM public.issue_oauth_naver_state(
      pg_catalog.repeat('f', 64), 'http://localhost:8081/oauth-callback');
    RAISE EXCEPTION 'localhost callback was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END
$regression$;

ROLLBACK;
