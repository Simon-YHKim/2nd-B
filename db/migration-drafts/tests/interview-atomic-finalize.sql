-- Synthetic service preflights test database atomicity; not a safety classifier.
BEGIN;
CREATE FUNCTION pg_temp.uid(n integer,k integer DEFAULT 1) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('1a162600-0000-4000-800'||k||'-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(q text,code text,msg text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE q;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>code OR (msg IS NOT NULL AND position(msg IN SQLERRM)=0) THEN
   RAISE EXCEPTION 'wrong rejection % %',SQLSTATE,SQLERRM;
  END IF;
  RETURN;
 END;
 RAISE EXCEPTION 'expected rejection: %',q;
END $$;
CREATE FUNCTION pg_temp.packet(n integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
 SELECT jsonb_build_object('v',1,'intent',jsonb_build_object('requestId',pg_temp.uid(n,5),'sessionId',w.session_id,
  'draftId',w.draft_id,'revision',7,'contentGeneration',w.generation),'ruleSet',w.rule_set,'period',w.period,
  'conversationLocale',w.conversation_locale,'uiLanguage',w.ui_language,'growthOrigin',w.growth_origin,
  'turns','[{"n":1,"scene":1,"role":"interviewer","text":"Q?","layer":"fact","origin":"fixed","askKind":"seed","openerUnedited":null,"state":null},
  {"n":2,"scene":1,"role":"user","text":"My own answer.","layer":"fact","origin":"user","askKind":null,"openerUnedited":false,"state":"judged"}]'::jsonb)
 FROM public.interview_work_contracts w WHERE w.owner_id=pg_temp.uid(n) AND w.new_work_key=pg_temp.uid(n,3)
$$;
CREATE FUNCTION pg_temp.preflight(n integer,decision text DEFAULT 'clear') RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
 SELECT jsonb_build_object('v',1,'source','server-c9-render-domain-v1','ownerId',pg_temp.uid(n),'workId',w.session_id,
 'requestId',w.save_request_id,'contentGeneration',w.generation,'snapshotDigest',encode(w.snapshot_digest,'hex'),
 'ruleSet',w.rule_set,'decision',decision,'summary','Star · My own answer.','domainTag','domain:collect')
 FROM public.interview_work_contracts w WHERE w.owner_id=pg_temp.uid(n) AND w.new_work_key=pg_temp.uid(n,3)
$$;
CREATE FUNCTION pg_temp.finish(n integer,decision text DEFAULT 'clear') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.finalize_interview_save(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',pg_temp.packet(n),pg_temp.preflight(n,decision)) $$;
CREATE FUNCTION pg_temp.observe(n integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.lookup_interview_save(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
 (pg_temp.packet(n)->'intent'->>'sessionId')::uuid,pg_temp.uid(n,5)) $$;
CREATE FUNCTION pg_temp.probe(n integer,verdict text DEFAULT 'credited',model text DEFAULT 'fact',credit boolean DEFAULT true,audit integer DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
 SELECT public.record_interview_work_verdict(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
 (pg_temp.packet(n)->'intent'->>'contentGeneration')::uuid,pg_temp.uid(COALESCE(audit,n),6),
 (pg_temp.packet(n)->'intent'->>'sessionId')::uuid,'now','en',1,1,2,'fact','seed','pass',model,verdict,credit,
 pg_temp.packet(n)->>'ruleSet','claude',false,0,2,
 encode(sha256(convert_to((pg_temp.packet(n)->'intent'->>'sessionId')||':2:My own answer.','UTF8')),'hex')) $$;
INSERT INTO auth.users(id,email) SELECT pg_temp.uid(n),'atomic-'||n||'@example.invalid' FROM generate_series(1,30)n;
INSERT INTO public.users(id,email,birth_date,locale) SELECT pg_temp.uid(n),'atomic-'||n||'@example.invalid','1990-01-01','en' FROM generate_series(1,30)n;
INSERT INTO auth.sessions(id,user_id) SELECT pg_temp.uid(n,2),pg_temp.uid(n) FROM generate_series(1,30)n;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.open_interview_work(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
 pg_temp.uid(n,3),pg_temp.uid(n,4),'now','en','es',false) FROM generate_series(1,30)n;
SELECT public.reserve_interview_save(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
 (pg_temp.packet(n)->'intent'->>'sessionId')::uuid,(pg_temp.packet(n)->'intent'->>'contentGeneration')::uuid,
 pg_temp.uid(n,5),7,decode(interview_authority_private.finalize_packet(pg_temp.uid(n),pg_temp.packet(n))->>'digest','hex'),
 pg_temp.uid(n,4),'now','en','es',false) FROM generate_series(1,30)n;
INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,purpose,event_source)
 SELECT pg_temp.uid(n,6),pg_temp.uid(n),'p','o','synthetic-local',false,'green',1,'interview_probe','server_verified' FROM generate_series(1,30)n;
-- END SHARED FIXTURE

-- ACLs and helper self-validation: actual roles, not just source matching.
DO $$ DECLARE r text; f record;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='interview_authority_private' LOOP
   PERFORM pg_temp.check(has_function_privilege(r,f.signature,'EXECUTE')=(r='service_role' AND f.proname IN ('request','finalize','verdict_request','lifecycle')),'private ACL '||r||f.signature);
  END LOOP;
 END LOOP;
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.reject('SELECT pg_temp.finish(1)','42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.reject('SELECT pg_temp.finish(1)','42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role='authenticated';
SELECT pg_temp.reject('SELECT pg_temp.finish(1)','42501','service_required');
SELECT pg_temp.reject($q$SELECT interview_authority_private.finalize(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',pg_temp.packet(1),pg_temp.preflight(1))$q$,'42501','service_required');
SET LOCAL request.jwt.claim.role='service_role';
SELECT pg_temp.reject($q$SELECT public.finalize_interview_save(pg_temp.uid(1),pg_temp.uid(2,2),clock_timestamp()+interval '1 hour',pg_temp.packet(1),pg_temp.preflight(1))$q$,'42501','live_session_required');
SELECT pg_temp.reject($q$SELECT public.finalize_interview_save(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',pg_temp.packet(1),NULL)$q$,'42501','preflight_required');
SELECT pg_temp.reject($q$SELECT public.finalize_interview_save(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',pg_temp.packet(1),pg_temp.preflight(1)||'{"safe":true}')$q$,'42501','preflight_required');
SELECT pg_temp.reject($q$SELECT public.finalize_interview_save(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',jsonb_set(pg_temp.packet(1),'{intent,revision}','8'),pg_temp.preflight(1))$q$,'22023','binding_conflict');
SELECT pg_temp.check(pg_temp.probe(1)='recorded','actual owned verdict');
SELECT pg_temp.check(pg_temp.finish(1)->>'state'='committed','atomic finalization');
SELECT pg_temp.check(pg_temp.finish(1)->'receipt'=pg_temp.observe(1)->'receipt','same key retry exact receipt');
RESET ROLE;
SELECT pg_temp.check((SELECT count(*)=1 FROM public.records WHERE user_id=pg_temp.uid(1))
 AND (SELECT count(*)=1 FROM public.interview_transcripts WHERE user_id=pg_temp.uid(1))
 AND (SELECT count(*)=2 FROM public.interview_transcript_turns WHERE user_id=pg_temp.uid(1))
 AND (SELECT sum(created)=1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(1)),'one record/head/two turns, start count unchanged');
SELECT pg_temp.check((SELECT snapshot_digest IS NOT NULL AND save_state='committed' AND commit_receipt->>'cellsAdded'='1' FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(1)),'receipt plus real coverage');
SELECT pg_temp.check((SELECT answer_digest IS NULL AND link_state='linked' FROM public.interview_probe_verdicts WHERE audit_id=pg_temp.uid(1,6)),'core actually erased linked answer digest');
SELECT pg_temp.reject($q$UPDATE public.interview_work_contracts SET commit_receipt='{}' WHERE owner_id=pg_temp.uid(1)$q$,'42501','identity_is_fixed');
SELECT pg_temp.reject($q$UPDATE public.interview_work_contracts SET draft_revision=8 WHERE owner_id=pg_temp.uid(1)$q$,'42501','identity_is_fixed');
SELECT pg_temp.reject($q$UPDATE public.interview_work_contracts SET rule_set='r1-q5' WHERE owner_id=pg_temp.uid(1)$q$,'42501','identity_is_fixed');

-- Late owned RED raises current hold, preserving the original immutable fact.
CREATE TEMP TABLE receipt_one AS SELECT commit_receipt FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(1);
INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,purpose,event_source)
 VALUES(pg_temp.uid(101,6),pg_temp.uid(1),'p','o','synthetic-local',false,'red',1,'interview_probe','server_verified');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.probe(1,'credited','fact',true,101)='session_committed','late RED status');
SELECT pg_temp.check((pg_temp.observe(1)->>'currentHold')::boolean AND NOT (pg_temp.observe(1)->'receipt'->>'holdAtCommit')::boolean,'current hold differs from hold at commit');
RESET ROLE;
SELECT pg_temp.check((SELECT w.commit_receipt=r.commit_receipt FROM public.interview_work_contracts w CROSS JOIN receipt_one r WHERE w.owner_id=pg_temp.uid(1)),'late RED receipt immutable');

-- Error after record/core writes must leave no partial row, coverage or receipt.
CREATE FUNCTION pg_temp.break_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.owner_id=pg_temp.uid(2) AND NEW.save_state='committed' THEN RAISE EXCEPTION 'fixture_receipt_fault'; END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_atomic_fixture_fault BEFORE UPDATE ON public.interview_work_contracts FOR EACH ROW EXECUTE FUNCTION pg_temp.break_receipt();
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.probe(2)='recorded','fault fixture verdict');
SELECT pg_temp.reject('SELECT pg_temp.finish(2)','P0001','fixture_receipt_fault');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.records WHERE user_id=pg_temp.uid(2))
 AND NOT EXISTS(SELECT 1 FROM public.interview_transcripts WHERE user_id=pg_temp.uid(2))
 AND NOT EXISTS(SELECT 1 FROM public.interview_coverage WHERE user_id=pg_temp.uid(2))
 AND (SELECT save_state='reserved' AND commit_receipt IS NULL FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(2))
 AND (SELECT prompt_hash='p' FROM public.ai_audit_log WHERE id=pg_temp.uid(2,6)),'failure atomicity includes audit cleanup');
DROP TRIGGER zz_atomic_fixture_fault ON public.interview_work_contracts;
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.finish(2)->>'state'='committed','same original intent can finish after rollback');
SELECT pg_temp.check(pg_temp.finish(3,'hold')->'receipt'->>'cellsAdded'='0','synthetic trusted hold has no coverage');
RESET ROLE;
SELECT pg_temp.check((SELECT bool_and(ai_hold) FROM public.interview_transcript_turns WHERE user_id=pg_temp.uid(3)),'hold on every turn');

-- Protocol is pinned for NEW work only. Existing rule/revision never changes.
UPDATE public.interview_content_authority SET write_protocol='v2-required' WHERE owner_id=pg_temp.uid(4);
SELECT pg_temp.reject($q$UPDATE public.interview_content_authority SET write_protocol='legacy' WHERE owner_id=pg_temp.uid(4)$q$,'42501','protocol');
SELECT pg_temp.check((SELECT rule_set='r0' FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(4)),'old work remains r0');
SET LOCAL ROLE service_role;
SELECT public.open_interview_work(pg_temp.uid(4),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',pg_temp.uid(404,3),pg_temp.uid(404,4),'now','en','es',false);
RESET ROLE;
SELECT pg_temp.check((SELECT rule_set='r1-q5' FROM public.interview_work_contracts WHERE new_work_key=pg_temp.uid(404,3)),'new rule pinned before first verdict');
-- Bind the real work writer to the new contract, retain NO_VERDICT/model NULL.
SET LOCAL ROLE service_role;
SELECT pg_temp.check(public.record_interview_work_verdict(pg_temp.uid(4),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',
 (public.inspect_interview_authority(pg_temp.uid(4),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',NULL)->>'generation')::uuid,
 pg_temp.uid(4,6),(public.open_interview_work(pg_temp.uid(4),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',pg_temp.uid(404,3),pg_temp.uid(404,4),'now','en','es',false)->>'workId')::uuid,
 'now','en',1,1,2,'fact','seed','pass',NULL,'no_verdict',true,'r1-q5','claude',false,0,2,NULL)='recorded','r1-q5 missing Q5 local pass');
RESET ROLE;
SELECT pg_temp.check((SELECT verdict='no_verdict' AND model_layer IS NULL AND final_credit FROM public.interview_probe_verdicts WHERE audit_id=pg_temp.uid(4,6)),'never fabricate model fact');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(public.interview_session_rule_for_metrics((public.open_interview_work(pg_temp.uid(4),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',pg_temp.uid(404,3),pg_temp.uid(404,4),'now','en','es',false)->>'workId')::uuid)='r1-q5','service rule helper works without work-table grant');
RESET ROLE;
-- CI service stub lacks production BYPASSRLS; view data is checked as fixture administrator.
SELECT pg_temp.check((SELECT rule_set='r1-q5' FROM public.interview_scene_metrics WHERE owner_id=pg_temp.uid(4)),'metrics reads immutable work rule');

-- CI bootstrap predates Supabase table grants. Give only this rolled-back
-- fixture the existing owner-RLS DML capability to exercise INVOKER guards.
GRANT SELECT,INSERT,UPDATE ON public.records,public.interview_coverage TO authenticated;
-- Ordinary notes/other audits still work. Known old interview writes are refused.
SET LOCAL request.jwt.claim.sub='1a162600-0000-4000-8001-000000000004';
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL ROLE authenticated;
INSERT INTO public.records(user_id,kind,body) VALUES(pg_temp.uid(4),'note','ordinary note');
INSERT INTO public.records(user_id,kind,body,system_tags) VALUES(pg_temp.uid(4),'audit_response','other audit',ARRAY['recall']);
SELECT pg_temp.reject($q$INSERT INTO public.records(user_id,kind,body,system_tags) VALUES(pg_temp.uid(4),'audit_response','legacy interview',ARRAY['interview'])$q$,'42501','version_mismatch');
SELECT pg_temp.reject($q$SELECT public.close_interview_session(pg_temp.uid(404,7),'now','en','left',0,0)$q$,'42501','version_mismatch');
SELECT pg_temp.reject($q$INSERT INTO public.interview_coverage(user_id,period,layer,answers) VALUES(pg_temp.uid(4),'now','fact',1)$q$,'42501','version_mismatch');
RESET ROLE;
ROLLBACK;
