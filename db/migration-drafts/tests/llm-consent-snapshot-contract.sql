-- Included by the disposable Polaris runner after its base schema/behavior tests.
BEGIN;
ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN raw_user_meta_data jsonb DEFAULT '{}',
  ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.users ADD COLUMN email text, ADD COLUMN birth_date date,
  ADD COLUMN judge_mode boolean DEFAULT false, ADD COLUMN locale text, ADD COLUMN display_name text,
  ADD COLUMN account_status text DEFAULT 'active', ADD COLUMN minor_tier text DEFAULT 'adult',
  ADD COLUMN privacy_prefs jsonb NOT NULL DEFAULT '{}';
\ir ../../migrations/0031_consent_records.sql
\ir ../../migrations/0062_consent_changes.sql
\ir ../../migrations/0130_safety_notice_ack.sql
\ir ../../migrations/0148_verified_email_signup_consent_ledger.sql
-- @LOAD_ACTUAL_CONSENT_HELPERS@
\ir ../../migrations/0149_atomic_complete_profile_signup_consent.sql
\ir ../../migrations/0150_signup_consent_contract_20260902.sql
\ir ../UNNUMBERED_signup_consent_admob_20260925.sql
\ir ../UNNUMBERED_effective_llm_consent_current_contract.sql
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
GRANT SELECT,INSERT ON public.consent_records,public.consent_changes TO authenticated,service_role;
GRANT SELECT,UPDATE(privacy_prefs) ON public.users TO authenticated;
COMMIT;
SET request.jwt.claim.role='service_role';

-- No UI/writer is being shipped. These fixture-owner inserts model the future
-- trusted writer. Client inserts below must never acquire that provenance.
INSERT INTO auth.users(id) VALUES('66666666-6666-4666-8666-666666666666');
INSERT INTO public.users(id,privacy_prefs) VALUES('66666666-6666-4666-8666-666666666666','{"chat_autosave":true}');
INSERT INTO public.consent_records(id,user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
  purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale,created_at)
VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','66666666-6666-4666-8666-666666666666','adult','adult',
  '2026-09-07','2026-09-25','2026-08-16','["service"]',true,'{"chat_autosave":true}',true,true,true,true,'en','2026-01-01');
DO $$ BEGIN
  IF NOT public.effective_llm_consent_v2('66666666-6666-4666-8666-666666666666') THEN RAISE EXCEPTION 'trusted grant rejected'; END IF;
END $$;

INSERT INTO public.consent_records(id,user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
  purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale,created_at)
VALUES('00000000-0000-4000-8000-000000000001','66666666-6666-4666-8666-666666666666','adult','adult',
  '2026-09-07','2026-09-25','2026-08-16','["service"]',true,'{"chat_autosave":true}',true,true,true,false,'en','2026-01-01');
DO $$ BEGIN
  IF public.effective_llm_consent_v2('66666666-6666-4666-8666-666666666666') THEN
    RAISE EXCEPTION 'trusted negative service event fell back to an older grant';
  END IF;
END $$;

-- Trusted re-consent restores eligibility with a new server receipt identity.
INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
  purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale)
VALUES('66666666-6666-4666-8666-666666666666','adult','adult','2026-09-07','2026-09-25','2026-08-16',
  '["service"]',true,'{"chat_autosave":true}',true,true,true,true,'en');
