-- 0254: 위기 기록의 범주 칸(crisis_events.trigger_categories)은 서버에서도 닫힌 목록만 남긴다 (Q-261013-66).
--
-- 근거: Simon 2026-10-13 15:37 KST 「Q-66·67·68, Gaius 여섯 건, Z66 가 전부 추천대로 진행」 의 Q-66 추천안
--   (서버가 목록 밖 값을 거절하지 않고 고정 값 unlisted 로 바꿔 저장). 법무 의견(Gaius 15:08 · 내부 의견 ·
--   법률 자문 아님)의 조건 넷: ① 원래 값은 DB · 서버 로그 · 오류 보고 어디에도 남기지 않는다 ② unlisted 는
--   하나의 고정 값이다 ③ 출처가 사용자 입력인 기록에는 번호도 unlisted 도 남기지 않는다 ④ unlisted 건수를
--   지표로 보고 0 이 아니면 점검한다.
-- 사실: 0181 은 배열의 모양 · 개수 · 길이 · 제어 문자만 보고 값 목록은 보지 않는다. 앱은 #2380 부터 닫힌 목록
--   (src/lib/safety/crisis-event-categories.ts)을 거쳐 보내지만, 그것은 앱 안의 검사이지 경계가 아니다.
--   이 칸은 범주만 담는 칸이라 사람이나 모델이 쓴 글이 들어가면 안 된다.
--
-- 규칙 (화면 쪽과 맞춘 것 · DECISIONS 26.10.13 15:20)
--   'output_swap' 이 든 기록만 "AI 답이 위기 안내로 바뀐" 기록으로 본다.
--   - 그 기록: 목록의 이름과 번호(crisis_term:1 ~ crisis_term:19)는 그대로 두고, 그 밖의 값은 전부 합쳐
--     'unlisted' 하나로 바꾼다.
--   - 그 밖의 기록(사용자 입력에서 걸린 것): 목록의 이름만 남긴다. 번호 · 목록 밖 값 · 'unlisted' 는 넣지 않는다.
--   - 두 경우 모두 받은 순서를 지키고, 같은 값은 처음 것만 남긴다. 들어온 것이 16개 이하이므로(0181) 나가는
--     것도 16개 이하다.
--   - 다 빠져 빈 배열이 돼도 기록은 남긴다(위기 기록 자체를 잃지 않는다).
--   한 번만 쓰기(log_crisis_event_once)의 "같은 요청인가" 비교는 정리한 값끼리 한다. 0254 이전에 저장된 줄도
--   정리해서 비교하므로, 같은 요청을 다시 보내면 지금처럼 조용히 끝난다.
--
-- 조건 ① 에 대해 이 파일이 하는 것과 못 하는 것
--   - 하는 것: 원래 값은 표에 들어가지 않는다. 이 파일의 함수는 오류 문구에 값을 넣지 않고(문구는 전부 고정),
--     NOTICE · LOG 를 내지 않는다.
--   - 못 하는 것: 호출 인자를 DB 서버가 스스로 로그에 적는지는 서버 설정이다. 운영 값(2026-10-13 16:10~16:13 사이에 읽음):
--     log_statement = ddl · log_min_duration_statement = -1 · log_parameter_max_length_on_error = 0 이라
--     함수 호출과 그 인자는 적히지 않는다. 이 설정이 바뀌면 다시 봐야 한다. 앱 쪽 오류 보고도 서버가 막지 못한다.
-- 조건 ③ 의 한계: 'output_swap' 은 앱이 붙이는 값이다. 서버는 "그 기록이 스스로 AI 답이라고 말하는가"만 본다.
--   사용자 입력 기록에서 빠진 값은 흔적이 없어 지표로 보이지 않는다.
-- 조건 ④ 의 지표: 'unlisted' = ANY (trigger_categories) 인 줄 수. 운영은 0 이다(같은 읽기 · 6줄 중 0).
--
-- 하지 않는 일
--   - 모양 검사(0181 assert_client_crisis_event_payload)는 그대로다. 17개 이상 · 65자 이상 · 제어 문자 · NULL 이
--     든 기록은 지금처럼 통째로 거절된다. 지금 앱은 닫힌 목록만 보내므로 생기지 않는다.
--   - 이미 저장된 줄은 고치지 않는다. 운영의 6줄에는 목록 밖 값이 없다(같은 읽기).
--   - 위기 안내가 무엇을 잡고 무엇을 보여 주는지는 바꾸지 않는다. 이 파일은 기록 칸에 남는 값만 다룬다.
--   - 권한 · 속도 제한 · 한 번만 쓰기 열쇠 검사는 0181 그대로다.
-- 닫힌 목록의 정본은 앱의 CRISIS_EVENT_FIXED_CATEGORIES 다. 아래 배열이 그것과 같은지는 jest 가 지킨다
--   (src/lib/safety/__tests__/crisis-category-server-list.test.ts). 이름을 더할 때는 두 곳을 같이 고친다.
-- 되돌리기: rollback/0254_down.sql 이 두 쓰기 함수를 0181 의 본문으로 되돌린다.

