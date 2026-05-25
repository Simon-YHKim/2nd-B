-- 0003_records.sql
-- Unified Capture Engine table: journal entries, free-form notes,
-- and life-audit Q&A responses share one row shape, discriminated by `kind`.

CREATE TYPE record_kind AS ENUM ('journal', 'note', 'audit_response');

CREATE TABLE IF NOT EXISTS records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         record_kind NOT NULL,
  audit_period text,                                                        -- 'current' | '20s' (for audit_response only)
  prompt       text,                                                        -- audit question or note context, optional
  body         text NOT NULL,
  ai_followup  jsonb,                                                       -- AI-generated follow-ups, when present
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS records_user_created_idx ON records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS records_user_kind_idx ON records (user_id, kind);
