-- rollback/0219_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND, deliberately, and ONLY like this (design P7, CD2-04):
--
--   psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/rollback/0219_down.sql
--
-- There is no BEGIN or COMMIT in this file. --single-transaction makes the whole
-- file one transaction, so the functions and the columns go together or stay
-- together (CD-04: a half-applied rollback left the columns readable without
-- the functions). Because the file never commits, \i-ing it inside someone
-- else's open transaction cannot commit their work either (CD2-04). Run without
-- a transaction (plain autocommit psql), the first check below stops it before
-- anything is dropped.
--
-- 순서: 클라이언트를 먼저 되돌릴 필요는 없다. 0219 를 부르는 앱은 열 · 함수가 없으면
-- 첫 실행 화면을 스스로 열지 않는다(fail-closed, src/lib/onboarding/account-first-run.ts).
-- 그래서 되돌린 동안 새 계정은 환영을 자동으로 보지 못한다(설계 8절, 받아들임). 앱이 막히지는 않는다.
--
-- ⚠ 잃는 것: 서버에 기록된 다섯 열(허락 · 완료 · 열람 시각과 증표)이 함께 지워진다.
-- 다시 적용하면 기록 · 자료가 있는 계정만 가입 시각으로 다시 채워진다(0219 의 이행 규칙).

-- Refuse to run outside one transaction. SET LOCAL outside a transaction block
-- has no effect (PostgreSQL only warns), so the setting is still unset on the
-- next statement exactly when each statement is committing on its own.
SET LOCAL first_run_rollback.in_one_transaction = 'yes';
DO $single_transaction$
BEGIN
  IF pg_catalog.current_setting('first_run_rollback.in_one_transaction', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'rollback/0219_down.sql must run as one transaction: psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/rollback/0219_down.sql';
  END IF;
END
$single_transaction$;

SET LOCAL lock_timeout = '10s';

DROP FUNCTION IF EXISTS public.claim_first_run(uuid, text);
DROP FUNCTION IF EXISTS public.finish_first_run(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.first_run_marks_json(uuid);

ALTER TABLE public.users
  DROP COLUMN IF EXISTS onboarding_claimed_at,
  DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS ttfv_claimed_at,
  DROP COLUMN IF EXISTS ttfv_claim_token,
  DROP COLUMN IF EXISTS ttfv_seen_at;
