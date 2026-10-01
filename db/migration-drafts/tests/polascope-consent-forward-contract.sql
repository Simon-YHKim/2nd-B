-- Run after numbered migrations through 0208 in a disposable local DB.
-- The service-v1 and email-v4/email-v5/email-v6 clients continue after v2 is added.
BEGIN;
\ir ../UNNUMBERED_polascope_consent_20260928.sql
COMMIT;

CREATE OR REPLACE FUNCTION pg_temp.expect_consent_error(statement text,expected_code text,expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_code text; actual_message text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_code=RETURNED_SQLSTATE,actual_message=MESSAGE_TEXT;
  END;
  IF actual_code IS DISTINCT FROM expected_code OR actual_message NOT LIKE '%'||expected_message||'%' THEN
    RAISE EXCEPTION 'Expected % / %, received % / %',expected_code,expected_message,actual_code,actual_message;
  END IF;
END $$;

-- The standalone CI connection does not inherit the composite fixture's JWT.
SET request.jwt.claim.role='service_role';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 7
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v7') c
      WHERE c.consent_version='2026-10-05' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-10-05' AND c.confirmation_eligible)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v6') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v5') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-28'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v4') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-26'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible)
    OR EXISTS(SELECT 1 FROM public.signup_consent_contract('unreviewed'))
  THEN RAISE EXCEPTION 'signup tuple preservation/current contract failed'; END IF;
END $$;

-- The unchanged confirmation trigger must resolve both the already-published
-- 09-29 client and the new 10-05 client without rewriting either receipt.
DO $$
DECLARE subject uuid := gen_random_uuid(); old_subject uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(old_subject,old_subject::text||'@example.invalid',jsonb_build_object(
    'signup_flow','email-v6','signup_birth_date','1990-01-01','signup_locale','en',
    'signup_consent_service',true,'signup_consent_llm_processing',true,
    'signup_consent_overseas_transfer',true,'signup_consent_sensitive_data',true,
    'signup_consent_safety_notice',true,'signup_consent_marketing',false));
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=old_subject;
  IF NOT EXISTS(
    SELECT 1 FROM public.consent_records c
    JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE c.user_id=old_subject AND c.consent_version='2026-09-07'
      AND c.policy_version='2026-09-29' AND c.terms_version='2026-08-16'
      AND p.contract_revision='email-v6' AND c.required_ack AND c.safety_notice_ack
  ) THEN RAISE EXCEPTION 'email-v6 legacy confirmation/provenance changed'; END IF;

  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(subject,subject::text||'@example.invalid',jsonb_build_object(
    'signup_flow','email-v7','signup_birth_date','1990-01-01','signup_locale','en',
    'signup_consent_service',true,'signup_consent_llm_processing',true,
    'signup_consent_overseas_transfer',true,'signup_consent_sensitive_data',true,
    'signup_consent_safety_notice',true,'signup_consent_marketing',false,
    'signup_policy_version','2099-01-01'));
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=subject;
  IF NOT EXISTS(
    SELECT 1 FROM public.consent_records c
    JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE c.user_id=subject AND c.consent_version='2026-10-05'
      AND c.policy_version='2026-09-29' AND c.terms_version='2026-10-05'
      AND p.contract_revision='email-v7' AND c.required_ack AND c.safety_notice_ack
  ) THEN RAISE EXCEPTION 'email-v7 confirmation/provenance contract failed'; END IF;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','polascope-dual-client@example.invalid',now());
INSERT INTO public.users(id,email,birth_date,minor_tier,privacy_prefs)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','polascope-dual-client@example.invalid','2000-01-01','adult','{}');

DO $$
DECLARE
  u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v1 jsonb; v2 jsonb; saved jsonb; receipt public.consent_records%ROWTYPE;
  acks jsonb := '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
BEGIN
  v1 := public.llm_service_consent_status(u);
  v2 := public.llm_service_consent_status_v2(u);
  IF v1->>'contract_revision'<>'service-v1' OR v1->>'consent_version'<>'2026-09-07'
    OR v1->>'policy_version'<>'2026-09-29' OR v1->>'terms_version'<>'2026-08-16'
    OR v2->>'contract_revision'<>'service-v2' OR v2->>'consent_version'<>'2026-10-05'
    OR v2->>'policy_version'<>'2026-09-29' OR v2->>'terms_version'<>'2026-10-05'
    OR v1->>'change_token'=v2->>'change_token' THEN
    RAISE EXCEPTION 'dual client status contract failed';
  END IF;

  saved := public.write_llm_service_consent(u,'service-v1',v1->>'change_token','grant',acks,'en');
  SELECT c.* INTO receipt FROM public.consent_records c JOIN public.llm_consent_receipts p
    ON p.consent_record_id=c.id WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1;
  IF saved->>'state'<>'granted' OR receipt.consent_version<>'2026-09-07'
    OR receipt.policy_version<>'2026-09-29' OR receipt.terms_version<>'2026-08-16'
    OR NOT public.effective_llm_consent_v2(u)
    OR public.llm_service_consent_status_v2(u)->>'state'<>'granted' THEN
    RAISE EXCEPTION 'service-v1 grant lost validity or was silently upgraded';
  END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v2',v2->>'change_token','grant',acks,'en'),'40001','llm_service_consent_changed');

  v2 := public.llm_service_consent_status_v2(u);
  saved := public.write_llm_service_consent(u,'service-v2',v2->>'change_token','grant',acks,'ko');
  SELECT c.* INTO receipt FROM public.consent_records c JOIN public.llm_consent_receipts p
    ON p.consent_record_id=c.id WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1;
  IF saved->>'state'<>'granted' OR receipt.consent_version<>'2026-10-05'
    OR receipt.policy_version<>'2026-09-29' OR receipt.terms_version<>'2026-10-05'
    OR NOT public.effective_llm_consent_v2(u) THEN
    RAISE EXCEPTION 'current v7 grant failed';
  END IF;

  v1 := public.llm_service_consent_status(u);
  saved := public.write_llm_service_consent(u,'service-v1',v1->>'change_token','revoke','{}','en');
  IF saved->>'state'<>'revoked' OR public.effective_llm_consent_v2(u)
    OR public.llm_service_consent_status_v2(u)->>'state'<>'revoked' THEN
    RAISE EXCEPTION 'legacy withdrawal after v7 grant failed';
  END IF;
END $$;

SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.llm_service_consent_status_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'authenticated v2 status allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: PolaScope email-v7/service-v2, preserved v4/v5/v6 and v1 grant/withdrawal, CAS and private ACL';
