-- G4-05 / Simon 2026-10-10: export import history, not internal receipts or undo.
-- The export-account service client filters by user_id and orders by created_at,id.
-- Keep the existing authenticated/anon ACL and owner RLS unchanged.
SET LOCAL lock_timeout = '10s';

GRANT SELECT (id, user_id, created_at, item_count, profile_change_count, status,
  withdrawn_at, profile_restored)
ON public.profile_context_imports TO service_role;
