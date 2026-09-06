-- 0188: a deleted account's still-valid JWT must not be able to write new raw clippings.
--
-- THE HOLE. `delete-account` erases auth.users, the cascade removes the profile,
-- and a bounded sweep clears raw-clippings/<userId>/. But a JWT already issued to
-- that user stays cryptographically valid until it expires (Supabase default 1h),
-- and `auth.uid()` reads the token's `sub` claim -- it is not a table lookup. The
-- 0074 INSERT policy checks only that the path prefix equals auth.uid():
--
--   WITH CHECK (bucket_id = 'raw-clippings'
--               AND (storage.foldername(name))[1] = auth.uid()::text)
--
-- So that token can upload NEW objects into raw-clippings/<deletedUserId>/ after
-- the sweep already finished. Nothing sweeps again, and the objects have no owner
-- row: orphaned PII that survives a deletion the user was told had completed.
-- This is the "발급 JWT/동시 업로드 ... 동시쓰기 차단" item in the account-deletion
-- audit (docs/research/2026-09-05-document-system-audit.md, L6).
--
-- THE FENCE. Require the profile row to still exist for writes:
--
--   AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()))
--
-- `users_self_select` (0009) lets an authenticated caller read their own row, so
-- this evaluates true while the account lives and false once the cascade removed
-- it. It fails closed only in the correct direction.
--
-- WRITES ONLY. SELECT and DELETE keep no existence check on purpose. Blocking
-- reads would not protect anything the deletion did not already remove, and
-- blocking deletes would stop the cleanup we actually want. The service_role used
-- by delete-account / export-account bypasses RLS entirely, so neither erasure nor
-- export is affected (same note as 0074).
--
-- WHY THE POLICIES ARE RECREATED RATHER THAN ALTERED. 0074 builds them through
-- EXECUTE so the file parses on a plain-Postgres CI database where storage.* does
-- not exist. ALTER POLICY would need the same guard and could not run where the
-- policy is absent, so DROP + CREATE inside the same existence guard keeps the two
-- migrations shaped alike and idempotent.
--
-- initplan: every auth.uid() here is written (select auth.uid()). 0102 wrapped the
-- schema for exactly this reason -- Postgres re-evaluates a bare auth.uid() once
-- per row -- but 0102's loop reads pg_policies WHERE schemaname = 'public'
-- (0102:50,103), so the storage.objects policies from 0074 were never covered.
-- Verified before writing, not assumed. All four are recreated wrapped so this
-- bucket stops being the one place with the old shape; only INSERT and UPDATE gain
-- the existence check. auth.uid() is STABLE, so the wrap changes when the value is
-- computed, never what it returns -- no policy gains or loses a row.

DO $mig$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema absent (non-Supabase env) - skipping raw-clippings deleted-account fence';
    RETURN;
  END IF;

  -- Reads: unchanged boundary, wrapped call only.
  DROP POLICY IF EXISTS "raw_clippings_owner_select" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
    )$p$;

  -- Writes: owner prefix AND the profile still exists.
  DROP POLICY IF EXISTS "raw_clippings_owner_insert" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
      AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()))
    )$p$;

  DROP POLICY IF EXISTS "raw_clippings_owner_update" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
      AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()))
    )
    WITH CHECK (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
      AND EXISTS (SELECT 1 FROM public.users WHERE id = (select auth.uid()))
    )$p$;

  -- Deletes: unchanged boundary, wrapped call only. A user whose account is gone
  -- has no session to reach this with anyway, and an operator cleaning up orphans
  -- uses the service role.
  DROP POLICY IF EXISTS "raw_clippings_owner_delete" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
    )$p$;
END
$mig$;

-- NOT APPLIED BY THIS FILE. Operating application is console-session owned
-- (docs/SESSION-OWNERSHIP.md §1) and requires Simon's explicit approval, the way
-- 0147 and 0165 were applied on 2026-09-06. This commit adds the file only.
--
-- This fence closes the window for NEW writes. Objects uploaded before it is
-- applied, in the gap between a past deletion and its sweep, are not removed by
-- this migration; that is a separate operator cleanup against the service role.
