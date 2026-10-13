-- 0254 되돌리기: 위기 기록 쓰기 함수 둘을 0181 의 본문 그대로 되돌리고, 범주 정리 함수를 지운다.
-- 아래 두 함수 본문은 db/migrations/0181_client_audit_ingest_hardening.sql 에서 글자 그대로 옮긴 것이다.
-- 데이터는 바꾸지 않는다. 0254 가 적용된 동안 저장된 줄은 정리된 값 그대로 남는다.
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

REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event_once(text, numeric, text[], integer, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.normalize_client_crisis_categories(text[]);
