-- Run in the disposable CI database right after polascope-consent-forward-contract.sql,
-- which applies the PolaScope (email-v7 / service-v2) draft this one is stacked on.
-- Re-consent (email-v8 / service-v3): everyone confirms the revision in force, consents
-- given under earlier revisions keep AI processing running, and a withdrawn AI consent
-- stays withdrawn when its owner confirms (docs/legal/calendar-read-disclosure-draft-261002.md §7-2, §8).
BEGIN;
\ir ../UNNUMBERED_reconsent_v8_20261005.sql
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

CREATE OR REPLACE FUNCTION pg_temp.latest_record(u uuid) RETURNS public.consent_records
LANGUAGE sql AS $$
  SELECT c.* FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
  WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1
$$;

SET request.jwt.claim.role='service_role';

-- Tuples: v8 joins, every earlier revision keeps its tuple.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 8
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v8') c
      WHERE c.consent_version='2026-10-05' AND c.policy_version='2026-10-05'
        AND c.terms_version='2026-10-05' AND c.confirmation_eligible)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v7') c
      WHERE c.consent_version='2026-10-05' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-10-05' AND c.confirmation_eligible)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v6') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible)
  THEN RAISE EXCEPTION 'v8 tuple or preserved tuples failed'; END IF;
END $$;

-- A new sign-up on email-v8 leaves a v8 receipt.
DO $$
DECLARE subject uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(subject,subject::text||'@example.invalid',jsonb_build_object(
    'signup_flow','email-v8','signup_birth_date','1990-01-01','signup_locale','ko',
    'signup_consent_service',true,'signup_consent_llm_processing',true,
    'signup_consent_overseas_transfer',true,'signup_consent_sensitive_data',true,
    'signup_consent_safety_notice',true,'signup_consent_marketing',false));
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=subject;
  IF NOT EXISTS(
    SELECT 1 FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE c.user_id=subject AND c.policy_version='2026-10-05' AND p.contract_revision='email-v8'
  ) THEN RAISE EXCEPTION 'email-v8 sign-up provenance failed'; END IF;
  IF (public.llm_service_consent_status_v3(subject)->>'needs_reconsent')::boolean THEN
    RAISE EXCEPTION 'a v8 sign-up must not be asked to confirm again';
  END IF;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','reconsent-granted@example.invalid',now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','reconsent-withdrawn@example.invalid',now());
INSERT INTO public.users(id,email,birth_date,minor_tier,privacy_prefs) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','reconsent-granted@example.invalid','2000-01-01','adult','{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','reconsent-withdrawn@example.invalid','2000-01-01','adult','{}');

-- An account that never confirmed anything, then an earlier-revision grant, then v8.
DO $$
DECLARE
  u uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v2 jsonb; v3 jsonb; saved jsonb; rec public.consent_records;
  acks jsonb := '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
BEGIN
  v3 := public.llm_service_consent_status_v3(u);
  IF v3->>'contract_revision'<>'service-v3' OR v3->>'state'<>'uncovered'
    OR NOT (v3->>'needs_reconsent')::boolean OR v3->>'policy_version'<>'2026-10-05' THEN
    RAISE EXCEPTION 'uncovered account must be asked to confirm';
  END IF;

  v2 := public.llm_service_consent_status_v2(u);
  saved := public.write_llm_service_consent(u,'service-v2',v2->>'change_token','grant',acks,'en');
  v3 := public.llm_service_consent_status_v3(u);
  IF saved->>'state'<>'granted' OR NOT public.effective_llm_consent_v2(u)
    OR v3->>'state'<>'granted' OR NOT (v3->>'needs_reconsent')::boolean THEN
    RAISE EXCEPTION 'an earlier-revision grant must stay valid (03 = A) and still be asked to confirm';
  END IF;

  saved := public.write_llm_service_consent(u,'service-v3',v3->>'change_token','grant',acks,'ko');
  rec := pg_temp.latest_record(u);
  IF saved->>'state'<>'granted' OR (saved->>'needs_reconsent')::boolean
    OR rec.policy_version<>'2026-10-05' OR rec.llm_processing_ack IS NOT TRUE
    OR NOT public.effective_llm_consent_v2(u) THEN
    RAISE EXCEPTION 'v3 grant must confirm the revision and keep AI on';
  END IF;

  -- confirm is only for a withdrawn AI consent
  v3 := public.llm_service_consent_status_v3(u);
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v3',v3->>'change_token','confirm',
    '{"service":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}','ko'),
    '22023','llm_service_consent_invalid_input');
  -- stale token
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v3',v2->>'change_token','grant',acks,'ko'),'40001','llm_service_consent_changed');
  -- an old client re-granting puts the account back on an earlier tuple: still valid, asked again
  v2 := public.llm_service_consent_status_v2(u);
  saved := public.write_llm_service_consent(u,'service-v2',v2->>'change_token','grant',acks,'en');
  IF NOT public.effective_llm_consent_v2(u)
    OR NOT (public.llm_service_consent_status_v3(u)->>'needs_reconsent')::boolean THEN
    RAISE EXCEPTION 'old-client grant after v8 must stay valid and be asked again';
  END IF;
END $$;

-- A withdrawn AI consent stays withdrawn when its owner confirms the revision (T1).
DO $$
DECLARE
  u uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v1 jsonb; v2 jsonb; v3 jsonb; saved jsonb; rec public.consent_records;
  acks jsonb := '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
  four jsonb := '{"service":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
