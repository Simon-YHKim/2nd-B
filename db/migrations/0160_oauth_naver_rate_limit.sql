-- Durable pre-auth limiter for oauth-naver. The Edge function sends only
-- SHA-256 network/state fingerprints; raw IPs, authorization codes, and OAuth
-- state never enter the database.

BEGIN;

CREATE TABLE public.oauth_preauth_rate_limits (
  provider text NOT NULL CHECK (provider = 'naver'),
  dimension text NOT NULL CHECK (dimension IN ('ip_minute', 'ip_hour', 'state_10m')),
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, dimension, key_hash, window_start)
);

CREATE INDEX oauth_preauth_rate_limits_updated_idx
  ON public.oauth_preauth_rate_limits (updated_at);

ALTER TABLE public.oauth_preauth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_preauth_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.oauth_preauth_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_oauth_naver_rate_limit(
  p_ip_hash text,
  p_state_hash text
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_minute_start timestamptz;
  v_hour_start timestamptz;
  v_state_start timestamptz;
  v_ip_minute_count integer;
  v_ip_hour_count integer;
  v_state_count integer;
  v_retry integer := 0;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'oauth_naver_rate_limit_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_minute_start := pg_catalog.date_trunc('minute', v_now);
  v_hour_start := pg_catalog.date_trunc('hour', v_now);
  v_state_start := pg_catalog.date_bin(
    INTERVAL '10 minutes',
    v_now,
    TIMESTAMPTZ '2000-01-01 00:00:00+00'
  );

  -- Fixed windows plus atomic UPSERT make the 11th/61st/6th concurrent request
  -- deterministic. Counts remain capped to avoid integer growth under abuse.
  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'ip_minute', p_ip_hash, v_minute_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash, window_start)
  DO UPDATE SET
    request_count = LEAST(limits.request_count + 1, 1000000),
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_ip_minute_count;

  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'ip_hour', p_ip_hash, v_hour_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash, window_start)
  DO UPDATE SET
    request_count = LEAST(limits.request_count + 1, 1000000),
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_ip_hour_count;

  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'state_10m', p_state_hash, v_state_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash, window_start)
  DO UPDATE SET
    request_count = LEAST(limits.request_count + 1, 1000000),
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_state_count;

  IF v_ip_minute_count > 10 THEN
    v_retry := GREATEST(
      v_retry,
      pg_catalog.ceil(EXTRACT(EPOCH FROM (v_minute_start + INTERVAL '1 minute' - v_now)))::integer
    );
  END IF;
  IF v_ip_hour_count > 60 THEN
    v_retry := GREATEST(
      v_retry,
      pg_catalog.ceil(EXTRACT(EPOCH FROM (v_hour_start + INTERVAL '1 hour' - v_now)))::integer
    );
  END IF;
  IF v_state_count > 5 THEN
    v_retry := GREATEST(
      v_retry,
      pg_catalog.ceil(EXTRACT(EPOCH FROM (v_state_start + INTERVAL '10 minutes' - v_now)))::integer
    );
  END IF;

  -- At most about two days of small fixed-window counters survive even when
  -- pg_cron is unavailable. The indexed delete is safe to repeat.
  DELETE FROM public.oauth_preauth_rate_limits
   WHERE updated_at < v_now - INTERVAL '48 hours';

  RETURN QUERY SELECT v_retry = 0, GREATEST(v_retry, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) TO service_role;

COMMENT ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) IS
  'Service-only atomic oauth-naver pre-auth limiter: 10/IP/min, 60/IP/hour, 5/state/10min.';

DO $postconditions$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.consume_oauth_naver_rate_limit(text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.consume_oauth_naver_rate_limit(text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.consume_oauth_naver_rate_limit(text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION '0160 oauth naver limiter privilege postcondition failed';
  END IF;
END
$postconditions$;

COMMIT;
