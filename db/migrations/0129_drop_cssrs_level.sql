-- 0129_drop_cssrs_level.sql
-- 임상 척도 저장을 끝낸다 (법률 검토 Q4, Simon 결정 2026-08-17).
--
-- `crisis_events.cssrs_level` 은 C-SSRS (Columbia Suicide Severity Rating Scale)
-- 등급이다. 자살 위험도를 재는 **임상 척도 숫자**를 사람마다 저장한다는 뜻이고,
-- 검토 의견은 이것이 PIPA 제23조 민감정보(건강) 처리이며 §15①5호(긴급한 생명·
-- 신체 이익)를 민감정보에 원용할 수 없다고 본다. 그러면 남는 근거는 §23①1호
-- 별도 동의뿐인데, 그 동의는 받은 적이 없다.
--
-- 그리고 결정적으로 **이 값을 읽는 코드가 저장소에 한 건도 없다**(2026-08-17 실측).
-- 위기 라우팅은 `zone` 이 하고 그 컬럼은 그대로 남는다. 즉 쓸모는 없고 보유
-- 위험만 있는 항목이다.
--
-- 이 마이그레이션은 컬럼을 DROP 한다. 기존 행의 값도 함께 사라진다 - 그것이
-- 의도다(수집한 적 없어야 할 것을 지운다). 되돌릴 수 없다.
--
-- ⚠ 파라미터는 **일부러 남긴다.** 이미 설치된 모바일 앱이 `p_cssrs_level` 을
-- 계속 보낸다. 시그니처를 바꾸면 그 앱들의 위기 기록이 통째로 실패하고, 그건
-- 하필 실패하면 안 되는 경로다. 파라미터는 받되 버린다.

-- 1) 먼저 RPC 가 컬럼을 참조하지 않게 한다. 순서가 중요하다 - 컬럼을 먼저
--    지우면 그 사이에 들어온 호출이 실패한다.
CREATE OR REPLACE FUNCTION public.log_crisis_event(
  p_classifier_confidence    numeric,
  -- 호환용으로만 남은 자리. 값은 무시된다 (0129).
  p_trigger_categories       text[],
  p_cssrs_level              integer,
  p_routing_template_version text,
  p_locale                   text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_locale NOT IN ('ko', 'en') THEN
    RAISE EXCEPTION 'log_crisis_event: invalid locale %', p_locale USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.crisis_events (
    user_id_hash, zone, classifier_confidence, trigger_categories,
    routing_template_version, locale
  ) VALUES (
    -- Stamped server-side from the authenticated caller -- never client input.
    md5(auth.uid()::text),
    'red',
    p_classifier_confidence,
    COALESCE(p_trigger_categories, '{}'),
    p_routing_template_version,
    p_locale
  );
END;
$$;

-- 2) 이제 컬럼을 지운다. CHECK 제약도 함께 사라진다.
ALTER TABLE public.crisis_events DROP COLUMN IF EXISTS cssrs_level;

-- 3) 왜 없어졌는지 DB 안에 남긴다. 나중에 스키마만 보는 사람이 "누락"으로
--    오해하고 되살리지 않도록. (주석은 CREATE OR REPLACE 로 지워지지 않는다.)
COMMENT ON TABLE public.crisis_events IS
  'Red-zone routing ledger. cssrs_level (C-SSRS clinical score) was dropped in 0129: '
  'storing it is PIPA art.23 sensitive-health processing with no consent basis, and '
  'nothing ever read it. Routing is driven by zone. Do not reintroduce a severity '
  'score without a separate-consent basis first.';

-- 4) 권한 재확인. CREATE OR REPLACE 는 기존 권한을 유지하지만, 새로 적용되는
--    환경에서 anon 이 EXECUTE 를 자동으로 받는 것을 막는다.
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) TO authenticated;
