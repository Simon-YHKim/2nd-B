\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000031'),('00000000-0000-0000-0000-000000000032');
INSERT INTO public.users(id) SELECT id FROM auth.users;
INSERT INTO public.ops_routines(id,user_id,title) SELECT id,id,'Read' FROM public.users;

DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000031'; other uuid:='00000000-0000-0000-0000-000000000032';
  claim jsonb; run uuid; before_row public.ai_audit_log%ROWTYPE; after_row public.ai_audit_log%ROWTYPE;
BEGIN
  IF has_function_privilege('authenticated','public.dashboard_generation_audit_attempt(uuid,uuid,text,text,text,boolean)','EXECUTE')
    OR has_function_privilege('anon','public.dashboard_generation_audit_result(uuid,uuid,text,text,integer,text,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.invalidate_dashboard_consent()','EXECUTE')
    OR has_table_privilege('authenticated','public.ai_audit_log','UPDATE') THEN RAISE EXCEPTION '0244 ACL'; END IF;
  claim:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko'); run:=(claim->>'id')::uuid;
  IF public.dashboard_generation_audit_attempt(other,run,'claude-sonnet-5','low','abcd',false) THEN RAISE EXCEPTION 'attempt owner'; END IF;
  IF NOT public.dashboard_generation_audit_attempt(owner,run,'claude-sonnet-5','low','abcd',false) THEN RAISE EXCEPTION 'audited dispatch'; END IF;
  SELECT * INTO before_row FROM public.ai_audit_log WHERE id=run;
  IF NOT FOUND OR before_row.model_used<>'claude-sonnet-5+attempt' OR before_row.reasoning_effort<>'low'
    OR before_row.outbox_event_id<>'dashboard:'||run OR before_row.output_hash<>'' THEN RAISE EXCEPTION 'attempt durable'; END IF;
  IF public.dashboard_generation_audit_attempt(owner,run,'claude-sonnet-5','low','abcd',false) THEN RAISE EXCEPTION 'double audited dispatch'; END IF;
  IF public.dashboard_generation_audit_result(other,run,'dcba','completed',12,'green',10) THEN RAISE EXCEPTION 'result owner'; END IF;
  IF NOT public.dashboard_generation_audit_result(owner,run,'dcba','completed',12,'green',10)
    OR NOT public.dashboard_generation_audit_result(owner,run,'dcba','completed',12,'green',10) THEN RAISE EXCEPTION 'idempotent result'; END IF;
  SELECT * INTO after_row FROM public.ai_audit_log WHERE id=run;
  IF after_row.model_used<>'claude-sonnet-5' OR after_row.total_tokens<>10 OR after_row.output_hash<>'dcba'
    OR after_row.reasoning_effort<>before_row.reasoning_effort OR after_row.prompt_hash<>before_row.prompt_hash
    OR after_row.created_at<>before_row.created_at OR (SELECT count(*) FROM public.ai_audit_log WHERE id=run)<>1 THEN
    RAISE EXCEPTION 'single immutable attempt identity'; END IF;
  BEGIN
    PERFORM public.dashboard_generation_audit_result(owner,run,'ffff','completed',12,'green',10);
    RAISE EXCEPTION 'conflicting result accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF NOT public.dashboard_generation_finish(owner,run,'{"line":"new edge"}') THEN RAISE EXCEPTION 'new edge finish'; END IF;

  claim:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko'); run:=(claim->>'id')::uuid;
  IF NOT public.dashboard_generation_audit_attempt(owner,run,'claude-sonnet-5','low','abcd',true) THEN RAISE EXCEPTION 'crisis attempt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=run AND safety_zone='red' AND reasoning_effort IS NULL AND model_used LIKE '%+crisis')
    OR NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE id=run AND status='failed') THEN RAISE EXCEPTION 'crisis audit/state'; END IF;
  IF public.dashboard_generation_audit_result(owner,run,'dcba','completed',12,'green',10) THEN RAISE EXCEPTION 'crisis cannot become paid'; END IF;

  claim:=public.dashboard_generation_request(owner,'summary','Asia/Seoul','ko'); run:=(claim->>'id')::uuid;
  -- Force a real INSERT failure; the dispatch UPDATE must roll back with it.
  INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms)
    VALUES(run,owner,'','','collision',false,'green',0);
  BEGIN
    PERFORM public.dashboard_generation_audit_attempt(owner,run,'claude-sonnet-5','low','abcd',false);
    RAISE EXCEPTION 'audit collision accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE id=run AND status='pending') THEN RAISE EXCEPTION 'dispatch escaped failed insert'; END IF;
  -- Old Edge + new DB retains the original RPC and its existing direct INSERT.
  IF NOT public.dashboard_generation_dispatch(owner,run) OR NOT public.dashboard_generation_finish(owner,run,'{"line":"old edge"}') THEN
    RAISE EXCEPTION 'old edge compatibility'; END IF;
  RAISE NOTICE '0244 audit: owner, ACL, atomic INSERT, one row, replay conflict, crisis, old/new Edge passed';
