-- Run after empty S2b down, with S1 still installed.
BEGIN;
DO $$
BEGIN
 IF to_regprocedure('public.finalize_interview_save(uuid,uuid,timestamptz,jsonb,jsonb)') IS NOT NULL
 OR to_regprocedure('interview_authority_private.commit_core(uuid,text,uuid,uuid,jsonb,boolean)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname LIKE 'authority_%' AND NOT tgisinternal)
 OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='interview_work_contracts' AND column_name IN ('record_id','commit_receipt','erased_at'))
 OR to_regprocedure('public.open_interview_work(uuid,uuid,timestamptz,uuid,uuid,text,text,text,boolean)') IS NULL
 OR position('interview_authority_private' IN pg_get_functiondef('public.commit_interview_session(uuid,uuid,jsonb,boolean)'::regprocedure))>0
 OR position('max(v.rule_set)' IN pg_get_functiondef('public.fold_interview_session(uuid,text)'::regprocedure))=0
 OR has_function_privilege('authenticated','public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.commit_interview_session(uuid,uuid,jsonb,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'S2b empty rollback did not restore exact S1/legacy boundary';
 END IF;
END $$;
ROLLBACK;
