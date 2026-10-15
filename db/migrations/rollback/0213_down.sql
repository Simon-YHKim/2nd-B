-- rollback/0213_down.sql  (초안)
-- 반드시 rewarded-ssv Edge 를 v2 호출 버전으로 되돌린 "뒤"에만 실행한다.
-- (Edge 가 v3 를 부르는 동안 v3 를 지우면 모든 콜백이 503 settlement_service_unavailable.)
-- 0214(v2 EXECUTE 회수)을 적용했다면 먼저 0214_down 으로 v2 service_role EXECUTE 를 되돌린다.

SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF NOT has_function_privilege('service_role',
       'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0213_down: v2 is not executable by service_role; roll back 0214 first';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.settle_reward_ssv_ticket_v3(text, text, text, integer, text, bigint);
DROP FUNCTION IF EXISTS public.reward_ssv_callback_is_fresh(text, bigint);
