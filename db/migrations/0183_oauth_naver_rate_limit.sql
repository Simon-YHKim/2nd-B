-- 0183_oauth_naver_rate_limit.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Durable, private pre-auth controls for oauth-naver.
--
-- Only HMAC-SHA256 fingerprints cross the Edge/DB boundary. Raw peer IPs,
-- OAuth state capabilities, authorization codes, and Naver subjects are never
-- stored here. All limits, windows, provider names, and TTLs are fixed in SQL;
-- the unauthenticated caller cannot tune policy through RPC arguments.

BEGIN;

CREATE TABLE IF NOT EXISTS public.oauth_preauth_rate_limits (
  provider text NOT NULL
    CONSTRAINT oauth_preauth_rate_limits_provider_check CHECK (provider = 'naver'),
  dimension text NOT NULL
    CONSTRAINT oauth_preauth_rate_limits_dimension_check
      CHECK (dimension IN ('ip_minute', 'ip_hour', 'state_10m')),
  key_hash text NOT NULL
    CONSTRAINT oauth_preauth_rate_limits_key_hash_check
      CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL
    CONSTRAINT oauth_preauth_rate_limits_request_count_check CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_preauth_rate_limits_pkey
    PRIMARY KEY (provider, dimension, key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS oauth_preauth_rate_limits_updated_idx
  ON public.oauth_preauth_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS public.oauth_naver_states (
  state_hash text NOT NULL
    CONSTRAINT oauth_naver_states_state_hash_check
      CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  redirect_uri text NOT NULL
    CONSTRAINT oauth_naver_states_redirect_uri_check CHECK (
      redirect_uri IN (
        'https://simon-yhkim.github.io/2nd-B/oauth-callback',
        'http://localhost:8081/oauth-callback',
        'http://localhost:19006/oauth-callback'
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT oauth_naver_states_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + INTERVAL '10 minutes'
  ),
  CONSTRAINT oauth_naver_states_pkey PRIMARY KEY (state_hash)
);

CREATE INDEX IF NOT EXISTS oauth_naver_states_expires_idx
  ON public.oauth_naver_states (expires_at);

-- A pending row is deliberately durable. If auth.admin.createUser has an
-- ambiguous network result, a later request sees `pending` and cannot create a
-- second user. An operator must reconcile that rare row before retrying it.
CREATE TABLE IF NOT EXISTS public.oauth_naver_identities (
  subject_hash text NOT NULL
    CONSTRAINT oauth_naver_identities_subject_hash_check
      CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  claim_hash text NOT NULL
    CONSTRAINT oauth_naver_identities_claim_hash_key UNIQUE
    CONSTRAINT oauth_naver_identities_claim_hash_check
      CHECK (claim_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid
    CONSTRAINT oauth_naver_identities_user_id_key UNIQUE
    CONSTRAINT oauth_naver_identities_user_id_fkey
      REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  bound_at timestamptz,
  CONSTRAINT oauth_naver_identities_bound_pair_check CHECK (
    (user_id IS NULL AND bound_at IS NULL)
    OR (user_id IS NOT NULL AND bound_at IS NOT NULL)
  ),
  CONSTRAINT oauth_naver_identities_pkey PRIMARY KEY (subject_hash)
);

ALTER TABLE public.oauth_preauth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_preauth_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_naver_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_naver_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_naver_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_naver_identities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.oauth_preauth_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.oauth_naver_states
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.oauth_naver_identities
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
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'oauth_naver_rate_limit_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_minute_start := pg_catalog.date_trunc('minute', v_now);
  v_hour_start := pg_catalog.date_trunc('hour', v_now);
  v_state_start := pg_catalog.date_bin(
    INTERVAL '10 minutes',
    v_now,
    TIMESTAMPTZ '2000-01-01 00:00:00+00'
  );

  -- Atomic UPSERTs make the 11th/61st/6th concurrent request deterministic.
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

  DELETE FROM public.oauth_preauth_rate_limits
   WHERE updated_at < v_now - INTERVAL '48 hours';

  RETURN QUERY SELECT v_retry = 0, GREATEST(v_retry, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_oauth_naver_state(
  p_state_hash text,
  p_redirect_uri text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_inserted integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$'
     OR p_redirect_uri IS NULL
     OR p_redirect_uri NOT IN (
       'https://simon-yhkim.github.io/2nd-B/oauth-callback',
       'http://localhost:8081/oauth-callback',
       'http://localhost:19006/oauth-callback'
     ) THEN
    RAISE EXCEPTION 'oauth_naver_state_invalid' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.oauth_naver_states WHERE expires_at <= v_now;
  INSERT INTO public.oauth_naver_states (state_hash, redirect_uri, created_at, expires_at)
  VALUES (p_state_hash, p_redirect_uri, v_now, v_now + INTERVAL '10 minutes')
  ON CONFLICT (state_hash) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_oauth_naver_state(
  p_state_hash text,
  p_redirect_uri text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_consumed integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$'
     OR p_redirect_uri IS NULL
     OR p_redirect_uri NOT IN (
       'https://simon-yhkim.github.io/2nd-B/oauth-callback',
       'http://localhost:8081/oauth-callback',
       'http://localhost:19006/oauth-callback'
     ) THEN
    RAISE EXCEPTION 'oauth_naver_state_invalid' USING ERRCODE = '22023';
  END IF;

  -- DELETE ... RETURNING is the one-time consume. Concurrent callbacks can
  -- never both observe success.
  DELETE FROM public.oauth_naver_states
   WHERE state_hash = p_state_hash
     AND redirect_uri = p_redirect_uri
     AND expires_at > v_now;
  GET DIAGNOSTICS v_consumed = ROW_COUNT;
  DELETE FROM public.oauth_naver_states WHERE expires_at <= v_now;
  RETURN v_consumed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_oauth_naver_identity(
  p_subject_hash text,
  p_claim_hash text
) RETURNS TABLE (status text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_hash text;
  v_user_id uuid;
  v_inserted integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
     OR p_claim_hash IS NULL OR p_claim_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'oauth_naver_identity_key_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.oauth_naver_identities (subject_hash, claim_hash)
  VALUES (p_subject_hash, p_claim_hash)
  ON CONFLICT (subject_hash) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN QUERY SELECT 'claimed'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT identities.claim_hash, identities.user_id
    INTO v_claim_hash, v_user_id
    FROM public.oauth_naver_identities AS identities
   WHERE identities.subject_hash = p_subject_hash
   FOR UPDATE;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT 'bound'::text, v_user_id;
  ELSIF v_claim_hash = p_claim_hash THEN
    RETURN QUERY SELECT 'claimed'::text, NULL::uuid;
  ELSE
    RETURN QUERY SELECT 'pending'::text, NULL::uuid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_oauth_naver_identity(
  p_subject_hash text,
  p_claim_hash text,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bound integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
     OR p_claim_hash IS NULL OR p_claim_hash !~ '^[0-9a-f]{64}$'
     OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'oauth_naver_identity_binding_invalid' USING ERRCODE = '22023';
  END IF;

  -- Idempotent for a response-lost retry with the same claim and user only.
  UPDATE public.oauth_naver_identities
     SET user_id = p_user_id,
         bound_at = COALESCE(bound_at, pg_catalog.clock_timestamp())
   WHERE subject_hash = p_subject_hash
     AND claim_hash = p_claim_hash
     AND (user_id IS NULL OR user_id = p_user_id);
  GET DIAGNOSTICS v_bound = ROW_COUNT;
  RETURN v_bound = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_naver_rate_limit(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.issue_oauth_naver_state(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_oauth_naver_state(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_oauth_naver_identity(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bind_oauth_naver_identity(text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_oauth_naver_state(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_naver_state(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_oauth_naver_identity(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_oauth_naver_identity(text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) IS
  'Service-only atomic oauth-naver limiter: 10/peer/min, 60/peer/hour, 5/state/10min.';
COMMENT ON FUNCTION public.issue_oauth_naver_state(text, text) IS
  'Service-only issue of a fixed-TTL HMAC state fingerprint.';
COMMENT ON FUNCTION public.consume_oauth_naver_state(text, text) IS
  'Service-only atomic one-time consume of a live HMAC state fingerprint.';
COMMENT ON FUNCTION public.claim_oauth_naver_identity(text, text) IS
  'Service-only unique Naver subject claim; durable pending blocks duplicate auth users.';
COMMENT ON FUNCTION public.bind_oauth_naver_identity(text, text, uuid) IS
  'Service-only idempotent binding of an owned pending subject claim to one auth user.';

DO $postconditions$
DECLARE
  v_table text;
  v_function text;
BEGIN
  IF (
       SELECT count(*)
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.oauth_preauth_rate_limits'::regclass
          AND conname IN (
            'oauth_preauth_rate_limits_provider_check',
            'oauth_preauth_rate_limits_dimension_check',
            'oauth_preauth_rate_limits_key_hash_check',
            'oauth_preauth_rate_limits_request_count_check',
            'oauth_preauth_rate_limits_pkey'
          )
     ) <> 5
     OR (
       SELECT count(*)
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.oauth_naver_states'::regclass
          AND conname IN (
            'oauth_naver_states_state_hash_check',
            'oauth_naver_states_redirect_uri_check',
            'oauth_naver_states_expiry_check',
            'oauth_naver_states_pkey'
          )
     ) <> 4
     OR (
       SELECT count(*)
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.oauth_naver_identities'::regclass
          AND conname IN (
            'oauth_naver_identities_subject_hash_check',
            'oauth_naver_identities_claim_hash_key',
            'oauth_naver_identities_claim_hash_check',
            'oauth_naver_identities_user_id_key',
            'oauth_naver_identities_user_id_fkey',
            'oauth_naver_identities_bound_pair_check',
            'oauth_naver_identities_pkey'
          )
     ) <> 7 THEN
    RAISE EXCEPTION '0183 oauth naver constraint postcondition failed';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.oauth_preauth_rate_limits',
    'public.oauth_naver_states',
    'public.oauth_naver_identities'
  ] LOOP
    IF has_table_privilege(
         'anon', v_table,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       )
       OR has_table_privilege(
         'authenticated', v_table,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       )
       OR has_table_privilege(
         'service_role', v_table,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       )
       OR NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_class
          WHERE oid = v_table::regclass
            AND relrowsecurity
            AND relforcerowsecurity
       ) THEN
      RAISE EXCEPTION '0183 oauth naver table postcondition failed: %', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.consume_oauth_naver_rate_limit(text,text)',
    'public.issue_oauth_naver_state(text,text)',
    'public.consume_oauth_naver_state(text,text)',
    'public.claim_oauth_naver_identity(text,text)',
    'public.bind_oauth_naver_identity(text,text,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
       OR NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_proc
          WHERE oid = v_function::regprocedure
            AND prosecdef
            AND EXISTS (
              SELECT 1
                FROM pg_catalog.unnest(proconfig) AS setting(value)
               WHERE setting.value LIKE 'search_path=%'
            )
       ) THEN
      RAISE EXCEPTION '0183 oauth naver function postcondition failed: %', v_function;
    END IF;
  END LOOP;
END
$postconditions$;

COMMIT;
