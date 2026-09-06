-- 0181_client_audit_ingest_hardening.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Bound and label the authenticated-client audit ingress. Client RPC rows are
-- useful delivery evidence, but a modified client can fabricate their fields;
-- only service-role Edge writers may explicitly mark a row server_verified.

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.ai_audit_log
  ADD COLUMN IF NOT EXISTS event_source text NOT NULL DEFAULT 'legacy_unknown';
ALTER TABLE public.crisis_events
  ADD COLUMN IF NOT EXISTS event_source text NOT NULL DEFAULT 'legacy_unknown';

-- Fail safe for every future writer: an omitted provenance marker is never
-- treated as authoritative. Edge functions set server_verified explicitly.
ALTER TABLE public.ai_audit_log
  ALTER COLUMN event_source SET DEFAULT 'client_unverified';
ALTER TABLE public.crisis_events
  ALTER COLUMN event_source SET DEFAULT 'client_unverified';

ALTER TABLE public.ai_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crisis_events FORCE ROW LEVEL SECURITY;

-- Authenticated clients write through the four owner-stamping RPCs below.
-- Preserve read-only audit history access while making provenance impossible
-- to choose through a direct table mutation, even if default grants drift.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.ai_audit_log FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.crisis_events FROM PUBLIC, anon, authenticated;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.ai_audit_log'::regclass
       AND conname = 'ai_audit_log_event_source_check'
  ) THEN
    ALTER TABLE public.ai_audit_log
      ADD CONSTRAINT ai_audit_log_event_source_check
      CHECK (event_source IN ('server_verified', 'client_unverified', 'legacy_unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.crisis_events'::regclass
       AND conname = 'crisis_events_event_source_check'
  ) THEN
    ALTER TABLE public.crisis_events
      ADD CONSTRAINT crisis_events_event_source_check
      CHECK (event_source IN ('server_verified', 'client_unverified', 'legacy_unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.ai_audit_log'::regclass
       AND conname = 'ai_audit_log_client_payload_bounds'
  ) THEN
    ALTER TABLE public.ai_audit_log
      ADD CONSTRAINT ai_audit_log_client_payload_bounds
      CHECK (
        event_source <> 'client_unverified'
        OR (
          prompt_hash ~ '^[0-9a-f]{0,8}$'
          AND output_hash ~ '^[0-9a-f]{0,8}$'
          AND pg_catalog.char_length(model_used) BETWEEN 1 AND 128
          AND pg_catalog.octet_length(model_used) <= 512
          AND latency_ms BETWEEN 0 AND 3600000
          AND (purpose IS NULL OR pg_catalog.char_length(purpose) <= 64)
          AND (reasoning_vendor IS NULL OR reasoning_vendor IN ('gemini', 'claude', 'openai', 'xai'))
          AND (reasoning_effort IS NULL OR reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'none'))
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.crisis_events'::regclass
       AND conname = 'crisis_events_client_payload_bounds'
  ) THEN
    ALTER TABLE public.crisis_events
      ADD CONSTRAINT crisis_events_client_payload_bounds
      CHECK (
        event_source <> 'client_unverified'
        OR (
          classifier_confidence IS NOT NULL
          AND classifier_confidence BETWEEN 0 AND 1
          AND pg_catalog.cardinality(trigger_categories) <= 16
          AND pg_catalog.char_length(routing_template_version) BETWEEN 1 AND 128
          AND pg_catalog.octet_length(routing_template_version) <= 512
        )
      ) NOT VALID;
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS ai_audit_log_client_owner_created_idx
  ON public.ai_audit_log (user_id, created_at DESC)
  WHERE event_source = 'client_unverified';
CREATE INDEX IF NOT EXISTS crisis_events_client_owner_created_idx
  ON public.crisis_events (user_id_hash, created_at DESC)
  WHERE event_source = 'client_unverified';

COMMENT ON COLUMN public.ai_audit_log.event_source IS
  'Provenance: server_verified is explicit service-role evidence; client_unverified is attacker-modifiable client evidence; legacy_unknown predates 0181.';
COMMENT ON COLUMN public.crisis_events.event_source IS
  'Provenance: server_verified is explicit service-role evidence; client_unverified is attacker-modifiable client evidence; legacy_unknown predates 0181.';

CREATE OR REPLACE FUNCTION public.assert_client_ai_audit_payload(
  p_prompt_hash text,
  p_output_hash text,
  p_model_used text,
  p_vertex_backend boolean,
  p_safety_zone text,
  p_latency_ms integer,
  p_purpose text,
  p_reasoning_vendor text,
  p_reasoning_effort text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_prompt_hash IS NULL
     OR p_prompt_hash !~ '^[0-9a-f]{0,8}$'
     OR p_output_hash IS NULL
     OR p_output_hash !~ '^[0-9a-f]{0,8}$'
     OR p_model_used IS NULL
     OR pg_catalog.char_length(p_model_used) NOT BETWEEN 1 AND 128
     OR pg_catalog.octet_length(p_model_used) > 512
     OR p_model_used ~ '[[:cntrl:]]'
     OR p_vertex_backend IS NULL
     OR p_safety_zone NOT IN ('green', 'yellow', 'red')
     OR p_latency_ms IS NULL
     OR p_latency_ms NOT BETWEEN 0 AND 3600000
     OR (
       p_purpose IS NOT NULL
       AND (
         pg_catalog.char_length(p_purpose) > 64
         OR pg_catalog.octet_length(p_purpose) > 256
         OR p_purpose ~ '[[:cntrl:]]'
       )
     )
     OR (
       p_reasoning_vendor IS NOT NULL
       AND p_reasoning_vendor NOT IN ('gemini', 'claude', 'openai', 'xai')
     )
     OR (
       p_reasoning_effort IS NOT NULL
       AND p_reasoning_effort NOT IN ('low', 'medium', 'high', 'xhigh', 'max', 'none')
     ) THEN
    RAISE EXCEPTION 'client_ai_audit_payload_invalid'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_client_crisis_event_payload(
  p_classifier_confidence numeric,
  p_trigger_categories text[],
  p_routing_template_version text,
  p_locale text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_category text;
BEGIN
  IF p_classifier_confidence IS NULL
     OR p_classifier_confidence NOT BETWEEN 0 AND 1
     OR p_trigger_categories IS NULL
     OR COALESCE(pg_catalog.array_ndims(p_trigger_categories), 1) <> 1
     OR pg_catalog.cardinality(p_trigger_categories) > 16
     OR p_routing_template_version IS NULL
     OR pg_catalog.char_length(p_routing_template_version) NOT BETWEEN 1 AND 128
     OR pg_catalog.octet_length(p_routing_template_version) > 512
     OR p_routing_template_version ~ '[[:cntrl:]]'
     OR p_locale NOT IN ('ko', 'en') THEN
    RAISE EXCEPTION 'client_crisis_event_payload_invalid'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_category IN ARRAY p_trigger_categories LOOP
    IF v_category IS NULL
       OR pg_catalog.char_length(v_category) NOT BETWEEN 1 AND 64
       OR pg_catalog.octet_length(v_category) > 256
       OR v_category ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'client_crisis_event_payload_invalid'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_client_audit_ingest_rate(
  p_owner uuid,
  p_kind text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_burst_count bigint;
  v_daily_count bigint;
  v_burst_limit integer;
  v_daily_limit integer;
  v_owner_hash text;
BEGIN
  IF p_owner IS NULL OR p_kind NOT IN ('ai', 'crisis') THEN
    RAISE EXCEPTION 'client_audit_rate_guard_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('secondb:client-audit:' || p_kind || ':' || p_owner::text, 0)
  );

  IF p_kind = 'ai' THEN
    v_burst_limit := 120;
    v_daily_limit := 2000;
    SELECT
      pg_catalog.count(*) FILTER (WHERE created_at >= v_now - INTERVAL '10 minutes'),
      pg_catalog.count(*)
      INTO v_burst_count, v_daily_count
      FROM public.ai_audit_log
     WHERE user_id = p_owner
       AND event_source = 'client_unverified'
       AND created_at >= v_now - INTERVAL '24 hours';
  ELSE
    v_burst_limit := 30;
    v_daily_limit := 200;
    v_owner_hash := pg_catalog.md5(p_owner::text);
    SELECT
      pg_catalog.count(*) FILTER (WHERE created_at >= v_now - INTERVAL '10 minutes'),
      pg_catalog.count(*)
      INTO v_burst_count, v_daily_count
      FROM public.crisis_events
     WHERE user_id_hash = v_owner_hash
       AND event_source = 'client_unverified'
       AND created_at >= v_now - INTERVAL '24 hours';
  END IF;

  IF v_burst_count >= v_burst_limit OR v_daily_count >= v_daily_limit THEN
    RAISE EXCEPTION 'client_audit_rate_limited'
      USING ERRCODE = '54000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_ai_audit_payload(text, text, text, boolean, text, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_client_ai_audit_payload(text, text, text, boolean, text, integer, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.assert_client_ai_audit_payload(text, text, text, boolean, text, integer, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.assert_client_ai_audit_payload(text, text, text, boolean, text, integer, text, text, text) FROM service_role;

REVOKE ALL ON FUNCTION public.assert_client_crisis_event_payload(numeric, text[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_client_crisis_event_payload(numeric, text[], text, text) FROM anon;
REVOKE ALL ON FUNCTION public.assert_client_crisis_event_payload(numeric, text[], text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.assert_client_crisis_event_payload(numeric, text[], text, text) FROM service_role;

REVOKE ALL ON FUNCTION public.enforce_client_audit_ingest_rate(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_client_audit_ingest_rate(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.enforce_client_audit_ingest_rate(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_client_audit_ingest_rate(uuid, text) FROM service_role;

CREATE OR REPLACE FUNCTION public.log_ai_audit(
  p_prompt_hash text,
  p_output_hash text,
  p_model_used text,
  p_vertex_backend boolean,
  p_safety_zone text,
  p_latency_ms integer,
  p_purpose text DEFAULT NULL,
  p_reasoning_vendor text DEFAULT NULL,
  p_reasoning_effort text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'log_ai_audit: authentication required'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_client_ai_audit_payload(
    p_prompt_hash, p_output_hash, p_model_used, p_vertex_backend,
    p_safety_zone, p_latency_ms, p_purpose, p_reasoning_vendor,
    p_reasoning_effort
  );
  PERFORM public.enforce_client_audit_ingest_rate(v_owner_id, 'ai');

  INSERT INTO public.ai_audit_log (
    user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone,
    latency_ms, purpose, reasoning_vendor, reasoning_effort, event_source
  ) VALUES (
    v_owner_id, p_prompt_hash, p_output_hash, p_model_used, p_vertex_backend,
    p_safety_zone::public.safety_zone, p_latency_ms,
    NULLIF(pg_catalog.btrim(p_purpose), ''), p_reasoning_vendor,
    p_reasoning_effort, 'client_unverified'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_ai_audit_once(
  p_outbox_event_id text,
  p_prompt_hash text,
  p_output_hash text,
  p_model_used text,
  p_vertex_backend boolean,
  p_safety_zone text,
  p_latency_ms integer,
  p_purpose text DEFAULT NULL,
  p_reasoning_vendor text DEFAULT NULL,
  p_reasoning_effort text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
  v_purpose text;
  v_existing public.ai_audit_log%ROWTYPE;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'log_ai_audit_once: authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF p_outbox_event_id IS NULL
     OR pg_catalog.char_length(p_outbox_event_id) NOT BETWEEN 1 AND 128
     OR p_outbox_event_id !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'invalid_audit_outbox_event_id'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_client_ai_audit_payload(
    p_prompt_hash, p_output_hash, p_model_used, p_vertex_backend,
    p_safety_zone, p_latency_ms, p_purpose, p_reasoning_vendor,
    p_reasoning_effort
  );
  v_purpose := NULLIF(pg_catalog.btrim(p_purpose), '');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('secondb:client-audit:ai:' || v_owner_id::text, 0)
  );
  SELECT * INTO v_existing
    FROM public.ai_audit_log
   WHERE user_id = v_owner_id
     AND outbox_event_id = p_outbox_event_id;
  IF FOUND THEN
    IF v_existing.prompt_hash IS DISTINCT FROM p_prompt_hash
       OR v_existing.output_hash IS DISTINCT FROM p_output_hash
       OR v_existing.model_used IS DISTINCT FROM p_model_used
       OR v_existing.vertex_backend IS DISTINCT FROM p_vertex_backend
       OR v_existing.safety_zone IS DISTINCT FROM p_safety_zone::public.safety_zone
       OR v_existing.latency_ms IS DISTINCT FROM p_latency_ms
       OR v_existing.purpose IS DISTINCT FROM v_purpose
       OR v_existing.reasoning_vendor IS DISTINCT FROM p_reasoning_vendor
       OR v_existing.reasoning_effort IS DISTINCT FROM p_reasoning_effort
       OR v_existing.event_source IS DISTINCT FROM 'client_unverified' THEN
      RAISE EXCEPTION 'audit_outbox_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  PERFORM public.enforce_client_audit_ingest_rate(v_owner_id, 'ai');
  INSERT INTO public.ai_audit_log (
    user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone,
    latency_ms, purpose, reasoning_vendor, reasoning_effort, outbox_event_id,
    event_source
  ) VALUES (
    v_owner_id, p_prompt_hash, p_output_hash, p_model_used, p_vertex_backend,
    p_safety_zone::public.safety_zone, p_latency_ms, v_purpose,
    p_reasoning_vendor, p_reasoning_effort, p_outbox_event_id,
    'client_unverified'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_crisis_event(
  p_classifier_confidence numeric,
  p_trigger_categories text[],
  p_cssrs_level integer,
  p_routing_template_version text,
  p_locale text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'log_crisis_event: authentication required'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_client_crisis_event_payload(
    p_classifier_confidence, p_trigger_categories,
    p_routing_template_version, p_locale
  );
  PERFORM public.enforce_client_audit_ingest_rate(v_owner_id, 'crisis');

  INSERT INTO public.crisis_events (
    user_id_hash, zone, classifier_confidence, trigger_categories,
    routing_template_version, locale, event_source
  ) VALUES (
    pg_catalog.md5(v_owner_id::text), 'red', p_classifier_confidence,
    p_trigger_categories, p_routing_template_version, p_locale,
    'client_unverified'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_crisis_event_once(
  p_outbox_event_id text,
  p_classifier_confidence numeric,
  p_trigger_categories text[],
  p_cssrs_level integer,
  p_routing_template_version text,
  p_locale text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
  v_owner_hash text;
  v_confidence numeric(4,3);
  v_existing public.crisis_events%ROWTYPE;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'log_crisis_event_once: authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF p_outbox_event_id IS NULL
     OR pg_catalog.char_length(p_outbox_event_id) NOT BETWEEN 1 AND 128
     OR p_outbox_event_id !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'invalid_audit_outbox_event_id'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_client_crisis_event_payload(
    p_classifier_confidence, p_trigger_categories,
    p_routing_template_version, p_locale
  );
  v_owner_hash := pg_catalog.md5(v_owner_id::text);
  v_confidence := p_classifier_confidence;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('secondb:client-audit:crisis:' || v_owner_id::text, 0)
  );
  SELECT * INTO v_existing
    FROM public.crisis_events
   WHERE user_id_hash = v_owner_hash
     AND outbox_event_id = p_outbox_event_id;
  IF FOUND THEN
    IF v_existing.zone IS DISTINCT FROM 'red'
       OR v_existing.classifier_confidence IS DISTINCT FROM v_confidence
       OR v_existing.trigger_categories IS DISTINCT FROM p_trigger_categories
       OR v_existing.routing_template_version IS DISTINCT FROM p_routing_template_version
       OR v_existing.locale IS DISTINCT FROM p_locale
       OR v_existing.event_source IS DISTINCT FROM 'client_unverified' THEN
      RAISE EXCEPTION 'crisis_outbox_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  PERFORM public.enforce_client_audit_ingest_rate(v_owner_id, 'crisis');
  INSERT INTO public.crisis_events (
    user_id_hash, zone, classifier_confidence, trigger_categories,
    routing_template_version, locale, outbox_event_id, event_source
  ) VALUES (
    v_owner_hash, 'red', v_confidence, p_trigger_categories,
    p_routing_template_version, p_locale, p_outbox_event_id,
    'client_unverified'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.ai_audit_daily_health AS
SELECT
  pg_catalog.date_trunc('day', created_at) AS day,
  COALESCE(purpose, '(null)') AS purpose,
  COALESCE(reasoning_vendor, '(null)') AS vendor,
  pg_catalog.count(*) AS calls,
  pg_catalog.count(*) FILTER (WHERE safety_zone = 'red') AS red_rows,
  pg_catalog.count(*) FILTER (
    WHERE model_used LIKE '%+refusal'
       OR model_used LIKE '%+truncated'
       OR model_used LIKE '%+blocked'
       OR model_used LIKE '%+empty'
  ) AS degraded_upstream,
  pg_catalog.count(*) FILTER (WHERE model_used = 'lexicon-only') AS semantic_dark_rows,
  pg_catalog.count(*) FILTER (WHERE purpose IS NULL) AS null_purpose_rows,
  pg_catalog.avg(latency_ms)::integer AS avg_latency_ms,
  pg_catalog.sum(total_tokens) AS total_tokens,
  pg_catalog.count(*) FILTER (WHERE event_source = 'client_unverified') AS client_unverified_rows
FROM public.ai_audit_log
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.ai_audit_daily_health IS
  'Operator-only audit rollup. client_unverified_rows must not be treated as server-authoritative provider evidence.';
REVOKE ALL ON public.ai_audit_daily_health FROM PUBLIC;
REVOKE ALL ON public.ai_audit_daily_health FROM anon;
REVOKE ALL ON public.ai_audit_daily_health FROM authenticated;

DO $postconditions$
BEGIN
  IF NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.ai_audit_log'::regclass
     ), false)
     OR NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.crisis_events'::regclass
     ), false)
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute AS a
         JOIN pg_catalog.pg_attrdef AS d
           ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'public.ai_audit_log'::regclass
          AND a.attname = 'event_source'
          AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) =
            '''client_unverified''::text'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute AS a
         JOIN pg_catalog.pg_attrdef AS d
           ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'public.crisis_events'::regclass
          AND a.attname = 'event_source'
          AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) =
            '''client_unverified''::text'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.ai_audit_log'::regclass
          AND conname = 'ai_audit_log_event_source_check'
          AND contype = 'c'
          AND convalidated
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.crisis_events'::regclass
          AND conname = 'crisis_events_event_source_check'
          AND contype = 'c'
          AND convalidated
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.ai_audit_log'::regclass
          AND conname = 'ai_audit_log_client_payload_bounds'
          AND contype = 'c'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.crisis_events'::regclass
          AND conname = 'crisis_events_client_payload_bounds'
          AND contype = 'c'
     )
     OR has_table_privilege(
       'anon', 'public.ai_audit_log',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.ai_audit_log',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'anon', 'public.crisis_events',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.crisis_events',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege('anon', 'public.ai_audit_daily_health', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ai_audit_daily_health', 'SELECT')
     OR has_function_privilege(
       'anon',
       'public.log_ai_audit(text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.log_ai_audit(text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.log_ai_audit(text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.assert_client_ai_audit_payload(text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.assert_client_ai_audit_payload(text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.assert_client_ai_audit_payload(text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.assert_client_crisis_event_payload(numeric,text[],text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.assert_client_crisis_event_payload(numeric,text[],text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.assert_client_crisis_event_payload(numeric,text[],text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.enforce_client_audit_ingest_rate(uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.enforce_client_audit_ingest_rate(uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.enforce_client_audit_ingest_rate(uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.log_crisis_event_once(text,numeric,text[],integer,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.log_crisis_event_once(text,numeric,text[],integer,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.log_crisis_event_once(text,numeric,text[],integer,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.log_crisis_event(numeric,text[],integer,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.log_crisis_event(numeric,text[],integer,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.log_crisis_event(numeric,text[],integer,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION '0181 client audit ingest privilege postcondition failed';
  END IF;
END
$postconditions$;

COMMIT;
