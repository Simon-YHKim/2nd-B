-- Test-only synthetic actors and synthetic future contract. All mutations roll back.
BEGIN;
SET LOCAL statement_timeout='10s';
CREATE FUNCTION pg_temp.expect_failure(statement text,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM=message THEN RETURN; END IF;
    RAISE EXCEPTION 'expected %, got %',message,SQLERRM;
  END;
  RAISE EXCEPTION 'accepted forbidden operation: %',message;
END $$;
CREATE FUNCTION pg_temp.check(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;

CREATE FUNCTION pg_temp.check_existing_state() RETURNS void LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM t10_existing_state;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM pg_temp.check(public.effective_llm_consent_snapshot_v2(s.user_id,false)=s.lease,'existing LLM lease unchanged');
  PERFORM pg_temp.check(public.dashboard_generation_request(s.user_id,'open','UTC','en')->>'kind'='ready','existing dashboard cache ready');
  PERFORM pg_temp.check((SELECT output='{"line":"Ready before T10"}'::jsonb AND status='ready'
    FROM public.dashboard_generation_runs WHERE id=(s.run->>'id')::uuid),'existing dashboard output unchanged');
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $$;
SELECT pg_temp.check_existing_state();
SELECT pg_temp.check((SELECT u.privacy_prefs=s.privacy_prefs FROM public.users u JOIN t10_existing_state s ON s.user_id=u.id),'install preserves existing preferences');
UPDATE public.users SET privacy_prefs=privacy_prefs||'{"ads":true}' WHERE id='66666666-6666-4666-8666-666666666666';
SELECT pg_temp.check_existing_state();
SELECT pg_temp.check((SELECT NOT (privacy_prefs ? 'llm_record_body') FROM public.users WHERE id='66666666-6666-4666-8666-666666666666'),'absent key stays absent');
UPDATE public.users SET birth_date='1990-02-01' WHERE id='66666666-6666-4666-8666-666666666666';
SELECT pg_temp.check_existing_state();
SELECT 'PASS: dormant install, unrelated save and adult date correction preserve live lease/cache' AS result;

INSERT INTO auth.users(id,email_confirmed_at) VALUES('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',now()),
  ('33333333-3333-4333-8333-333333333333',now()),('44444444-4444-4444-8444-444444444444',now());
INSERT INTO public.users(id,birth_date,minor_tier,locale,privacy_prefs) VALUES
  ('11111111-1111-4111-8111-111111111111','1990-01-01','adult','ko','{"long_term_memory":true}'),
  ('22222222-2222-4222-8222-222222222222',(CURRENT_DATE-interval '16 years')::date,'minor_self','en','{"llm_record_body":true}'),
  ('33333333-3333-4333-8333-333333333333',NULL,'adult','en','{"llm_record_body":true}'),
  ('44444444-4444-4444-8444-444444444444',(CURRENT_DATE-interval '16 years')::date,'adult','en','{"llm_record_body":true}');
-- Real email-v10 service consent/provenance, not a successful consent stub.
INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,purposes,
  required_ack,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale)
SELECT id,'adult','adult','2026-10-18','2026-10-07','2026-10-05','["service"]',true,true,true,true,true,'en' FROM public.users
  WHERE id<>'66666666-6666-4666-8666-666666666666';
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.record_body_consent_contract()),'empty shipped contract');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.users WHERE privacy_prefs->'llm_record_body'='true'),'all start off');
SELECT pg_temp.check(NOT public.record_body_consent_decision('11111111-1111-4111-8111-111111111111'),'service/long_term_memory cannot substitute');
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL test.user_id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.expect_failure($q$SELECT public.set_record_body_consent(true,NULL,'fictional',true,'ko')$q$,'record_body_not_available');
SELECT pg_temp.check((SELECT count(*) FROM public.consent_records WHERE record_body_trusted)=0,'no failed grant receipt');
SELECT 'PASS: shipped contract OFF, no inferred consent or failed grant writes' AS result;
SELECT pg_temp.check(NOT public.record_body_adult((CURRENT_DATE-interval '14 years')::date,'minor_self','active')
  AND NOT public.record_body_adult((CURRENT_DATE-interval '17 years')::date,'minor_self','active')
  AND NOT public.record_body_adult('1990-01-01','minor_self','active')
  AND NOT public.record_body_adult('1990-01-01','minor_guardian','active')
  AND NOT public.record_body_adult('1990-01-01',NULL,'active')
  AND NOT public.record_body_adult('1990-01-01','adult','paused')
  AND public.record_body_adult((CURRENT_DATE-interval '18 years')::date,'adult','active'),'age/tier/status matrix');

