-- UNNUMBERED_oauth_naver_rate_limit_completion.sql
-- LOCAL DRAFT ONLY: reserve the next migration number with a fresh remote scan
-- and push the reservation before this can enter a release candidate.
--
-- Forward completion for 0183. The original limiter wrote one `state_10m` row
-- for every caller-chosen state before deciding that the peer was over limit.
-- Rejected traffic could therefore amplify DB writes and row cardinality. This
-- draft keeps the two-argument RPC for a zero-downtime Edge rollout, but the
-- state hash is shape-checked only. One-time replay enforcement remains in the
-- durable oauth_naver_states consume RPC.
--
-- Keep both Naver feature gates OFF while applying this draft. No top-level
-- BEGIN/COMMIT: the Supabase migration runner owns the transaction.

SET LOCAL lock_timeout = '5s';

-- Remove the attacker-cardinality ledger before narrowing its constraint.
DELETE FROM public.oauth_preauth_rate_limits
 WHERE provider = 'naver'
   AND dimension = 'state_10m';

ALTER TABLE public.oauth_preauth_rate_limits
  DROP CONSTRAINT oauth_preauth_rate_limits_dimension_check;
ALTER TABLE public.oauth_preauth_rate_limits
  ADD CONSTRAINT oauth_preauth_rate_limits_dimension_check
  CHECK (dimension IN ('global_minute', 'ip_minute', 'ip_hour', 'subject_hour'));

-- 0183 keyed the ledger by window, retaining another row for the same peer in
-- every window. Preserve only the newest historical counter before changing to
-- one reusable row per bounded key.
WITH ranked AS (
  SELECT
    ctid,
    pg_catalog.row_number() OVER (
      PARTITION BY provider, dimension, key_hash
      ORDER BY window_start DESC, updated_at DESC, ctid DESC
    ) AS ordinal
  FROM public.oauth_preauth_rate_limits
)
DELETE FROM public.oauth_preauth_rate_limits AS limits
USING ranked
WHERE limits.ctid = ranked.ctid
  AND ranked.ordinal > 1;

ALTER TABLE public.oauth_preauth_rate_limits
  DROP CONSTRAINT oauth_preauth_rate_limits_pkey;
ALTER TABLE public.oauth_preauth_rate_limits
  ADD CONSTRAINT oauth_preauth_rate_limits_pkey
  PRIMARY KEY (provider, dimension, key_hash);

-- Production accepts one exact HTTPS callback. Remove any expired development
-- allowance from the durable DB contract as well as the Edge/client allowlist.
DELETE FROM public.oauth_naver_states
 WHERE redirect_uri <> 'https://simon-yhkim.github.io/2nd-B/oauth-callback';
ALTER TABLE public.oauth_naver_states
  DROP CONSTRAINT oauth_naver_states_redirect_uri_check;
ALTER TABLE public.oauth_naver_states
  ADD CONSTRAINT oauth_naver_states_redirect_uri_check
  CHECK (redirect_uri = 'https://simon-yhkim.github.io/2nd-B/oauth-callback');

