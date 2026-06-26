-- 0060_star_tier_history_evidence.sql
-- Evidence-link each star_tier_history observation (0045) to WHAT moved it, so a
-- brightness / tier change is citable ("이 별이 밝아진 근거"). Two nullable, additive
-- columns — existing rows and the aggregate rebuild path (persona/build.ts) stay
-- null; the propose->ratify path fills them from the ratified proposal.
--   evidence_origin    : how the row was produced ('ratify' | 'rebuild' | …).
--   evidence_citations : record ids / source slugs backing the change
--                        (SelfModelProposal.citations) — scalars only, never any
--                        body / chat text (mirrors the PII-free funnel events).
-- Append-only table unchanged; no backfill, no RLS change (inherits 0045 owner).

ALTER TABLE star_tier_history
  ADD COLUMN IF NOT EXISTS evidence_origin    text,
  ADD COLUMN IF NOT EXISTS evidence_citations text[];
