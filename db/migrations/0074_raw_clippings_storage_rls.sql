-- 0074_raw_clippings_storage_rls.sql
-- Version-control the raw-clippings bucket + its access boundary (audit W14).
--
-- Until now the private bucket + owner-scoped RLS lived ONLY as a manual Supabase
-- Dashboard step (documented in src/lib/wiki/storage.ts), so the app's most
-- PII-rich content -- the user's raw clipped markdown at
-- raw-clippings/<userId>/<slug>.md -- had its access boundary OUTSIDE migrations,
-- CI, and review. This migration makes the private bucket + the owner-scoped
-- policies part of the schema so a broken boundary fails loudly.
--
-- Path convention (src/lib/wiki/storage.ts rawClippingPath): the object name is
-- <userId>/<slug>.md, so the owner is the first path segment:
--   (storage.foldername(name))[1] = auth.uid()::text
-- The delete-account / export-account edge functions use the service_role, which
-- bypasses RLS, so these policies do not affect account erasure/export.
--
-- storage.* is a Supabase-managed schema absent from the plain-Postgres CI DB, so
-- everything is guarded behind a storage.buckets existence check: a no-op there,
-- fully applied (idempotently) on Supabase.

DO $mig$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema absent (non-Supabase env) - skipping raw-clippings bucket RLS';
    RETURN;
  END IF;

  -- 1. Ensure the bucket exists and is private (idempotent; also repairs a bucket
  --    that was accidentally created public).
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('raw-clippings', 'raw-clippings', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  -- 2. Owner-scoped RLS on storage.objects for this bucket (created via EXECUTE so
  --    the migration parses even where storage.objects is absent).
  DROP POLICY IF EXISTS "raw_clippings_owner_select" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;

  DROP POLICY IF EXISTS "raw_clippings_owner_insert" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;

  DROP POLICY IF EXISTS "raw_clippings_owner_update" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;

  DROP POLICY IF EXISTS "raw_clippings_owner_delete" ON storage.objects;
  EXECUTE $p$CREATE POLICY "raw_clippings_owner_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;
END $mig$;
