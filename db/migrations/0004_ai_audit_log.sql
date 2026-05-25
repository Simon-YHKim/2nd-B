-- 0004_ai_audit_log.sql
-- C3: every AI decision is logged here by the Gemini wrapper.
-- vertex_backend column serves as evidence for C2 in submission package.

CREATE TYPE safety_zone AS ENUM ('green', 'yellow', 'red');

CREATE TABLE IF NOT EXISTS ai_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_hash     text NOT NULL,
  output_hash     text NOT NULL,
  model_used      text NOT NULL,
  vertex_backend  boolean NOT NULL,                                          -- C2
  safety_zone     safety_zone NOT NULL,
  latency_ms      integer NOT NULL CHECK (latency_ms >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_audit_log_user_created_idx
  ON ai_audit_log (user_id, created_at DESC);
