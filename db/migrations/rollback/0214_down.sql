-- rollback/0214_down.sql — 0214 를 되돌린다. 손으로, 사고 중에만 돌린다(0189 · 0211 · 0221 과 같다).
-- v2 의 service_role 직접 실행 권한을 0196 의 상태로 돌려준다. rewarded-ssv Edge 를 v2 를 부르는 판으로
-- 되돌려야 할 때만 쓴다(0213_down 은 이것을 먼저 요구한다). 원장 행(supabase_migrations)은 지우지
-- 않는다 — 되돌린 사실은 HANDOFF 와 사건 기록에 남긴다.
-- 최상위 BEGIN/COMMIT 을 두지 않는다. psql 로 돌릴 때는 -1(--single-transaction)을 붙인다.

GRANT EXECUTE ON FUNCTION public.settle_reward_ssv_ticket_v2(text, text, text, integer, text) TO service_role;

DO $after_down$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0214_down: settle v2 is not back to service_role-only';
  END IF;
END
$after_down$;
