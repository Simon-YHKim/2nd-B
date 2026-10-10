\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000060');
INSERT INTO public.users(id) VALUES('00000000-0000-0000-0000-000000000060');
INSERT INTO public.ops_routines(id,user_id,title) VALUES('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000060','Read');

DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000060'; claim jsonb; run_id uuid; age interval; role_name text;
BEGIN
  -- No cron schema exists in this fixture. Migration seeds a real purge anyway.
  IF to_regnamespace('cron') IS NOT NULL OR NOT public.dashboard_generation_retention_ready() THEN RAISE EXCEPTION '0245 seed without cron'; END IF;
  claim := public.dashboard_generation_request(owner_id,'summary','Asia/Seoul','ko');
  IF claim->>'kind'<>'claimed' THEN RAISE EXCEPTION 'old Edge request after 0245'; END IF;
  run_id := (claim->>'id')::uuid;

  FOREACH age IN ARRAY ARRAY[interval '3 hours',interval '4 hours',interval '-1 hour'] LOOP
    UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-age;
    IF public.dashboard_generation_retention_ready() THEN RAISE EXCEPTION 'stale/future readiness: %',age; END IF;
    IF public.dashboard_generation_guard(owner_id) IS NOT NULL THEN RAISE EXCEPTION 'stale/future guard: %',age; END IF;
    IF public.dashboard_generation_request(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'denied' THEN RAISE EXCEPTION 'stale/future request'; END IF;
    IF public.dashboard_generation_dispatch(owner_id,run_id) THEN RAISE EXCEPTION 'stale/future old Edge dispatch'; END IF;
    IF public.dashboard_generation_audit_attempt(owner_id,run_id,'claude-sonnet-5','low','abcd',false) THEN RAISE EXCEPTION 'stale/future audited dispatch'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=run_id) OR
    (SELECT status FROM public.dashboard_generation_runs WHERE id=run_id)<>'pending' THEN RAISE EXCEPTION 'stale heartbeat mutated claim/audit'; END IF;
  DELETE FROM public.dashboard_generation_retention;
  IF public.dashboard_generation_retention_ready() OR public.dashboard_generation_guard(owner_id) IS NOT NULL THEN RAISE EXCEPTION 'missing heartbeat'; END IF;
  PERFORM public.purge_dashboard_generation();
  IF NOT public.dashboard_generation_retention_ready() THEN RAISE EXCEPTION 'purge did not restore missing heartbeat'; END IF;
  UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '2 hours 59 minutes';
  IF NOT public.dashboard_generation_retention_ready() OR public.dashboard_generation_guard(owner_id) IS NULL THEN RAISE EXCEPTION 'fresh boundary'; END IF;
  IF NOT public.dashboard_generation_audit_attempt(owner_id,run_id,'claude-sonnet-5','low','abcd',false) THEN RAISE EXCEPTION 'fresh audited dispatch'; END IF;
  IF NOT public.dashboard_generation_finish(owner_id,run_id,'{"headline":"Read"}') THEN RAISE EXCEPTION 'fresh finish'; END IF;
  IF public.dashboard_generation_request(owner_id,'summary','Asia/Seoul','ko')->>'kind'<>'ready' THEN RAISE EXCEPTION 'fresh cache'; END IF;
  UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';
  IF public.dashboard_generation_request(owner_id,'summary','Asia/Seoul','ko')->>'kind'<>'denied' THEN RAISE EXCEPTION 'stale cache exposed'; END IF;

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'public.dashboard_generation_retention','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'heartbeat table ACL: %',role_name; END IF;
    IF has_function_privilege(role_name,'public.dashboard_generation_guard(uuid)','EXECUTE') THEN RAISE EXCEPTION 'guard ACL'; END IF;
    IF has_function_privilege(role_name,'public.dashboard_generation_retention_ready()','EXECUTE') IS DISTINCT FROM (role_name='service_role') OR
      has_function_privilege(role_name,'public.purge_dashboard_generation()','EXECUTE') IS DISTINCT FROM (role_name='service_role') THEN RAISE EXCEPTION 'retention RPC ACL: %',role_name; END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.dashboard_generation_retention'::regclass) THEN RAISE EXCEPTION 'heartbeat RLS'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.dashboard_generation_retention_ready()'::regprocedure,'public.dashboard_generation_guard(uuid)'::regprocedure,'public.purge_dashboard_generation()'::regprocedure)
    AND (NOT prosecdef OR NOT proconfig @> ARRAY['search_path=""','row_security=off'])) THEN RAISE EXCEPTION 'definer settings'; END IF;
  BEGIN
    INSERT INTO public.dashboard_generation_retention VALUES(false,clock_timestamp());
    RAISE EXCEPTION 'singleton accepted second row';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- A purge failure must neither attest success nor partially delete content.
INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,created_at,expires_at) VALUES
  ('00000000-0000-0000-0000-000000000060','daily_note','retention-expired','x',repeat('a',64),'ready','{"line":"expired"}',now()-interval '2 hours',now()-interval '1 hour'),
  ('00000000-0000-0000-0000-000000000060','daily_note','retention-old','x',repeat('a',64),'ready','{"line":"old"}',now()-interval '49 hours',now()-interval '25 hours');
CREATE FUNCTION public.test_retention_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_purge_failure'; END $$;
CREATE TRIGGER test_retention_failure BEFORE INSERT OR UPDATE ON public.dashboard_generation_retention FOR EACH ROW EXECUTE FUNCTION public.test_retention_failure();
DO $$ DECLARE before_purge timestamptz; BEGIN
  SELECT last_purged_at INTO before_purge FROM public.dashboard_generation_retention;
  BEGIN
    PERFORM public.purge_dashboard_generation();
    RAISE EXCEPTION 'purge should fail';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'synthetic_purge_failure' THEN RAISE; END IF; END;
  IF (SELECT last_purged_at FROM public.dashboard_generation_retention) IS DISTINCT FROM before_purge OR public.dashboard_generation_retention_ready() THEN RAISE EXCEPTION 'failed purge refreshed heartbeat'; END IF;
  IF (SELECT count(output) FROM public.dashboard_generation_runs WHERE request_key IN ('retention-expired','retention-old'))<>2 THEN RAISE EXCEPTION 'failed purge partially committed'; END IF;
END $$;
DROP TRIGGER test_retention_failure ON public.dashboard_generation_retention;
SELECT public.purge_dashboard_generation();
DO $$ BEGIN
  IF NOT public.dashboard_generation_retention_ready() THEN RAISE EXCEPTION 'successful purge heartbeat'; END IF;
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE request_key='retention-old') OR
    NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE request_key='retention-expired' AND output IS NULL AND status='failed') THEN RAISE EXCEPTION 'purge retention semantics'; END IF;
END $$;
ROLLBACK;
\echo 'Retention heartbeat: seed, boundaries, request/cache/dispatch/audit, ACL/RLS, atomic failure and recovery passed.'
