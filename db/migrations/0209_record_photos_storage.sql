-- 0209_record_photos_storage.sql
--
-- Photos attached to a 글 record (Simon 2026-09-30: "글 - 메모 / 4W1H 화면에서
-- 사진을 추가할 수 있게 해"; GO the same day for a NEW private bucket rather
-- than widening raw-clippings).
--
-- The client (src/lib/capture/record-photos.ts, #1950) re-encodes every picked
-- photo to JPEG (EXIF/GPS dropped, about 1 MB), uploads it to
--   record-photos/<auth.uid()>/photo-<uuid>.jpg
-- and links the path from records.structured.photos. Nothing here or there
-- calls an AI service.
--
-- Why a bucket of its own: raw-clippings is hardened to markdown on purpose
-- (0186/0192: allowed_mime_types ['text/markdown'], 1 MiB, INSERT only at
-- `<uid>/%.md`) and is the object store the account-deletion fence was built
-- around. Widening it would weaken that hardening for every clipping.
--
-- This file mirrors the hardened raw-clippings shape for the new bucket:
--   1. private bucket, image/jpeg only, 2 MiB per object (the client stays
--      near 1 MB; the headroom only absorbs encoder variance);
--   2. owner-only SELECT / INSERT / DELETE for `authenticated`. No UPDATE
--      policy (a photo is never rewritten or moved) and nothing for `anon`.
--      INSERT is limited to the flat `<uid>/photo-<id>.jpg` name;
--   3. the 0192 account-deletion fence covers this bucket too: a BEFORE INSERT
--      OR UPDATE trigger takes the same owner-keyed advisory lock and refuses
--      the write once the owner's tombstone exists, so the delete-account sweep
--      of this bucket cannot be outrun by a late upload.
--
-- Storage bytes are not rows: db/erasure-registry.json classifies public
-- tables only, and this migration creates none. Erasure of the objects is the
-- delete-account Edge function's job (it now sweeps raw-clippings AND
-- record-photos behind the fence, before Auth deletion), and export-account
-- lists them with signed URLs.
--
-- Deploy order: this migration -> delete-account + export-account Edge deploys
-- -> client switch (RECORD_PHOTOS_ENABLED). The Edge functions fail closed on
-- a missing bucket, so deploying them first would block account deletion.
--
-- storage.* is Supabase-managed and absent from a plain PostgreSQL. The DO
-- block takes the same NOTICE branch as 0074/0186/0192 there; CI seeds a
-- minimal storage stub so the policies and trigger really execute.

CREATE OR REPLACE FUNCTION public.guard_record_photo_account_deletion()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_owner_text text;
  v_owner_texts text[];
  v_owner uuid;
  v_locked_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.bucket_id IS DISTINCT FROM 'record-photos' THEN
      RETURN NEW;
    END IF;
    v_owner_texts := ARRAY[pg_catalog.split_part(NEW.name, '/', 1)];
  ELSE
    SELECT pg_catalog.array_agg(candidate.owner_text ORDER BY candidate.owner_text)
    INTO v_owner_texts
    FROM (
      SELECT DISTINCT owner_text
      FROM pg_catalog.unnest(ARRAY[
        CASE WHEN OLD.bucket_id = 'record-photos'
          THEN pg_catalog.split_part(OLD.name, '/', 1) END,
        CASE WHEN NEW.bucket_id = 'record-photos'
          THEN pg_catalog.split_part(NEW.name, '/', 1) END
      ]) AS owners(owner_text)
      WHERE owner_text IS NOT NULL
    ) AS candidate;

    IF v_owner_texts IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  FOREACH v_owner_text IN ARRAY v_owner_texts LOOP
    IF v_owner_text IS NULL
       OR v_owner_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'record_photos_owner_invalid';
    END IF;
    v_owner := v_owner_text::uuid;

    -- Same lock key as public.begin_account_deletion (0192): an upload that
    -- started first commits before the fence; one that arrives second waits
    -- and then sees the committed tombstone.
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(v_owner::text, 260913)
    );

    v_locked_user := NULL;
    SELECT u.id
    INTO v_locked_user
    FROM public.users AS u
    WHERE u.id = v_owner
    FOR KEY SHARE;

    IF v_locked_user IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'record_photos_owner_missing';
    END IF;

    -- A separate statement after the possibly waiting row lock, so it takes a
    -- fresh snapshot under READ COMMITTED (same reasoning as 0192).
    IF EXISTS (
      SELECT 1
      FROM public.account_deletion_tombstones AS tombstone
      WHERE tombstone.user_id = v_owner
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'account_deletion_in_progress';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_record_photo_account_deletion()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_record_photo_account_deletion()
  FROM anon;

DO $record_photos$
BEGIN
  IF pg_catalog.to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema absent - skipping record-photos bucket';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('record-photos', 'record-photos', false, 2097152, ARRAY['image/jpeg']::text[])
  ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/jpeg']::text[];

  IF pg_catalog.to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'storage.objects is required when storage.buckets exists';
  END IF;

  IF NOT COALESCE(
    (
      SELECT relation.relrowsecurity
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = pg_catalog.to_regclass('storage.objects')
    ),
    false
  ) THEN
    RAISE EXCEPTION 'storage.objects RLS must be enabled before record-photos policies';
  END IF;

  DROP POLICY IF EXISTS "record_photos_owner_select" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "record_photos_owner_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'record-photos'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )$policy$;

  -- Flat, non-empty `<uid>/photo-<id>.jpg` only: the export and deletion
  -- sweeps enumerate the owner prefix flat, and the client never nests.
  DROP POLICY IF EXISTS "record_photos_owner_insert" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "record_photos_owner_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'record-photos'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE (SELECT auth.uid())::text || '/photo-%.jpg'
      AND pg_catalog.length(name) > pg_catalog.length((SELECT auth.uid())::text) + 11
    )$policy$;

  -- No UPDATE policy on purpose: photos are write-once. A leftover one from a
  -- hand-made policy would let an owner rename into another shape.
  DROP POLICY IF EXISTS "record_photos_owner_update" ON storage.objects;

  DROP POLICY IF EXISTS "record_photos_owner_delete" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "record_photos_owner_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'record-photos'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )$policy$;

  EXECUTE 'DROP TRIGGER IF EXISTS guard_record_photo_account_deletion ON storage.objects';
  EXECUTE 'CREATE TRIGGER guard_record_photo_account_deletion
    BEFORE INSERT OR UPDATE ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION public.guard_record_photo_account_deletion()';
END;
$record_photos$;
