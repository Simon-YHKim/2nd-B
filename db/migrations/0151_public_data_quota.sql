-- PROVISIONAL 0151: final integration MUST renumber this migration.
-- Open 0148-0150 stacks and another security DB branch already occupy the
-- surrounding numbers. Do not push or deploy this filename as-is.
--
-- Atomic, fail-closed quota accounting for public-data-proxy. Every allowance
-- is consumed before the upstream request. The provider/day row is locked
-- first, then the user/provider/day row, so parallel callers cannot exceed
-- either ceiling and all callers take locks in one deadlock-safe order.
--
-- p_cap remains in the RPC signature used by the Edge Function, but it may
-- only lower the server-owned per-user ceiling. Provider-global ceilings never
-- come from the caller. EXIM stays below its official 1,000/day allowance.

CREATE TABLE IF NOT EXISTS public.public_data_quota_daily (
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  usage_day   date NOT NULL,
  calls       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (user_id, provider, usage_day),
  CONSTRAINT public_data_quota_provider_allowed
    CHECK (provider IN ('exim_fx', 'mfds_food')),
  CONSTRAINT public_data_quota_calls_nonnegative CHECK (calls >= 0)
);

CREATE TABLE IF NOT EXISTS public.public_data_provider_quota_daily (
  provider    text NOT NULL,
  usage_day   date NOT NULL,
  calls       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (provider, usage_day),
  CONSTRAINT public_data_provider_quota_provider_allowed
    CHECK (provider IN ('exim_fx', 'mfds_food')),
  CONSTRAINT public_data_provider_quota_calls_nonnegative CHECK (calls >= 0)
);

ALTER TABLE public.public_data_quota_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_data_quota_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_data_provider_quota_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_data_provider_quota_daily FORCE ROW LEVEL SECURITY;

-- No direct ledger access, including for service_role. The definer RPC is the
-- only mutation surface and therefore the only place both caps can be consumed
-- in the same transaction.
REVOKE ALL ON TABLE public.public_data_quota_daily
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.public_data_provider_quota_daily
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_public_data_quota(
  p_user_id uuid,
  p_provider text,
  p_day date,
  p_cap int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_request_role text;
  v_user_cap_ceiling integer;
  v_global_cap integer;
  v_global_calls integer;
  v_user_calls integer;
BEGIN
  -- PostgREST moved the role claim from the legacy scalar GUC to the claims
  -- JSON on the current stack. Read both forms; malformed/missing claims fail
  -- closed through the ownership branch below.
  v_request_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  -- The deployed proxy calls with service_role after deriving p_user_id from a
  -- gateway-verified JWT. Keep an owner guard as defence in depth: if grants
  -- are ever widened accidentally, a signed-in caller still cannot target a
  -- different user's row.
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22004';
  END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('exim_fx', 'mfds_food') THEN
    RAISE EXCEPTION 'provider not allowed' USING ERRCODE = '22023';
  END IF;
  IF p_day IS NULL OR p_day <> (pg_catalog.now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'p_day must be the current UTC day' USING ERRCODE = '22023';
  END IF;

  v_user_cap_ceiling := CASE p_provider
    WHEN 'exim_fx' THEN 20
    WHEN 'mfds_food' THEN 50
  END;
  IF p_cap IS NULL OR p_cap < 1 OR p_cap > v_user_cap_ceiling THEN
    RAISE EXCEPTION 'p_cap outside server allowance' USING ERRCODE = '22023';
  END IF;

  -- These are deliberately server constants. In particular, p_cap cannot lift
  -- a provider-global allowance. MFDS is pinned explicitly rather than relying
  -- on a provider default that may differ between issued keys.
  v_global_cap := CASE p_provider
    WHEN 'exim_fx' THEN 900
    WHEN 'mfds_food' THEN 900
  END;

  -- Serialize all calls for one provider/day before touching any user row.
  INSERT INTO public.public_data_provider_quota_daily AS provider_quota
    (provider, usage_day, calls)
  VALUES (p_provider, p_day, 0)
  ON CONFLICT (provider, usage_day) DO NOTHING;

  SELECT provider_quota.calls
    INTO STRICT v_global_calls
    FROM public.public_data_provider_quota_daily AS provider_quota
   WHERE provider_quota.provider = p_provider
     AND provider_quota.usage_day = p_day
   FOR UPDATE;

  IF v_global_calls >= v_global_cap THEN
    RETURN false;
  END IF;

  INSERT INTO public.public_data_quota_daily AS user_quota
    (user_id, provider, usage_day, calls)
  VALUES (p_user_id, p_provider, p_day, 0)
  ON CONFLICT (user_id, provider, usage_day) DO NOTHING;

  SELECT user_quota.calls
    INTO STRICT v_user_calls
    FROM public.public_data_quota_daily AS user_quota
   WHERE user_quota.user_id = p_user_id
     AND user_quota.provider = p_provider
     AND user_quota.usage_day = p_day
   FOR UPDATE;

  IF v_user_calls >= p_cap THEN
    RETURN false;
  END IF;

  UPDATE public.public_data_provider_quota_daily AS provider_quota
     SET calls = provider_quota.calls + 1,
         updated_at = pg_catalog.now()
   WHERE provider_quota.provider = p_provider
     AND provider_quota.usage_day = p_day;

  UPDATE public.public_data_quota_daily AS user_quota
     SET calls = user_quota.calls + 1,
         updated_at = pg_catalog.now()
   WHERE user_quota.user_id = p_user_id
     AND user_quota.provider = p_provider
     AND user_quota.usage_day = p_day;

  RETURN true;
END;
$$;

-- Supabase may auto-grant new public-schema functions to client roles, so name
-- each role explicitly in addition to PUBLIC. Only the Edge Function's trusted
-- service-role path may spend a provider-global allowance.
REVOKE ALL ON FUNCTION public.consume_public_data_quota(uuid, text, date, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_data_quota(uuid, text, date, int)
  TO service_role;
