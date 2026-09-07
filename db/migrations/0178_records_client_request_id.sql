-- 0178_records_client_request_id.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Retry-safe hand-off for device-local pre-account notes. The key is scoped to
-- the authenticated owner so one user's client value cannot collide with or
-- reveal another user's record. PostgreSQL UNIQUE permits multiple NULLs, so
-- existing and ordinary record inserts remain unchanged.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS client_request_id text;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.records'::regclass
       AND conname = 'records_client_request_id_format'
  ) THEN
    ALTER TABLE public.records
      ADD CONSTRAINT records_client_request_id_format
      CHECK (
        client_request_id IS NULL
        OR (
          char_length(client_request_id) BETWEEN 1 AND 128
          AND client_request_id ~ '^[A-Za-z0-9._:-]+$'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.records'::regclass
       AND conname = 'records_owner_client_request_unique'
  ) THEN
    ALTER TABLE public.records
      ADD CONSTRAINT records_owner_client_request_unique
      UNIQUE (user_id, client_request_id);
  END IF;
END
$constraints$;

-- The retry key is useful only if table-owner code cannot accidentally bypass
-- the same owner policy enforced for authenticated clients.
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.records.client_request_id IS
  'Optional owner-scoped retry key for a device-local plain-note hand-off.';

DO $verify$
BEGIN
  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.records'::regclass
          AND attname = 'client_request_id'
          AND atttypid = 'pg_catalog.text'::regtype
          AND NOT attnotnull
          AND NOT attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.records'::regclass
          AND conname = 'records_client_request_id_format'
          AND contype = 'c'
          AND convalidated
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.records'::regclass
          AND conname = 'records_owner_client_request_unique'
          AND contype = 'u'
          AND convalidated
          AND pg_catalog.pg_get_constraintdef(oid) =
            'UNIQUE (user_id, client_request_id)'
     )
     OR NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.records'::regclass
     ), false) THEN
    RAISE EXCEPTION 'records client request id verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

