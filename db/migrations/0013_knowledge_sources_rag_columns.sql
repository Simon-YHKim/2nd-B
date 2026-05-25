-- 0013_knowledge_sources_rag_columns.sql
-- Extends knowledge_sources for Path A (Karpathy Wiki) retrieval per the build-rag-wiki
-- handoff §1. Adds:
--   - summary_ko / summary_en: locale-specific 1-2 paragraph summaries used in prompt
--     assembly
--   - application_notes: how the row applies to 2nd-Brain (Advisor + Inference)
--   - added_by: relaxed to NULL so seed (curator-system) rows can be inserted without
--     a real user. RLS policy ks_auth_insert still forces added_by = auth.uid() for
--     authenticated INSERTs, so this only changes behavior for service-role seeds.

ALTER TABLE knowledge_sources
  ADD COLUMN IF NOT EXISTS summary_ko        text,
  ADD COLUMN IF NOT EXISTS summary_en        text,
  ADD COLUMN IF NOT EXISTS application_notes text;

ALTER TABLE knowledge_sources
  ALTER COLUMN added_by DROP NOT NULL;

-- DOI uniqueness so seed re-runs are idempotent via ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_doi_unique
  ON knowledge_sources (doi) WHERE doi IS NOT NULL;

-- The Path A retriever filters by framework + locale. Add a covering index.
CREATE INDEX IF NOT EXISTS knowledge_sources_framework_locale_idx
  ON knowledge_sources (framework, locale);