BEGIN
  v2 := public.llm_service_consent_status_v2(u);
  saved := public.write_llm_service_consent(u,'service-v2',v2->>'change_token','grant',acks,'en');
  v1 := public.llm_service_consent_status(u);
  saved := public.write_llm_service_consent(u,'service-v1',v1->>'change_token','revoke','{}','en');
  v3 := public.llm_service_consent_status_v3(u);
  IF v3->>'state'<>'revoked' OR NOT (v3->>'needs_reconsent')::boolean THEN
    RAISE EXCEPTION 'withdrawn account must be asked to confirm';
  END IF;

  -- confirm must not carry the AI acknowledgement, and only service-v3 takes it
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v3',v3->>'change_token','confirm',acks,'ko'),'22023','llm_service_consent_invalid_input');
  v2 := public.llm_service_consent_status_v2(u);
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v2',v2->>'change_token','confirm',four,'ko'),'22023','llm_service_consent_invalid_input');

  saved := public.write_llm_service_consent(u,'service-v3',v3->>'change_token','confirm',four,'ko');
  rec := pg_temp.latest_record(u);
  IF saved->>'state'<>'revoked' OR (saved->>'needs_reconsent')::boolean
    OR rec.policy_version<>'2026-10-05' OR rec.llm_processing_ack IS NOT FALSE
    OR rec.required_ack IS NOT TRUE OR rec.overseas_transfer_ack IS NOT TRUE
    OR rec.sensitive_data_ack IS NOT TRUE OR rec.safety_notice_ack IS NOT TRUE
    OR public.effective_llm_consent_v2(u) THEN
    RAISE EXCEPTION 'confirm must record the revision and keep AI withdrawn';
  END IF;

  -- the owner may still opt back in, by a full grant
  v3 := public.llm_service_consent_status_v3(u);
  saved := public.write_llm_service_consent(u,'service-v3',v3->>'change_token','grant',acks,'ko');
  IF saved->>'state'<>'granted' OR NOT public.effective_llm_consent_v2(u) THEN
    RAISE EXCEPTION 'opting back in after confirm failed';
  END IF;
END $$;

-- Withdrawing before ever confirming leaves every acknowledgement false; confirm sets the
-- four it asked for and still leaves AI withdrawn.
DO $$
DECLARE
  u uuid := gen_random_uuid();
  v2 jsonb; v3 jsonb; saved jsonb; rec public.consent_records;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(u,u::text||'@example.invalid',now());
  INSERT INTO public.users(id,email,birth_date,minor_tier,privacy_prefs)
  VALUES(u,u::text||'@example.invalid','2000-01-01','adult','{}');
  v2 := public.llm_service_consent_status_v2(u);
  saved := public.write_llm_service_consent(u,'service-v2',v2->>'change_token','revoke','{}','ko');
  rec := pg_temp.latest_record(u);
  IF saved->>'state'<>'revoked' OR rec.required_ack IS NOT FALSE THEN
    RAISE EXCEPTION 'uncovered withdrawal fixture changed';
  END IF;
  v3 := public.llm_service_consent_status_v3(u);
  saved := public.write_llm_service_consent(u,'service-v3',v3->>'change_token','confirm',
    '{"service":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}','ko');
  rec := pg_temp.latest_record(u);
  IF saved->>'state'<>'revoked' OR rec.required_ack IS NOT TRUE OR rec.overseas_transfer_ack IS NOT TRUE
    OR rec.sensitive_data_ack IS NOT TRUE OR rec.safety_notice_ack IS NOT TRUE
    OR rec.llm_processing_ack IS NOT FALSE OR public.effective_llm_consent_v2(u) THEN
    RAISE EXCEPTION 'confirm after an uncovered withdrawal must set the four and keep AI withdrawn';
  END IF;
END $$;

-- A blocked account did not withdraw: AI is off for another reason (here an email-v3
-- receipt, a tuple no longer current). It confirms with all five, never with confirm.
DO $$
DECLARE
  u uuid := gen_random_uuid();
  v3 jsonb; saved jsonb;
  acks jsonb := '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(u,u::text||'@example.invalid',jsonb_build_object(
    'signup_flow','email-v3','signup_birth_date','1990-01-01','signup_locale','ko',
    'signup_consent_service',true,'signup_consent_llm_processing',true,
    'signup_consent_overseas_transfer',true,'signup_consent_sensitive_data',true,
    'signup_consent_safety_notice',true,'signup_consent_marketing',false));
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=u;
  v3 := public.llm_service_consent_status_v3(u);
  IF v3->>'state'<>'blocked' OR NOT (v3->>'needs_reconsent')::boolean
    OR NOT (v3->>'can_grant')::boolean THEN
    RAISE EXCEPTION 'email-v3 fixture is not a blocked, eligible account: %', v3;
  END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v3',v3->>'change_token','confirm',
    '{"service":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}','ko'),
    '22023','llm_service_consent_invalid_input');
  saved := public.write_llm_service_consent(u,'service-v3',v3->>'change_token','grant',acks,'ko');
  IF saved->>'state'<>'granted' OR (saved->>'needs_reconsent')::boolean THEN
    RAISE EXCEPTION 'blocked account must confirm by granting';
  END IF;
END $$;

SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.llm_service_consent_status_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');
    RAISE EXCEPTION 'authenticated v3 status allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: re-consent email-v8/service-v3, earlier grants stay valid, withdrawn AI stays withdrawn on confirm, CAS and private ACL';
