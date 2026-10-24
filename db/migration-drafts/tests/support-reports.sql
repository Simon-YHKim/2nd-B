\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '15s';
\ir support-reports-setup.sql
-- Supabase operator semantics only inside this rolled-back test transaction.
ALTER ROLE service_role BYPASSRLS;

CREATE FUNCTION pg_temp.assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'T53 assertion: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, code text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=code THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'T53 expected SQLSTATE %: %',code,statement;
END $$;
INSERT INTO auth.users VALUES ('a0000000-0000-4000-8000-000000000001'),('b0000000-0000-4000-8000-000000000002');
INSERT INTO public.users VALUES ('a0000000-0000-4000-8000-000000000001',1980),('b0000000-0000-4000-8000-000000000002',2010);
SELECT pg_temp.assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.support_reports'::regclass),'RLS enabled and forced');
SELECT pg_temp.assert((SELECT count(*)=0 FROM pg_policies WHERE tablename='support_reports'),'no client policies');
SELECT pg_temp.assert((SELECT class='account_delete_only' AND owner_column='user_id' FROM public.erasure_registry WHERE table_name='support_reports'),'erasure classification');
SELECT pg_temp.assert((SELECT schedule='17 * * * *' AND command='SELECT public.purge_support_reports()' FROM cron.job WHERE jobname='purge-support-reports'),'retention scheduled');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.submit_support_report(uuid,text,text,jsonb,text)','EXECUTE'),'anonymous RPC denied');
SELECT pg_temp.assert(NOT has_function_privilege('service_role','public.submit_support_report(uuid,text,text,jsonb,text)','EXECUTE'),'operator cannot impersonate writer');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.purge_support_reports()','EXECUTE'),'client purge denied');

SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT * FROM public.support_reports$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO public.support_reports DEFAULT VALUES$q$,'42501');
SELECT pg_temp.expect_error($q$UPDATE public.support_reports SET body='changed'$q$,'42501');
SELECT pg_temp.expect_error($q$DELETE FROM public.support_reports$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug','hello','{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug','   ','{}','support-v1')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug',repeat('x',2001),'{}','support-v1')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug','hello','{}','support-v0')$q$,'22023');
DO $$ DECLARE meta jsonb; BEGIN
  FOREACH meta IN ARRAY ARRAY[
    '{}'::jsonb,'[]'::jsonb,'null'::jsonb,
    '{"app_version":null,"screen_path":"/support","locale":"ko"}'::jsonb,
    '{"app_version":"1.0","screen_path":"/support?text=private","locale":"ko"}'::jsonb,
    '{"app_version":"1.0","screen_path":"/support","locale":"fr"}'::jsonb,
    '{"app_version":"1.0","screen_path":"/support","locale":"ko","wiki":"private"}'::jsonb,
    '{"app_version":10,"screen_path":"/support","locale":"ko"}'::jsonb
  ] LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.submit_support_report(gen_random_uuid(),%L,%L,%L::jsonb,%L)','bug','hello',meta,'support-v1'),'22023');
  END LOOP;
END $$;
SELECT public.submit_support_report('10000000-0000-4000-8000-000000000001','bug','hello','{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1') AS first_receipt \gset
SELECT pg_temp.assert(public.submit_support_report('10000000-0000-4000-8000-000000000001','bug','hello','{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1')=:'first_receipt'::uuid,'retry returns original receipt');
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report('10000000-0000-4000-8000-000000000001','bug','different','{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1')$q$,'22023');
SELECT public.submit_support_report(gen_random_uuid(),'inquiry',repeat('가',2000),'{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1');
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug','third','{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1')$q$,'P0053');
SELECT pg_temp.assert(public.submit_support_report('10000000-0000-4000-8000-000000000001','bug','hello','{"app_version":"1.0","screen_path":"/support","locale":"ko"}','support-v1')=:'first_receipt'::uuid,'replay precedes quota');

-- A minor uses the same consent contract and scope; no age/email is copied.
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
SELECT public.submit_support_report('10000000-0000-4000-8000-000000000001','bug','minor','{"app_version":"1.0","screen_path":"/support","locale":"id"}','support-v1') AS minor_receipt \gset
SELECT pg_temp.assert(:'minor_receipt'::uuid<>:'first_receipt'::uuid,'request IDs are per owner');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=3 FROM public.support_reports),'idempotent count');
SELECT pg_temp.assert((SELECT user_id='b0000000-0000-4000-8000-000000000002' FROM public.support_reports WHERE id=:'minor_receipt'),'JWT owns write');
-- Check RLS independently of the table ACL: accidental grants still expose no
-- rows and cannot become a quota-bypassing write path.
GRANT SELECT, INSERT ON public.support_reports TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.support_reports),'RLS hides own and other reports');
SELECT pg_temp.expect_error($q$INSERT INTO public.support_reports(user_id,request_id,kind,body,metadata,consent_version)
  VALUES('b0000000-0000-4000-8000-000000000002',gen_random_uuid(),'bug','direct',
  '{"app_version":"1.0","screen_path":"/support","locale":"en"}','support-v1')$q$,'42501');
RESET ROLE;
REVOKE SELECT, INSERT ON public.support_reports FROM authenticated;
UPDATE public.support_reports SET created_at=clock_timestamp()-interval '2 minutes';
INSERT INTO public.support_reports(user_id,request_id,kind,body,metadata,consent_version,created_at)
SELECT 'a0000000-0000-4000-8000-000000000001',gen_random_uuid(),'bug','quota',
  '{"app_version":"1.0","screen_path":"/support","locale":"en"}'::jsonb,'support-v1',clock_timestamp()-interval '2 hours'
FROM generate_series(1,8);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug','eleventh','{"app_version":"1.0","screen_path":"/support","locale":"en"}','support-v1')$q$,'P0053');
RESET ROLE;
UPDATE public.support_reports SET created_at=clock_timestamp()-interval '25 hours' WHERE body='quota';
SET LOCAL ROLE authenticated;
SELECT public.submit_support_report(gen_random_uuid(),'bug','after-window','{"app_version":"1.0","screen_path":"/support","locale":"pt"}','support-v1');
RESET ROLE;
INSERT INTO public.account_deletion_tombstones VALUES('b0000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_error($q$SELECT public.submit_support_report(gen_random_uuid(),'bug','closed','{"app_version":"1.0","screen_path":"/support","locale":"es"}','support-v1')$q$,'42501');
RESET ROLE;
UPDATE public.support_reports SET created_at=clock_timestamp()-interval '31 days' WHERE body='quota';
SET LOCAL ROLE service_role;
SELECT pg_temp.assert((SELECT count(*)=12 FROM public.support_reports),'operator can read');
SELECT public.purge_support_reports();
SELECT pg_temp.assert((SELECT count(*)=4 FROM public.support_reports),'retention removes only expired reports');
RESET ROLE;
DELETE FROM auth.users WHERE id='a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.support_reports),'account erasure cascades and leaves other owner');
ROLLBACK;
\echo T53 support report SQL contract PASS