CREATE OR REPLACE FUNCTION public.normalize_client_crisis_categories(p_categories text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- The app's closed list without 'unlisted' (crisis-event-categories.ts), in the same order.
  v_names constant text[] := ARRAY[
    'input_red',
    'input_semantic_red',
    'interview_input_red',
    'record_save_red',
    'proxy_input_red',
    'proxy_input_red_unconfirmed',
    'output_swap',
    'crisis',
    'forbidden_lexicon',
    'lexicon_match',
    'passive_ideation',
    'active_ideation_no_method',
    'active_ideation_with_method',
    'intent_no_plan',
    'intent_with_plan',
    'behavior_past',
    'behavior_preparation',
    'behavior_recent',
    'self_harm_non_suicidal'
  ];
  -- The fixed numbers of the Korean gate terms. Spelled out so that nothing but these
  -- nineteen exact strings can pass (no pattern, no collation question).
  v_numbers constant text[] := ARRAY[
    'crisis_term:1', 'crisis_term:2', 'crisis_term:3', 'crisis_term:4', 'crisis_term:5',
    'crisis_term:6', 'crisis_term:7', 'crisis_term:8', 'crisis_term:9', 'crisis_term:10',
    'crisis_term:11', 'crisis_term:12', 'crisis_term:13', 'crisis_term:14', 'crisis_term:15',
    'crisis_term:16', 'crisis_term:17', 'crisis_term:18', 'crisis_term:19'
  ];
  v_unlisted constant text := 'unlisted';
  v_is_reply boolean;
  v_entry text;
  v_kept text;
  v_out text[] := '{}'::text[];
BEGIN
  IF p_categories IS NULL THEN
    RETURN v_out;
  END IF;
  -- Only a record that names 'output_swap' is a record of a swapped AI reply.
  v_is_reply := COALESCE('output_swap' = ANY (p_categories), false);

  FOREACH v_entry IN ARRAY p_categories LOOP
    IF v_entry IS NOT NULL AND v_entry = ANY (v_names) THEN
      v_kept := v_entry;
    ELSIF NOT v_is_reply THEN
      -- A record from user input keeps the list's names and nothing else.
      CONTINUE;
    ELSIF v_entry IS NOT NULL AND v_entry = ANY (v_numbers) THEN
      v_kept := v_entry;
    ELSE
      v_kept := v_unlisted;
    END IF;
    IF NOT (v_kept = ANY (v_out)) THEN
      v_out := v_out || v_kept;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM service_role;

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
    public.normalize_client_crisis_categories(p_trigger_categories),
    p_routing_template_version, p_locale,
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
  v_triggers text[];
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
  v_triggers := public.normalize_client_crisis_categories(p_trigger_categories);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('secondb:client-audit:crisis:' || v_owner_id::text, 0)
  );
  SELECT * INTO v_existing
    FROM public.crisis_events
   WHERE user_id_hash = v_owner_hash
     AND outbox_event_id = p_outbox_event_id;
  IF FOUND THEN
    -- Both sides are compared as they would be stored, so a row written before 0254
    -- and the same request sent again still match.
    IF v_existing.zone IS DISTINCT FROM 'red'
       OR v_existing.classifier_confidence IS DISTINCT FROM v_confidence
       OR public.normalize_client_crisis_categories(v_existing.trigger_categories) IS DISTINCT FROM v_triggers
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
    v_owner_hash, 'red', v_confidence, v_triggers,
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