DO $$
DECLARE u uuid := '66666666-6666-4666-8666-666666666666'; before_token text; after_token text;
BEGIN
  before_token := public.effective_llm_consent_snapshot_v2(u)->>'token';
  IF before_token IS NULL OR before_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'eligible snapshot lacks an opaque token'; END IF;
  UPDATE public.users SET privacy_prefs='{"chat_autosave":false}' WHERE id=u;
  IF public.effective_llm_consent_snapshot_v2(u) <> '{"allowed":false,"token":null}'::jsonb THEN RAISE EXCEPTION 'withdrawn pref allowed provider'; END IF;
  UPDATE public.users SET privacy_prefs='{"chat_autosave":true}' WHERE id=u;
  after_token := public.effective_llm_consent_snapshot_v2(u)->>'token';
  IF after_token IS NULL OR after_token=before_token THEN RAISE EXCEPTION 'direct pref ABA reused the pre-provider token'; END IF;
  before_token := after_token;
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"ads":true}' WHERE id=u;
  IF public.effective_llm_consent_snapshot_v2(u)->>'token'<>before_token THEN RAISE EXCEPTION 'unrelated optional pref invalidated service snapshot'; END IF;
  UPDATE public.users SET account_status='paused' WHERE id=u;
  UPDATE public.users SET account_status='active' WHERE id=u;
  after_token := public.effective_llm_consent_snapshot_v2(u)->>'token';
  IF after_token IS NULL OR after_token=before_token THEN RAISE EXCEPTION 'account state ABA reused token'; END IF;
  before_token := after_token;
  INSERT INTO public.consent_changes(user_id,pref_key,event_type) VALUES(u,'chat_autosave','grant');
  after_token := public.effective_llm_consent_snapshot_v2(u)->>'token';
  IF after_token IS NULL OR after_token=before_token THEN RAISE EXCEPTION 'relevant change event did not invalidate token'; END IF;
  IF has_function_privilege('anon','public.effective_llm_consent_snapshot_v2(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.effective_llm_consent_snapshot_v2(uuid)','EXECUTE')
    OR has_function_privilege('service_role','public.invalidate_llm_consent_snapshot()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.effective_llm_consent_snapshot_v2(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'snapshot/invalidation ACL boundary failed';
  END IF;
END $$;

-- A client-authored canonical-looking row cannot change the trusted decision.
SELECT set_config('test.user_id','66666666-6666-4666-8666-666666666666',false);
SET ROLE authenticated;
INSERT INTO public.consent_records(id,user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
  purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale)
VALUES('00000000-0000-4000-8000-000000000002','66666666-6666-4666-8666-666666666666','adult','adult',
  '2026-09-07','2026-09-25','2026-08-16','["service"]',false,'{}',false,false,false,false,'en');
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.llm_consent_receipts WHERE consent_record_id='00000000-0000-4000-8000-000000000002')
    OR NOT public.effective_llm_consent_v2('66666666-6666-4666-8666-666666666666') THEN
    RAISE EXCEPTION 'client event acquired server provenance';
  END IF;
END $$;

INSERT INTO public.records(id,user_id,kind,audit_period,tags,body)
VALUES('ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-4666-8666-666666666666','audit_response','work',ARRAY['interview'],'Consent-bound role evidence.');
DO $$
DECLARE u uuid := '66666666-6666-4666-8666-666666666666'; generation uuid; token text; newer text;
  card jsonb := '{"id":"consent","label":"Consent","summary":"A disposable role","status":"proposed","claimStrength":2,"evidence":{"domains":["work"],"constructs":["self-reported narrative (same-source)"]},"evidenceRefs":["record:ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]}';
BEGIN
  token := public.effective_llm_consent_snapshot_v2(u)->>'token';
  generation := (public.reserve_polaris_generation(u,'consent-stale-token')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,generation);
  UPDATE public.users SET privacy_prefs='{"chat_autosave":false}' WHERE id=u;
  UPDATE public.users SET privacy_prefs='{"chat_autosave":true}' WHERE id=u;
  newer := public.effective_llm_consent_snapshot_v2(u)->>'token';
  BEGIN PERFORM public.settle_polaris_generation(u,generation,jsonb_build_array(card),token);
    RAISE EXCEPTION 'Polaris saved using a stale consent token';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <> 'llm_consent_changed' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.personas WHERE user_id=u) THEN RAISE EXCEPTION 'denied settlement persisted cards'; END IF;
  PERFORM public.settle_polaris_generation(u,generation,NULL,token);
  IF (public.polaris_generation_status(u)->>'intro_remaining')::int<>2 THEN RAISE EXCEPTION 'consent denial consumed intro allowance'; END IF;
  generation := (public.reserve_polaris_generation(u,'consent-current-token')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,generation);
  IF NOT public.settle_polaris_generation(u,generation,jsonb_build_array(card),newer) THEN RAISE EXCEPTION 'current token settlement failed'; END IF;
END $$;
SELECT 'PASS: trusted negative events, server receipt ordering, direct ABA, relevant event invalidation, token settlement and private grants' AS consent_result;
