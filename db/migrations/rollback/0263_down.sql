-- DISPOSABLE LOCAL STRUCTURE TEST ONLY. Erased vectors/models cannot be restored.
-- PERMANENT COMPATIBILITY: after any app stops direct deletion, production DOWN
-- that removes/disables either trigger is forbidden. Rolling back an app cannot
-- remove already-installed mobile clients. Use a reviewed forward fix or keep
-- withdrawal enabled and make the write guard NULL every candidate (safe mode).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS zz_records_embedding_write_guard ON public.records;
DROP TRIGGER IF EXISTS zz_records_embedding_consent_changed ON public.users;
DROP FUNCTION IF EXISTS public.guard_record_embedding_write();
DROP FUNCTION IF EXISTS public.clear_record_embeddings_on_privacy_change();
COMMIT;
