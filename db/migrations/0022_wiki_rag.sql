-- 0022_wiki_rag.sql
-- RAG / Wiki data model — PR 1 of the RAG ingest track.
--
-- Three tables: `sources` (raw capture metadata + Storage path, append-mostly),
-- `wiki_pages` (source | entity | concept pages with body_md, tags, frontmatter),
-- `wiki_links` ([[wikilink]] edges between pages).
--
-- The 8 Obsidian clipper templates map to `sources.kind`:
--   inbox · article · video · paper · reddit · code · ai_tool · self_knowledge
--
-- Wiki pages are user-scoped (each user owns their own knowledge graph). Links
-- use a composite FK against (user_id, id) so the schema itself forbids edges
-- across user boundaries; RLS then prevents reads/writes outside one's graph.

----------------------------------------------------------------------
-- sources: raw clipped content metadata
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             text NOT NULL
    CHECK (kind IN ('inbox', 'article', 'video', 'paper', 'reddit', 'code', 'ai_tool', 'self_knowledge')),
  title            text NOT NULL,
  source_url       text,
  storage_path     text NOT NULL,                                            -- raw/clipped/<category>/<slug>.md
  frontmatter      jsonb NOT NULL DEFAULT '{}'::jsonb,                       -- full clipper frontmatter
  tags             text[] NOT NULL DEFAULT ARRAY[]::text[],                  -- denormalized from frontmatter for GIN
  simon_relevance  int,                                                      -- 1..5 from clipper template
  ingested         boolean NOT NULL DEFAULT false,                           -- has Phase 1/2 run?
  ingested_at      timestamptz,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_relevance_range
    CHECK (simon_relevance IS NULL OR simon_relevance BETWEEN 1 AND 5),
  CONSTRAINT sources_ingested_pair
    CHECK (ingested = false OR ingested_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS sources_user_captured_idx ON sources (user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS sources_user_ingested_idx ON sources (user_id, ingested);
CREATE INDEX IF NOT EXISTS sources_tags_gin ON sources USING GIN (tags);

----------------------------------------------------------------------
-- wiki_pages: source / entity / concept pages
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wiki_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('source', 'entity', 'concept')),
  title         text NOT NULL,
  body_md       text NOT NULL DEFAULT '',
  frontmatter   jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags          text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_id     uuid REFERENCES sources(id) ON DELETE SET NULL,              -- only set when kind='source'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wiki_pages_user_slug_unique UNIQUE (user_id, slug),
  CONSTRAINT wiki_pages_user_id_unique UNIQUE (user_id, id),                 -- target for wiki_links composite FK
  CONSTRAINT wiki_pages_source_kind_pair
    CHECK ((kind = 'source') = (source_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS wiki_pages_user_kind_idx ON wiki_pages (user_id, kind);
CREATE INDEX IF NOT EXISTS wiki_pages_user_updated_idx ON wiki_pages (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS wiki_pages_tags_gin ON wiki_pages USING GIN (tags);

CREATE TRIGGER trg_wiki_pages_updated_at
  BEFORE UPDATE ON wiki_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

----------------------------------------------------------------------
-- wiki_links: directed [[wikilink]] edges
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wiki_links (
  user_id     uuid NOT NULL,
  from_page   uuid NOT NULL,
  to_page     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_page, to_page),
  CONSTRAINT wiki_links_from_fk
    FOREIGN KEY (user_id, from_page) REFERENCES wiki_pages (user_id, id) ON DELETE CASCADE,
  CONSTRAINT wiki_links_to_fk
    FOREIGN KEY (user_id, to_page) REFERENCES wiki_pages (user_id, id) ON DELETE CASCADE,
  CONSTRAINT wiki_links_no_self
    CHECK (from_page <> to_page)
);

CREATE INDEX IF NOT EXISTS wiki_links_to_idx ON wiki_links (to_page);          -- backlinks lookup
CREATE INDEX IF NOT EXISTS wiki_links_user_idx ON wiki_links (user_id);

----------------------------------------------------------------------
-- Row-Level Security
----------------------------------------------------------------------

ALTER TABLE sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_pages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_links  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sources_owner_all ON sources;
CREATE POLICY sources_owner_all ON sources
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS wiki_pages_owner_all ON wiki_pages;
CREATE POLICY wiki_pages_owner_all ON wiki_pages
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS wiki_links_owner_all ON wiki_links;
CREATE POLICY wiki_links_owner_all ON wiki_links
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
