-- rollback/0209_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- ⚠ 순서를 지킬 것. 이 파일은 마지막 단계다.
--   1. 클라이언트 스위치(RECORD_PHOTOS_ENABLED)를 먼저 끄고 배포한다 - 새 사진이
--      더 올라오지 않게.
--   2. delete-account · export-account 를 0209 이전 판으로 되돌려 배포한다.
--      새 판은 record-photos 버킷이 없으면 계정 삭제를 503 으로 막는다(fail
--      closed). 버킷을 먼저 지우면 그 사이 계정 삭제가 전부 멈춘다.
--   3. 그다음에 이 파일을 돌린다.
--
-- 사진 파일과 버킷 자체는 이 SQL 이 지우지 않는다. Supabase 는 storage 테이블의
-- 직접 DELETE 를 막고(Storage API 를 쓰라는 보호 트리거), 행만 지우면 바이트가
-- 남는다. 정책이 없어진 버킷은 authenticated 에게 닫힌다. 버킷까지 없애려면
-- 대시보드(Storage) 또는 Storage API 로 먼저 비운 뒤 삭제한다.

DO $record_photos_down$
BEGIN
  IF pg_catalog.to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS guard_record_photo_account_deletion ON storage.objects';
    DROP POLICY IF EXISTS "record_photos_owner_select" ON storage.objects;
    DROP POLICY IF EXISTS "record_photos_owner_insert" ON storage.objects;
    DROP POLICY IF EXISTS "record_photos_owner_update" ON storage.objects;
    DROP POLICY IF EXISTS "record_photos_owner_delete" ON storage.objects;
  END IF;

END;
$record_photos_down$;

DROP FUNCTION IF EXISTS public.guard_record_photo_account_deletion();
