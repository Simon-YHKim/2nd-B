-- rollback/0217_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- ⚠ 순서를 지킬 것. 이 파일은 마지막 단계다.
--   1. 웹 · 앱을 0217 이전 판으로 되돌린다 - 새 판은 삭제 뒤 영수증 화면
--      (/account-deleted)으로 보내고, 그 화면이 account-deletion-receipt 를 부른다.
--   2. account-deletion-receipt Edge 함수를 내린다(또는 그대로 두면 503 을 돌려준다).
--   3. delete-account 를 0217 이전 판으로 되돌려 배포한다. 새 판은 영수증 RPC 가 없으면
--      영수증 번호 없이 삭제를 끝내므로(삭제권 우선) 순서를 어겨도 삭제는 멈추지 않지만,
--      배포 게이트(check-edge-function-schema-deps)가 새 판의 재배포를 막는다.
--   4. 그다음에 이 파일을 돌린다.
--
-- ⚠ 영수증 행이 모두 사라진다. 영수증에는 계정 식별자가 없어서 개인정보 손실은 아니지만,
--   이미 영수증 번호를 받은 사용자는 그 번호로 더는 조회할 수 없다.

DO $receipt_purge_unschedule$
DECLARE
  j record;
BEGIN
  IF pg_catalog.to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'purge-expired-account-deletion-receipts' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$receipt_purge_unschedule$;

DROP TRIGGER IF EXISTS trg_users_issue_account_deletion_receipt ON public.users;

DROP FUNCTION IF EXISTS public.purge_expired_account_deletion_receipts();
DROP FUNCTION IF EXISTS public.get_account_deletion_receipt(uuid);
DROP FUNCTION IF EXISTS public.record_account_deletion_receipt_sweeps(uuid, jsonb);
DROP FUNCTION IF EXISTS public.issue_account_deletion_receipt();
DROP FUNCTION IF EXISTS public.attach_account_deletion_receipt(uuid, uuid);

DROP INDEX IF EXISTS public.account_deletion_tombstones_pending_receipt_key;
ALTER TABLE IF EXISTS public.account_deletion_tombstones
  DROP COLUMN IF EXISTS pending_receipt_id;

DROP TABLE IF EXISTS public.account_deletion_receipts;
