-- Operational rollback for a forward-only integrity repair.
-- Stop new imports; retain the corrected withdrawal/save paths, receipts and undo.
-- Do not restore 0239's broken restoration or discard live descendant undo.
-- Keep the all-item validator and its private ACL; never reopen provenance bypass.
-- Old partial-confirmation clients cannot resume imports. Requires Simon GO.
SET LOCAL lock_timeout = '10s';
REVOKE ALL ON FUNCTION public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.validate_profile_import_document(jsonb,text[])
  FROM PUBLIC,anon,authenticated,service_role;
-- Resume only after review: GRANT EXECUTE ON FUNCTION
-- public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint) TO authenticated;
