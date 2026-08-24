-- 0146: t5_seen_aggregate 를 키별 min-N 게이트로 — 5문항 확장의 필수 동반물.
--
-- ── 왜 (실측 2026-08-25) ─────────────────────────────────────────────────────
--
-- 피어 문항이 3개(외향·성실·우호)에서 5개(+개방성·신경성)로 늘면 옛 응답(3키)과
-- 새 응답(5키)이 한 사용자 안에 섞인다. 기존 함수의 min-N(>=3) 게이트는 **전체
-- 행 수** 기준이라, 3키 응답 3행 + 5키 응답 1행이면 n=4 로 게이트를 통과하고
-- 개방성 평균 = **단 한 명의 원점수 그대로**가 노출된다. 재식별 방지(min-N 3)가
-- 신규 특성에서 뚫리는 것이다.
--
-- 고침: 특성 키마다 따로 센다 — HAVING count(*) >= 3 per key. informant_count
-- 도 키별 응답자 수가 된다(전에는 전체 n). 반환 시그니처는 동일해서 클라이언트
-- (SeenAggregateRow) 는 무변경이고, 순수 3키 데이터에서는 결과가 기존과 같다.
-- UI 가 informant_count 에 max() 를 취하는 자리는 "가장 많이 답한 특성의 응답자
-- 수" 라는 뜻이 된다 — 표시로는 보수적(작거나 같음)이라 안전하다.

CREATE OR REPLACE FUNCTION public.t5_seen_aggregate()
 RETURNS TABLE(trait text, avg_score numeric, informant_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH active AS (
    SELECT o.ratings
    FROM peer_observations o
    JOIN informant_consents c ON c.id = o.informant_consent_id
    JOIN peer_invitations   i ON i.id = o.invitation_id
    WHERE o.subject_user_id = uid
      AND o.withdrawn_at IS NULL
      AND c.withdrawn_at IS NULL
      AND i.status = 'accepted'
  )
  SELECT kv.key::text,
         round(avg((kv.value)::numeric), 2),
         count(*)::int
  FROM active a, jsonb_each_text(a.ratings) kv
  GROUP BY kv.key
  HAVING count(*) >= 3;
END;
$function$;

-- DEFINER 함수 권한 규율(0036/0082): CREATE OR REPLACE 는 기존 ACL 을 유지하지만
-- 가드는 파일 안에서 명시를 요구한다 -- Supabase 가 anon 에 EXECUTE 를 자동
-- 부여하는 함정 때문이다. 이 집계는 로그인한 본인만 부른다.
REVOKE EXECUTE ON FUNCTION public.t5_seen_aggregate() FROM public;
REVOKE EXECUTE ON FUNCTION public.t5_seen_aggregate() FROM anon;
GRANT EXECUTE ON FUNCTION public.t5_seen_aggregate() TO authenticated;
