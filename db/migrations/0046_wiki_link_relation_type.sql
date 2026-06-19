-- 0046_wiki_link_relation_type.sql
-- Wiki STEP 2 (docs/wiki-system-upgrade.md): edge type + confidence on
-- wiki_links, mirroring graphify's EXTRACTED/INFERRED/AMBIGUOUS but mapped to
-- our propose->ratify canon:
--   * 'wikilink'  — an explicit [[wikilink]] the user wrote (structural truth)
--   * 'inferred'  — an AI-proposed connection awaiting the user's ratification
--   * 'ratified'  — an inferred link the user accepted (promoted in place)
-- confidence is the model's 0..1 score; explicit/ratified links are 1.0.
-- Additive + idempotent: existing edges backfill to 'wikilink' / 1.0, so the
-- already-shipped [[wikilink]] graph keeps working unchanged.

ALTER TABLE wiki_links
  ADD COLUMN IF NOT EXISTS relation_type text NOT NULL DEFAULT 'wikilink',
  ADD COLUMN IF NOT EXISTS confidence    real NOT NULL DEFAULT 1;

-- Named constraints added separately so re-running the migration is safe
-- (ADD COLUMN IF NOT EXISTS won't re-add, but the CHECKs need their own guard).
DO $$ BEGIN
  ALTER TABLE wiki_links ADD CONSTRAINT wiki_links_relation_type_check
    CHECK (relation_type IN ('wikilink', 'inferred', 'ratified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE wiki_links ADD CONSTRAINT wiki_links_confidence_range
    CHECK (confidence >= 0 AND confidence <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inferred links are queried as a worklist ("what does the assistant propose
-- I connect?"), so index the (user, type) lookup.
CREATE INDEX IF NOT EXISTS wiki_links_relation_type_idx
  ON wiki_links (user_id, relation_type);
