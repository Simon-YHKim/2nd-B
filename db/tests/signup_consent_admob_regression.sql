-- Disposable LOCAL database only. Apply the existing signup contract/trigger
-- and the promoted AdMob consent draft first. No external services are called.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  revision text;
  subject uuid;
  expected_policy text;
  before_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 4 THEN
    RAISE EXCEPTION 'expected four supported historical/current contracts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.signup_consent_contract_status()
    WHERE signup_revision = 'email-v4' AND consent_version = '2026-09-07'
      AND policy_version = '2026-09-26' AND terms_version = '2026-08-16'
      AND confirmation_eligible AND confirmation_ready
  ) THEN RAISE EXCEPTION 'new contract is not ready'; END IF;

  FOREACH revision IN ARRAY ARRAY['email-v2', 'email-v3', 'email-v4', 'complete-profile-v1', 'unknown'] LOOP
    subject := gen_random_uuid();
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (subject, subject::text || '@example.invalid', jsonb_build_object(
      'signup_flow', revision, 'signup_birth_date', '1990-01-01', 'signup_locale', 'en',
      'signup_consent_service', true, 'signup_consent_llm_processing', true,
      'signup_consent_overseas_transfer', true, 'signup_consent_sensitive_data', true,
      'signup_consent_safety_notice', true, 'signup_consent_marketing', false,
      'signup_policy_version', '2099-01-01'
    ));
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = subject;
    IF revision IN ('complete-profile-v1', 'unknown') THEN
      IF EXISTS (SELECT 1 FROM public.users WHERE id = subject)
        OR EXISTS (SELECT 1 FROM public.consent_records WHERE user_id = subject) THEN
        RAISE EXCEPTION 'unrecognized/ineligible revision provisioned a profile';
      END IF;
      CONTINUE;
    END IF;
    expected_policy := CASE revision WHEN 'email-v2' THEN '2026-08-30'
      WHEN 'email-v3' THEN '2026-09-07' ELSE '2026-09-26' END;
    IF NOT EXISTS (SELECT 1 FROM public.consent_records
      WHERE user_id = subject AND policy_version = expected_policy
        AND terms_version = '2026-08-16' AND purposes = '["service"]'::jsonb
        AND optional_consents = '{"marketing":false}'::jsonb
        AND required_ack AND llm_processing_ack AND overseas_transfer_ack
        AND sensitive_data_ack AND safety_notice_ack) THEN
      RAISE EXCEPTION 'confirmation did not write its original contract: %', revision;
    END IF;
    SELECT count(*) INTO before_count FROM public.consent_records WHERE user_id = subject;
    UPDATE auth.users SET email_confirmed_at = now() + interval '1 second' WHERE id = subject;
    IF (SELECT count(*) FROM public.consent_records WHERE user_id = subject) <> before_count THEN
      RAISE EXCEPTION 'confirmation retry wrote a second receipt';
    END IF;
  END LOOP;

  -- A false required ack cannot be replaced by a newer document version.
  subject := gen_random_uuid();
  INSERT INTO auth.users(id, email, raw_user_meta_data)
  VALUES(subject, subject::text || '@example.invalid', jsonb_build_object(
    'signup_flow', 'email-v4', 'signup_birth_date', '1990-01-01',
    'signup_consent_service', true, 'signup_consent_llm_processing', true,
    'signup_consent_overseas_transfer', true, 'signup_consent_sensitive_data', true,
    'signup_consent_safety_notice', false
  ));
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = subject;
  IF EXISTS(SELECT 1 FROM public.users WHERE id = subject) THEN
    RAISE EXCEPTION 'missing ack was treated as consent';
  END IF;
END
$test$;

SET LOCAL ROLE anon;
SELECT 1 / CASE WHEN count(*) = 4 THEN 1 ELSE 0 END AS anonymous_public_metadata
FROM public.signup_consent_contract_status();
RESET ROLE;

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.signup_consent_contract(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.signup_consent_contract(text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'private signup writer or resolver became public';
  END IF;
END
$acl$;

ALTER TABLE auth.users DISABLE TRIGGER trg_complete_verified_email_signup;
DO $disabled$
BEGIN
  IF EXISTS(SELECT 1 FROM public.signup_consent_contract_status() WHERE confirmation_ready) THEN
    RAISE EXCEPTION 'disabled trigger still reports ready';
  END IF;
END
$disabled$;
ALTER TABLE auth.users ENABLE TRIGGER trg_complete_verified_email_signup;

-- Metadata comes from the actual resolver, not copied status-RPC constants.
CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE(consent_version text, policy_version text, terms_version text, confirmation_eligible boolean)
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT '1999-01-01'::text, '1999-01-02'::text, '1999-01-03'::text, false $$;
DO $resolver$
BEGIN
  IF EXISTS (SELECT 1 FROM public.signup_consent_contract_status()
    WHERE policy_version <> '1999-01-02' OR confirmation_eligible) THEN
    RAISE EXCEPTION 'status does not read the actual resolver';
  END IF;
END
$resolver$;

ROLLBACK;
