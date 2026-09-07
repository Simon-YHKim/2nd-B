-- 0184_billing_self_service_rate_limit.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Atomically limit every valid subscription-manage request before eligibility
-- reads, audit writes, HMAC issuance, or Paddle calls. One row per user stores
-- at most the 20 timestamps still inside the rolling one-hour window.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.billing_self_service_rate_limits (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_self_service_rate_claims_bounded CHECK (
    cardinality(claimed_at) BETWEEN 0 AND 20
    AND array_position(claimed_at, NULL) IS NULL
  )
);

ALTER TABLE public.billing_self_service_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_self_service_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_self_service_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_billing_self_service_rate_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now     timestamptz;
  v_claims  timestamptz[];
  v_retry   integer;
  v_updated uuid;
BEGIN
  -- The Edge function derives p_user_id from the gateway-verified JWT. Keep the
  -- arbitrary-subject argument unavailable even if an ACL drifts later.
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22023';
  END IF;

  -- Materialize one mutex row. A concurrent first claim waits on the unique
  -- key, then every caller serializes on the same row below.
  INSERT INTO public.billing_self_service_rate_limits AS limits
    (user_id, claimed_at)
  VALUES
    (p_user_id, '{}'::timestamptz[])
  ON CONFLICT (user_id) DO NOTHING;

  SELECT limits.claimed_at
    INTO v_claims
    FROM public.billing_self_service_rate_limits AS limits
   WHERE limits.user_id = p_user_id
   FOR UPDATE;

  IF v_claims IS NULL THEN
    RAISE EXCEPTION 'rate limit subject unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- Take wall-clock time only after the row-lock wait, then retain exactly the
  -- rolling hour. The lock is held until this RPC transaction commits.
  v_now := clock_timestamp();
  SELECT coalesce(array_agg(claimed ORDER BY claimed), '{}'::timestamptz[])
    INTO v_claims
    FROM unnest(v_claims) AS claimed
   WHERE claimed >= v_now - make_interval(hours => 1);

  IF cardinality(v_claims) >= 20 THEN
    v_retry := greatest(
      1,
      least(
        3600,
        ceil(extract(epoch FROM (v_claims[1] + make_interval(hours => 1) - v_now)))::integer
      )
    );
    RETURN v_retry;
  END IF;

  UPDATE public.billing_self_service_rate_limits AS limits
     SET claimed_at = array_append(v_claims, v_now),
         updated_at = v_now
   WHERE limits.user_id = p_user_id
  RETURNING limits.user_id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'rate limit subject unavailable' USING ERRCODE = 'P0001';
  END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_self_service_rate_limit(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_billing_self_service_rate_limit(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_billing_self_service_rate_limit(uuid) IS
  'Service-only rolling limiter for subscription-manage: first 20 user requests per 60 minutes return 0; later requests return retry-after seconds.';

DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.billing_self_service_rate_limits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.billing_self_service_rate_limits', 'SELECT')
     OR has_table_privilege('service_role', 'public.billing_self_service_rate_limits', 'SELECT')
     OR has_function_privilege(
       'anon',
       'public.claim_billing_self_service_rate_limit(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.claim_billing_self_service_rate_limit(uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.claim_billing_self_service_rate_limit(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'billing self-service rate-limit ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

