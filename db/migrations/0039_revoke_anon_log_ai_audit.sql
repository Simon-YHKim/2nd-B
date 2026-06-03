-- 0039_revoke_anon_log_ai_audit.sql
-- Follow-up to 0038 (applied + verified on prod 2026-06-03). Supabase's default
-- function grants gave anon (and service_role) EXECUTE on the new log_ai_audit()
-- at CREATE time, which 0038's `REVOKE ... FROM public` did NOT cover (those are
-- explicit per-role grants, not the PUBLIC pseudo-role). An anon caller would
-- write rows with user_id = NULL (auth.uid() is null when unauthenticated) — an
-- audit-table spam vector and a needless privilege on a SECURITY DEFINER writer.
--
-- Least privilege: only `authenticated` may call it (the direct/native client
-- audit path). The gemini-proxy writes the authoritative row server-side as
-- service_role via a DIRECT INSERT (bypasses RLS), not through this RPC, so
-- service_role does not need EXECUTE here either.
--
-- Idempotent.
REVOKE EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer) TO authenticated;
