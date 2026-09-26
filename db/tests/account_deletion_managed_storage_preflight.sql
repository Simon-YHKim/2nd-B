-- Read-only checks for an isolated MANAGED Supabase project after 0192.
-- This does not apply a migration, create a fixture, or prove a two-session race.
\set ON_ERROR_STOP on
BEGIN READ ONLY;

DO $preflight$
DECLARE
  bucket record;
  objects_oid oid := to_regclass('storage.objects');
  tombstone_oid oid := to_regclass('public.account_deletion_tombstones');
  ledger_rows integer;
  supported_ledger_rows integer;
  nonempty_ledger_rows integer;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR objects_oid IS NULL THEN
    RAISE EXCEPTION 'managed_storage_schema_missing';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION '0192_migration_ledger_missing';
  END IF;
  -- CLI scratch records version 0192 with the bare stem. The managed clone's
  -- apply_migration plan records a timestamp version with the numbered stem.
  -- Exactly one nonempty row in one documented form is required. A duplicate
  -- or renamed/empty row needs reconciliation; never edit the ledger to pass.
  SELECT count(*),
         count(*) FILTER (WHERE
           (m.version = '0192' AND m.name = 'account_deletion_completion_fence')
           OR (m.version ~ '^[0-9]{14}$'
               AND m.name = '0192_account_deletion_completion_fence')),
         count(*) FILTER (WHERE cardinality(m.statements) > 0)
    INTO ledger_rows, supported_ledger_rows, nonempty_ledger_rows
  FROM supabase_migrations.schema_migrations AS m
  WHERE m.name IN ('account_deletion_completion_fence',
                   '0192_account_deletion_completion_fence');
  IF ledger_rows <> 1 OR supported_ledger_rows <> 1
     OR nonempty_ledger_rows <> 1 THEN
    RAISE EXCEPTION '0192_migration_ledger_missing_or_ambiguous';
  END IF;
  IF tombstone_oid IS NULL
     OR to_regprocedure('public.begin_account_deletion(uuid,uuid,timestamptz)') IS NULL
     OR to_regprocedure('public.verify_account_deletion_session(uuid,uuid,timestamptz)') IS NULL
     OR to_regprocedure('public.guard_raw_clipping_account_deletion()') IS NULL THEN
    RAISE EXCEPTION '0192_function_or_tombstone_missing';
  END IF;
  SELECT b.public, b.file_size_limit, b.allowed_mime_types INTO bucket
  FROM storage.buckets AS b WHERE b.id = 'raw-clippings';
  IF NOT FOUND OR bucket.public IS DISTINCT FROM false
     OR bucket.file_size_limit IS DISTINCT FROM 1048576
     OR bucket.allowed_mime_types IS DISTINCT FROM ARRAY['text/markdown']::text[] THEN
    RAISE EXCEPTION 'raw_clippings_bucket_contract_changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = objects_oid AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = tombstone_oid
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'storage_or_tombstone_rls_missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = objects_oid
      AND tgname = 'guard_raw_clipping_account_deletion'
      AND tgfoid = 'public.guard_raw_clipping_account_deletion()'::regprocedure
      AND tgenabled IN ('O', 'A')
      AND (tgtype & 23) = 23 -- ROW + BEFORE + INSERT + UPDATE
      AND (tgtype & 8) = 0   -- not DELETE
  ) THEN
    RAISE EXCEPTION 'managed_storage_insert_update_trigger_missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('raw_clippings_owner_select', 'SELECT'),
      ('raw_clippings_owner_insert', 'INSERT'),
      ('raw_clippings_owner_update', 'UPDATE'),
      ('raw_clippings_owner_delete', 'DELETE')
    ) AS expected(name, command)
    LEFT JOIN pg_policies AS policy
      ON policy.schemaname = 'storage'
     AND policy.tablename = 'objects'
     AND policy.policyname = expected.name
     AND policy.cmd = expected.command
    WHERE policy.policyname IS NULL
       OR policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'raw_clippings_owner_policies_missing';
  END IF;
  IF has_function_privilege('anon',
       'public.begin_account_deletion(uuid,uuid,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.begin_account_deletion(uuid,uuid,timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.begin_account_deletion(uuid,uuid,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.verify_account_deletion_session(uuid,uuid,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.verify_account_deletion_session(uuid,uuid,timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.verify_account_deletion_session(uuid,uuid,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'deletion_rpc_acl_changed';
  END IF;
END;
$preflight$;

-- Capture the exact managed Storage column shape and deparsed policies for
-- review against the pinned 0192 source. Presence checks above are not enough.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'storage' AND table_name IN ('objects', 'buckets')
ORDER BY table_name, ordinal_position;

-- Any row here means the runbook's three-column metadata INSERT cannot be
-- used as written. This does not invalidate the trigger or the API probe.
SELECT column_name, data_type AS additional_required_insert_column
FROM information_schema.columns
WHERE table_schema = 'storage' AND table_name = 'objects'
  AND is_nullable = 'NO' AND column_default IS NULL
  AND is_generated = 'NEVER' AND identity_generation IS NULL
  AND column_name NOT IN ('id', 'bucket_id', 'name')
ORDER BY column_name;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'raw_clippings_owner_%'
ORDER BY policyname;

SELECT version, name, cardinality(statements) AS statement_count,
  md5(regexp_replace(array_to_string(statements, ''), '[[:space:]]+', '', 'g'))
    AS normalized_sql_md5
FROM supabase_migrations.schema_migrations
WHERE name IN ('account_deletion_completion_fence',
               '0192_account_deletion_completion_fence',
               'llm_service_consent_management',
               '0194_llm_service_consent_management')
ORDER BY version;

SELECT to_regprocedure('public.llm_service_consent_status(uuid)') IS NOT NULL
    AS migration_0194_status_rpc_present,
  to_regprocedure('public.write_llm_service_consent(uuid,text,text,text,jsonb,text)') IS NOT NULL
    AS migration_0194_writer_rpc_present;

ROLLBACK;