CREATE OR REPLACE FUNCTION public.consume_oauth_naver_rate_limit(
  p_ip_hash text,
  p_state_hash text
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz;
  v_minute_start timestamptz;
  v_hour_start timestamptz;
  v_global_key constant text := pg_catalog.repeat('0', 64);
  v_global_count integer;
  v_ip_minute_count integer;
  v_ip_hour_count integer;
  v_retry integer := 0;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'oauth_naver_rate_limit_key_invalid' USING ERRCODE = '22023';
  END IF;

  -- Serialize the fleet-wide decision before allocating any peer-keyed row.
  -- A denied distributed burst therefore cannot grow table cardinality.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oauth_naver_rate_limit:global', 0)
  );
  v_now := pg_catalog.clock_timestamp();
  v_minute_start := pg_catalog.date_trunc('minute', v_now);
  v_hour_start := pg_catalog.date_trunc('hour', v_now);

  -- Check the shared ceiling before allocating a new peer key. The advisory
  -- lock makes this read authoritative until the eventual admitted increment.
  SELECT CASE
           WHEN limits.window_start = v_minute_start THEN limits.request_count
           ELSE 0
         END
    INTO v_global_count
    FROM public.oauth_preauth_rate_limits AS limits
   WHERE limits.provider = 'naver'
     AND limits.dimension = 'global_minute'
     AND limits.key_hash = v_global_key;
  v_global_count := COALESCE(v_global_count, 0);

  IF v_global_count >= 600 THEN
    RETURN QUERY SELECT false, GREATEST(
      1,
      LEAST(
        60,
        pg_catalog.ceil(
          EXTRACT(EPOCH FROM (v_minute_start + INTERVAL '1 minute' - v_now))
        )::integer
      )
    );
    RETURN;
  END IF;

  -- Cleanup is bounded on the attacker-triggerable path. Rows are reused
  -- across windows, and no request may delete more than 32 stale keys.
  DELETE FROM public.oauth_preauth_rate_limits AS limits
  USING (
    SELECT stale.provider, stale.dimension, stale.key_hash
      FROM public.oauth_preauth_rate_limits AS stale
     WHERE stale.provider = 'naver'
       AND (
         (stale.dimension = 'subject_hour' AND stale.updated_at < v_now - INTERVAL '48 hours')
         OR (stale.dimension <> 'subject_hour' AND stale.updated_at < v_now - INTERVAL '2 hours')
       )
     ORDER BY stale.updated_at, stale.dimension, stale.key_hash
     LIMIT 32
     FOR UPDATE OF stale SKIP LOCKED
  ) AS stale
  WHERE limits.provider = stale.provider
    AND limits.dimension = stale.dimension
    AND limits.key_hash = stale.key_hash
    -- Recheck staleness on the row DELETE will affect. The locked candidate
    -- cannot race a subject-hour UPSERT and erase a freshly incremented cap.
    AND (
      (limits.dimension = 'subject_hour' AND limits.updated_at < v_now - INTERVAL '48 hours')
      OR (limits.dimension <> 'subject_hour' AND limits.updated_at < v_now - INTERVAL '2 hours')
    );

  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'ip_minute', p_ip_hash, v_minute_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN limits.window_start = EXCLUDED.window_start
        THEN LEAST(limits.request_count + 1, 11)
      ELSE 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_ip_minute_count;

  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'ip_hour', p_ip_hash, v_hour_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN limits.window_start = EXCLUDED.window_start
        THEN LEAST(limits.request_count + 1, 61)
      ELSE 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_ip_hour_count;

  IF v_ip_minute_count > 10 THEN
    v_retry := GREATEST(
      v_retry,
      pg_catalog.ceil(
        EXTRACT(EPOCH FROM (v_minute_start + INTERVAL '1 minute' - v_now))
      )::integer
    );
  END IF;
  IF v_ip_hour_count > 60 THEN
    v_retry := GREATEST(
      v_retry,
      pg_catalog.ceil(
        EXTRACT(EPOCH FROM (v_hour_start + INTERVAL '1 hour' - v_now))
      )::integer
    );
  END IF;

  -- An over-limit peer must not be able to burn the fleet-wide budget.
  IF v_retry > 0 THEN
    RETURN QUERY SELECT false, v_retry;
    RETURN;
  END IF;

  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'global_minute', v_global_key, v_minute_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN limits.window_start = EXCLUDED.window_start
        THEN LEAST(limits.request_count + 1, 600)
      ELSE 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_global_count;

  RETURN QUERY SELECT true, 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_oauth_naver_subject_rate_limit(
  p_subject_hash text
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_hour_start timestamptz := pg_catalog.date_trunc('hour', v_now);
  v_subject_count integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'oauth_naver_subject_rate_limit_key_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.oauth_preauth_rate_limits AS limits (
    provider, dimension, key_hash, window_start, request_count, updated_at
  ) VALUES ('naver', 'subject_hour', p_subject_hash, v_hour_start, 1, v_now)
  ON CONFLICT (provider, dimension, key_hash)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN limits.window_start = EXCLUDED.window_start
        THEN LEAST(limits.request_count + 1, 21)
      ELSE 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_subject_count;

  RETURN QUERY SELECT
    v_subject_count <= 20,
    CASE
      WHEN v_subject_count <= 20 THEN 0
      ELSE GREATEST(
        1,
        LEAST(
          3600,
          pg_catalog.ceil(
            EXTRACT(EPOCH FROM (v_hour_start + INTERVAL '1 hour' - v_now))
          )::integer
        )
      )
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_oauth_naver_state(
  p_state_hash text,
  p_redirect_uri text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_inserted integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$'
     OR p_redirect_uri IS DISTINCT FROM
       'https://simon-yhkim.github.io/2nd-B/oauth-callback' THEN
    RAISE EXCEPTION 'oauth_naver_state_invalid' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.oauth_naver_states AS states
  USING (
    SELECT stale.state_hash
      FROM public.oauth_naver_states AS stale
     WHERE stale.expires_at <= v_now
     ORDER BY stale.expires_at, stale.state_hash
     LIMIT 64
  ) AS stale
  WHERE states.state_hash = stale.state_hash;

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
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_consumed integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$'
     OR p_redirect_uri IS DISTINCT FROM
       'https://simon-yhkim.github.io/2nd-B/oauth-callback' THEN
    RAISE EXCEPTION 'oauth_naver_state_invalid' USING ERRCODE = '22023';
  END IF;

  -- DELETE ... RETURNING remains the one-time consume. Concurrent callbacks
  -- can never both observe success.
  DELETE FROM public.oauth_naver_states
   WHERE state_hash = p_state_hash
     AND redirect_uri = p_redirect_uri
     AND expires_at > v_now;
  GET DIAGNOSTICS v_consumed = ROW_COUNT;

  DELETE FROM public.oauth_naver_states AS states
  USING (
    SELECT stale.state_hash
      FROM public.oauth_naver_states AS stale
     WHERE stale.expires_at <= v_now
     ORDER BY stale.expires_at, stale.state_hash
     LIMIT 64
  ) AS stale
  WHERE states.state_hash = stale.state_hash;

  RETURN v_consumed = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_naver_rate_limit(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_oauth_naver_subject_rate_limit(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.issue_oauth_naver_state(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_oauth_naver_state(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_naver_rate_limit(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_naver_subject_rate_limit(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_oauth_naver_state(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_naver_state(text, text)
  TO service_role;

COMMENT ON FUNCTION public.consume_oauth_naver_rate_limit(text, text) IS
  'Service-only global/peer Naver pre-auth limiter; state arg retained for rollout compatibility only.';
COMMENT ON FUNCTION public.consume_oauth_naver_subject_rate_limit(text) IS
  'Service-only 20/hour quota for an HMAC-bound Naver provider subject.';
COMMENT ON FUNCTION public.issue_oauth_naver_state(text, text) IS
  'Service-only exact-production redirect state issue with bounded stale cleanup.';
COMMENT ON FUNCTION public.consume_oauth_naver_state(text, text) IS
  'Service-only exact-production redirect one-time consume with bounded stale cleanup.';

DO $postconditions$
DECLARE
  v_function text;
  v_dimension_check text;
  v_redirect_check text;
  v_primary_key text;
  v_peer_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO v_dimension_check
    FROM pg_catalog.pg_constraint
   WHERE conrelid = 'public.oauth_preauth_rate_limits'::regclass
     AND conname = 'oauth_preauth_rate_limits_dimension_check';
  SELECT pg_catalog.pg_get_functiondef(
           'public.consume_oauth_naver_rate_limit(text,text)'::regprocedure
         )
    INTO v_peer_definition;
  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO v_redirect_check
    FROM pg_catalog.pg_constraint
   WHERE conrelid = 'public.oauth_naver_states'::regclass
     AND conname = 'oauth_naver_states_redirect_uri_check';
  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO v_primary_key
    FROM pg_catalog.pg_constraint
   WHERE conrelid = 'public.oauth_preauth_rate_limits'::regclass
     AND conname = 'oauth_preauth_rate_limits_pkey';

  IF v_dimension_check IS NULL
     OR v_dimension_check NOT LIKE '%global_minute%'
     OR v_dimension_check NOT LIKE '%subject_hour%'
     OR v_dimension_check LIKE '%state_10m%'
     OR v_redirect_check IS NULL
     OR v_redirect_check LIKE '%localhost%'
     OR v_redirect_check NOT LIKE '%https://simon-yhkim.github.io/2nd-B/oauth-callback%'
     OR v_primary_key IS DISTINCT FROM 'PRIMARY KEY (provider, dimension, key_hash)'
     OR v_peer_definition LIKE '%VALUES (''naver'', ''state_10m''%'
     OR EXISTS (
       SELECT 1
         FROM public.oauth_preauth_rate_limits
        WHERE provider = 'naver'
          AND dimension = 'state_10m'
     )
     THEN
    RAISE EXCEPTION 'oauth naver limiter schema postcondition failed';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.consume_oauth_naver_rate_limit(text,text)',
    'public.consume_oauth_naver_subject_rate_limit(text)',
    'public.issue_oauth_naver_state(text,text)',
    'public.consume_oauth_naver_state(text,text)'
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
            AND EXISTS (
              SELECT 1
                FROM pg_catalog.unnest(proconfig) AS setting(value)
               WHERE setting.value = 'lock_timeout=5s'
            )
       ) THEN
      RAISE EXCEPTION 'oauth naver limiter function postcondition failed: %', v_function;
    END IF;
  END LOOP;
END
$postconditions$;