-- Only this transaction supplies a fictional version to exercise dormant branches.
CREATE OR REPLACE FUNCTION public.record_body_consent_contract()
RETURNS TABLE(consent_version text,policy_version text,terms_version text)
LANGUAGE sql STABLE SET search_path='' AS $$ SELECT 'fixture-t10','fixture-policy','fixture-terms' $$;
DO $$ DECLARE subject uuid; BEGIN
  FOREACH subject IN ARRAY ARRAY['22222222-2222-4222-8222-222222222222'::uuid,'33333333-3333-4333-8333-333333333333'::uuid,
    '44444444-4444-4444-8444-444444444444'::uuid] LOOP
    PERFORM set_config('test.user_id',subject::text,true);
    PERFORM pg_temp.expect_failure($q$SELECT public.set_record_body_consent(true,NULL,'fixture-t10',true,'en')$q$,'record_body_adult_required');
  END LOOP;
END $$;
SET LOCAL test.user_id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.expect_failure($q$SELECT public.set_record_body_consent(true,NULL,'fixture-t10',false,'ko')$q$,'record_body_ack_required');
SELECT pg_temp.expect_failure($q$SELECT public.set_record_body_consent(true,NULL,'old',true,'ko')$q$,'record_body_ack_required');

GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.consent_records TO authenticated,service_role;
GRANT SELECT,UPDATE(privacy_prefs) ON public.users TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure($q$INSERT INTO public.consent_records(user_id,age_band,consent_version,policy_version,terms_version,
  purposes,optional_consents,locale) VALUES(auth.uid(),'adult','fixture-t10','fixture-policy','fixture-terms',
  '["llm_record_body"]','{"llm_record_body":true}','ko')$q$,'record_body_trusted_writer_required');
RESET ROLE;
SELECT pg_temp.check(NOT has_function_privilege('authenticated','public.record_body_consent_snapshot(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.set_record_body_consent(boolean,uuid,text,boolean,text)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.set_record_body_consent(boolean,uuid,text,boolean,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.record_body_consent_contract()','EXECUTE'),'private ACLs');
SELECT 'PASS: minor_self, missing age, forged adult tier, explicit acknowledgement, provenance and ACL' AS result;

-- A separate adult without a service receipt cannot use the optional consent.
INSERT INTO auth.users(id,email_confirmed_at) VALUES('55555555-5555-4555-8555-555555555555',now());
INSERT INTO public.users(id,birth_date,minor_tier) VALUES('55555555-5555-4555-8555-555555555555','1990-01-01','adult');
SET LOCAL test.user_id='55555555-5555-4555-8555-555555555555';
SELECT pg_temp.expect_failure($q$SELECT public.set_record_body_consent(true,NULL,'fixture-t10',true,'en')$q$,'record_body_service_consent_required');
SET LOCAL test.user_id='11111111-1111-4111-8111-111111111111';

