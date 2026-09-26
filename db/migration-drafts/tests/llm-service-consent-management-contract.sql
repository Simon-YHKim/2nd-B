-- The management API is service-only; the Edge binds p_user_id to its verified
-- bearer identity and checks the single off/collect/enforce mode before RPC.
BEGIN;
\ir ../UNNUMBERED_llm_service_consent_management.sql
COMMIT;
DO $$ BEGIN
  IF to_regprocedure('public.llm_service_consent_status(uuid)') IS NULL THEN
    RAISE EXCEPTION 'service consent management status contract is missing';
  END IF;
END $$;

CREATE FUNCTION pg_temp.expect_consent_error(statement text,expected_code text,expected_message text)
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
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('88888888-8888-4888-8888-888888888888','local-management@example.invalid',now()),
  ('99999999-9999-4999-8999-999999999999','local-uncovered@example.invalid',now());
INSERT INTO public.users(id,birth_date,minor_tier,privacy_prefs) VALUES
  ('88888888-8888-4888-8888-888888888888','2000-01-01','adult','{"chat_autosave":true,"marketing":false}'),
  ('99999999-9999-4999-8999-999999999999','2000-01-01','adult','{}');

DO $$
DECLARE u uuid:='88888888-8888-4888-8888-888888888888'; other uuid:='99999999-9999-4999-8999-999999999999';
  status jsonb; saved jsonb; token text; legacy text; rec public.consent_records%ROWTYPE;
  acks jsonb:='{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
  bad jsonb; before_count bigint;
BEGIN
  status:=public.llm_service_consent_status(u); token:=status->>'change_token';
  IF status->>'state'<>'uncovered' OR NOT (status->>'can_grant')::boolean OR token !~ '^[a-f0-9]{64}$'
    OR (SELECT count(*) FROM jsonb_object_keys(status))<>7 THEN RAISE EXCEPTION 'invalid status contract'; END IF;
  IF public.effective_llm_consent_v2(u) OR (public.effective_llm_consent_snapshot_v2(u,false)->>'allowed')::boolean THEN
    RAISE EXCEPTION 'strict mode allowed uncovered account'; END IF;
  legacy:=public.effective_llm_consent_snapshot_v2(u,true)->>'token';
  IF legacy IS NULL OR legacy=public.effective_llm_consent_snapshot_v2(other,true)->>'token' THEN
    RAISE EXCEPTION 'collection legacy token is missing or shared between accounts'; END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    other,'service-v1',token,'grant',acks,'en'),'40001','llm_service_consent_changed');
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v0',token,'grant',acks,'en'),'22023','llm_service_consent_contract_changed');
  FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(acks-'safetyNotice',acks||'{"extra":true}',
    acks||'{"service":"true"}',acks||'{"llmProcessing":false}','[]'::jsonb,'null'::jsonb)) LOOP
    PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
      u,'service-v1',token,'grant',bad,'en'),'22023','llm_service_consent_invalid_input');
  END LOOP;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v1',token,'grant',acks,'xx'),'22023','llm_service_consent_invalid_input');
  saved:=public.write_llm_service_consent(u,'service-v1',token,'grant',acks,'ko');
  IF saved->>'state'<>'granted' OR saved->>'created'<>'true' OR saved->>'change_token'=token
    OR public.effective_llm_consent_snapshot_v2(u,true)->>'token'=legacy THEN RAISE EXCEPTION 'grant did not replace legacy lease'; END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v1',token,'grant',acks,'ko'),'40001','llm_service_consent_changed');
  SELECT c.* INTO rec FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1;
  IF rec.locale<>'ko' OR rec.age_band<>'adult' OR rec.policy_version<>'2026-09-26'
    OR rec.optional_consents<>'{}'::jsonb OR rec.ip_hash IS NOT NULL OR rec.ua_hash IS NOT NULL THEN
    RAISE EXCEPTION 'writer accepted invented metadata/optional grants'; END IF;
  token:=saved->>'change_token';
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"marketing":true,"ads":true}' WHERE id=u;
  IF public.llm_service_consent_status(u)->>'change_token'<>token THEN RAISE EXCEPTION 'unrelated prefs changed CAS'; END IF;
  saved:=public.write_llm_service_consent(u,'service-v1',token,'revoke','{}','en');
  IF saved->>'state'<>'revoked' OR (public.effective_llm_consent_snapshot_v2(u,true)->>'allowed')::boolean
    THEN RAISE EXCEPTION 'explicit revoke fell back to collection legacy'; END IF;
  SELECT c.* INTO rec FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE p.user_id=u ORDER BY p.receipt_order DESC LIMIT 1;
  IF rec.llm_processing_ack OR NOT rec.required_ack OR NOT rec.overseas_transfer_ack OR NOT rec.sensitive_data_ack
    OR NOT rec.safety_notice_ack THEN RAISE EXCEPTION 'revoke changed unrelated required acknowledgements'; END IF;
  saved:=public.write_llm_service_consent(u,'service-v1',saved->>'change_token','grant',acks,'en');
  IF saved->>'state'<>'granted' OR saved->>'change_token'=token THEN RAISE EXCEPTION 'grant/revoke/grant ABA reused CAS'; END IF;
  -- No prior trusted history: a revoke cannot invent four positive ACKs.
  saved:=public.write_llm_service_consent(other,'service-v1',public.llm_service_consent_status(other)->>'change_token','revoke','{}','en');
  SELECT c.* INTO rec FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE p.user_id=other ORDER BY p.receipt_order DESC LIMIT 1;
  IF rec.required_ack OR rec.llm_processing_ack OR rec.overseas_transfer_ack OR rec.sensitive_data_ack OR rec.safety_notice_ack
    OR saved->>'state'<>'revoked' THEN RAISE EXCEPTION 'uncovered revoke invented consent'; END IF;
  -- A missing provenance trigger rolls the source event back atomically.
  SELECT count(*) INTO before_count FROM public.consent_records WHERE user_id=u;
  ALTER TABLE public.consent_records DISABLE TRIGGER capture_llm_consent_provenance_after_insert;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v1',public.llm_service_consent_status(u)->>'change_token','grant',acks,'en'),'55000','llm_service_consent_provenance_missing');
  ALTER TABLE public.consent_records ENABLE TRIGGER capture_llm_consent_provenance_after_insert;
  IF (SELECT count(*) FROM public.consent_records WHERE user_id=u)<>before_count THEN RAISE EXCEPTION 'failed grant left orphan receipt'; END IF;
