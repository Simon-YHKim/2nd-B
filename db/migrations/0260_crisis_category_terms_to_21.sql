-- 0260: 위기 기록의 범주 칸이 받는 위기 낱말 번호를 crisis_term:1 ~ crisis_term:21 로 넓힌다 (0254 의 후속).
--
-- 근거: Simon 2026-10-15 02:1x KST(2ndb-e7 창에 직접 입력 · 그 창 보고서 18판의 Q-261015-40 에 대한 답)
--   「- 위기 낱말 20 · 21 의 기록: 남긴다: 0260 으로 서버 목록을 21 까지 넓힘 → 검토 → 머지 → Relay 적용 뒤 앱 (추천 · 1~2시간)」.
--   그 앞: Q-261015-80 「가」 답으로 위기 낱말 「끝내 버리고 싶」 · 「끝내 버릴」이 더해져 고정 번호 20 · 21 을 받았다
--   (PR #2519 · 2ndb-79). 0254 의 닫힌 목록은 19 에서 끝나, 그 둘을 기록에 쓰면 unlisted 로 바뀐다.
--
-- 하는 일: normalize_client_crisis_categories 를 0254 의 본문 그대로 다시 만들고, 번호 배열에 'crisis_term:20' ·
--   'crisis_term:21' 둘만 더한다(바로 위 주석의 개수 낱말 하나도 함께). 이름 목록 · 정리 규칙 · 권한(앱의 어떤 역할도
--   직접 못 부름) · 두 쓰기 함수(log_crisis_event · log_crisis_event_once)는 그대로다. 0254 의 조건 넷(원래 값을 남기지
--   않음 · unlisted 는 하나의 고정 값 · 사용자 입력에서 걸린 기록에는 번호도 unlisted 도 남기지 않음 · unlisted 건수)도
--   그대로 지켜진다.
-- 하지 않는 일
--   - 이미 저장된 줄은 고치지 않는다. 지금까지 앱은 20 · 21 을 보내지 않았다(앱의 받는 범위와 쓰는 범위가 모두 19).
--   - 앱이 20 · 21 을 실제로 쓰게 하는 것은 이 파일이 운영에 적용된 뒤의 앱 PR 이다(model-reply-scan.ts · 2ndb-79).
--     먼저 쓰면 운영의 0254 가 unlisted 로 바꾼다.
-- 닫힌 목록의 정본은 앱의 crisis-event-categories.ts 다. 아래 배열이 그것과 같은지, 이 함수가 0254 의 것과 번호 둘
--   말고는 같은지는 jest 가 지킨다(src/lib/safety/__tests__/crisis-category-server-list.test.ts).
-- 되돌리기: rollback/0260_down.sql 이 0254 의 본문으로 되돌린다.

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
  -- twenty-one exact strings can pass (no pattern, no collation question).
  v_numbers constant text[] := ARRAY[
    'crisis_term:1', 'crisis_term:2', 'crisis_term:3', 'crisis_term:4', 'crisis_term:5',
    'crisis_term:6', 'crisis_term:7', 'crisis_term:8', 'crisis_term:9', 'crisis_term:10',
    'crisis_term:11', 'crisis_term:12', 'crisis_term:13', 'crisis_term:14', 'crisis_term:15',
    'crisis_term:16', 'crisis_term:17', 'crisis_term:18', 'crisis_term:19', 'crisis_term:20',
    'crisis_term:21'
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
