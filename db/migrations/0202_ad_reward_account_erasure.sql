-- 0202_ad_reward_account_erasure.sql
-- Integration candidate only: re-scan remote/local migration numbers immediately
-- before push and renumber if 0202 was taken in the meantime.
--
-- 탈퇴한 사용자의 광고 보상 원장을 지운다 (Simon 결정 2026-09-27 18:0x, "탈퇴 시 삭제").
--
-- 공개 개인정보처리방침은 "보상 거래 기록과 계정별 발급 제한 정보는 계정 삭제 시
-- 함께 삭제합니다" 라고 적는다. 보상 관련 표 셋 중 둘은 이미 그렇다:
--   rewarded_ssv_txns · reward_ssv_tickets -> users 를 ON DELETE CASCADE 로 문다.
-- 남은 하나가 credit_ledger 다. 0134 가 user_id 를 ON DELETE SET NULL 로 만든 것은
-- 구매 때문이다 - 민법 제146조 취소권 기간이 계정보다 오래 살아서, 구매 사실과
-- 미사용 잔량의 증거가 계정과 함께 사라지면 안 된다. 그 규칙이 광고 보상 로트에도
-- 똑같이 걸려서, 탈퇴 뒤에도 ad_reward 행이 사용자 칸만 비운 채 남고 그 memo 에
-- AdMob 거래 ID('rewarded SSV ' || transaction_id, 0172 grant_reward_credits_ssv)가
-- 그대로 있었다. 광고 보상은 돈을 낸 기록이 아니므로 취소권 증거로 남길 이유가 없다.
--
-- 무엇을 지우나. 광고 보상 "로트" 전체다. ad_reward 행은 로트를 여는 행이고,
-- 그 크레딧을 쓴 spend · spend_refund · expire · adjust 행이 lot_id 로 그 행을
-- 가리킨다(FK 는 없고 credit_ledger_stamp_lot 트리거가 같은 사용자임을 강제한다).
-- 여는 행만 지우면 짝 잃은 소비 행이 남으므로 로트에 속한 행을 모두 지운다.
-- 구매 · 프로모 로트와 그 소비 행은 건드리지 않는다 - 0134 의 SET NULL 이 그대로 적용된다.
--
-- 왜 트리거인가. 계정 삭제 경로가 여럿이다(delete-account Edge 의 auth.users 삭제가
-- public.users 로 연쇄되는 경로, 운영자 삭제). BEFORE DELETE ON public.users 는
-- 어느 경로로 오든 SET NULL 참조 동작(삭제 뒤 AFTER 로 돈다)보다 먼저 돈다.
-- credit_ledger 의 트리거 셋(stamp_lot · balance_apply · mirror_counter)은 전부
-- INSERT 전용이라 행을 지워도 잔액 캐시가 흔들리지 않고, credit_balance 는
-- users 를 ON DELETE CASCADE 로 물어 계정과 함께 사라진다.
--
-- 운영 데이터(2026-09-27 18:0x 읽기 전용 실측): credit_ledger ad_reward 0행,
-- rewarded_ssv_txns 0행, reward_ssv_tickets 0행. 광고는 OFF 다. 그래서 옮길 데이터가
-- 없고, 이 파일은 광고를 켜기 전에 구조만 맞춘다. 이미 사용자 칸이 비어 버린 과거
-- ad_reward 행(있다면)은 누구의 것인지 알 수 없으므로 여기서 건드리지 않는다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싸므로 여기서 또 열면 중첩된다 (supabase-dry-run.yml 이 0147 이상에 대해 막는다).

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.erase_ad_reward_ledger_on_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 이 사용자의 광고 보상 로트에 속한 행만 지운다. 로트는 한 사용자의 것이라
  -- (stamp_lot 이 강제) user_id 조건은 방어용 이중 확인이다.
  DELETE FROM public.credit_ledger AS l
   WHERE l.user_id = OLD.id
     AND l.lot_id IN (
       SELECT o.id
         FROM public.credit_ledger AS o
        WHERE o.user_id = OLD.id
          AND o.kind = 'ad_reward'
     );
  RETURN OLD;
END;
$$;

-- 트리거 함수다. 누가 직접 부를 일이 없다. Supabase 는 새 함수에 anon ·
-- authenticated · service_role EXECUTE 를 이름으로 주므로 넷 다 걷는다
-- (scripts/check-definer-grants.ts 규칙 B · 0190 과 같은 이유).
REVOKE EXECUTE ON FUNCTION public.erase_ad_reward_ledger_on_account_delete() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.erase_ad_reward_ledger_on_account_delete() IS
  '계정 삭제 직전(BEFORE DELETE ON public.users)에 그 사용자의 광고 보상 로트(ad_reward 여는 행과 그 로트의 소비 행)를 credit_ledger 에서 지운다. 구매·프로모 로트는 0134 의 ON DELETE SET NULL 로 남는다(취소권 증거). 개인정보처리방침의 "보상 거래 기록은 계정 삭제 시 함께 삭제" 를 원장에서도 지키기 위한 것이다.';

DROP TRIGGER IF EXISTS trg_users_erase_ad_reward_ledger ON public.users;
CREATE TRIGGER trg_users_erase_ad_reward_ledger
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.erase_ad_reward_ledger_on_account_delete();

----------------------------------------------------------------------
-- 끝 상태를 적용 시점에 확인한다 (0172~0190 과 같은 모양).
----------------------------------------------------------------------

DO $ad_reward_erasure_check$
BEGIN
  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger AS t
        WHERE t.tgrelid = 'public.users'::regclass
          AND t.tgname = 'trg_users_erase_ad_reward_ledger'
          AND t.tgenabled = 'O'
          AND t.tgfoid = 'public.erase_ad_reward_ledger_on_account_delete()'::regprocedure
     )
     OR NOT (
       SELECT p.prosecdef
         FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'public.erase_ad_reward_ledger_on_account_delete()'::regprocedure
     )
     OR pg_catalog.has_function_privilege('public', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE') THEN
    RAISE EXCEPTION '0202: ad-reward erasure trigger postcondition failed';
  END IF;
END;
$ad_reward_erasure_check$;
