-- 0228_account_deletion_ops_erasure_registry.sql
-- 등록부 한 행만 더한다(0217 이 계정 삭제 작업 원장 account_deletion_ops 를 만든 뒤).
-- owner_id 는 진행 중에만 계정 id 를 갖는 소유자 열이라 check:erasure-registry G1 이 분류를
-- 요구한다. 분류는 retained: 콘텐츠 삭제(erase_my_data)는 이 표를 건드리지 않는다.
-- 번호: 0217 은 코디네이터가 예약했다. 등록부 forward 파일은 생성 블록만 담아야 해서(G7)
-- 0217 안에 넣을 수 없고, 0218~0224 · 0229 · 0230 · 0231 은 다른 작업이 쓰고 있어 0228 을 썼다(사유 개정은 0227).
-- 이 파일은 rollback/0189_down.sql 의 c_names 와 CI 왕복 단계의 목록에도 들어 있다.
-- 아래 블록은 scripts/erasure-registry-forward.ts 의 renderRegistryAdditionsSql 출력 그대로다.
-- <<< erasure-registry:additions from db/erasure-registry.json >>>
-- Generated additions only. Existing registry rows and user data remain untouched.
DO $erasure_additions$
DECLARE target record;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'erasure_additions_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_additions_rpc_must_remain_locked';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('account_deletion_ops', 'owner_id')
  ) AS additions(table_name,owner_column) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relname=target.table_name AND c.relkind IN ('r','p')
        AND a.attname=target.owner_column AND a.attnum>0 AND NOT a.attisdropped
        AND a.atttypid='uuid'::regtype) THEN
      RAISE EXCEPTION 'erasure_additions_owner_table_missing';
    END IF;
  END LOOP;
END $erasure_additions$;
WITH incoming (table_name,owner_column,class,delete_order,cascades_from,reason) AS (
  VALUES
    ('account_deletion_ops', 'owner_id', 'retained', NULL, NULL, '계정 삭제 작업 원장이자 삭제 영수증(0217). 콘텐츠 삭제(erase_my_data)는 건드리지 않는다 - 진행 중인 삭제의 상태와 작업 증표 해시라서, 지우면 기기가 자기 삭제의 결과를 확인할 길이 끊긴다. owner_id 는 접수 · 실행 중에만 차고 프로필 행이 지워지는 트랜잭션의 트리거가 비운다. 완료 행은 365일, 실패 · 포기 행은 30일 뒤 purge_account_deletion_ops() 가 매시 지운다(0217).')
)
INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)
SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i
ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;
-- <<< /erasure-registry:additions >>>
