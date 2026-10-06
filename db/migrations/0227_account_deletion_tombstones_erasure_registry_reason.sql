-- 0227_account_deletion_tombstones_erasure_registry_reason.sql
-- 등록부 사유 한 칸만 바꾼다(Simon 채택 Q6, DECISIONS.md 26.10.06 22:33 ①).
-- 0217 이 Auth 삭제 전에 실패가 확정된 삭제의 tombstone 을 같은 계정 advisory lock 아래에서
-- 풀게 되면서, 0198 이 적은 "의도적으로 영구히 남는다" 가 더는 전부 사실이 아니다.
-- class 는 retained 그대로다(콘텐츠 삭제는 여전히 이 표를 건드리지 않는다). 0198 은 배포된
-- 역사라 고치지 않고 db/erasure-registry.json 의 forwardRevisions 가 옛 사유를 기록한다.
-- 0228 과 따로 둔 이유: G7 은 한 파일이 additions 와 revisions 를 함께 갖는 것을 막는다.
-- 번호: 0229 는 다른 작업(인터뷰 판정)이 잡아 두어 비어 있던 0227 을 썼다.
-- 이 파일은 rollback/0189_down.sql 의 c_names 와 CI 왕복 단계의 목록에도 들어 있다.
-- 아래 블록은 scripts/erasure-registry-forward.ts 의 renderRegistryRevisionsSql 출력 그대로다.
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
    ('account_deletion_tombstones', 'user_id', 'retained', NULL::int, NULL::text,
     'Durable account-deletion fence. Content deletion leaves it unchanged; it intentionally survives account deletion without an auth FK so late requests cannot recreate deleted account data.',
     '계정 삭제 울타리(0192). 콘텐츠 삭제는 건드리지 않는다. 계정이 삭제된 뒤에도 auth FK 없이 남아, 늦게 도착한 요청이 지워진 계정의 데이터를 다시 만들지 못하게 한다. 예외는 하나다: Auth 삭제 전에 실패가 확정된 삭제의 울타리는 같은 계정 advisory lock 아래에서, 그 계정에 실행 중인 삭제 작업이 없고 울타리를 마지막으로 건드린 요청이 실패로 끝났을 때 풀린다(0217 · Simon 채택 Q6). 계정이 살아 있는데 업로드 · 동의 변경 · 북극성 생성이 영구히 거절되지 않게 하기 위해서다.')
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