END $$;

CREATE FUNCTION pg_temp.seed_runs(owner uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,expires_at)
    SELECT owner,'daily_note',gen_random_uuid()::text,'hash',repeat('a',64),state,
      CASE WHEN state='ready' THEN '{"line":"cached"}'::jsonb END,now()+interval '1 day'
    FROM unnest(ARRAY['pending','dispatched','ready','failed']) state;
$$;
CREATE FUNCTION pg_temp.assert_closed(owner uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner AND (output IS NOT NULL OR status<>'failed')) THEN
    RAISE EXCEPTION 'withdrawal output/state survived'; END IF;
END $$;
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000031'; other uuid:='00000000-0000-0000-0000-000000000032';
  consent uuid; event uuid; count_before int; run uuid;
BEGIN
  PERFORM pg_temp.seed_runs(owner); PERFORM pg_temp.seed_runs(other);
  SELECT count(*) INTO count_before FROM public.dashboard_generation_runs WHERE user_id=owner;
  UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=owner;
  PERFORM pg_temp.assert_closed(owner);
  IF (SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id=owner)<>count_before THEN RAISE EXCEPTION 'quota rows deleted'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=other AND output IS NOT NULL) THEN RAISE EXCEPTION 'other owner erased'; END IF;
  UPDATE public.users SET privacy_prefs='{"recommendations":true}' WHERE id=owner;
  PERFORM pg_temp.assert_closed(owner);
  SELECT id INTO run FROM public.dashboard_generation_runs WHERE user_id=owner LIMIT 1;
  IF public.dashboard_generation_finish(owner,run,'{"line":"late"}') OR public.dashboard_generation_dispatch(owner,run) THEN
    RAISE EXCEPTION 'regrant reopened old attempt'; END IF;
  PERFORM pg_temp.seed_runs(owner);
  -- Unrelated location/marketing settings must not destroy a current slot.
  UPDATE public.users SET privacy_prefs=privacy_prefs||'{"location_weather":true,"marketing":true}' WHERE id=owner;
  INSERT INTO public.consent_changes(user_id,pref_key,event_type) VALUES(owner,'ads','grant');
  IF NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner AND output IS NOT NULL) THEN RAISE EXCEPTION 'unrelated preferences invalidated'; END IF;
  INSERT INTO public.consent_records(user_id,llm_processing_ack) VALUES(owner,false) RETURNING id INTO consent;
  INSERT INTO public.llm_consent_receipts(consent_record_id,user_id) VALUES(consent,owner);
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  UPDATE public.llm_consent_receipts SET state_revision=state_revision+1 WHERE user_id=owner;
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  UPDATE public.llm_consent_receipts SET service_action='revoke',optional_consents_since=now() WHERE user_id=owner;
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  INSERT INTO public.consent_changes(user_id,pref_key,event_type) VALUES(owner,'recommendations','revoke') RETURNING id INTO event;
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  UPDATE public.consent_changes SET created_at=created_at+interval '1 second' WHERE id=event;
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  DELETE FROM public.consent_changes WHERE id=event;
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  UPDATE public.consent_records SET llm_processing_ack=true WHERE id=consent;
  PERFORM pg_temp.assert_closed(owner);
  PERFORM pg_temp.seed_runs(owner);
  DELETE FROM public.consent_records WHERE id=consent;
  PERFORM pg_temp.assert_closed(owner);
  -- Retention metadata scrub does not throw away eligible cached text.
  INSERT INTO public.consent_records(user_id) VALUES(owner) RETURNING id INTO consent;
  PERFORM pg_temp.seed_runs(owner);
  UPDATE public.consent_records SET ip_hash=NULL,ua_hash=NULL WHERE id=consent;
  IF NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner AND output IS NOT NULL) THEN RAISE EXCEPTION 'metadata scrub invalidated'; END IF;
  -- A revoked user can still finish the already committed audit attempt.
  INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,event_source,outbox_event_id)
    VALUES(owner,owner,'abcd','','claude-sonnet-5+attempt',false,'green',0,'server_verified','dashboard:'||owner);
  UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=owner;
  IF NOT public.dashboard_generation_audit_result(owner,owner,'dcba','consent_withheld',12,'green',10) THEN RAISE EXCEPTION 'withdrawal lost audit'; END IF;
  DELETE FROM auth.users WHERE id=owner;
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner)
    OR NOT EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=owner AND user_id IS NULL) THEN RAISE EXCEPTION 'erasure contract'; END IF;
  RAISE NOTICE '0244 withdrawal: prefs, receipts, consent record/event changes, regrant, isolation, quotas, erasure passed';
END $$;
ROLLBACK;
