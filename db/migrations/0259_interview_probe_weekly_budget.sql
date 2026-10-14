-- 0259: 인터뷰 질문(interview_probe)의 서버 한도를 하루 몫에서 "최근 7일 예산 + 하루 천장"으로 바꾼다.
--
-- 근거: Simon 2026-10-14 13:42:09 KST (2ndb-79 창의 보고서 「인터뷰와 앱 경험 · 여섯 가지 생각에 대한 판단」에 직접 입력 ·
--   2ndb-e7 이 그 창의 기록에서 글자 그대로 읽어 확인) 「Q-261014-17 인터뷰 한도 - 한도: 가. 주 단위 예산(임시 주 140 · 하루 60)
--   + 한도에서 화면 유지(추천)」. 원문은 여기까지다. "한도에서 화면 유지"는 화면 쪽 일이다(2ndb-79).
--   무료가 아닌 등급의 숫자는 2ndb-79 의 제안(주 = 지금 하루 몫 x 7 · 하루 천장 = 지금 하루 몫 x 3)이고, 대표님이 2026-10-14 14:12:02 KST 에
--   「올린다. 유료 등급은 제안대로(soma 150/350 · cortex 300/700 · brain 750/1,750) (추천)」으로 고르셨다(이 창 보고서의 Q-261014-36).
--   등급 이름: 아래의 free · soma · cortex · brain 은 내부 키다. 사용자가 보는 이름은 별바라기(free) · 항해자(cortex) · 북극성(brain)이고
--   soma 는 요금제 화면에 없는 옛 등급이다(locales/ko/plans.json). 내부 키는 바꾸지 않는다.
--
-- 하는 일: consume_llm_proxy_purpose_quota(0185)를 0185 의 글자 그대로 다시 만들되 세 곳만 바꾼다(정적 테스트가 그 차이만 있는지 본다).
--   1. 인터뷰 좌석의 하루 몫을 하루 천장으로 올린다(free 20 -> 60 · soma 50 -> 150 · cortex 100 -> 300 · brain 250 -> 750).
--   2. 하루 카운터 줄을 올리기 전에, 오늘을 포함한 최근 7개 KST 날의 인터뷰 줄을 더해 주 예산에 닿았으면 거절한다.
--      거절은 (false, 7일 합계, 주 예산)이다. 프록시가 보는 계약(거절이면 used >= limit · limit <= 10000)에 그대로 맞는다.
--      같은 사용자의 두 호출이 마지막 하나를 함께 가져가지 않도록 그 사용자 · 그 좌석의 트랜잭션 잠금(advisory)을 먼저 잡는다.
--   3. 다른 좌석은 한 글자도 바뀌지 않는다. 표(llm_proxy_purpose_daily) · 권한 · 45일 정리도 그대로다.
-- 하지 않는 일: 표나 칸을 더하지 않는다(하루 줄을 7일치 더해 읽는다 · 45일 정리가 7일보다 길다). 화면 문구 · 재개 시각 안내는 없다
--   (화면은 지금처럼 "한도에 닿았다"만 말한다 · session-end.ts 의 원칙).
-- 되돌리기: rollback/0259_down.sql 이 0185 의 함수를 글자 그대로 되돌린다.

