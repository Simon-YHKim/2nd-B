-- 0150_signup_consent_contract_20260902.sql
--
-- Append the 2026-09-02 verified-email surface without rewriting either
-- historical contract. The optional marketing choice remains the user's
-- literal auth-metadata value; this mapping owns only document versions and
-- whether the auth confirmation trigger may consume the revision.
--
-- The complete-profile RPC has no shipped caller yet. Keep its v1 contract for
-- historical reproducibility, but close authenticated execution until a future
-- client revision and its re-grant can ship atomically.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE (
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $contract$
  SELECT
    contract.consent_version,
    contract.policy_version,
    contract.terms_version,
    contract.confirmation_eligible
  FROM (
    VALUES
      ('email-v2'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, true),
      ('complete-profile-v1'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, false),
      ('email-v3'::text, '2026-09-02'::text, '2026-09-02'::text, '2026-08-16'::text, true)
  ) AS contract(
    signup_revision,
    consent_version,
    policy_version,
    terms_version,
    confirmation_eligible
  )
  WHERE contract.signup_revision = p_revision
$contract$;

-- CREATE OR REPLACE preserves ACLs. Reassert every private boundary explicitly;
-- keep the dormant RPC revoke last so the migration's final ACL mutation is
-- the fail-closed production state.
REVOKE ALL ON FUNCTION public.signup_consent_contract(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_verified_email_signup()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_profile_signup_consent(
  text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