END $$;

-- Explicit re-consent must preserve BOTH selected optional keys and their
-- earlier withdrawal ledger boundary, even when a stale prefs row says true.
INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
  purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale,created_at)
VALUES('88888888-8888-4888-8888-888888888888','adult','adult','2026-09-07','2026-09-26','2026-08-16',
  '["service"]',true,'{"chat_autosave":true}',true,true,true,true,'en','2026-01-01');
INSERT INTO public.consent_changes(user_id,pref_key,event_type,created_at)
  VALUES('88888888-8888-4888-8888-888888888888','chat_autosave','revoke','2026-02-01');
DO $$
DECLARE u uuid:='88888888-8888-4888-8888-888888888888'; saved jsonb; prior_prefs jsonb; prior_events bigint;
  acks jsonb:='{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}';
BEGIN
  SELECT privacy_prefs INTO prior_prefs FROM public.users WHERE id=u;
  SELECT count(*) INTO prior_events FROM public.consent_changes WHERE user_id=u;
  saved:=public.write_llm_service_consent(u,'service-v1',public.llm_service_consent_status(u)->>'change_token','grant',acks,'en');
  IF saved->>'state'<>'blocked' OR saved->>'created'<>'true' OR public.effective_llm_consent_v2(u)
    OR (SELECT privacy_prefs FROM public.users WHERE id=u)<>prior_prefs
    OR (SELECT count(*) FROM public.consent_changes WHERE user_id=u)<>prior_events THEN
    RAISE EXCEPTION 'service grant silently reset optional withdrawal'; END IF;
  UPDATE public.users SET birth_date=current_date-interval '13 years',minor_tier='minor_guardian' WHERE id=u;
  IF (public.llm_service_consent_status(u)->>'can_grant')::boolean THEN RAISE EXCEPTION 'underage grant eligible'; END IF;
  PERFORM pg_temp.expect_consent_error(format('SELECT public.write_llm_service_consent(%L,%L,%L,%L,%L,%L)',
    u,'service-v1',public.llm_service_consent_status(u)->>'change_token','grant',acks,'en'),'42501','llm_service_consent_ineligible');
  saved:=public.write_llm_service_consent(u,'service-v1',public.llm_service_consent_status(u)->>'change_token','revoke','{}','en');
  IF saved->>'state'<>'revoked' THEN RAISE EXCEPTION 'existing receipt could not be revoked after age/profile block'; END IF;
  UPDATE public.users SET birth_date=current_date-interval '16 years',minor_tier='adult' WHERE id=u;
  IF (public.llm_service_consent_status(u)->>'can_grant')::boolean THEN RAISE EXCEPTION 'mismatched stored minor tier accepted'; END IF;
  UPDATE public.users SET minor_tier='minor_self' WHERE id=u;
  IF NOT (public.llm_service_consent_status(u)->>'can_grant')::boolean THEN RAISE EXCEPTION 'valid minor-self grant rejected'; END IF;
  saved:=public.write_llm_service_consent(u,'service-v1',public.llm_service_consent_status(u)->>'change_token','grant',acks,'es');
  IF saved->>'state'<>'blocked' THEN RAISE EXCEPTION 'minor-self grant discarded optional withdrawal'; END IF;
  UPDATE public.users SET birth_date='2000-01-01',minor_tier='adult' WHERE id=u;
