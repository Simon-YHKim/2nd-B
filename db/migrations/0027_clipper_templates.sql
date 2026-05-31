-- 0027_clipper_templates.sql
-- G3 — user-created + community-shared clipper formats.
--
-- The 8 canonical clipper templates ship bundled in the app
-- (src/lib/wiki/clipper-templates.ts) so classification always works offline.
-- This table holds the EXTRA formats a user's AI proposes for novel material
-- (2026-06-01 directive: "사용자의 새로운 자료에 대해 형식을 추가로 생성해서
-- 서버에 공유"). Each custom format anchors on one of the 8 base kinds, so the
-- source.kind it produces stays inside the existing CHECK on `sources` — no
-- schema churn there. A format is private to its owner until they opt in to
-- share, at which point every authenticated user can read it (community format).

CREATE TABLE IF NOT EXISTS clipper_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug             text NOT NULL,                                  -- kebab id, unique per owner
  base_kind        text NOT NULL
    CHECK (base_kind IN ('inbox', 'article', 'video', 'paper', 'reddit', 'code', 'ai_tool', 'self_knowledge')),
  name             jsonb NOT NULL DEFAULT '{}'::jsonb,             -- { en, ko }
  what             jsonb NOT NULL DEFAULT '{}'::jsonb,             -- { en, ko } one-line description
  triggers         text[] NOT NULL DEFAULT ARRAY[]::text[],        -- URL globs that hint this format
  default_tags     text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_category  text NOT NULL DEFAULT ''
    CHECK (target_category IN ('concepts', 'entities', 'projects', '')),
  wiki_target      text NOT NULL DEFAULT '',
  ai_properties    jsonb NOT NULL DEFAULT '[]'::jsonb,             -- ClipperAiProperty[] the AI fills
  is_shared        boolean NOT NULL DEFAULT false,                 -- opt-in publish to the community
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clipper_templates_owner_slug_unique UNIQUE (owner_id, slug)
);

CREATE INDEX IF NOT EXISTS clipper_templates_owner_idx ON clipper_templates (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS clipper_templates_shared_idx ON clipper_templates (is_shared) WHERE is_shared;
CREATE INDEX IF NOT EXISTS clipper_templates_base_kind_idx ON clipper_templates (base_kind);

CREATE TRIGGER trg_clipper_templates_updated_at
  BEFORE UPDATE ON clipper_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

----------------------------------------------------------------------
-- Row-Level Security
--   read  : your own formats OR any shared (community) format
--   write : only your own rows (insert / update / delete)
----------------------------------------------------------------------

ALTER TABLE clipper_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clipper_templates_read ON clipper_templates;
CREATE POLICY clipper_templates_read ON clipper_templates
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_shared = true);

DROP POLICY IF EXISTS clipper_templates_insert ON clipper_templates;
CREATE POLICY clipper_templates_insert ON clipper_templates
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clipper_templates_update ON clipper_templates;
CREATE POLICY clipper_templates_update ON clipper_templates
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clipper_templates_delete ON clipper_templates;
CREATE POLICY clipper_templates_delete ON clipper_templates
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
