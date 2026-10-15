-- Roll the exporter back first; revoking while the new exporter runs makes it
-- fail closed. Retain all history and the existing authenticated/anon ACL.
SET LOCAL lock_timeout = '10s';

REVOKE SELECT (id, user_id, created_at, item_count, profile_change_count, status,
  withdrawn_at, profile_restored)
ON public.profile_context_imports FROM service_role;
