-- 0180_llm_capacity_retention.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Bound the operational reservation ledger introduced by 0176.
--
-- Reservation UUIDs exist only inside one Edge invocation and the active lease
-- is one minute. Seven days still leaves a deliberately generous replay and
-- incident-review window. The cutoff is fixed rather than caller-controlled
-- so an operator or compromised service token cannot erase fresh idempotency
-- evidence by passing an unsafe retention value.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

CREATE INDEX IF NOT EXISTS llm_capacity_retention_idx
  ON public.llm_proxy_capacity_reservations (created_at, reservation_id);

CREATE OR REPLACE FUNCTION public.prune_llm_proxy_capacity_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_rows integer;
BEGIN
  WITH victims AS (
    SELECT reservation_id
      FROM public.llm_proxy_capacity_reservations
     WHERE created_at < v_now - interval '7 days'
       AND lease_expires_at < v_now
     ORDER BY created_at, reservation_id
     LIMIT 50000
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.llm_proxy_capacity_reservations AS target
   USING victims
   WHERE target.reservation_id = victims.reservation_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- pg_cron is not present in every local/CI database. Pruning on accepted
-- inserts provides a second, bounded cleanup path: if traffic exists, stale
-- rows are drained faster than they can accumulate; if traffic stops, the
-- table also stops growing. The 0176 fleet advisory lock is already held when
-- this BEFORE INSERT trigger runs, so cleanup cannot weaken atomic cap checks.
CREATE OR REPLACE FUNCTION public.prune_llm_proxy_capacity_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  WITH victims AS (
    SELECT reservation_id
      FROM public.llm_proxy_capacity_reservations
     WHERE created_at < v_now - interval '7 days'
       AND lease_expires_at < v_now
     ORDER BY created_at, reservation_id
     LIMIT 1000
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.llm_proxy_capacity_reservations AS target
   USING victims
   WHERE target.reservation_id = victims.reservation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS llm_capacity_prune_before_insert
  ON public.llm_proxy_capacity_reservations;
CREATE TRIGGER llm_capacity_prune_before_insert
  BEFORE INSERT ON public.llm_proxy_capacity_reservations
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prune_llm_proxy_capacity_on_insert();

REVOKE ALL ON FUNCTION public.prune_llm_proxy_capacity_reservations()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_llm_proxy_capacity_reservations()
  TO service_role;

REVOKE ALL ON FUNCTION public.prune_llm_proxy_capacity_on_insert()
  FROM PUBLIC, anon, authenticated, service_role;

-- Hourly cleanup is idempotently installed when pg_cron already exists.
-- Dynamic SQL keeps this migration executable in the plain Postgres CI image
-- where the cron schema is intentionally absent.
DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1'
      USING 'purge-llm-capacity-reservations'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;

    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      INTO v_job_id
      USING
        'purge-llm-capacity-reservations',
        '23 * * * *',
        'SELECT public.prune_llm_proxy_capacity_reservations();';
  ELSE
    RAISE NOTICE '0180: pg_cron unavailable; insert-trigger retention remains active';
  END IF;
END
$schedule$;

DO $verify$
BEGIN
  IF to_regclass('public.llm_capacity_retention_idx') IS NULL
     OR NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.llm_proxy_capacity_reservations'::regclass
     ), false)
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_proc AS p
         JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'prune_llm_proxy_capacity_reservations'
          AND p.pronargs = 0
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=""']::text[]
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_proc AS p
         JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'prune_llm_proxy_capacity_on_insert'
          AND p.pronargs = 0
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=""']::text[]
     )
     OR has_function_privilege(
       'anon',
       'public.prune_llm_proxy_capacity_reservations()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.prune_llm_proxy_capacity_reservations()',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.prune_llm_proxy_capacity_reservations()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.prune_llm_proxy_capacity_on_insert()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.prune_llm_proxy_capacity_on_insert()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.prune_llm_proxy_capacity_on_insert()',
       'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger
        WHERE tgname = 'llm_capacity_prune_before_insert'
          AND tgrelid = 'public.llm_proxy_capacity_reservations'::regclass
          AND tgenabled = 'O'
          AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'LLM capacity retention verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

