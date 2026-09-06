-- Provisional 0170: durable pre-capability limiter for the no-account peer
-- responder. The Edge function sends only a secret-keyed network fingerprint;
-- raw network hints and invitation capabilities never enter this ledger.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.peer_response_rate_limits (
  dimension text NOT NULL
    CONSTRAINT peer_response_rate_limits_dimension_check
      CHECK (dimension IN ('global', 'key')),
  action text NOT NULL
    CONSTRAINT peer_response_rate_limits_action_check
      CHECK (action IN ('load', 'submit', 'withdraw')),
  key_hash text NOT NULL
    CONSTRAINT peer_response_rate_limits_key_hash_check
      CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL
    CONSTRAINT peer_response_rate_limits_count_check
      CHECK (request_count BETWEEN 1 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peer_response_rate_limits_window_check
    CHECK (window_start = pg_catalog.date_trunc('minute', window_start)),
  CONSTRAINT peer_response_rate_limits_pkey
    PRIMARY KEY (dimension, action, key_hash)
);

-- One row is reused for each action/key across minute windows. This partial
-- index keeps the bounded, opportunistic stale-key cleanup index-only ordered.
CREATE INDEX IF NOT EXISTS peer_response_rate_limits_cleanup_idx
  ON public.peer_response_rate_limits (action, updated_at, key_hash)
  WHERE dimension = 'key';

ALTER TABLE public.peer_response_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_response_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.peer_response_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_peer_response_rate_limit(
  p_action text,
  p_key_hash text
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz;
  v_window_start timestamptz;
  v_global_key constant text := pg_catalog.repeat('0', 64);
  v_global_cap integer;
  v_key_cap integer;
  v_global_count integer;
  v_key_count integer;
  v_retry integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('load', 'submit', 'withdraw') THEN
    RAISE EXCEPTION 'peer_response_rate_limit_action_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'peer_response_rate_limit_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  CASE p_action
    WHEN 'load' THEN
      v_global_cap := 600;
      v_key_cap := 30;
    WHEN 'submit' THEN
      v_global_cap := 120;
      v_key_cap := 6;
    WHEN 'withdraw' THEN
      v_global_cap := 120;
      v_key_cap := 6;
  END CASE;

  -- Every action takes its fleet-wide lock before any keyed lock. Besides
  -- making both decisions atomic, this prevents opposing key/global lock order
  -- from deadlocking under a distributed burst.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'peer_response_rate_limit:global:' || p_action,
      0
    )
  );

  -- Take wall-clock time after waiting for the action lock. A transaction-start
  -- timestamp could otherwise charge a burst to a window that already ended.
  v_now := pg_catalog.clock_timestamp();
  v_window_start := pg_catalog.date_trunc('minute', v_now);

  INSERT INTO public.peer_response_rate_limits AS limits (
    dimension, action, key_hash, window_start, request_count, updated_at
  ) VALUES ('global', p_action, v_global_key, v_window_start, 1, v_now)
  ON CONFLICT (dimension, action, key_hash)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN limits.window_start = EXCLUDED.window_start
        THEN LEAST(limits.request_count + 1, v_global_cap + 1)
      ELSE 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_global_count;

  -- Never perform an unbounded DELETE on an attacker-triggerable path. Reuse
  -- rows across windows and remove at most 32 stale keyed rows for this action.
  DELETE FROM public.peer_response_rate_limits AS limits
  USING (
    SELECT stale.action, stale.key_hash
      FROM public.peer_response_rate_limits AS stale
     WHERE stale.dimension = 'key'
       AND stale.action = p_action
       AND stale.updated_at < v_now - INTERVAL '15 minutes'
     ORDER BY stale.updated_at, stale.key_hash
     LIMIT 32
  ) AS stale
  WHERE limits.dimension = 'key'
    AND limits.action = stale.action
    AND limits.key_hash = stale.key_hash;

  v_retry := GREATEST(
    1,
    LEAST(
      60,
      pg_catalog.ceil(
        EXTRACT(EPOCH FROM (v_window_start + INTERVAL '1 minute' - v_now))
      )::integer
    )
  );

  -- Once the global ceiling is crossed, do not allocate a row for a new
  -- attacker-controlled key. This bounds ledger cardinality per active window.
  IF v_global_count > v_global_cap THEN
    RETURN QUERY SELECT false AS allowed, v_retry AS retry_after_seconds;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'peer_response_rate_limit:key:' || p_action || ':' || p_key_hash,
      0
    )
  );

  INSERT INTO public.peer_response_rate_limits AS limits (
    dimension, action, key_hash, window_start, request_count, updated_at
  ) VALUES ('key', p_action, p_key_hash, v_window_start, 1, v_now)
  ON CONFLICT (dimension, action, key_hash)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN limits.window_start = EXCLUDED.window_start
        THEN LEAST(limits.request_count + 1, v_key_cap + 1)
      ELSE 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_key_count;

  RETURN QUERY SELECT
    (v_key_count <= v_key_cap) AS allowed,
    (CASE WHEN v_key_count <= v_key_cap THEN 0 ELSE v_retry END)
      AS retry_after_seconds;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_peer_response_rate_limit(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_peer_response_rate_limit(text, text)
  TO service_role;

COMMENT ON FUNCTION public.consume_peer_response_rate_limit(text, text) IS
  'Service-only peer responder limiter with action global/key minute ceilings.';

DO $postconditions$
BEGIN
  IF pg_catalog.to_regclass('public.peer_response_rate_limits') IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_class
        WHERE oid = 'public.peer_response_rate_limits'::regclass
          AND relrowsecurity
          AND relforcerowsecurity
     )
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_policy
        WHERE polrelid = 'public.peer_response_rate_limits'::regclass
     )
     OR has_table_privilege(
       'anon', 'public.peer_response_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.peer_response_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role', 'public.peer_response_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_function_privilege(
       'anon', 'public.consume_peer_response_rate_limit(text,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.consume_peer_response_rate_limit(text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.consume_peer_response_rate_limit(text,text)',
       'EXECUTE'
     )
     OR (
       SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.peer_response_rate_limits'::regclass
          AND conname IN (
            'peer_response_rate_limits_dimension_check',
            'peer_response_rate_limits_action_check',
            'peer_response_rate_limits_key_hash_check',
            'peer_response_rate_limits_count_check',
            'peer_response_rate_limits_window_check',
            'peer_response_rate_limits_pkey'
          )
     ) <> 6
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index AS i
         JOIN pg_catalog.pg_class AS c ON c.oid = i.indexrelid
        WHERE c.relname = 'peer_response_rate_limits_cleanup_idx'
          AND i.indrelid = 'public.peer_response_rate_limits'::regclass
          AND i.indisvalid
          AND i.indpred IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_proc
        WHERE oid = 'public.consume_peer_response_rate_limit(text,text)'::regprocedure
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
    RAISE EXCEPTION '0170 peer response limiter postcondition failed';
  END IF;
END
$postconditions$;

COMMIT;
