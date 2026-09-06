-- 0179_audit_outbox_idempotency.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Exactly-once server writes for the durable client audit outbox. Existing
-- callers keep using log_ai_audit/log_crisis_event unchanged; only outbox-aware
-- callers use the new *_once wrappers.

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.ai_audit_log
  ADD COLUMN IF NOT EXISTS outbox_event_id text;

ALTER TABLE public.crisis_events
  ADD COLUMN IF NOT EXISTS outbox_event_id text;

ALTER TABLE public.ai_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crisis_events FORCE ROW LEVEL SECURITY;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.ai_audit_log'::regclass
       AND conname = 'ai_audit_log_outbox_event_id_format'
  ) THEN
    ALTER TABLE public.ai_audit_log
      ADD CONSTRAINT ai_audit_log_outbox_event_id_format
      CHECK (
        outbox_event_id IS NULL
        OR (
          char_length(outbox_event_id) BETWEEN 1 AND 128
          AND outbox_event_id ~ '^[A-Za-z0-9._:-]+$'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.crisis_events'::regclass
       AND conname = 'crisis_events_outbox_event_id_format'
  ) THEN
    ALTER TABLE public.crisis_events
      ADD CONSTRAINT crisis_events_outbox_event_id_format
      CHECK (
        outbox_event_id IS NULL
        OR (
          char_length(outbox_event_id) BETWEEN 1 AND 128
          AND outbox_event_id ~ '^[A-Za-z0-9._:-]+$'
        )
      );
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_log_owner_outbox_event_unique
  ON public.ai_audit_log (user_id, outbox_event_id)
  WHERE outbox_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crisis_events_owner_outbox_event_unique
  ON public.crisis_events (user_id_hash, outbox_event_id)
  WHERE outbox_event_id IS NOT NULL;

COMMENT ON COLUMN public.ai_audit_log.outbox_event_id IS
  'Optional owner-scoped retry token for the durable client audit outbox.';
COMMENT ON COLUMN public.crisis_events.outbox_event_id IS
  'Optional owner-scoped retry token for the durable client crisis outbox.';

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
  v_owner_id uuid;
  v_purpose text;
  v_vendor text;
  v_effort text;
  v_inserted_id uuid;
  v_existing public.ai_audit_log%ROWTYPE;
BEGIN
  v_owner_id := auth.uid();
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
  IF p_safety_zone NOT IN ('green', 'yellow', 'red') THEN
    RAISE EXCEPTION 'log_ai_audit_once: invalid safety_zone %', p_safety_zone
      USING ERRCODE = '22023';
  END IF;

  -- Match log_ai_audit's persisted normalization before replay comparison.
  v_purpose := NULLIF(pg_catalog.left(pg_catalog.btrim(p_purpose), 64), '');
  v_vendor := CASE
    WHEN p_reasoning_vendor IN ('gemini', 'claude', 'openai') THEN p_reasoning_vendor
  END;
  v_effort := CASE
    WHEN p_reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'none')
      THEN p_reasoning_effort
  END;

  INSERT INTO public.ai_audit_log (
    user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone,
    latency_ms, purpose, reasoning_vendor, reasoning_effort, outbox_event_id
  ) VALUES (
    v_owner_id, p_prompt_hash, p_output_hash, p_model_used, p_vertex_backend,
    p_safety_zone::public.safety_zone, p_latency_ms, v_purpose, v_vendor,
    v_effort, p_outbox_event_id
  )
  ON CONFLICT (user_id, outbox_event_id)
    WHERE outbox_event_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_existing
    FROM public.ai_audit_log
   WHERE user_id = v_owner_id
     AND outbox_event_id = p_outbox_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit_outbox_idempotency_state_error'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_existing.prompt_hash IS DISTINCT FROM p_prompt_hash
     OR v_existing.output_hash IS DISTINCT FROM p_output_hash
     OR v_existing.model_used IS DISTINCT FROM p_model_used
     OR v_existing.vertex_backend IS DISTINCT FROM p_vertex_backend
     OR v_existing.safety_zone IS DISTINCT FROM p_safety_zone::public.safety_zone
     OR v_existing.latency_ms IS DISTINCT FROM p_latency_ms
     OR v_existing.purpose IS DISTINCT FROM v_purpose
     OR v_existing.reasoning_vendor IS DISTINCT FROM v_vendor
     OR v_existing.reasoning_effort IS DISTINCT FROM v_effort THEN
    RAISE EXCEPTION 'audit_outbox_idempotency_conflict'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_crisis_event_once(
  p_outbox_event_id text,
  p_classifier_confidence numeric,
  p_trigger_categories text[],
  -- Retained for client compatibility; migration 0129 removed the stored field.
  p_cssrs_level integer,
  p_routing_template_version text,
  p_locale text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_owner_hash text;
  v_confidence numeric(4,3);
  v_triggers text[];
  v_inserted_id uuid;
  v_existing public.crisis_events%ROWTYPE;
BEGIN
  v_owner_id := auth.uid();
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
  IF p_locale NOT IN ('ko', 'en') THEN
    RAISE EXCEPTION 'log_crisis_event_once: invalid locale %', p_locale
      USING ERRCODE = '22023';
  END IF;

  v_owner_hash := pg_catalog.md5(v_owner_id::text);
  -- Match the destination column/coalesce behavior before replay comparison.
  v_confidence := p_classifier_confidence;
  v_triggers := COALESCE(p_trigger_categories, '{}'::text[]);

  INSERT INTO public.crisis_events (
    user_id_hash, zone, classifier_confidence, trigger_categories,
    routing_template_version, locale, outbox_event_id
  ) VALUES (
    v_owner_hash, 'red', v_confidence, v_triggers,
    p_routing_template_version, p_locale, p_outbox_event_id
  )
  ON CONFLICT (user_id_hash, outbox_event_id)
    WHERE outbox_event_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_existing
    FROM public.crisis_events
   WHERE user_id_hash = v_owner_hash
     AND outbox_event_id = p_outbox_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'crisis_outbox_idempotency_state_error'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_existing.zone IS DISTINCT FROM 'red'
     OR v_existing.classifier_confidence IS DISTINCT FROM v_confidence
     OR v_existing.trigger_categories IS DISTINCT FROM v_triggers
     OR v_existing.routing_template_version IS DISTINCT FROM p_routing_template_version
     OR v_existing.locale IS DISTINCT FROM p_locale THEN
    RAISE EXCEPTION 'crisis_outbox_idempotency_conflict'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) TO authenticated;

DO $privileges$
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
     OR NOT COALESCE((
       SELECT i.indisunique AND i.indisvalid AND i.indisready
         FROM pg_catalog.pg_index AS i
        WHERE i.indexrelid =
          'public.ai_audit_log_owner_outbox_event_unique'::regclass
     ), false)
     OR NOT COALESCE((
       SELECT i.indisunique AND i.indisvalid AND i.indisready
         FROM pg_catalog.pg_index AS i
        WHERE i.indexrelid =
          'public.crisis_events_owner_outbox_event_unique'::regclass
     ), false)
     OR has_table_privilege('anon', 'public.ai_audit_log', 'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated', 'public.ai_audit_log', 'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('anon', 'public.crisis_events', 'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated', 'public.crisis_events', 'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_function_privilege(
       'anon',
       'public.log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
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
     ) THEN
    RAISE EXCEPTION '0179 audit outbox function privilege postcondition failed';
  END IF;
END
$privileges$;

COMMIT;
