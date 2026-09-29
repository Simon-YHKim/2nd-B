-- Run only after the numbered migrations, including 0194 and 0208, on a
-- disposable database. The retained draft test creates 0194 itself and cannot
-- test the final schema after 0208. This transaction leaves no test accounts.
\set ON_ERROR_STOP on
BEGIN;

DO $acl$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.llm_service_consent_status(uuid)',
    'public.write_llm_service_consent(uuid,text,text,text,jsonb,text)',
    'public.llm_service_consent_coverage()'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE')
       OR has_function_privilege('authenticated', signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION '0194: service RPC ACL changed: %', signature;
    END IF;
  END LOOP;
END
$acl$;

-- v4/v5 receipts represent already installed clients. The new management
-- writer must leave these rows and their current decisions alone.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('01940000-0000-0000-0000-000000000001', 'service-v1-ci@example.invalid', now()),
  ('01940000-0000-0000-0000-000000000004', 'service-v4-ci@example.invalid', now()),
  ('01940000-0000-0000-0000-000000000005', 'service-v5-ci@example.invalid', now());
INSERT INTO public.users (id, email, birth_date, minor_tier, privacy_prefs) VALUES
  ('01940000-0000-0000-0000-000000000001', 'service-v1-ci@example.invalid',
   '2000-01-01', 'adult', '{"chat_autosave":true}'::jsonb),
  ('01940000-0000-0000-0000-000000000004', 'service-v4-ci@example.invalid',
   '2000-01-01', 'adult', '{}'::jsonb),
  ('01940000-0000-0000-0000-000000000005', 'service-v5-ci@example.invalid',
   '2000-01-01', 'adult', '{}'::jsonb);
INSERT INTO public.consent_records (
  user_id, age_band, minor_tier, consent_version, policy_version,
  terms_version, purposes, required_ack, optional_consents,
  llm_processing_ack, overseas_transfer_ack, sensitive_data_ack,
  safety_notice_ack, locale
) VALUES
  ('01940000-0000-0000-0000-000000000004', 'adult', 'adult',
   '2026-09-07', '2026-09-26', '2026-08-16', '["service"]',
   true, '{}', true, true, true, true, 'en'),
  ('01940000-0000-0000-0000-000000000005', 'adult', 'adult',
   '2026-09-07', '2026-09-28', '2026-08-16', '["service"]',
   true, '{}', true, true, true, true, 'en');

SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL ROLE service_role;
DO $exercise$
DECLARE
  subject constant uuid := '01940000-0000-0000-0000-000000000001';
  status jsonb;
  granted jsonb;
  revoked jsonb;
  stale_rejected boolean := false;
  required_acks constant jsonb :=
    '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}'::jsonb;
BEGIN
  status := public.llm_service_consent_status(subject);
  IF status->>'contract_revision' IS DISTINCT FROM 'service-v1'
     OR status->>'consent_version' IS DISTINCT FROM '2026-09-07'
     OR status->>'policy_version' IS DISTINCT FROM '2026-09-29'
     OR status->>'terms_version' IS DISTINCT FROM '2026-08-16'
     OR status->>'state' IS DISTINCT FROM 'uncovered'
     OR status->>'can_grant' IS DISTINCT FROM 'true'
     OR status->>'change_token' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION '0194: v1 status is not the email-v6 document tuple: %', status;
  END IF;
  granted := public.write_llm_service_consent(
    subject, 'service-v1', status->>'change_token', 'grant', required_acks, 'ko');
  IF granted->>'state' IS DISTINCT FROM 'granted'
     OR granted->>'policy_version' IS DISTINCT FROM '2026-09-29'
     OR granted->>'change_token' IS NOT DISTINCT FROM status->>'change_token' THEN
    RAISE EXCEPTION '0194: grant did not advance v1 status: %', granted;
  END IF;
  revoked := public.write_llm_service_consent(
    subject, 'service-v1', granted->>'change_token', 'revoke', '{}'::jsonb, 'en');
  IF revoked->>'state' IS DISTINCT FROM 'revoked'
     OR revoked->>'policy_version' IS DISTINCT FROM '2026-09-29'
     OR revoked->>'change_token' IS NOT DISTINCT FROM granted->>'change_token' THEN
    RAISE EXCEPTION '0194: revoke did not advance v1 status: %', revoked;
  END IF;
  BEGIN
    PERFORM public.write_llm_service_consent(
      subject, 'service-v1', granted->>'change_token', 'grant', required_acks, 'en');
  EXCEPTION WHEN SQLSTATE '40001' THEN
    stale_rejected := SQLERRM = 'llm_service_consent_changed';
  END;
  IF NOT stale_rejected THEN
    RAISE EXCEPTION '0194: stale grant token was accepted after revoke';
  END IF;
  IF public.llm_service_consent_status('01940000-0000-0000-0000-000000000004')->>'state'
       IS DISTINCT FROM 'granted'
     OR public.llm_service_consent_status('01940000-0000-0000-0000-000000000005')->>'state'
       IS DISTINCT FROM 'granted' THEN
    RAISE EXCEPTION '0194: v4/v5 service status lost current consent';
  END IF;
END
$exercise$;
RESET ROLE;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.consent_records
      WHERE user_id = '01940000-0000-0000-0000-000000000001') <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.consent_records c
       JOIN public.llm_consent_receipts p ON p.consent_record_id = c.id
       WHERE c.user_id = '01940000-0000-0000-0000-000000000001'
         AND c.consent_version = '2026-09-07'
         AND c.policy_version = '2026-09-29'
         AND c.terms_version = '2026-08-16'
         AND c.required_ack AND c.llm_processing_ack
         AND c.overseas_transfer_ack AND c.sensitive_data_ack AND c.safety_notice_ack
         AND c.optional_consents = '{}'::jsonb
         AND p.contract_revision = 'email-v6' AND p.service_action = 'grant'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.consent_records c
       JOIN public.llm_consent_receipts p ON p.consent_record_id = c.id
       WHERE c.user_id = '01940000-0000-0000-0000-000000000001'
         AND c.consent_version = '2026-09-07'
         AND c.policy_version = '2026-09-29'
         AND c.terms_version = '2026-08-16'
         AND c.required_ack AND NOT c.llm_processing_ack
         AND c.overseas_transfer_ack AND c.sensitive_data_ack AND c.safety_notice_ack
         AND c.optional_consents = '{}'::jsonb
         AND p.contract_revision = 'email-v6' AND p.service_action = 'revoke'
     ) THEN
    RAISE EXCEPTION '0194: grant/revoke did not create two canonical email-v6 receipts';
  END IF;
  IF (SELECT privacy_prefs FROM public.users
      WHERE id = '01940000-0000-0000-0000-000000000001')
       IS DISTINCT FROM '{"chat_autosave":true}'::jsonb THEN
    RAISE EXCEPTION '0194: writer changed optional preferences';
  END IF;
  IF (SELECT count(*) FROM public.llm_consent_receipts p
      JOIN public.consent_records c ON c.id = p.consent_record_id
      WHERE (c.user_id = '01940000-0000-0000-0000-000000000004'
             AND c.policy_version = '2026-09-26' AND p.contract_revision = 'email-v4')
         OR (c.user_id = '01940000-0000-0000-0000-000000000005'
             AND c.policy_version = '2026-09-28' AND p.contract_revision = 'email-v5')) <> 2
     OR (SELECT count(*) FROM public.llm_consent_current_decision(
       '01940000-0000-0000-0000-000000000004')) <> 1
     OR (SELECT count(*) FROM public.llm_consent_current_decision(
       '01940000-0000-0000-0000-000000000005')) <> 1 THEN
    RAISE EXCEPTION '0194: v4/v5 historical receipts were not preserved';
  END IF;
END
$verify$;
ROLLBACK;