END $$;

-- Privileged claims cannot restore SQL EXECUTE to public caller roles.
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.llm_service_consent_status('88888888-8888-4888-8888-888888888888');
    RAISE EXCEPTION 'authenticated status RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.write_llm_service_consent('88888888-8888-4888-8888-888888888888','service-v1',repeat('a',64),'revoke','{}','en');
    RAISE EXCEPTION 'authenticated writer allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.llm_service_consent_coverage();
    RAISE EXCEPTION 'authenticated coverage allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.llm_service_consent_status('88888888-8888-4888-8888-888888888888');
    RAISE EXCEPTION 'anon status allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET request.jwt.claim.role='authenticated';
SELECT pg_temp.expect_consent_error($q$SELECT public.llm_service_consent_status('88888888-8888-4888-8888-888888888888')$q$,'42501','llm_service_consent_forbidden');
SET request.jwt.claim.role='service_role';
BEGIN READ ONLY;
DO $$ DECLARE coverage jsonb; BEGIN
  coverage:=public.llm_service_consent_coverage();
  IF (coverage->>'ready_for_enforce')::boolean OR (coverage->>'uncovered_accounts')::int=0
    OR (coverage->>'intentionally_revoked_accounts')::int<>1 OR (coverage->>'blocked_accounts')::int<>1
    OR (SELECT count(*) FROM jsonb_object_keys(coverage))<>6 THEN RAISE EXCEPTION 'coverage gave false readiness: %',coverage; END IF;
END $$;
COMMIT;
-- Temporarily isolate the completely covered cohort. Intentional withdrawals
-- remain visible and do not masquerade as uncovered accounts.
BEGIN;
UPDATE public.users SET account_status='paused' WHERE id<>'99999999-9999-4999-8999-999999999999';
DO $$ DECLARE coverage jsonb; BEGIN
  coverage:=public.llm_service_consent_coverage();
  IF NOT (coverage->>'ready_for_enforce')::boolean OR (coverage->>'active_accounts')::int<>1
    OR (coverage->>'intentionally_revoked_accounts')::int<>1 THEN RAISE EXCEPTION 'intentional withdrawal misclassified: %',coverage; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: service consent writer, ACL, exact ACKs, owner CAS/ABA, optional history, age and read-only full-cohort coverage';
