-- 0229_interview_sessions_erasure_registry.sql
-- 등록부 전용. 0220 이 만든 interview_sessions 한 행을 삭제 등록부에 더한다(account_delete_only).
--
-- 0220 과 나눈 이유: 0189 롤백(rollback/0189_down.sql)은 등록부를 지우고 이 파일만 다시 적용해
-- 행을 되살린다. 표 · 함수를 만드는 0220 을 다시 돌리지 않게, 등록부 행은 이 파일에만 둔다
-- (0195 · 0198 과 같은 분리, scripts/erasure-registry-forward.ts G7: 생성된 블록과 주석만).
--
-- ⚠ 번호: 0220 은 이 작업에 예약된 번호이고, 이 파일의 번호는 따로 예약된 것이 아니다.
--   2026-10-07 origin/main 기준 0223 · 0224 · 0230 이 쓰였고 0225~0229 는 비어 있었다. 다른 작업과
--   겹치면 파일 이름과 db/erasure-registry.json 의 forwardAdditions 키를 함께 바꾼다(ledger 이름
--   interview_sessions_erasure_registry 는 그대로라 rollback/0189_down.sql 의 c_names 는 그대로다).
--
-- 아래 블록은 scripts/erasure-registry-forward.ts 의 renderRegistryAdditionsSql 이 그렸다.
-- 손으로 고치지 말고 JSON 을 고친 뒤 다시 그린다(check:erasure-registry G7 이 한 글자까지 대조한다).
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 자기 트랜잭션으로 감싼다.
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
    ('interview_sessions', 'owner_id')
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
    ('interview_sessions', 'owner_id', 'account_delete_only', NULL, NULL, '인터뷰 판정 원장의 세션 행(0220). 숫자 · 열거값만 담고 원문이 없다. 0220 이 클라이언트 권한과 정책을 두지 않아 소유자에게 삭제 경로가 없다 - 같은 재료에서 나온 interview_coverage(0143)와 같은 칸이다. 저장하지 않은 세션은 마지막 활동 6시간 뒤 anonymize_interview_sessions() 가 소유자를 비워 소유자 없는 집계로만 남고, 계정 삭제 때는 소유자가 남아 있는 행이 auth.users 연쇄로 지워진다. 판정 행(interview_probe_verdicts)은 소유자 열이 없고 세션을 따라 지워진다.')
)
INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)
SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i
ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;
-- <<< /erasure-registry:additions >>>
