-- INACTIVE DRAFT. Q-261021-06 (2026-10-22): account export read access.
-- Assign a number only in the Relay promotion PR. Apply in one transaction.
-- Follow 0243: explicit export columns only; keep client ACL and RLS intact.
-- This does not activate the pending export descriptors or deploy the exporter.
SET LOCAL lock_timeout = '10s';

GRANT SELECT (consent_record_id, user_id, contract_revision, service_action, recorded_at)
ON public.llm_consent_receipts TO service_role;

GRANT SELECT (user_id, enabled, contract, locale, updated_at)
ON public.weather_consent_state TO service_role;

GRANT SELECT (id, user_id, event, recipient, contract, created_at)
ON public.weather_access_events TO service_role;

GRANT SELECT (user_id, timezone, locale, last_active_at)
ON public.dashboard_generation_settings TO service_role;
