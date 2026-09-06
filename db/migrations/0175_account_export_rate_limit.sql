-- 0175_account_export_rate_limit.sql
-- Integration candidate only: re-scan remote and local migration
-- reservations immediately before push; renumber again if precedence changed.
-- Serialize expensive account-export starts per user. The Edge Function derives
-- p_user_id only from its gateway-verified JWT; clients cannot execute this RPC.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.account_export_rate_limits (
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_claimed_at timestamptz NOT NULL,
  PRIMARY KEY (user_id)
);

ALTER TABLE public.account_export_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_export_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_export_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_account_export(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now        timestamptz := clock_timestamp();
  v_claimed_at timestamptz;
  v_retry      integer;
BEGIN
  -- ACLs are necessary but not sufficient for a DEFINER function accepting an
  -- arbitrary UUID. Keep the privilege check inside the trusted boundary too.
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22023';
  END IF;

  -- The conditional UPSERT is one row-locking statement. PostgreSQL rechecks
  -- its WHERE clause after a concurrent conflict wait, so only one request can
  -- move last_claimed_at inside the five-minute window.
  INSERT INTO public.account_export_rate_limits AS limits
    (user_id, last_claimed_at)
  VALUES
    (p_user_id, v_now)
  ON CONFLICT (user_id) DO UPDATE
    SET last_claimed_at = EXCLUDED.last_claimed_at
    WHERE limits.last_claimed_at <= v_now - make_interval(secs => 300)
  RETURNING last_claimed_at INTO v_claimed_at;

  IF v_claimed_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT greatest(
           1,
           least(300, ceil(extract(epoch FROM
             (limits.last_claimed_at + make_interval(secs => 300) - v_now)
           ))::integer)
         )
    INTO v_retry
    FROM public.account_export_rate_limits AS limits
   WHERE limits.user_id = p_user_id;

  -- A concurrent account deletion is the only expected way for the row to
  -- disappear. Deny rather than accidentally treating that state as a claim.
  RETURN coalesce(v_retry, 300);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_export(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_export(uuid) TO service_role;

DO $verify$
BEGIN
  IF has_table_privilege(
       'anon',
       'public.account_export_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated',
       'public.account_export_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role',
       'public.account_export_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class c
        WHERE c.oid = 'public.account_export_rate_limits'::regclass
     ), false)
     OR has_function_privilege('anon', 'public.claim_account_export(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_account_export(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.claim_account_export(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'account export claim ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

COMMIT;
