\set ON_ERROR_STOP on

BEGIN;

\ir ../migration-drafts/UNNUMBERED_peer_response_rate_limit.sql

SET LOCAL request.jwt.claim.role = 'service_role';

DELETE FROM public.peer_response_rate_limits
 WHERE action = 'submit';

DO $regression$
DECLARE
  v_allowed boolean;
  v_retry integer;
  v_global_count integer;
  v_attempt integer;
  v_key_index integer;
  v_key_hash text;
  v_second numeric;
  v_hot_key constant text := pg_catalog.repeat('a', 64);
  v_final_key constant text := pg_catalog.repeat('f', 64);
BEGIN
  -- Keep all calls in one limiter window without making the assertion depend
  -- on when the CI job happens to start.
  v_second := EXTRACT(SECOND FROM pg_catalog.clock_timestamp());
  IF v_second >= 45 THEN
    PERFORM pg_catalog.pg_sleep(61 - v_second);
  END IF;

  FOR v_attempt IN 1..6 LOOP
    SELECT result.allowed, result.retry_after_seconds
      INTO v_allowed, v_retry
      FROM public.consume_peer_response_rate_limit('submit', v_hot_key) AS result;
    IF v_allowed IS DISTINCT FROM true OR v_retry <> 0 THEN
      RAISE EXCEPTION 'hot key admitted call % was denied', v_attempt;
    END IF;
  END LOOP;

  FOR v_attempt IN 1..20 LOOP
    SELECT result.allowed, result.retry_after_seconds
      INTO v_allowed, v_retry
      FROM public.consume_peer_response_rate_limit('submit', v_hot_key) AS result;
    IF v_allowed IS DISTINCT FROM false OR v_retry <= 0 THEN
      RAISE EXCEPTION 'hot key overflow call % was admitted', v_attempt;
    END IF;
  END LOOP;

  SELECT limits.request_count
    INTO v_global_count
    FROM public.peer_response_rate_limits AS limits
   WHERE limits.dimension = 'global'
     AND limits.action = 'submit'
     AND limits.key_hash = pg_catalog.repeat('0', 64);
  IF v_global_count IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'same-key rejected overflow consumed global quota: %',
      v_global_count;
  END IF;

  -- The hot key admitted six calls. Exactly 114 other admitted keys must fill
  -- the remaining fleet-wide budget without an early denial.
  FOR v_key_index IN 1..114 LOOP
    v_key_hash := pg_catalog.lpad(pg_catalog.to_hex(v_key_index), 64, '0');
    SELECT result.allowed, result.retry_after_seconds
      INTO v_allowed, v_retry
      FROM public.consume_peer_response_rate_limit('submit', v_key_hash) AS result;
    IF v_allowed IS DISTINCT FROM true OR v_retry <> 0 THEN
      RAISE EXCEPTION
        'other key % was denied before accepted aggregate reached 120',
        v_key_index;
    END IF;
  END LOOP;

  SELECT limits.request_count
    INTO v_global_count
    FROM public.peer_response_rate_limits AS limits
   WHERE limits.dimension = 'global'
     AND limits.action = 'submit'
     AND limits.key_hash = pg_catalog.repeat('0', 64);
  IF v_global_count IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'accepted aggregate did not reach global cap: %',
      v_global_count;
  END IF;

  SELECT result.allowed, result.retry_after_seconds
    INTO v_allowed, v_retry
    FROM public.consume_peer_response_rate_limit('submit', v_final_key) AS result;
  IF v_allowed IS DISTINCT FROM false OR v_retry <= 0 THEN
    RAISE EXCEPTION 'request beyond the accepted aggregate cap was admitted';
  END IF;

  SELECT limits.request_count
    INTO v_global_count
    FROM public.peer_response_rate_limits AS limits
   WHERE limits.dimension = 'global'
     AND limits.action = 'submit'
     AND limits.key_hash = pg_catalog.repeat('0', 64);
  IF v_global_count IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'global denial changed the accepted aggregate: %',
      v_global_count;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.peer_response_rate_limits AS limits
     WHERE limits.dimension = 'key'
       AND limits.action = 'submit'
       AND limits.key_hash = v_final_key
  ) THEN
    RAISE EXCEPTION 'global denial allocated a new keyed row';
  END IF;
END
$regression$;

ROLLBACK;
