-- 0203 regression: the 2026-09-28 privacy policy is a NOTICE revision.
--
-- Scratch database only, after the numbered migrations ran. Everything happens
-- inside one transaction that is rolled back.
--
-- What must hold (Simon, 2026-09-28: notice revision, not re-consent):
--   1. email-v5 is advertised and ready next to email-v4 (5 contracts).
--   2. A v5 signup is stamped with the 2026-09-28 tuple and gets an email-v5
--      provenance receipt. A v4 signup (an installed older app) still works
--      and keeps its 2026-09-26 tuple.
--   3. LLM consent treats BOTH tuples as current: each user gets exactly one
--      decision row, allowed. An older contract (email-v3) is not current.
--   4. The public status RPC stays readable by anon; the resolvers do not.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  revision text;
  subject uuid;
  subjects jsonb := '{}'::jsonb;
  expected_policy text;
  receipt_revision text;
  rows_seen bigint;
  decision_allowed boolean;
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 5 THEN
    RAISE EXCEPTION '0203: expected five supported contracts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.signup_consent_contract_status()
    WHERE signup_revision = 'email-v5' AND consent_version = '2026-09-07'
      AND policy_version = '2026-09-28' AND terms_version = '2026-08-16'
      AND confirmation_eligible AND confirmation_ready
  ) THEN RAISE EXCEPTION '0203: email-v5 is not ready'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.signup_consent_contract_status()
    WHERE signup_revision = 'email-v4' AND policy_version = '2026-09-26'
      AND confirmation_eligible AND confirmation_ready
  ) THEN RAISE EXCEPTION '0203: email-v4 must stay accepted for installed clients'; END IF;

  FOREACH revision IN ARRAY ARRAY['email-v5', 'email-v4', 'email-v3'] LOOP
    subject := gen_random_uuid();
    subjects := subjects || jsonb_build_object(revision, subject);
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (subject, subject::text || '@example.invalid', jsonb_build_object(
      'signup_flow', revision, 'signup_birth_date', '1990-01-01', 'signup_locale', 'en',
      'signup_consent_service', true, 'signup_consent_llm_processing', true,
      'signup_consent_overseas_transfer', true, 'signup_consent_sensitive_data', true,
      'signup_consent_safety_notice', true, 'signup_consent_marketing', false
    ));
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = subject;

    expected_policy := CASE revision WHEN 'email-v5' THEN '2026-09-28'
      WHEN 'email-v4' THEN '2026-09-26' ELSE '2026-09-07' END;
    IF NOT EXISTS (SELECT 1 FROM public.consent_records
      WHERE user_id = subject AND consent_version = '2026-09-07'
        AND policy_version = expected_policy AND terms_version = '2026-08-16'
        AND purposes = '["service"]'::jsonb
        AND required_ack AND llm_processing_ack AND overseas_transfer_ack
        AND sensitive_data_ack AND safety_notice_ack) THEN
      RAISE EXCEPTION '0203: % signup did not write its own tuple', revision;
    END IF;

    SELECT p.contract_revision INTO receipt_revision
      FROM public.llm_consent_receipts p
     WHERE p.user_id = subject;
    IF receipt_revision IS DISTINCT FROM revision THEN
      RAISE EXCEPTION '0203: % signup got receipt %', revision, receipt_revision;
    END IF;

    SELECT count(*), bool_and(d.allowed) INTO rows_seen, decision_allowed
      FROM public.llm_consent_current_decision(subject) d;
    IF rows_seen <> 1 THEN
      RAISE EXCEPTION '0203: % decision returned % rows, not one', revision, rows_seen;
    END IF;
    IF revision IN ('email-v5', 'email-v4') AND decision_allowed IS NOT TRUE THEN
      RAISE EXCEPTION '0203: % consent must stay current after a notice revision', revision;
    END IF;
    IF revision = 'email-v3' AND decision_allowed IS NOT FALSE THEN
      RAISE EXCEPTION '0203: an email-v3 receipt must not count as current';
    END IF;
  END LOOP;

  -- An unknown revision still provisions nothing.
  subject := gen_random_uuid();
  INSERT INTO auth.users(id, email, raw_user_meta_data)
  VALUES (subject, subject::text || '@example.invalid', jsonb_build_object(
    'signup_flow', 'email-v6', 'signup_birth_date', '1990-01-01',
    'signup_consent_service', true, 'signup_consent_llm_processing', true,
    'signup_consent_overseas_transfer', true, 'signup_consent_sensitive_data', true,
    'signup_consent_safety_notice', true
  ));
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = subject;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = subject)
     OR EXISTS (SELECT 1 FROM public.consent_records WHERE user_id = subject) THEN
    RAISE EXCEPTION '0203: an unknown revision provisioned a profile';
  END IF;
END
$test$;

SET LOCAL ROLE anon;
SELECT 1 / CASE WHEN count(*) = 5 THEN 1 ELSE 0 END AS anonymous_public_metadata
FROM public.signup_consent_contract_status();
RESET ROLE;

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.signup_consent_contract(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.signup_consent_contract(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.llm_consent_current_decision(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.llm_consent_current_decision(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.llm_consent_current_decision(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '0203: a private resolver became callable';
  END IF;
END
$acl$;

ROLLBACK;
