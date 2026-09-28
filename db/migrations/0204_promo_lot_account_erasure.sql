-- 0204_promo_lot_account_erasure.sql
-- Integration candidate only: re-scan remote/local migration numbers immediately
-- before push and renumber if 0204 was taken in the meantime (0205 cites it).
--
-- 탈퇴한 사용자의 프로모 로트도 광고 보상 로트처럼 지운다
-- (결정 2026-09-27, Simon 위임 하의 Relay: "프로모 로트도 계정과 함께 삭제").
--
-- 0202 는 계정 삭제 직전 트리거로 ad_reward 로트만 지웠고, 구매·프로모 로트는
-- 0134 의 ON DELETE SET NULL 로 사용자 칸만 비운 채 남겼다. 그 SET NULL 이 있는
-- 이유는 구매다 - 민법 제146조 취소권 기간이 계정보다 오래 살아서 구매 사실과
-- 미사용 잔량의 증거가 계정과 함께 사라지면 안 된다. 프로모(promo)는 광고 보상과
-- 같이 돈을 낸 기록이 아니다(grant_credits_free 가 둘을 같은 경로로 준다,
-- amount_cents NULL). 그러니 취소권 증거로 남길 이유가 없다.
--
-- 무엇을 지우나. 0202 와 같은 모양이다: 이 사용자의 promo 여는 행과, lot_id 로
-- 그 행을 가리키는 spend · spend_refund · expire · adjust 행. 여는 행만 지우면 짝
-- 잃은 소비 행이 남으므로 로트에 속한 행을 모두 지운다. 구매 로트와 그 소비
-- 행은 건드리지 않는다 - 0134 의 SET NULL 이 그대로 적용된다. 이미 사용자 칸이
-- 비어 버린 과거 행(있다면)은 누구의 것인지 알 수 없으므로 건드리지 않는다.
--
-- 함수 이름은 0202 그대로 둔다(erase_ad_reward_ledger_on_account_delete). 이름을
-- 바꾸면 트리거를 다시 묶어야 하고 그 사이가 빈다. CREATE OR REPLACE 는 트리거
-- 결합 · 소유자 · ACL 을 그대로 두고 본문만 바꾼다. 이름이 이제 절반만 맞는다는
-- 사실은 COMMENT 에 적는다.
--
-- 등록부(erasure_registry)의 credit_ledger 사유는 0205 가 따로 고친다. 등록부를
-- 고치는 파일은 0189 되돌리기 뒤에 통째로 다시 적용되므로 생성 블록만 담아야
-- 한다(check:erasure-registry G7). 이 파일은 등록부를 읽지도 쓰지도 않는다.
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
  -- 이 사용자의 무상 로트(광고 보상 · 프로모)에 속한 행만 지운다. 로트는 한
  -- 사용자의 것이라(stamp_lot 이 강제) user_id 조건은 방어용 이중 확인이다.
  -- 구매 로트는 여기 들지 않는다: 0134 의 ON DELETE SET NULL 이 증거로 남긴다.
  DELETE FROM public.credit_ledger AS l
   WHERE l.user_id = OLD.id
     AND l.lot_id IN (
       SELECT o.id
         FROM public.credit_ledger AS o
        WHERE o.user_id = OLD.id
          AND o.kind IN ('ad_reward', 'promo')
     );
  RETURN OLD;
END;
$$;

-- 트리거 함수다. 누가 직접 부를 일이 없다. CREATE OR REPLACE 는 0202 가 걷어 둔
-- ACL 을 유지하지만, 규칙 B(scripts/check-definer-grants.ts)가 같은 파일의 회수를
-- 요구하고 그 편이 읽는 사람에게도 분명하다.
REVOKE EXECUTE ON FUNCTION public.erase_ad_reward_ledger_on_account_delete() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.erase_ad_reward_ledger_on_account_delete() IS
  '계정 삭제 직전(BEFORE DELETE ON public.users)에 그 사용자의 무상 로트를 credit_ledger 에서 지운다: 광고 보상(ad_reward, 0202)과 프로모(promo, 0204)의 여는 행과 그 로트의 모든 행. 이름은 0202 의 것을 트리거 결합 때문에 그대로 두었고, 이제 프로모도 다룬다. 구매 로트는 0134 의 ON DELETE SET NULL 로 user_id 만 비운 채 남는다(취소권 증거).';

COMMENT ON COLUMN public.credit_ledger.user_id IS
  'Account deletion treats lots by kind. Purchase lots (the opening row and every row drawn from it) stay with user_id NULL (ON DELETE SET NULL, like revenue_events): the 민법 제146조 window outlives the account, so do not change this FK to CASCADE. Ad-reward and promo lots (the opening row and every row drawn from it) are deleted instead, by the BEFORE DELETE trigger on public.users (0202, 0204).';

----------------------------------------------------------------------
-- 끝 상태를 적용 시점에 확인한다 (0202 와 같은 모양 + 본문이 promo 를 다루는가).
----------------------------------------------------------------------

DO $promo_lot_erasure_check$
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
              AND COALESCE(p.proconfig @> ARRAY['search_path=""']::text[], false)
              AND pg_catalog.strpos(p.prosrc, '''ad_reward''') > 0
              AND pg_catalog.strpos(p.prosrc, '''promo''') > 0
              AND pg_catalog.strpos(p.prosrc, '''purchase''') = 0
         FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'public.erase_ad_reward_ledger_on_account_delete()'::regprocedure
     )
     OR pg_catalog.has_function_privilege('service_role', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.erase_ad_reward_ledger_on_account_delete()', 'EXECUTE') THEN
    RAISE EXCEPTION '0204: promo-lot erasure trigger postcondition failed';
  END IF;
END;
$promo_lot_erasure_check$;
