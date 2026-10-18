-- 0262 (email-v10 / service-v5, Z5 쉬운 말 · 방침 2026-10-07) numbered regression. 공지형·재동의 없음.
-- Runs after the numbered CLI replay has applied 0262 once. The forward lane
-- (consent-email-v10-forward-contract.sql) applies 0262 on the polaris fixture
-- first and then includes this file.

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
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 9
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract_status()
      WHERE signup_revision='email-v10' AND consent_version='2026-10-18'
        AND policy_version='2026-10-07' AND terms_version='2026-10-05'
        AND confirmation_eligible AND confirmation_ready)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v9') c
      WHERE c.consent_version='2026-10-06' AND c.policy_version='2026-10-06'
        AND c.terms_version='2026-10-05' AND c.confirmation_eligible)
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
    OR EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v8'))
    OR EXISTS(SELECT 1 FROM public.signup_consent_contract('unreviewed'))
  THEN RAISE EXCEPTION 'email-v10 signup tuple preservation/current contract failed'; END IF;
  -- The v5 DEFINER runs as the same owner as the v4 status function and the writer.
  IF (SELECT p.proowner FROM pg_catalog.pg_proc AS p
       WHERE p.oid='public.llm_service_consent_status_v5(uuid)'::regprocedure)
     IS DISTINCT FROM (SELECT p.proowner FROM pg_catalog.pg_proc AS p
       WHERE p.oid='public.llm_service_consent_status_v4(uuid)'::regprocedure)
    OR (SELECT p.proowner FROM pg_catalog.pg_proc AS p
       WHERE p.oid='public.llm_service_consent_status_v5(uuid)'::regprocedure)
     IS DISTINCT FROM (SELECT p.proowner FROM pg_catalog.pg_proc AS p
       WHERE p.oid='public.write_llm_service_consent(uuid,text,text,text,jsonb,text)'::regprocedure)
    OR NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p
       WHERE p.oid='public.llm_service_consent_status_v5(uuid)'::regprocedure)
    OR (SELECT pg_catalog.array_to_string(p.proconfig, ',') FROM pg_catalog.pg_proc AS p
       WHERE p.oid='public.llm_service_consent_status_v5(uuid)'::regprocedure) IS DISTINCT FROM 'search_path=""'
  THEN RAISE EXCEPTION 'email-v10 v5 status owner/definer/search_path failed'; END IF;
END $$;

-- The unchanged confirmation trigger resolves the new email-v10 client and the
-- already-published email-v9 client, each to its own tuple and provenance.
DO $$
DECLARE subject uuid := gen_random_uuid(); subject_v9 uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(subject,subject::text||'@example.invalid',jsonb_build_object(
    'signup_flow','email-v10','signup_birth_date','1990-01-01','signup_locale','ko',
    'signup_consent_service',true,'signup_consent_llm_processing',true,
    'signup_consent_overseas_transfer',true,'signup_consent_sensitive_data',true,
    'signup_consent_safety_notice',true,'signup_consent_marketing',false,
    'signup_policy_version','2099-01-01'));
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=subject;
  IF NOT EXISTS(
    SELECT 1 FROM public.consent_records c
    JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE c.user_id=subject AND c.consent_version='2026-10-18'
      AND c.policy_version='2026-10-07' AND c.terms_version='2026-10-05'
      AND p.contract_revision='email-v10' AND c.required_ack AND c.safety_notice_ack
  ) THEN RAISE EXCEPTION 'email-v10 confirmation/provenance contract failed'; END IF;

  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(subject_v9,subject_v9::text||'@example.invalid',jsonb_build_object(
    'signup_flow','email-v9','signup_birth_date','1990-01-01','signup_locale','en',
    'signup_consent_service',true,'signup_consent_llm_processing',true,
    'signup_consent_overseas_transfer',true,'signup_consent_sensitive_data',true,
    'signup_consent_safety_notice',true,'signup_consent_marketing',false));
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=subject_v9;
  IF NOT EXISTS(
    SELECT 1 FROM public.consent_records c
    JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE c.user_id=subject_v9 AND c.consent_version='2026-10-06'
      AND c.policy_version='2026-10-06' AND c.terms_version='2026-10-05'
      AND p.contract_revision='email-v9' AND c.required_ack AND c.safety_notice_ack
  ) THEN RAISE EXCEPTION 'email-v9 confirmation/provenance changed after email-v10'; END IF;
END $$;

