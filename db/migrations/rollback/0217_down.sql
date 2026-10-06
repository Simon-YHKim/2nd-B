-- rollback/0217_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- ⚠ 순서를 지킬 것. 이 파일은 마지막 단계다.
--   1. 웹 · 앱을 0217 이전 판으로 되돌린다. 새 판은 삭제 전에 begin 을 보내고, 옛 Edge 의 400 을
--      받으면 옛 흐름({})으로 내려가므로 순서를 어겨도 삭제는 막히지 않는다.
--   2. account-deletion-receipt Edge 함수를 내린다(남겨 두면 조회가 503 으로 닫힌다).
--   3. delete-account 를 0217 이전 판으로 되돌려 배포한다. 새 판은 begin_account_deletion_op 이
--      없으면 400 op_unsupported 로 앱을 옛 흐름으로 보내지만, 옛 본문({})은 start_legacy_account_
--      deletion_op 이 없으면 503 으로 닫힌다. 그래서 이 파일보다 먼저 되돌린다.
--   4. 그다음에 이 파일을 돌린다. 0228 · 0229 의 등록부 변경도 여기서 함께 되돌린다
--      (0228 이 더한 account_deletion_ops 행을 지우고, 0229 가 바꾼 tombstone 사유를 0198 문장으로).
--   5. 다시 올리려면 supabase_migrations.schema_migrations 에서 0217 · 0228 · 0229 행을 지운 뒤
--      push 한다(이 파일은 원장을 건드리지 않는다 - 손으로 돌리는 파일이 원장을 몰래 고치지 않게).
--
-- ⚠ 영수증 행이 모두 사라진다. 완료 행에는 계정 식별자가 없어서 개인정보 손실은 아니지만,
--   이미 영수증 번호를 받은 사용자는 그 번호로 더는 조회할 수 없다. 진행 중 · 실패 행은
--   owner_id 를 갖고 있으므로 지우는 것이 개인정보 쪽으로는 안전한 방향이다.
-- ⚠ Q6 해제가 사라진다. 이후 Auth 삭제 전에 실패한 계정의 tombstone 은 0192 대로 다시 영구히 남는다.

DO $ops_maintenance_unschedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF pg_catalog.to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;
  FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1'
    USING 'account-deletion-ops-maintenance'
  LOOP
    EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
  END LOOP;
END;
$ops_maintenance_unschedule$;

DROP TRIGGER IF EXISTS trg_users_complete_account_deletion_ops ON public.users;

DROP FUNCTION IF EXISTS public.purge_account_deletion_ops();
DROP FUNCTION IF EXISTS public.complete_account_deletion_ops();
DROP FUNCTION IF EXISTS public.consume_account_deletion_receipt_lookup(text);
DROP FUNCTION IF EXISTS public.get_account_deletion_op(uuid, text);
DROP FUNCTION IF EXISTS public.record_account_deletion_op_sweeps(uuid, jsonb);
DROP FUNCTION IF EXISTS public.fail_account_deletion_op(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.start_legacy_account_deletion_op(uuid);
DROP FUNCTION IF EXISTS public.start_account_deletion_op(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.begin_account_deletion_op(uuid, uuid, bigint, text);
DROP FUNCTION IF EXISTS public.account_deletion_ops_release_failed_fence(uuid);
DROP FUNCTION IF EXISTS public.account_deletion_ops_settle_live_owner(uuid);

DROP TABLE IF EXISTS public.account_deletion_receipt_lookup_limits;
DROP TABLE IF EXISTS public.account_deletion_ops;

-- 0228 · 0229 의 등록부 변경을 되돌린다. 등록부(0189)가 없으면 할 일이 없다.
DO $registry_revert$
BEGIN
  IF pg_catalog.to_regclass('public.erasure_registry') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.erasure_registry WHERE table_name = 'account_deletion_ops';
  UPDATE public.erasure_registry
     SET reason = 'Durable account-deletion fence. Content deletion leaves it unchanged; it intentionally survives account deletion without an auth FK so late requests cannot recreate deleted account data.'
   WHERE table_name = 'account_deletion_tombstones';
END;
$registry_revert$;
