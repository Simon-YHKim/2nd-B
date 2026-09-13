\set ON_ERROR_STOP on

BEGIN;
\i db/migration-drafts/UNNUMBERED_account_deletion_completion_fence.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$;

INSERT INTO auth.users (id, email)
VALUES (
  'de1e7100-0000-4000-8000-000000000001',
  'account-deletion-fence-ci@example.invalid'
);

INSERT INTO auth.sessions (id, user_id)
VALUES (
  'de1e7100-0000-4000-8000-000000000002',
  'de1e7100-0000-4000-8000-000000000001'
);

INSERT INTO public.users (id, email, birth_date, locale)
VALUES (
  'de1e7100-0000-4000-8000-000000000001',
  'account-deletion-fence-ci@example.invalid',
  DATE '1990-01-01',
  'en'
);

SELECT pg_temp.assert_true(
  (SELECT NOT public
          AND file_size_limit = 1048576
          AND allowed_mime_types = ARRAY['text/markdown']::text[]
     FROM storage.buckets
    WHERE id = 'raw-clippings'),
  'raw-clippings bucket hardening was not applied'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgname = 'guard_raw_clipping_account_deletion'
       AND tgrelid = 'storage.objects'::pg_catalog.regclass
       AND NOT tgisinternal
  ),
  'account-deletion storage trigger is missing'
);

SELECT pg_temp.assert_true(
  (SELECT relrowsecurity
     FROM pg_catalog.pg_class
    WHERE oid = 'storage.objects'::pg_catalog.regclass),
  'storage.objects RLS is disabled'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
      FROM (VALUES
        ('raw_clippings_owner_select', 'SELECT'),
        ('raw_clippings_owner_insert', 'INSERT'),
        ('raw_clippings_owner_update', 'UPDATE'),
        ('raw_clippings_owner_delete', 'DELETE')
      ) AS expected(policyname, cmd)
      LEFT JOIN pg_catalog.pg_policies AS policy
        ON policy.schemaname = 'storage'
       AND policy.tablename = 'objects'
       AND policy.policyname = expected.policyname
       AND policy.cmd = expected.cmd
     WHERE policy.policyname IS NULL
        OR policy.roles <> ARRAY['authenticated']::name[]
  ),
  'raw-clippings policy contract is incomplete'
);

SELECT pg_temp.assert_true(
  storage.foldername('owner/file.md')
    IS NOT DISTINCT FROM ARRAY['owner']::text[]
  AND storage.foldername('owner/nested/file.md')
    IS NOT DISTINCT FROM ARRAY['owner', 'nested']::text[],
  'storage.foldername contract is incorrect'
);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"de1e7100-0000-4000-8000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects (id, bucket_id, name)
VALUES (
  'de1e7100-0000-4000-8000-000000000003',
  'raw-clippings',
  'de1e7100-0000-4000-8000-000000000001/before.md'
);

UPDATE storage.objects
   SET name = 'de1e7100-0000-4000-8000-000000000001/before-renamed.md'
 WHERE id = 'de1e7100-0000-4000-8000-000000000003';
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT name = 'de1e7100-0000-4000-8000-000000000001/before-renamed.md'
     FROM storage.objects
    WHERE id = 'de1e7100-0000-4000-8000-000000000003'),
  'pre-fence update was blocked'
);

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.assert_true(
  public.verify_account_deletion_session(
    'de1e7100-0000-4000-8000-000000000001',
    'de1e7100-0000-4000-8000-000000000002',
    pg_catalog.now()
  ),
  'deployed compatibility wrapper could not publish the deletion fence'
);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"de1e7100-0000-4000-8000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;

DO $blocked_insert$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES (
      'raw-clippings',
      'de1e7100-0000-4000-8000-000000000001/after.md'
    );
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'post-fence insert succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM IS DISTINCT FROM 'account_deletion_in_progress' THEN
        RAISE;
      END IF;
  END;
END;
$blocked_insert$;

DO $blocked_update$
BEGIN
  BEGIN
    UPDATE storage.objects
       SET name = 'de1e7100-0000-4000-8000-000000000001/changed.md'
     WHERE id = 'de1e7100-0000-4000-8000-000000000003';
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'post-fence update succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM IS DISTINCT FROM 'account_deletion_in_progress' THEN
        RAISE;
      END IF;
  END;
END;
$blocked_update$;

DELETE FROM storage.objects
 WHERE id = 'de1e7100-0000-4000-8000-000000000003';
RESET ROLE;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
      FROM storage.objects
     WHERE id = 'de1e7100-0000-4000-8000-000000000003'
  ),
  'owner delete was blocked after the deletion fence'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege(
    'authenticated',
    'public.begin_account_deletion(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.begin_account_deletion(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  'account-deletion fence function ACL is incorrect'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege(
    'authenticated',
    'public.verify_account_deletion_session(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.verify_account_deletion_session(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  'account-deletion compatibility wrapper ACL is incorrect'
);

ROLLBACK;