-- The fixed multi-client user differs from 0210's (aaaaaaaa-...) and 0215's
-- (bbbbbbbb-...) regressions: all commit fixtures on the same CI database.
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','polascope-v10-multi-client@example.invalid',now());
INSERT INTO public.users(id,email,birth_date,minor_tier,privacy_prefs)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','polascope-v10-multi-client@example.invalid','2000-01-01','adult','{}');

DO $$
DECLARE
  u uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v1 jsonb; v2 jsonb; v4 jsonb; v5 jsonb; saved jsonb; receipt public.consent_records%ROWTYPE;
  acks jsonb := '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
BEGIN
  v1 := public.llm_service_consent_status(u);
  v2 := public.llm_service_consent_status_v2(u);
  v4 := public.llm_service_consent_status_v4(u);
  v5 := public.llm_service_consent_status_v5(u);
  IF v4->>'contract_revision'<>'service-v4' OR v4->>'consent_version'<>'2026-10-06'
    OR v4->>'policy_version'<>'2026-10-06' OR v4->>'terms_version'<>'2026-10-05'
    OR v5->>'contract_revision'<>'service-v5' OR v5->>'consent_version'<>'2026-10-18'
    OR v5->>'policy_version'<>'2026-10-07' OR v5->>'terms_version'<>'2026-10-05'
    OR v5->>'state'<>'uncovered' OR (v5->>'can_grant')::boolean IS NOT TRUE
    OR v1->>'change_token'=v5->>'change_token'
    OR v2->>'change_token'=v5->>'change_token'
    OR v4->>'change_token'=v5->>'change_token' THEN
    RAISE EXCEPTION 'four-client status contract failed';
  END IF;

  -- A service-v4 grant stays valid and readable as granted through service-v5.
  saved := public.write_llm_service_consent(u,'service-v4',v4->>'change_token','grant',acks,'en');
  SELECT c.* INTO receipt FROM public.consent_records c JOIN public.llm_consent_receipts p
    ON p.consent_record_id=c.id WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1;
  IF saved->>'state'<>'granted' OR receipt.consent_version<>'2026-10-06'
    OR receipt.policy_version<>'2026-10-06' OR receipt.terms_version<>'2026-10-05'
    OR NOT public.effective_llm_consent_v2(u)
    OR public.llm_service_consent_status_v5(u)->>'state'<>'granted' THEN
    RAISE EXCEPTION 'service-v4 grant lost validity or was silently upgraded';
  END IF;
  -- The stale v5 token from before the v4 write is refused (owner CAS).
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v5',v5->>'change_token','grant',acks,'ko'),'40001','llm_service_consent_changed');
  -- A v4 token cannot be replayed against the v5 contract.
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v5',public.llm_service_consent_status_v4(u)->>'change_token','grant',acks,'ko'),'40001','llm_service_consent_changed');

  v5 := public.llm_service_consent_status_v5(u);
  saved := public.write_llm_service_consent(u,'service-v5',v5->>'change_token','grant',acks,'ko');
  SELECT c.* INTO receipt FROM public.consent_records c JOIN public.llm_consent_receipts p
    ON p.consent_record_id=c.id WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1;
  IF saved->>'state'<>'granted' OR saved->>'contract_revision'<>'service-v5'
    OR receipt.consent_version<>'2026-10-18'
    OR receipt.policy_version<>'2026-10-07' OR receipt.terms_version<>'2026-10-05'
    OR NOT EXISTS(SELECT 1 FROM public.llm_consent_receipts p
      WHERE p.consent_record_id=receipt.id AND p.contract_revision='email-v10')
    OR NOT public.effective_llm_consent_v2(u) THEN
    RAISE EXCEPTION 'current v10 grant failed';
  END IF;

  v1 := public.llm_service_consent_status(u);
  saved := public.write_llm_service_consent(u,'service-v1',v1->>'change_token','revoke','{}','en');
  IF saved->>'state'<>'revoked' OR public.effective_llm_consent_v2(u)
    OR public.llm_service_consent_status_v5(u)->>'state'<>'revoked' THEN
    RAISE EXCEPTION 'legacy withdrawal after v10 grant failed';
  END IF;

  -- An unknown revision is refused before any write.
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v6',repeat('a',64),'grant',acks,'ko'),'22023','llm_service_consent_contract_changed');
END $$;

SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.llm_service_consent_status_v5('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    RAISE EXCEPTION 'authenticated v5 status allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.llm_service_consent_status_v5('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    RAISE EXCEPTION 'anon v5 status allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: email-v10/service-v5, preserved v4/v5/v6/v7/v9 and v1/v4 grant/withdrawal, CAS and private ACL';
