-- Retry-safe hand-off for device-local pre-account notes. The key is scoped to
-- the authenticated owner so one user's client value cannot collide with or
-- reveal another user's record. PostgreSQL UNIQUE permits multiple NULLs, so
-- existing and ordinary record inserts remain unchanged.

BEGIN;

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

COMMENT ON COLUMN public.records.client_request_id IS
  'Optional owner-scoped retry key for a device-local plain-note hand-off.';

COMMIT;
