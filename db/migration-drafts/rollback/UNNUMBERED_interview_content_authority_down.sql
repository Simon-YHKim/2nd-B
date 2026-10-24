-- Empty rehearsal only. Never destroy used replay keys, barriers or intents.
BEGIN;
LOCK TABLE public.interview_content_authority,public.interview_content_wipes,
  public.interview_work_contracts IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM public.interview_content_authority)
    OR EXISTS(SELECT 1 FROM public.interview_content_wipes)
    OR EXISTS(SELECT 1 FROM public.interview_work_contracts) THEN
    RAISE EXCEPTION 'interview_authority_used_rollback_forbidden' USING ERRCODE='55000';
  END IF;
END;
$guard$;
DROP FUNCTION public.open_interview_work(uuid,uuid,timestamptz,uuid,uuid,text,text,text,boolean),
  public.inspect_interview_authority(uuid,uuid,timestamptz,uuid),
  public.begin_interview_content_wipe(uuid,uuid,timestamptz,uuid,uuid,text),
  public.inspect_interview_content_wipe(uuid,uuid,timestamptz,uuid),
  public.reserve_interview_save(uuid,uuid,timestamptz,uuid,uuid,uuid,bigint,bytea,uuid,text,text,text,boolean),
  public.lookup_interview_save(uuid,uuid,timestamptz,uuid,uuid);
DROP FUNCTION interview_authority_private.request(text,uuid,uuid,timestamptz,jsonb),
  interview_authority_private.acquire_access(uuid,uuid,timestamptz,boolean),
  interview_authority_private.recheck_access(uuid,uuid,timestamptz);
DROP TABLE public.interview_work_contracts,public.interview_content_wipes,public.interview_content_authority;
DROP SCHEMA interview_authority_private;
COMMIT;
