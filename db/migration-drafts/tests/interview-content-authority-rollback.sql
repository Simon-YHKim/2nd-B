-- Runner expands the exact down file, first in an empty DB and then after use.
-- A changed definition is not a substitute for executing the candidate down.
DO $check$
BEGIN
  IF to_regclass('public.interview_content_authority') IS NOT NULL
    OR to_regclass('public.interview_content_wipes') IS NOT NULL
    OR to_regclass('public.interview_work_contracts') IS NOT NULL
    OR to_regnamespace('interview_authority_private') IS NOT NULL
    OR to_regprocedure('public.open_interview_work(uuid,uuid,timestamptz,uuid,uuid,text,text,text,boolean)') IS NOT NULL
    OR to_regprocedure('public.begin_interview_content_wipe(uuid,uuid,timestamptz,uuid,uuid,text)') IS NOT NULL
    OR to_regprocedure('public.reserve_interview_save(uuid,uuid,timestamptz,uuid,uuid,uuid,bigint,bytea,uuid,text,text,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'empty rollback left authority objects';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='interview_session_count_start' AND NOT tgisinternal)
    OR to_regprocedure('public.close_interview_session(uuid,text,text,text,integer,integer)') IS NULL
    OR has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'empty rollback changed legacy contracts';
  END IF;
END;
$check$;
