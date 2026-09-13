-- UNNUMBERED_account_deletion_completion_fence.sql
--
-- INACTIVE DRAFT. Move to db/migrations only after the migration coordinator
-- reserves the then-current next number and the console owner has rehearsed the
-- storage.objects trigger against the deployed Supabase Storage schema.
--
-- Deployment order is migration -> Edge function -> client activation. The
-- compatibility wrapper makes the already-deployed Edge establish the same
-- durable fence during the short migration-to-function rollout interval.

CREATE TABLE IF NOT EXISTS public.account_deletion_tombstones (
  user_id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  deletion_started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_requested_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.account_deletion_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_tombstones FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_tombstones
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.begin_account_deletion(
  p_user_id uuid,
  p_session_id uuid,
  p_issued_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_claims jsonb := nullif(
    pg_catalog.current_setting('request.jwt.claims', true),
    ''
  )::jsonb;
  v_role text := COALESCE(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    v_claims ->> 'role'
  );
  v_locked_user uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     OR p_user_id IS NULL
     OR p_session_id IS NULL
     OR p_issued_at IS NULL
     OR p_issued_at < pg_catalog.now() - interval '5 minutes'
     OR p_issued_at > pg_catalog.now() + interval '1 minute' THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
  ) THEN
    RETURN false;
  END IF;

  -- The upload trigger takes the shared form of this same owner-keyed lock.
  -- An upload that started first commits before this fence; an upload that
  -- arrives second waits and then observes the committed tombstone.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 260913)
  );

  SELECT u.id
  INTO v_locked_user
  FROM public.users AS u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF v_locked_user IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.account_deletion_tombstones (
    user_id,
    session_id,
    deletion_started_at,
    last_requested_at
  ) VALUES (
    p_user_id,
    p_session_id,
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET session_id = EXCLUDED.session_id,
      last_requested_at = EXCLUDED.last_requested_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_account_deletion(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion(uuid, uuid, timestamptz)
  TO service_role;

-- Backward-compatible name used by the currently deployed Edge. VOLATILE is
-- required because verification now also publishes the durable write fence.
CREATE OR REPLACE FUNCTION public.verify_account_deletion_session(
  p_user_id uuid,
  p_session_id uuid,
  p_issued_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.begin_account_deletion(p_user_id, p_session_id, p_issued_at);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_account_deletion_session(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_session(uuid, uuid, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_raw_clipping_account_deletion()
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
    IF NEW.bucket_id IS DISTINCT FROM 'raw-clippings' THEN
      RETURN NEW;
    END IF;
    v_owner_texts := ARRAY[pg_catalog.split_part(NEW.name, '/', 1)];
  ELSE
    SELECT pg_catalog.array_agg(candidate.owner_text ORDER BY candidate.owner_text)
    INTO v_owner_texts
    FROM (
      SELECT DISTINCT owner_text
      FROM pg_catalog.unnest(ARRAY[
        CASE WHEN OLD.bucket_id = 'raw-clippings'
          THEN pg_catalog.split_part(OLD.name, '/', 1) END,
        CASE WHEN NEW.bucket_id = 'raw-clippings'
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
        MESSAGE = 'raw_clippings_owner_invalid';
    END IF;
    v_owner := v_owner_text::uuid;

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
        MESSAGE = 'raw_clippings_owner_missing';
    END IF;

    -- Keep this as a separate SQL statement after the potentially waiting row
    -- lock. Under Storage's READ COMMITTED transactions it takes a fresh
    -- statement snapshot and sees a fence that committed while this write was
    -- waiting.
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

REVOKE ALL ON FUNCTION public.guard_raw_clipping_account_deletion()
  FROM PUBLIC, anon, authenticated, service_role;

DO $storage_completion$
BEGIN
  IF pg_catalog.to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema absent - skipping raw-clippings completion fence';
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

  IF NOT COALESCE(
    (
      SELECT relation.relrowsecurity
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = pg_catalog.to_regclass('storage.objects')
    ),
    false
  ) THEN
    RAISE EXCEPTION 'storage.objects RLS must be enabled before account-deletion policies';
  END IF;

  DROP POLICY IF EXISTS "raw_clippings_owner_select" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "raw_clippings_owner_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )$policy$;

  -- Restore the 0186 canonical flat, non-empty Markdown path. 0188
  -- accidentally widened both INSERT and UPDATE while adding its profile test.
  DROP POLICY IF EXISTS "raw_clippings_owner_insert" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "raw_clippings_owner_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE (SELECT auth.uid())::text || '/%.md'
      AND pg_catalog.length(name) > pg_catalog.length((SELECT auth.uid())::text) + 4
      AND EXISTS (
        SELECT 1
        FROM public.users AS active_user
        WHERE active_user.id = (SELECT auth.uid())
      )
    )$policy$;

  DROP POLICY IF EXISTS "raw_clippings_owner_update" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "raw_clippings_owner_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE (SELECT auth.uid())::text || '/%.md'
      AND pg_catalog.length(name) > pg_catalog.length((SELECT auth.uid())::text) + 4
      AND EXISTS (
        SELECT 1
        FROM public.users AS active_user
        WHERE active_user.id = (SELECT auth.uid())
      )
    )
    WITH CHECK (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND pg_catalog.array_length(storage.foldername(name), 1) = 1
      AND name LIKE (SELECT auth.uid())::text || '/%.md'
      AND pg_catalog.length(name) > pg_catalog.length((SELECT auth.uid())::text) + 4
      AND EXISTS (
        SELECT 1
        FROM public.users AS active_user
        WHERE active_user.id = (SELECT auth.uid())
      )
    )$policy$;

  DROP POLICY IF EXISTS "raw_clippings_owner_delete" ON storage.objects;
  EXECUTE $policy$CREATE POLICY "raw_clippings_owner_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'raw-clippings'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )$policy$;

  EXECUTE 'DROP TRIGGER IF EXISTS guard_raw_clipping_account_deletion ON storage.objects';
  EXECUTE 'CREATE TRIGGER guard_raw_clipping_account_deletion
    BEFORE INSERT OR UPDATE ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION public.guard_raw_clipping_account_deletion()';
END;
$storage_completion$;
