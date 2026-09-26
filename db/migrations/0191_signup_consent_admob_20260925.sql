-- INACTIVE DRAFT. Reserve a fresh migration number before approved promotion.
-- Apply and verify this server contract BEFORE publishing the 2026-09-26
-- privacy policy/client. Older clients retain their original document tuple.
-- This does not backfill consent, enable ads, or grant optional ad consent.
-- The public status RPC reads the actual private resolver and current trigger
-- wiring; release checks must also run the confirmation behavior fixture.
-- Prerequisites: 0148_verified_email_signup_consent_ledger.sql,
-- 0149_atomic_complete_profile_signup_consent.sql, and
-- 0150_signup_consent_contract_20260902.sql (including their own prerequisites).
-- Promote atomically, then run db/tests/signup_consent_admob_regression.sql
-- against a disposable LOCAL database. The web publish workflow checks the
-- public status RPC with the build's target before export and after approval
-- through scripts/check-signup-consent-deployment.cjs. Do not publish email-v4
-- while that gate is unavailable or fails. Client rollback preserves v2/v3.

SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.signup_consent_contract('email-v3') AS contract
    WHERE contract.consent_version = '2026-09-07'
      AND contract.policy_version = '2026-09-07'
      AND contract.terms_version = '2026-08-16'
      AND contract.confirmation_eligible IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_trigger AS hook ON hook.tgfoid = routine.oid
    WHERE routine.oid = 'public.complete_verified_email_signup()'::regprocedure
      AND routine.prosecdef
      AND position('public.signup_consent_contract' in routine.prosrc) > 0
      AND position('contract.confirmation_eligible IS TRUE' in routine.prosrc) > 0
      AND hook.tgrelid = 'auth.users'::regclass
      AND hook.tgname = 'trg_complete_verified_email_signup'
      AND hook.tgenabled IN ('O', 'A') AND hook.tgtype = 17
      AND NOT hook.tgisinternal
  ) THEN
    RAISE EXCEPTION 'signup_consent_contract_not_ready' USING ERRCODE = '55000';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE (
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean
)
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $contract$
  SELECT contract.consent_version, contract.policy_version,
         contract.terms_version, contract.confirmation_eligible
  FROM (VALUES
    ('email-v2'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, true),
    ('complete-profile-v1'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, false),
    ('email-v3'::text, '2026-09-07'::text, '2026-09-07'::text, '2026-08-16'::text, true),
    ('email-v4'::text, '2026-09-07'::text, '2026-09-26'::text, '2026-08-16'::text, true)
  ) AS contract(signup_revision, consent_version, policy_version, terms_version, confirmation_eligible)
  WHERE contract.signup_revision = p_revision
$contract$;

REVOKE ALL ON FUNCTION public.signup_consent_contract(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_verified_email_signup()
  FROM PUBLIC, anon, authenticated, service_role;
-- The dormant complete-profile contract remains closed; email-v4 does not
-- authorize an older profile form to assert it showed the new policy.
REVOKE ALL ON FUNCTION public.complete_profile_signup_consent(
  text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()
RETURNS TABLE (
  signup_revision text,
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean,
  confirmation_ready boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $status$
  SELECT revision.id, contract.consent_version, contract.policy_version,
         contract.terms_version, contract.confirmation_eligible,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS routine
           JOIN pg_catalog.pg_trigger AS hook ON hook.tgfoid = routine.oid
           WHERE routine.oid = 'public.complete_verified_email_signup()'::regprocedure
             AND routine.prosecdef
             AND position('public.signup_consent_contract' in routine.prosrc) > 0
             AND position('contract.confirmation_eligible IS TRUE' in routine.prosrc) > 0
             AND hook.tgrelid = 'auth.users'::regclass
             AND hook.tgname = 'trg_complete_verified_email_signup'
             AND hook.tgenabled IN ('O', 'A') AND hook.tgtype = 17
             AND NOT hook.tgisinternal
             AND NOT pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
             AND NOT pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
             AND NOT pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE')
         )
  FROM (VALUES ('email-v2'), ('complete-profile-v1'), ('email-v3'), ('email-v4')) AS revision(id)
  CROSS JOIN LATERAL public.signup_consent_contract(revision.id) AS contract
$status$;

REVOKE ALL ON FUNCTION public.signup_consent_contract_status()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_consent_contract_status() TO anon, authenticated;

COMMENT ON FUNCTION public.signup_consent_contract_status() IS
  'Public policy metadata only. Reads the actual signup contract and confirmation trigger readiness; contains no account data and grants no consent.';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.signup_consent_contract_status()
    WHERE signup_revision = 'email-v4' AND consent_version = '2026-09-07'
      AND policy_version = '2026-09-26' AND terms_version = '2026-08-16'
      AND confirmation_eligible IS TRUE AND confirmation_ready IS TRUE
  ) THEN
    RAISE EXCEPTION 'signup_consent_contract_not_ready' USING ERRCODE = '55000';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';
