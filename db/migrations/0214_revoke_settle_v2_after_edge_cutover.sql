-- 0214_revoke_settle_v2_after_edge_cutover.sql
-- PR-7c. rewarded-ssv Edge 가 v3 를 부르도록 배포된 뒤(운영 v99, 2026-10-06 01:41 KST, 배포본 소스에
-- settle_reward_ssv_ticket_v2 호출 0건 확인) v2 의 service_role 직접 실행 권한을 걷는다.
--
-- 왜: 0213 의 v3 는 콜백 timestamp 신선도(1일 · 발급 뒤 5분 안)를 본 다음에만 v2 로 지급한다. v2 를
-- service_role 이 직접 부를 수 있으면 그 검사를 건너뛰는 지급 경로가 서버 쪽에 남는다. 88일 정리(0211)
-- 뒤에는 그 경로로 지워진 거래 ID 를 다시 쓸 여지가 생긴다(0213 머리말). 0213 이 "Edge 전환 뒤
-- 0214 로 걷는다" 고 약속한 마지막 단계이고, 광고를 Alpha 밖으로 넓히기 전 조건이다(Gaius ⑥,
-- 보안 게이트 r4 daybreak 메모).
--
-- 깨지지 않는 이유: v3 는 SECURITY DEFINER 이고 소유자가 v2 와 같다. v3 안에서 v2 를 부를 때 권한은
-- 소유자 기준이라 service_role 의 EXECUTE 가 없어도 된다. scripts/check-reward-ssv-db.sh 는 postgres
-- 로 접속해 request.jwt.claim.role 만 바꾸므로 역시 영향이 없다.
--
-- 되돌리기: rollback/0214_down.sql — Edge 를 v2 를 부르는 판으로 되돌려야 할 때만(그때는 0213_down
-- 전에 먼저 돌린다). 최상위 BEGIN/COMMIT 을 두지 않는다(Supabase CLI 트랜잭션).

SET LOCAL lock_timeout = '10s';

DO $preconditions$
DECLARE
  v_v2 regprocedure := to_regprocedure('public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)');
  v_v3 regprocedure := to_regprocedure('public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)');
BEGIN
  IF v_v2 IS NULL OR v_v3 IS NULL THEN
    RAISE EXCEPTION '0214 requires 0196 (v2) and 0213 (v3) to be applied first';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = v_v3)
     OR (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_v3)
        <> (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_v2)
     OR (SELECT p.prosrc FROM pg_catalog.pg_proc AS p WHERE p.oid = v_v3) !~ 'settle_reward_ssv_ticket_v2'
     OR NOT has_function_privilege('service_role', v_v3, 'EXECUTE') THEN
    RAISE EXCEPTION '0214: v3 must be a SECURITY DEFINER wrapper of v2 with the same owner, executable by service_role';
  END IF;
END
$preconditions$;

REVOKE ALL ON FUNCTION public.settle_reward_ssv_ticket_v2(text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $postcondition$
BEGIN
  IF has_function_privilege('service_role', 'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION '0214: settle v2 is still directly executable or v3 lost its service_role grant';
  END IF;
END
$postcondition$;