DO $$ DECLARE grant_id uuid; revoke_id uuid; before_token text; first_token text; next_token text; service_count bigint;
  u uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  SELECT token INTO before_token FROM public.llm_consent_current_decision(u);
  SELECT count(*) INTO service_count FROM public.llm_consent_receipts;
  grant_id := public.set_record_body_consent(true,NULL,'fixture-t10',true,'ko');
  PERFORM pg_temp.check(public.record_body_consent_decision(u),'explicit adult grant');
  PERFORM pg_temp.check((SELECT count(*)=service_count FROM public.llm_consent_receipts),'optional grant must not replace service receipt');
  PERFORM pg_temp.check((SELECT token=before_token FROM public.llm_consent_current_decision(u)),'grant preserves service snapshot');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  first_token := public.record_body_consent_snapshot(u)->>'token';
  PERFORM pg_temp.check(first_token ~ '^[0-9a-f]{64}$','snapshot hash only');
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_temp.expect_failure($q$SELECT public.set_record_body_consent(true,NULL,'fixture-t10',true,'ko')$q$,'record_body_consent_conflict');
  revoke_id := public.set_record_body_consent(false,grant_id,NULL,false,'ko');
  PERFORM pg_temp.check(revoke_id<>grant_id AND NOT public.record_body_consent_decision(u),'append-only revoke');
  PERFORM pg_temp.check((SELECT optional_consents->'llm_record_body'='true' FROM public.consent_records WHERE id=grant_id),'old grant unchanged');
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"llm_record_body":true}' WHERE id=u;
  PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'stale ordinary settings cannot reenable');
  grant_id := public.set_record_body_consent(true,revoke_id,'fixture-t10',true,'ko');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  next_token := public.record_body_consent_snapshot(u)->>'token';
  PERFORM pg_temp.check(next_token IS NOT NULL AND next_token<>first_token,'OFF/ON ABA changes token');
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"llm_record_body":false}' WHERE id=u;
  PERFORM pg_temp.check((SELECT optional_consents->'llm_record_body'='false' FROM public.consent_records
    WHERE user_id=u AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1),'direct OFF appends revoke');
  PERFORM pg_temp.check(public.record_body_consent_snapshot(u)='{"allowed":false,"token":null}'::jsonb,'next snapshot denied');
  SELECT id INTO revoke_id FROM public.consent_records WHERE user_id=u AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.set_record_body_consent(true,revoke_id,'fixture-t10',true,'ko');
  UPDATE public.users SET minor_tier='minor_self' WHERE id=u;
  PERFORM pg_temp.check((SELECT privacy_prefs->'llm_record_body'='false' FROM public.users WHERE id=u),'server tier downgrade clamps');
  PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'server tier downgrade denies');
  PERFORM pg_temp.check((SELECT count(*)=service_count FROM public.llm_consent_receipts),'service receipt count stable');
  UPDATE public.users SET minor_tier='adult' WHERE id=u;
  SELECT id INTO revoke_id FROM public.consent_records WHERE user_id=u AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1;
  grant_id := public.set_record_body_consent(true,revoke_id,'fixture-t10',true,'ko');
  UPDATE public.users SET birth_date=(CURRENT_DATE-interval '17 years')::date WHERE id=u;
  PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'birth date alone closes consent');
  PERFORM pg_temp.check((SELECT privacy_prefs->'llm_record_body'='false' FROM public.users WHERE id=u),'birth date clamps preference');
  UPDATE public.users SET birth_date='1990-01-01' WHERE id=u;
  SELECT id INTO revoke_id FROM public.consent_records WHERE user_id=u AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1;
  grant_id := public.set_record_body_consent(true,revoke_id,'fixture-t10',true,'ko');
  UPDATE public.users SET account_status='paused' WHERE id=u;
  SELECT id INTO revoke_id FROM public.consent_records WHERE user_id=u AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1;
  PERFORM pg_temp.check(revoke_id<>grant_id,'status-only pause appends revocation');
  UPDATE public.users SET account_status='active',privacy_prefs=privacy_prefs||'{"llm_record_body":true}' WHERE id=u;
  PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'unpause cannot revive the old grant');
  grant_id := public.set_record_body_consent(true,revoke_id,'fixture-t10',true,'ko');
  UPDATE public.consent_records SET llm_processing_ack=false WHERE id=(SELECT consent_record_id
    FROM public.llm_consent_receipts WHERE user_id=u ORDER BY receipt_order DESC LIMIT 1);
  PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'service withdrawal closes optional body access');
END $$;
SELECT 'PASS: adult grant/revoke, stale CAS, immutable evidence, direct OFF, ABA invalidation and age downgrade' AS result;

-- Untrusted full-object saves cannot silently withdraw; actual T10 transitions
-- still rotate their own token without changing an existing live lease/cache.
SET LOCAL test.user_id='66666666-6666-4666-8666-666666666666';
DO $$ DECLARE u uuid := '66666666-6666-4666-8666-666666666666'; receipt uuid; before_count bigint; token text;
BEGIN
  receipt := public.set_record_body_consent(true,NULL,'fixture-t10',true,'en');
  PERFORM pg_temp.check_existing_state();
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  token := public.record_body_consent_snapshot(u)->>'token';
  SELECT count(*) INTO before_count FROM public.consent_records WHERE user_id=u AND record_body_trusted;
  UPDATE public.users SET privacy_prefs='{"recommendations":true,"ads":false}' WHERE id=u;
  PERFORM pg_temp.check(public.record_body_consent_snapshot(u)->>'token'=token,'missing-key save preserves T10 snapshot');
  PERFORM pg_temp.check((SELECT count(*)=before_count FROM public.consent_records WHERE user_id=u AND record_body_trusted),'missing-key save writes no revoke');
  PERFORM pg_temp.check_existing_state();
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"llm_record_body":false}' WHERE id=u;
  PERFORM pg_temp.check_existing_state();
  PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'explicit OFF still withdraws');
END $$;
SELECT 'PASS: actual 0236/0244/0263 coexist, optional grant/revoke and old-app saves preserve live lease/cache' AS result;

-- Actual Supabase-shaped service_role BYPASSRLS + UPDATE privileges. Neither
-- marker edits nor content-only rewrites of a revoke may manufacture permission.
INSERT INTO public.consent_records(id,user_id,age_band,consent_version,policy_version,terms_version,purposes,locale)
VALUES('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666','adult','old','old','old','["marketing"]','en');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_failure($q$UPDATE public.consent_records SET record_body_trusted=true,
  purposes='["llm_record_body"]',optional_consents='{"llm_record_body":true}',llm_processing_ack=true,overseas_transfer_ack=true,sensitive_data_ack=true,
  consent_version='fixture-t10',policy_version='fixture-policy',terms_version='fixture-terms'
  WHERE id='77777777-7777-4777-8777-777777777777'$q$,'record_body_receipt_immutable');
