-- 0205_credit_ledger_erasure_registry_reason.sql
-- Registry-only reason revision after 0204. Re-scan remote/local migration
-- numbers immediately before push and renumber if 0205 was taken meanwhile
-- (rename the key in db/erasure-registry.json forwardRevisions, the c_names
-- entry in rollback/0189_down.sql and the round-trip step's lists with it).
--
-- 등록부의 credit_ledger 사유가 사실과 달라졌다. 0189 시드는 "계정 삭제 때도
-- SET NULL 로 남긴다" 고 적었는데, 0202 부터 광고 보상 로트는, 0204 부터 프로모
-- 로트는 계정 삭제 직전 트리거가 지운다. 남는 것은 구매 로트뿐이다.
--
-- 사유(reason) 한 칸만 바꾼다. class 는 retained 그대로다 - 콘텐츠 삭제
-- (erase_my_data)는 여전히 이 표를 건드리지 않는다. 0189 는 배포된 역사라 고치지
-- 않고, db/erasure-registry.json 의 forwardRevisions 가 옛 사유를 기록한다.
-- check:erasure-registry (G7) 가 0189 시드를 그 옛 사유로 다시 그려 한 글자까지
-- 대조하고, 아래 블록을 현재 사유로 다시 그려 이 파일과 대조한다.
--
-- 이 파일은 rollback/0189_down.sql 의 c_names 에 있다. 되돌리기가 등록부를
-- 지우고 다시 민 뒤 0189 시드가 옛 사유를 다시 쓰므로, 이 파일도 함께 다시
-- 적용돼야 사유가 돌아온다. 그래서 이 파일에는 생성 블록과 주석만 둔다
-- (두 번 적용돼도 같은 행 하나의 사유만 같은 값으로 쓴다).
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 자기 트랜잭션으로 감싼다.

-- <<< erasure-registry:revisions from db/erasure-registry.json >>>
-- Generated reason revisions only. Owner, class, order and cascade stay as they were;
-- no row is added or removed and user data remains untouched.
DO $erasure_revisions$
DECLARE
  target record;
  v_rows bigint;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'erasure_revisions_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_revisions_rpc_must_remain_locked';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('credit_ledger', 'user_id', 'retained', NULL::int, NULL::text,
     '구매 사실과 미사용 잔량의 증거. 취소권 기간이 계정보다 오래 살아남으므로 계정 삭제 때도 SET NULL 로 남긴다(0134 · 설계서 F5).',
     '로트 종류마다 계정 삭제 때 운명이 다르다. 구매(purchase) 로트는 여는 행과 그 로트의 모든 행이 구매 사실과 미사용 잔량의 증거다. 취소권 기간이 계정보다 오래 살아남으므로 user_id 만 NULL 로 비우고 남긴다(0134 ON DELETE SET NULL · 설계서 F5). 광고 보상(ad_reward)·프로모(promo) 로트는 돈을 낸 기록이 아니므로, 계정 삭제 직전 public.users 의 BEFORE DELETE 트리거가 여는 행과 그 로트의 모든 행을 지운다(0202 · 0204). 콘텐츠 삭제(erase_my_data)는 이 표를 건드리지 않는다.')
  ) AS revisions(table_name,owner_column,class,delete_order,cascades_from,previous_reason,reason) LOOP
    UPDATE public.erasure_registry AS r SET reason = target.reason
     WHERE r.table_name = target.table_name AND r.owner_column = target.owner_column
       AND r.class = target.class AND r.delete_order IS NOT DISTINCT FROM target.delete_order
       AND r.cascades_from IS NOT DISTINCT FROM target.cascades_from
       AND r.reason IN (target.previous_reason, target.reason);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'erasure_revisions_row_not_in_recorded_state: %', target.table_name;
    END IF;
  END LOOP;
END $erasure_revisions$;
-- <<< /erasure-registry:revisions >>>
