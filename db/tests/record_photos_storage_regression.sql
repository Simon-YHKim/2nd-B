\set ON_ERROR_STOP on

-- 0209 record-photos bucket: the boundary the 글 photo attachments rely on.
-- Runs against the numbered tree (CI applies every db/migrations file first).
-- Everything happens inside one transaction and is rolled back.

BEGIN;

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

-- Expect the statement to be refused with insufficient_privilege (RLS or the
-- fence trigger). p_reason, when given, must match the error text exactly.
CREATE OR REPLACE FUNCTION pg_temp.assert_denied(p_sql text, p_reason text, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF p_reason IS NOT NULL AND SQLERRM IS DISTINCT FROM p_reason THEN
        RAISE EXCEPTION '% (refused for the wrong reason: %)', p_message, SQLERRM;
      END IF;
      RETURN;
  END;
  RAISE EXCEPTION '% (statement was allowed)', p_message;
END;
$$;

INSERT INTO auth.users (id, email)
VALUES
  ('9b070000-0000-4000-8000-000000000001', 'record-photos-owner-ci@example.invalid'),
  ('9b070000-0000-4000-8000-000000000011', 'record-photos-other-ci@example.invalid');

INSERT INTO auth.sessions (id, user_id)
VALUES (
  '9b070000-0000-4000-8000-000000000002',
  '9b070000-0000-4000-8000-000000000001'
);

INSERT INTO public.users (id, email, birth_date, locale)
VALUES
  ('9b070000-0000-4000-8000-000000000001', 'record-photos-owner-ci@example.invalid', DATE '1990-01-01', 'en'),
  ('9b070000-0000-4000-8000-000000000011', 'record-photos-other-ci@example.invalid', DATE '1990-01-01', 'en');

-- 1. Bucket shape.
SELECT pg_temp.assert_true(
  (SELECT NOT public
          AND file_size_limit = 2097152
          AND allowed_mime_types = ARRAY['image/jpeg']::text[]
     FROM storage.buckets
    WHERE id = 'record-photos'),
  'record-photos bucket is missing or not private/jpeg-only/2 MiB'
);

-- raw-clippings keeps its own hardening untouched.
SELECT pg_temp.assert_true(
  (SELECT allowed_mime_types = ARRAY['text/markdown']::text[]
     FROM storage.buckets
    WHERE id = 'raw-clippings'),
  'raw-clippings hardening changed'
);

-- 2. Policies: owner select/insert/delete for authenticated, no update, nothing else.
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
      FROM (VALUES
        ('record_photos_owner_select', 'SELECT'),
        ('record_photos_owner_insert', 'INSERT'),
        ('record_photos_owner_delete', 'DELETE')
      ) AS expected(policyname, cmd)
      LEFT JOIN pg_catalog.pg_policies AS policy
        ON policy.schemaname = 'storage'
       AND policy.tablename = 'objects'
       AND policy.policyname = expected.policyname
       AND policy.cmd = expected.cmd
     WHERE policy.policyname IS NULL
        OR policy.roles <> ARRAY['authenticated']::name[]
  ),
  'record-photos policy contract is incomplete'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND (qual LIKE '%record-photos%' OR with_check LIKE '%record-photos%')
       AND (cmd IN ('UPDATE', 'ALL') OR NOT (roles = ARRAY['authenticated']::name[]))
  ),
  'record-photos has an UPDATE/ALL policy or a policy for a role other than authenticated'
);

-- 3. The fence trigger and its function ACL.
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgname = 'guard_record_photo_account_deletion'
       AND tgrelid = 'storage.objects'::pg_catalog.regclass
       AND NOT tgisinternal
  ),
  'record-photos account-deletion trigger is missing'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.guard_record_photo_account_deletion()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.guard_record_photo_account_deletion()', 'EXECUTE'),
  'record-photos guard function is callable by an API role'
);

-- 4. As the owner: the flat photo path is accepted, every other shape refused.
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"9b070000-0000-4000-8000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO storage.objects (id, bucket_id, name)
VALUES (
  '9b070000-0000-4000-8000-000000000003',
  'record-photos',
  '9b070000-0000-4000-8000-000000000001/photo-0123456789abcdef.jpg'
);

SELECT pg_temp.assert_denied(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('record-photos', '9b070000-0000-4000-8000-000000000001/nested/photo-0123456789abcdef.jpg')$sql$,
  NULL, 'nested photo path was accepted');
SELECT pg_temp.assert_denied(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('record-photos', '9b070000-0000-4000-8000-000000000001/clip.md')$sql$,
  NULL, 'non-photo name was accepted');
SELECT pg_temp.assert_denied(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('record-photos', '9b070000-0000-4000-8000-000000000001/photo-.jpg')$sql$,
  NULL, 'empty photo id was accepted');
SELECT pg_temp.assert_denied(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('record-photos', '9b070000-0000-4000-8000-000000000011/photo-0123456789abcdef.jpg')$sql$,
  NULL, 'upload into another owner folder was accepted');

-- No UPDATE policy: an owner rename touches nothing.
UPDATE storage.objects
   SET name = '9b070000-0000-4000-8000-000000000001/photo-renamed00000.jpg'
 WHERE id = '9b070000-0000-4000-8000-000000000003';
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT name = '9b070000-0000-4000-8000-000000000001/photo-0123456789abcdef.jpg'
     FROM storage.objects
    WHERE id = '9b070000-0000-4000-8000-000000000003'),
  'owner could rename a photo although no UPDATE policy exists'
);

-- 5. Another signed-in user cannot see or delete it; anon sees nothing.
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"9b070000-0000-4000-8000-000000000011"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'record-photos'),
  'another user can read the owner photo'
);
DELETE FROM storage.objects WHERE id = '9b070000-0000-4000-8000-000000000003';
RESET ROLE;
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM storage.objects WHERE id = '9b070000-0000-4000-8000-000000000003'),
  'another user deleted the owner photo'
);

-- anon: either the schema is closed to it (the CI stub grants storage only to
-- authenticated) or RLS shows it nothing (Supabase). Seeing a row is the failure.
SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $anon_read$
DECLARE
  v_seen bigint;
BEGIN
  BEGIN
    SELECT pg_catalog.count(*) INTO v_seen FROM storage.objects WHERE bucket_id = 'record-photos';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_seen := 0;
  END;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'anon can read record photos';
  END IF;
END;
$anon_read$;
RESET ROLE;

-- 6. The deletion fence: once begin_account_deletion commits the tombstone, the
-- owner can no longer add photos, but can still remove them.
SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.assert_true(
  public.begin_account_deletion(
    '9b070000-0000-4000-8000-000000000001',
    '9b070000-0000-4000-8000-000000000002',
    pg_catalog.now()
  ),
  'begin_account_deletion did not publish the fence'
);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"9b070000-0000-4000-8000-000000000001"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_denied(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('record-photos', '9b070000-0000-4000-8000-000000000001/photo-after0fence00.jpg')$sql$,
  'account_deletion_in_progress', 'post-fence photo upload was not refused by the fence');

DELETE FROM storage.objects WHERE id = '9b070000-0000-4000-8000-000000000003';
RESET ROLE;

SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM storage.objects WHERE id = '9b070000-0000-4000-8000-000000000003'),
  'owner delete was blocked after the deletion fence'
);

ROLLBACK;
