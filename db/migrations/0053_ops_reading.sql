-- 0053_ops_reading.sql
-- Wave 2 (reading_list / 독서·학습 목록) manage layer: a personal book shelf.
-- Pairs with the Google Books search source (src/lib/reading/books.ts): search
-- finds a volume, this persists it on the user's shelf with a read status +
-- page progress. Manual structured input — no Gemini call, no new C1/C9/C3
-- surface. $0.
--
-- Owner-only RLS (auth.uid() = user_id), mirroring ops_routines_owner_all (0048)
-- and ops_ledger_owner_all (0052). Additive + idempotent so re-running is safe.

CREATE TABLE IF NOT EXISTS ops_reading (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  volume_id     text NOT NULL,                                   -- Google Books volume id
  title         text NOT NULL,
  authors       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'want'
    CHECK (status IN ('want', 'reading', 'done')),
  current_page  int NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  total_pages   int CHECK (total_pages IS NULL OR total_pages >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_reading_once_per_volume UNIQUE (user_id, volume_id)
);

CREATE INDEX IF NOT EXISTS ops_reading_user_status_idx
  ON ops_reading (user_id, status);

ALTER TABLE ops_reading ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ops_reading_owner_all ON ops_reading;
    CREATE POLICY ops_reading_owner_all ON ops_reading
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
