-- 0017_memorized_patterns.sql
-- Persistence target for the memorize engine (build-rag-wiki Engine 6).
-- Stores observed-pattern fragments keyed by user, distinct from `personas`
-- which holds full versioned self-model snapshots. A pattern is a small
-- categorical signal ("user keeps describing parental conflict as central
-- source of distress, framework: attachment, zone: yellow") that the
-- Inference Engine can later aggregate into the next persona version.

CREATE TABLE IF NOT EXISTS memorized_patterns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_kind     text NOT NULL,
  evidence_batches text[] NOT NULL DEFAULT ARRAY[]::text[],
  triggers         text[] NOT NULL DEFAULT ARRAY[]::text[],
  summary          text NOT NULL,
  recorded_zone    text NOT NULL CHECK (recorded_zone IN ('green', 'yellow', 'red')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memorized_summary_length CHECK (char_length(summary) <= 600)
);

CREATE INDEX IF NOT EXISTS memorized_patterns_user_kind_idx
  ON memorized_patterns (user_id, pattern_kind, created_at DESC);

-- Per-user RLS: users see only their own; service_role bypasses.
ALTER TABLE memorized_patterns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    -- Drop+recreate policies idempotently so the migration is re-runnable
    -- (e.g. supabase-dry-run CI re-applies the whole sequence).
    DROP POLICY IF EXISTS memorized_patterns_select_own ON memorized_patterns;
    DROP POLICY IF EXISTS memorized_patterns_insert_own ON memorized_patterns;

    CREATE POLICY memorized_patterns_select_own ON memorized_patterns
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    CREATE POLICY memorized_patterns_insert_own ON memorized_patterns
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
