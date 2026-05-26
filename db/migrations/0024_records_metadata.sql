-- 0024_records_metadata.sql
-- Per master blueprint user directive: every entry must surface
-- tags · time · topic · summary · conclusion. records already has
-- created_at + updated_at (time), kind + audit_period + prompt (context),
-- and body (content). Add the four missing semantic fields plus tags
-- (denormalized text[] mirroring sources/wiki_pages for cross-table
-- search consistency).
--
-- All fields are optional — existing rows stay valid. Phase 1
-- summarization (src/lib/wiki/phase1.ts) will populate summary +
-- conclusion when extended to operate on records too.

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS topic      text,
  ADD COLUMN IF NOT EXISTS summary    text,
  ADD COLUMN IF NOT EXISTS conclusion text,
  ADD COLUMN IF NOT EXISTS tags       text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS records_tags_gin ON records USING GIN (tags);
CREATE INDEX IF NOT EXISTS records_user_topic_idx ON records (user_id, topic) WHERE topic IS NOT NULL;
