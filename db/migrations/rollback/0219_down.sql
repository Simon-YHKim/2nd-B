-- rollback/0219_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- 순서: 클라이언트를 먼저 되돌릴 필요는 없다. 0219 를 읽고 부르는 앱은 읽기가 실패하면
-- (열 없음 42703 · RPC 없음 PGRST202) 기기 값으로 돌아가고, 쓰기 실패는 경고만 남긴다
-- (src/lib/onboarding/account-first-run.ts). 그래서 이 파일은 언제 돌려도 앱이 막히지 않는다.
--
-- ⚠ 잃는 것: 서버에 기록된 온보딩 완료 시각과 첫날 되돌아보기 본 시각이 함께 지워진다.
-- 되돌린 뒤에는 W-12 이전처럼 새 기기 · 시크릿 창에서 기존 계정에 온보딩이 다시 뜬다.
-- 다시 적용하면 기록 · 자료가 있는 계정만 가입 시각으로 다시 채워진다(0219 의 이행 규칙).
--
-- 한 트랜잭션이다(CD-04). 함수 둘과 열 둘은 함께 없어지거나 함께 남는다. 함수만 지워지고
-- 열이 남으면 읽기는 성공해서 앱이 서버 값을 채택하는데 기록 RPC 는 없어서, 완료 표식이
-- NULL 인 계정은 실행할 때마다 온보딩을 다시 본다. users 잠금을 10초 안에 못 얻거나
-- 어느 문장이든 실패하면 psql 은 남은 문장을 aborted 로 거절하고 COMMIT 은 ROLLBACK 이
-- 된다. 그때는 아무것도 바뀌지 않았으니 한가할 때 다시 돌린다.

BEGIN;

SET LOCAL lock_timeout = '10s';

DROP FUNCTION IF EXISTS public.mark_onboarding_completed(uuid);
DROP FUNCTION IF EXISTS public.mark_ttfv_seen(uuid);

ALTER TABLE public.users
  DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS ttfv_seen_at;

COMMIT;
