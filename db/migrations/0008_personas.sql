-- 0008_personas.sql
-- Inference Engine output: synthesized self-model versioned per user.
-- markdown_export is a cache for the portable RAG export (Engine 3).

CREATE TABLE IF NOT EXISTS personas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  traits          jsonb NOT NULL,
  values          jsonb,
  patterns        jsonb,
  markdown_export text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personas_user_version_unique UNIQUE (user_id, version)
);

CREATE INDEX IF NOT EXISTS personas_user_idx ON personas (user_id, version DESC);
