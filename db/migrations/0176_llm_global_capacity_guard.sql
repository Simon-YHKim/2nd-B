-- 0176_llm_global_capacity_guard.sql
-- Integration candidate only: re-scan remote and local migration
-- reservations immediately before push; renumber again if precedence changed.
-- Global and provider-specific LLM cost circuit breaker.
--
-- gemini_spend_daily remains the per-user/day product backstop shared by the
-- proxies. This ledger is deliberately separate: it serializes every provider
-- before upstream dispatch and guards fleet-wide weighted calls per UTC minute
-- plus active concurrency. A released pre-dispatch reservation stops counting;
-- a settled or abandoned reservation remains in its minute bucket so a crash
-- cannot erase capacity that may already have reached a paid provider.
--
-- Budget values are not embedded here. The proxy must supply all four caps from
-- explicit deployment configuration. Missing, non-positive, or internally
-- inconsistent values fail closed in the RPC before a reservation is created.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.llm_proxy_capacity_reservations (
  reservation_id  uuid PRIMARY KEY,
  provider        text NOT NULL,
  model           text NOT NULL,
  weight          integer NOT NULL,
  utc_minute      timestamp without time zone NOT NULL,
  status          text NOT NULL DEFAULT 'reserved',
  lease_expires_at timestamptz NOT NULL,
  settled_at      timestamptz,
  released_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT llm_capacity_provider_known CHECK (
    provider IN ('gemini', 'claude', 'openai', 'xai')
  ),
  CONSTRAINT llm_capacity_model_format CHECK (
    char_length(model) BETWEEN 1 AND 128
    AND model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
  ),
  CONSTRAINT llm_capacity_weight_positive CHECK (weight > 0),
  CONSTRAINT llm_capacity_utc_minute_exact CHECK (
    utc_minute = date_trunc('minute', utc_minute)
  ),
  CONSTRAINT llm_capacity_status_known CHECK (
    status IN ('reserved', 'settled', 'released')
  ),
  CONSTRAINT llm_capacity_lease_after_create CHECK (
    lease_expires_at > created_at
  ),
  CONSTRAINT llm_capacity_terminal_timestamp_shape CHECK (
    (status = 'reserved' AND settled_at IS NULL AND released_at IS NULL)
    OR (status = 'settled' AND settled_at IS NOT NULL AND released_at IS NULL)
    OR (status = 'released' AND settled_at IS NULL AND released_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS llm_capacity_minute_provider_idx
  ON public.llm_proxy_capacity_reservations
  (utc_minute, provider, status)
  INCLUDE (weight);

CREATE INDEX IF NOT EXISTS llm_capacity_active_provider_idx
  ON public.llm_proxy_capacity_reservations
  (status, lease_expires_at, provider);

ALTER TABLE public.llm_proxy_capacity_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_proxy_capacity_reservations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_proxy_capacity_reservations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_llm_proxy_capacity(
  p_reservation_id uuid,
  p_provider text,
  p_model text,
  p_weight integer,
  p_global_minute_weight_cap integer,
  p_provider_minute_weight_cap integer,
  p_global_concurrency_cap integer,
  p_provider_concurrency_cap integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_minute timestamp without time zone;
  v_lease_expires_at timestamptz;
  v_existing public.llm_proxy_capacity_reservations%ROWTYPE;
  v_global_minute_weight bigint;
  v_provider_minute_weight bigint;
  v_global_inflight bigint;
  v_provider_inflight bigint;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'reservation_id required' USING ERRCODE = '22004';
  END IF;
  IF p_provider IS NULL
     OR p_provider NOT IN ('gemini', 'claude', 'openai', 'xai') THEN
    RAISE EXCEPTION 'invalid LLM provider' USING ERRCODE = '22023';
  END IF;
  IF p_model IS NULL
     OR p_model != btrim(p_model)
     OR char_length(p_model) NOT BETWEEN 1 AND 128
     OR p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$' THEN
    RAISE EXCEPTION 'invalid LLM model' USING ERRCODE = '22023';
  END IF;
  IF p_weight IS NULL OR p_weight <= 0 THEN
    RAISE EXCEPTION 'invalid LLM weight' USING ERRCODE = '22023';
  END IF;

  -- These values are required environment configuration at the proxy boundary.
  -- There are deliberately no SQL defaults that could silently open the gate.
  IF p_global_minute_weight_cap IS NULL
     OR p_provider_minute_weight_cap IS NULL
     OR p_global_concurrency_cap IS NULL
     OR p_provider_concurrency_cap IS NULL THEN
    RAISE EXCEPTION 'llm_capacity_config_required' USING ERRCODE = '22004';
  END IF;
  IF p_global_minute_weight_cap <= 0
     OR p_provider_minute_weight_cap <= 0
     OR p_global_concurrency_cap <= 0
     OR p_provider_concurrency_cap <= 0
     OR p_provider_minute_weight_cap > p_global_minute_weight_cap
     OR p_provider_concurrency_cap > p_global_concurrency_cap
     OR p_weight > p_provider_minute_weight_cap THEN
    RAISE EXCEPTION 'llm_capacity_config_invalid' USING ERRCODE = '22023';
  END IF;

  -- The existing operational kill switch remains authoritative. Missing rows
  -- deny, matching bump_gemini_spend's current fail-closed behavior.
  IF COALESCE(
    (
      SELECT rf.enabled
        FROM public.runtime_flags AS rf
       WHERE rf.key = 'llm_enabled'
    ),
    false
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'llm_runtime_disabled' USING ERRCODE = 'P0001';
  END IF;

  -- A single fleet-wide mutex is intentional. All four counters must be read
  -- from one state and followed by one insert; separate provider locks would let
  -- two providers each pass the global cap concurrently.
  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended('llm_proxy_capacity_reserve', 0)
  );

  -- Take wall-clock time only after a possible lock wait. Transaction-start
  -- time could otherwise stamp an old bucket or an already-expired lease under
  -- exactly the burst load this guard exists to contain.
  v_now := clock_timestamp();
  v_minute := date_trunc('minute', v_now AT TIME ZONE 'UTC');
  -- All current provider requests have a 30-second timeout. One UTC-minute
  -- lease leaves a full timeout of margin while ensuring a crashed isolate
  -- cannot occupy a concurrency slot indefinitely.
  v_lease_expires_at := v_now + make_interval(mins => 1);

  SELECT * INTO v_existing
    FROM public.llm_proxy_capacity_reservations
   WHERE reservation_id = p_reservation_id;

  IF FOUND THEN
    IF v_existing.provider IS DISTINCT FROM p_provider
       OR v_existing.model IS DISTINCT FROM p_model
       OR v_existing.weight IS DISTINCT FROM p_weight THEN
      RAISE EXCEPTION 'llm_capacity_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;
    -- Never grant a second upstream dispatch for a replayed request id. The
    -- caller can inspect status for diagnostics, but only accepted=true may run.
    RETURN jsonb_build_object(
      'reservation_id', v_existing.reservation_id,
      'status', v_existing.status,
      'accepted', false,
      'existing', true,
      'utc_minute', v_existing.utc_minute,
      'lease_expires_at', v_existing.lease_expires_at
    );
  END IF;

  SELECT COALESCE(sum(weight), 0)
    INTO v_global_minute_weight
    FROM public.llm_proxy_capacity_reservations
   WHERE status IN ('reserved', 'settled') AND utc_minute = v_minute;

  SELECT COALESCE(sum(weight), 0)
    INTO v_provider_minute_weight
    FROM public.llm_proxy_capacity_reservations
   WHERE provider = p_provider AND status IN ('reserved', 'settled')
     AND utc_minute = v_minute;

  SELECT count(*)
    INTO v_global_inflight
    FROM public.llm_proxy_capacity_reservations
   WHERE status = 'reserved' AND lease_expires_at > v_now;

  SELECT count(*)
    INTO v_provider_inflight
    FROM public.llm_proxy_capacity_reservations
   WHERE provider = p_provider AND status = 'reserved'
     AND lease_expires_at > v_now;

  -- Subtraction follows validation that weight <= provider <= global, avoiding
  -- addition overflow while testing whether this request still fits.
  IF v_global_minute_weight > p_global_minute_weight_cap - p_weight
     OR v_provider_minute_weight > p_provider_minute_weight_cap - p_weight
     OR v_global_inflight >= p_global_concurrency_cap
     OR v_provider_inflight >= p_provider_concurrency_cap THEN
    RAISE EXCEPTION 'llm_capacity_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.llm_proxy_capacity_reservations
    (reservation_id, provider, model, weight, utc_minute, status,
     lease_expires_at, created_at, updated_at)
  VALUES
    (p_reservation_id, p_provider, p_model, p_weight, v_minute, 'reserved',
     v_lease_expires_at, v_now, v_now);

  RETURN jsonb_build_object(
    'reservation_id', p_reservation_id,
    'status', 'reserved',
    'accepted', true,
    'existing', false,
    'utc_minute', v_minute,
    'lease_expires_at', v_lease_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_llm_proxy_capacity(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_done boolean;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_reservation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.llm_proxy_capacity_reservations
     SET status = 'settled', settled_at = now(), updated_at = now()
   WHERE reservation_id = p_reservation_id
     AND status = 'reserved'
  RETURNING true INTO v_done;

  IF COALESCE(v_done, false) THEN RETURN true; END IF;
  SELECT status = 'settled' INTO v_done
    FROM public.llm_proxy_capacity_reservations
   WHERE reservation_id = p_reservation_id;
  RETURN COALESCE(v_done, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_llm_proxy_capacity(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_done boolean;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_reservation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.llm_proxy_capacity_reservations
     SET status = 'released', released_at = now(), updated_at = now()
   WHERE reservation_id = p_reservation_id
     AND status = 'reserved'
  RETURNING true INTO v_done;

  IF COALESCE(v_done, false) THEN RETURN true; END IF;
  SELECT status = 'released' INTO v_done
    FROM public.llm_proxy_capacity_reservations
   WHERE reservation_id = p_reservation_id;
  RETURN COALESCE(v_done, false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_llm_proxy_capacity(uuid, text, text, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_llm_proxy_capacity(uuid, text, text, integer, integer, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.settle_llm_proxy_capacity(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_llm_proxy_capacity(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_llm_proxy_capacity(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_llm_proxy_capacity(uuid) TO service_role;

DO $verify$
BEGIN
  IF has_table_privilege(
       'anon',
       'public.llm_proxy_capacity_reservations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated',
       'public.llm_proxy_capacity_reservations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role',
       'public.llm_proxy_capacity_reservations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class c
        WHERE c.oid = 'public.llm_proxy_capacity_reservations'::regclass
     ), false)
     OR has_function_privilege('anon', 'public.reserve_llm_proxy_capacity(uuid,text,text,integer,integer,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_llm_proxy_capacity(uuid,text,text,integer,integer,integer,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reserve_llm_proxy_capacity(uuid,text,text,integer,integer,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.settle_llm_proxy_capacity(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.settle_llm_proxy_capacity(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.settle_llm_proxy_capacity(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.release_llm_proxy_capacity(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.release_llm_proxy_capacity(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.release_llm_proxy_capacity(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LLM capacity guard ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

COMMIT;