CREATE OR REPLACE FUNCTION public.consume_llm_proxy_purpose_quota(
  p_user_id uuid,
  p_provider text,
  p_purpose text
)
RETURNS TABLE (allowed boolean, used integer, quota_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tier  text;
  v_day   date;
  v_limit integer;
  v_used  integer;
  v_week  integer;
  v_week_limit integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22023';
  END IF;
  -- This mirrors the server-owned proxy policy. Unknown providers, unknown
  -- purposes, capture_voice (a routing alias), and mismatched proxy seats all
  -- fail before a counter row can be written.
  IF p_provider IS NULL OR p_purpose IS NULL OR NOT (CASE p_provider
    WHEN 'gemini' THEN p_purpose IN (
      'advisor', 'audit_qa', 'axis_estimate', 'capture_classify',
      'capture_ocr', 'clipper_classify', 'clipper_template_propose',
      'cluster_infer', 'digest_weekly', 'embed_index', 'gap_synthesize',
      'imagine', 'import_ingest', 'interview_probe', 'northstar_propose',
      'ops_daily_brief', 'ops_recommend', 'persona_narrative',
      'persona_synthesis', 'reasoning_connect', 'safety_classify',
      'secondb_chat', 'self_model_propose', 'source_ingest',
      'ttfv_first_insight', 'voice_transcribe'
    )
    WHEN 'openai' THEN p_purpose IN (
      'advisor', 'audit_qa', 'axis_estimate', 'capture_classify',
      'capture_ocr', 'clipper_classify', 'clipper_template_propose',
      'cluster_infer', 'crosscheck_challenge', 'digest_weekly', 'embed_index',
      'gap_synthesize', 'imagine', 'import_ingest', 'interview_probe',
      'northstar_propose', 'ops_daily_brief', 'ops_recommend',
      'persona_narrative', 'persona_synthesis', 'reasoning_connect',
      'safety_classify', 'secondb_chat', 'self_model_propose',
      'source_ingest', 'ttfv_first_insight', 'voice_transcribe'
    )
    WHEN 'claude' THEN p_purpose IN (
      'axis_estimate', 'crosscheck_defend', 'digest_weekly',
      'persona_narrative', 'persona_synthesis'
    )
    WHEN 'xai' THEN p_purpose IN (
      'advisor', 'axis_estimate', 'cluster_infer', 'digest_weekly',
      'gap_synthesize', 'northstar_propose', 'ops_daily_brief',
      'ops_recommend', 'persona_narrative', 'persona_synthesis',
      'secondb_chat', 'self_model_propose', 'ttfv_first_insight'
    )
    ELSE false
  END) THEN
    RAISE EXCEPTION 'unsupported provider purpose' USING ERRCODE = '22023';
  END IF;

  v_day := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
  v_tier := public.effective_subscription_tier(p_user_id);
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'quota subject unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_tier NOT IN ('free', 'soma', 'cortex', 'brain') THEN
    RAISE EXCEPTION 'quota tier unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_purpose = 'advisor' AND v_tier <> 'brain' THEN
    RAISE EXCEPTION 'purpose entitlement unavailable' USING ERRCODE = '42501';
  END IF;

  v_limit := CASE
    WHEN p_purpose = 'secondb_chat' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 250
      WHEN 'cortex' THEN 80
      WHEN 'soma'   THEN 30
      ELSE 5
    END
    WHEN p_purpose IN (
      'advisor', 'crosscheck_challenge', 'crosscheck_defend',
      'imagine', 'reasoning_connect'
    ) THEN CASE v_tier
      WHEN 'brain'  THEN 16
      WHEN 'cortex' THEN 8
      WHEN 'soma'   THEN 4
      ELSE 2
    END
    WHEN p_purpose = 'persona_synthesis' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 16
      WHEN 'cortex' THEN 8
      WHEN 'soma'   THEN 4
      ELSE 2
    END
    WHEN p_purpose = 'persona_narrative' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 50
      WHEN 'cortex' THEN 24
      WHEN 'soma'   THEN 12
      ELSE 6
    END
    WHEN p_purpose = 'axis_estimate' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 50
      WHEN 'cortex' THEN 20
      WHEN 'soma'   THEN 10
      ELSE 5
    END
    WHEN p_purpose = 'digest_weekly' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 4
      WHEN 'cortex' THEN 2
      WHEN 'soma'   THEN 1
      ELSE 1
    END
    WHEN p_purpose IN ('capture_ocr', 'voice_transcribe') THEN CASE v_tier
      WHEN 'brain'  THEN 200
      WHEN 'cortex' THEN 80
      WHEN 'soma'   THEN 30
      ELSE 10
    END
    WHEN p_purpose IN (
      'capture_classify', 'clipper_classify', 'embed_index', 'safety_classify'
    ) THEN CASE v_tier
      WHEN 'brain'  THEN 500
      WHEN 'cortex' THEN 350
      WHEN 'soma'   THEN 200
      ELSE 100
    END
    -- Interview questions: a daily ceiling here and a rolling seven-day budget below (0259).
    WHEN p_purpose = 'interview_probe' THEN CASE v_tier
      WHEN 'brain'  THEN 750
      WHEN 'cortex' THEN 300
      WHEN 'soma'   THEN 150
      ELSE 60
    END
    WHEN p_purpose IN (
      'audit_qa', 'capture_voice', 'clipper_template_propose', 'cluster_infer',
      'gap_synthesize', 'import_ingest',
      'northstar_propose', 'ops_daily_brief', 'ops_recommend',
      'self_model_propose', 'source_ingest', 'ttfv_first_insight'
    ) THEN CASE v_tier
      WHEN 'brain'  THEN 250
      WHEN 'cortex' THEN 100
      WHEN 'soma'   THEN 50
      ELSE 20
    END
    ELSE NULL
  END;
  IF v_limit IS NULL OR v_limit < 1 OR v_limit > 10000 THEN
    RAISE EXCEPTION 'quota policy unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- Preserve earned chat sends. The grant path caps the monthly credit at 20;
  -- clamp again here so even legacy/corrupt rows cannot widen a cost boundary.
  IF p_purpose = 'secondb_chat' THEN
    SELECT COALESCE((
      SELECT LEAST(20, GREATEST(0, COALESCE(cu.ad_bonus, 0)))
        FROM public.chat_usage AS cu
       WHERE cu.user_id = p_user_id
         AND cu.day = v_day
    ), 0)
      INTO v_used;
    v_limit := v_limit + v_used;
  END IF;

  -- Bounded per-user cleanup avoids a fleet-wide delete on the hot path while
  -- retaining enough history for incident review.
  DELETE FROM public.llm_proxy_purpose_daily
   WHERE user_id = p_user_id
     AND kst_day < v_day - 45;

  -- Interview questions are budgeted by the week as well (0259): the last seven KST days, today
  -- included, under the daily ceiling above. One decision at a time per user and seat, so two calls
  -- that arrive together cannot both take the last question of the week.
  IF p_purpose = 'interview_probe' THEN
    v_week_limit := CASE v_tier
      WHEN 'brain'  THEN 1750
      WHEN 'cortex' THEN 700
      WHEN 'soma'   THEN 350
      ELSE 140
    END;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('llm_proxy_purpose_week:' || p_user_id::text || ':' || p_purpose, 0));
    SELECT COALESCE(pg_catalog.sum(daily.count), 0)::integer
      INTO v_week
      FROM public.llm_proxy_purpose_daily AS daily
     WHERE daily.user_id = p_user_id
       AND daily.purpose = p_purpose
       AND daily.kst_day BETWEEN v_day - 6 AND v_day;
    IF v_week >= v_week_limit THEN
      RETURN QUERY SELECT false, v_week, v_week_limit;
      RETURN;
    END IF;
  END IF;

  v_used := NULL;
  INSERT INTO public.llm_proxy_purpose_daily AS daily
    (user_id, kst_day, purpose, count, updated_at)
  VALUES
    (p_user_id, v_day, p_purpose, 1, now())
  ON CONFLICT (user_id, kst_day, purpose) DO UPDATE
    SET count = daily.count + 1,
        updated_at = now()
    WHERE daily.count < v_limit
  RETURNING daily.count INTO v_used;

  IF v_used IS NOT NULL THEN
    RETURN QUERY SELECT true, v_used, v_limit;
    RETURN;
  END IF;

  SELECT daily.count
    INTO v_used
    FROM public.llm_proxy_purpose_daily AS daily
   WHERE daily.user_id = p_user_id
     AND daily.kst_day = v_day
     AND daily.purpose = p_purpose;

  IF v_used IS NULL THEN
    RAISE EXCEPTION 'quota row unavailable' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT false, v_used, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text) IS
  'Service-only atomic KST-day allowance with server-owned provider seats, tiers, and limits; interview_probe also has a rolling seven-day budget (0259).';

DO $verify0259$
BEGIN
  IF has_function_privilege('anon', 'public.consume_llm_proxy_purpose_quota(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_llm_proxy_purpose_quota(uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.consume_llm_proxy_purpose_quota(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0259: consume_llm_proxy_purpose_quota is open to an application role, or closed to the proxies'
      USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
                  WHERE p.oid = 'public.consume_llm_proxy_purpose_quota(uuid, text, text)'::regprocedure
                    AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
                    AND p.prosrc LIKE '%llm_proxy_purpose_week:%') THEN
    RAISE EXCEPTION '0259: consume_llm_proxy_purpose_quota is not the weekly form' USING ERRCODE = '55000';
  END IF;
END
$verify0259$;
