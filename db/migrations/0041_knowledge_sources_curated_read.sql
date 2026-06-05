-- 0041: knowledge_sources read policy — curated / own / verified only.
--
-- Closes a cross-user stored-prompt-injection vector (audit 2026-06-05, MED).
-- Previously `ks_auth_select` (0009) was `USING (true)`, so ANY authenticated
-- user's INSERTed knowledge_sources row was retrievable into EVERY other user's
-- Advisor prompt — retrieve.ts routes by framework/locale/age, not by owner —
-- and the C8 verification pair (verified_by/verified_at) was collected but never
-- enforced at read time.
--
-- New read rule (authenticated): a row is readable only if it is
--   - a curated/service-role seed   (added_by IS NULL),  OR
--   - the reader's own row           (added_by = auth.uid()), OR
--   - curator-verified               (verified_at IS NOT NULL).
-- => another user's UNVERIFIED row is no longer readable, so it cannot reach a
--    cross-user Advisor prompt. Curated seeds (added_by NULL, run as service
--    role per 0013) and verified rows are unaffected; a user still sees their
--    own pending submission. `ks_auth_insert` (added_by = auth.uid()) and
--    `ks_owner_update` are unchanged. retrieve.ts <UNTRUSTED> fencing stays as
--    defense in depth.
--
-- SAFETY NOTE (deploy gate): this relies on curated rows having added_by IS NULL
-- (true for service-role seeds). If any curated source was inserted with a
-- non-null added_by and verified_at IS NULL, stamp it verified (or null its
-- added_by) before/with apply so it stays visible. Verify on the live DB first.

DROP POLICY IF EXISTS ks_auth_select ON public.knowledge_sources;

CREATE POLICY ks_auth_select ON public.knowledge_sources
  FOR SELECT TO authenticated
  USING (
    added_by IS NULL
    OR added_by = auth.uid()
    OR verified_at IS NOT NULL
  );
