-- 0014_relax_verification_pair.sql
-- The original ks_verification_pair CHECK required (verified_by IS NULL) = (verified_at IS NULL),
-- which blocked seed/curator-system rows that have verified_at (= curation timestamp) but
-- no verified_by uuid (no real user behind a system seed).
--
-- New rule: verified_by implies verified_at (a person can't verify "at no time"), but
-- verified_at alone is fine (system curation timestamp without a user reference).

ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS ks_verification_pair;
ALTER TABLE knowledge_sources
  ADD CONSTRAINT ks_verification_pair
  CHECK (verified_by IS NULL OR verified_at IS NOT NULL);
