-- 0163_account_deletion_hardening.sql (provisional number)
--
-- Account deletion must not turn an unverified user contribution into a
-- globally readable curated source. Deleting its author now deletes that row;
-- deleting a verifier only clears the verifier reference. A service-only RPC
-- also closes the stateless-JWT window for this sensitive operation by checking
-- the freshly issued token's session against auth.sessions.
-- The Storage write boundary is narrowed to the canonical flat Markdown path;
-- legacy nested objects remain readable/deletable so account erasure can remove
-- them, but clients cannot create or mutate more of them.

BEGIN;

DO $migration$
DECLARE
  v_constraint name;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
    FROM pg_catalog.pg_constraint AS c
    JOIN pg_catalog.pg_attribute AS a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.knowledge_sources'::pg_catalog.regclass
      AND c.confrelid = 'public.users'::pg_catalog.regclass
      AND c.contype = 'f'
      AND pg_catalog.array_length(c.conkey, 1) = 1
      AND a.attname IN ('added_by', 'verified_by')
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.knowledge_sources DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
END;
$migration$;

ALTER TABLE public.knowledge_sources
  ADD CONSTRAINT knowledge_sources_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES public.users (id) ON DELETE CASCADE,
  ADD CONSTRAINT knowledge_sources_verified_by_fkey
    FOREIGN KEY (verified_by) REFERENCES public.users (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_session(
  p_user_id uuid,
  p_session_id uuid,
  p_issued_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claims jsonb := nullif(
    pg_catalog.current_setting('request.jwt.claims', true),
    ''
  )::jsonb;
  v_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    v_claims ->> 'role'
  );
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     OR p_user_id IS NULL
     OR p_session_id IS NULL
     OR p_issued_at IS NULL
     OR p_issued_at < pg_catalog.now() - interval '5 minutes'
     OR p_issued_at > pg_catalog.now() + interval '1 minute' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_account_deletion_session(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

DO $storage_hardening$
BEGIN
  IF pg_catalog.to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema absent - skipping raw-clippings hardening';
    RETURN;
  END IF;

  UPDATE storage.buckets
  SET public = false,
      file_size_limit = 1048576,
      allowed_mime_types = ARRAY['text/markdown']::text[]
  WHERE id = 'raw-clippings';

  IF pg_catalog.to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'storage.objects is required when storage.buckets exists';
  END IF;

  DROP POLICY IF EXISTS "raw_clippings_owner_insert" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "raw_clippings_owner_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE auth.uid()::text || '/%.md'
      AND pg_catalog.length(name) > pg_catalog.length(auth.uid()::text) + 4
      AND EXISTS (
        SELECT 1 FROM public.users AS active_user
        WHERE active_user.id = (SELECT auth.uid())
      )
    )$policy$;

  DROP POLICY IF EXISTS "raw_clippings_owner_update" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "raw_clippings_owner_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE auth.uid()::text || '/%.md'
      AND pg_catalog.length(name) > pg_catalog.length(auth.uid()::text) + 4
      AND EXISTS (
        SELECT 1 FROM public.users AS active_user
        WHERE active_user.id = (SELECT auth.uid())
      )
    )
    WITH CHECK (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE auth.uid()::text || '/%.md'
      AND pg_catalog.length(name) > pg_catalog.length(auth.uid()::text) + 4
      AND EXISTS (
        SELECT 1 FROM public.users AS active_user
        WHERE active_user.id = (SELECT auth.uid())
      )
    )$policy$;
END;
$storage_hardening$;

GRANT EXECUTE ON FUNCTION public.verify_account_deletion_session(uuid, uuid, timestamptz)
  TO service_role;

COMMIT;
