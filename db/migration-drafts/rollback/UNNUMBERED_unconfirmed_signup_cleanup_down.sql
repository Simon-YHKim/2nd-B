-- T07 schema/scheduling rollback only. Run as postgres in ONE transaction.
-- Does not recover erased users or birth dates, and does not change policy text.
DO $unschedule$
DECLARE v_job_id bigint; v_routine regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'T07 requires postgres'; END IF;
  FOREACH v_routine IN ARRAY ARRAY[
    'public.enforce_user_age_tier()'::regprocedure,
    'public.complete_verified_email_signup()'::regprocedure,
    'public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, unnest(p.proconfig) c
      WHERE p.oid = v_routine AND lower(split_part(c, '=', 1)) = 'timezone'
        AND c <> 'TimeZone=Asia/Seoul') THEN
      RAISE EXCEPTION 'T07 down refuses unexpected signup timezone override';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_cron')
     AND pg_catalog.to_regprocedure('cron.unschedule(bigint)') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=$1'
      USING 'purge-unconfirmed-signups'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;
  END IF;
END
$unschedule$;
ALTER FUNCTION public.enforce_user_age_tier() RESET timezone;
ALTER FUNCTION public.complete_verified_email_signup() RESET timezone;
ALTER FUNCTION public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)
  RESET timezone;
DROP TRIGGER IF EXISTS trg_scrub_signup_birth_date ON auth.identities;
DROP TRIGGER IF EXISTS trg_scrub_signup_birth_date ON auth.users;
DROP FUNCTION IF EXISTS public.purge_unconfirmed_signups(integer);
DROP FUNCTION IF EXISTS public.scrub_signup_birth_date_on_write();
DROP FUNCTION IF EXISTS public.scrub_under14_signup_birth_date(jsonb);
