-- INACTIVE DRAFT rollback. Run in one transaction after restoring the exporter
-- that does not query these four pending tables. Revoke only this draft's grants.
-- Preconditions: these columns had no service_role grant before the forward
-- migration, and no later migration relies on them. Preserve all other ACLs.
SET LOCAL lock_timeout = '10s';

REVOKE SELECT (consent_record_id, user_id, contract_revision, service_action, recorded_at)
ON public.llm_consent_receipts FROM service_role;

REVOKE SELECT (user_id, enabled, contract, locale, updated_at)
ON public.weather_consent_state FROM service_role;

REVOKE SELECT (id, user_id, event, recipient, contract, created_at)
ON public.weather_access_events FROM service_role;

REVOKE SELECT (user_id, timezone, locale, last_active_at)
ON public.dashboard_generation_settings FROM service_role;
