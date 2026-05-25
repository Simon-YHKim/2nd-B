-- 0007_knowledge_sources.sql
-- C8: Curator Engine output. Every curated reference must carry traceable
-- provenance (DOI or URL) and a verification pair (verified_by + verified_at).

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  authors       text[],
  doi           text,
  url           text,
  framework     text,                                                        -- 'big_five' | 'attachment' | 'sdt' | 'cbt' | ...
  age_range     text,                                                        -- 'child' | 'adolescent' | 'adult' | 'elderly'
  locale        text CHECK (locale IS NULL OR locale IN ('en', 'ko', 'both')),
  added_by      uuid NOT NULL REFERENCES users(id),
  verified_by   uuid REFERENCES users(id),
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ks_must_have_doi_or_url
    CHECK (doi IS NOT NULL OR url IS NOT NULL),                             -- C8
  CONSTRAINT ks_verification_pair
    CHECK ((verified_by IS NULL) = (verified_at IS NULL))                   -- C8
);

CREATE INDEX IF NOT EXISTS ks_framework_idx ON knowledge_sources (framework);
CREATE INDEX IF NOT EXISTS ks_verified_idx ON knowledge_sources (verified_at)
  WHERE verified_at IS NOT NULL;
