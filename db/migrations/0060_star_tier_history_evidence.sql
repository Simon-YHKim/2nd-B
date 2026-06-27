-- 0060_star_tier_history_evidence.sql
-- Evidence-link each star_tier_history observation (0045) to WHAT moved it, so a
-- brightness / tier change is citable ("이 별이 밝아진 근거"). Two nullable, additive
-- columns — existing rows and both current writers (aggregate rebuild AND the
-- propose->ratify path) leave evidence_citations null and set only origin.
--   evidence_origin    : how the row was produced ('ratify' | 'rebuild' | …).
--   evidence_citations : RESOLVABLE evidence refs (namespaced id/slug, doi, uuid)
--                        backing the change — scalars only, never body / chat
--                        text, and never model-invented labels. The ratify
--                        proposal's free-form citations are NOT trusted here (no
--                        real-id whitelist yet); recordStarTiers.sanitizeCitations
--                        enforces the shape. Populating this from real record ids
--                        is a follow-up.
-- Append-only table unchanged; no backfill, no RLS change (inherits 0045 owner).

ALTER TABLE star_tier_history
  ADD COLUMN IF NOT EXISTS evidence_origin    text,
  ADD COLUMN IF NOT EXISTS evidence_citations text[];