SELECT pg_temp.expect_failure($q$UPDATE public.consent_records SET record_body_order=DEFAULT
  WHERE user_id='66666666-6666-4666-8666-666666666666' AND record_body_trusted AND optional_consents->'llm_record_body'='true'$q$,'record_body_receipt_immutable');
SELECT pg_temp.expect_failure($q$UPDATE public.consent_records SET optional_consents='{"llm_record_body":true}',
  llm_processing_ack=true,overseas_transfer_ack=true,sensitive_data_ack=true
  WHERE user_id='66666666-6666-4666-8666-666666666666' AND record_body_trusted AND optional_consents->'llm_record_body'='false'$q$,'record_body_receipt_immutable');
SELECT pg_temp.expect_failure($q$UPDATE public.consent_records SET purposes='["llm_record_body"]'
  WHERE id='77777777-7777-4777-8777-777777777777'$q$,'record_body_receipt_immutable');
-- 0063 retention metadata is intentionally still scrubbable.
UPDATE public.consent_records SET ip_hash=repeat('a',64),ua_hash=repeat('b',64) WHERE record_body_trusted;
UPDATE public.consent_records SET ip_hash=NULL,ua_hash=NULL WHERE record_body_trusted;
-- @T10_OWNER_PREFLIGHT@
RESET ROLE;
SELECT pg_temp.check(NOT public.record_body_consent_decision('66666666-6666-4666-8666-666666666666'),'forgeries leave consent denied');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_class c ON c.oid='public.consent_records'::regclass
  WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('record_body_account_guard','clamp_record_body_preference',
    'invalidate_record_body_consent','set_record_body_consent','record_body_consent_snapshot')
  AND (p.proowner<>c.relowner OR NOT p.prosecdef OR NOT (p.proconfig @> ARRAY['search_path=""','row_security=off']))),'DEFINER owner/settings');
SELECT 'PASS: service-role marker/order/content forgeries refused; owner preflight and metadata scrub' AS result;

-- The same already-granted actor is tested against each independent fence.
DO $$ DECLARE u uuid := '66666666-6666-4666-8666-666666666666'; receipt uuid; n bigint; fence text;
BEGIN
  SELECT id INTO receipt FROM public.consent_records WHERE user_id=u AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1;
  receipt := public.set_record_body_consent(true,receipt,'fixture-t10',true,'en');
  FOREACH fence IN ARRAY ARRAY['tombstone','deleted','unconfirmed'] LOOP
    IF fence='tombstone' THEN INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES(u,gen_random_uuid());
    ELSIF fence='deleted' THEN UPDATE auth.users SET deleted_at=now() WHERE id=u;
    ELSE UPDATE auth.users SET email_confirmed_at=NULL WHERE id=u; END IF;
    SELECT count(*) INTO n FROM public.consent_records WHERE user_id=u;
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM pg_temp.expect_failure(format('SELECT public.set_record_body_consent(true,%L::uuid,''fixture-t10'',true,''en'')',receipt),'record_body_account_unavailable');
    PERFORM pg_temp.expect_failure(format('SELECT public.set_record_body_consent(false,%L::uuid,NULL,false,''en'')',receipt),'record_body_account_unavailable');
    PERFORM set_config('request.jwt.claim.role','service_role',true);
    PERFORM pg_temp.check(public.record_body_consent_snapshot(u)='{"allowed":false,"token":null}'::jsonb,'fenced egress snapshot');
    PERFORM pg_temp.check(NOT public.record_body_consent_decision(u),'fenced read-only decision');
    PERFORM pg_temp.check((SELECT count(*)=n FROM public.consent_records WHERE user_id=u),'no fenced receipt writes');
    IF fence='tombstone' THEN DELETE FROM public.account_deletion_tombstones WHERE user_id=u;
    ELSIF fence='deleted' THEN UPDATE auth.users SET deleted_at=NULL WHERE id=u;
    ELSE UPDATE auth.users SET email_confirmed_at=now() WHERE id=u; END IF;
  END LOOP;
END $$;
SELECT 'PASS: tombstone, deleted identity and unconfirmed identity fence both writer and egress snapshot' AS result;

ROLLBACK;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.record_body_consent_contract()) THEN RAISE EXCEPTION 'future contract not rolled back'; END IF;
END $$;
SELECT 'PASS: synthetic contract rolled back, shipped draft remains OFF' AS result;
