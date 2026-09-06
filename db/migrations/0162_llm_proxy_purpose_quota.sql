-- 0162_llm_proxy_purpose_quota.sql
-- A broad daily call counter is not a sufficient cost boundary for rare,
-- high-unit-cost seats. Keep an additional server-derived KST-day allowance
-- per purpose, shared by all four vendor proxies. No prompt or provider data is
-- stored here; only the minimum counter needed for authorization and cost.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE public.llm_proxy_purpose_daily (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kst_day    date NOT NULL,
  purpose    text NOT NULL,
  count      integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kst_day, purpose),
  CONSTRAINT llm_proxy_purpose_daily_purpose_check CHECK (
    purpose IN (
      'secondb_chat',
      'crosscheck_challenge',
      'crosscheck_defend',
      'persona_synthesis',
      'persona_narrative',
      'axis_estimate',
      'digest_weekly'
    )
  ),
  CONSTRAINT llm_proxy_purpose_daily_count_check CHECK (count BETWEEN 1 AND 10000)
);

ALTER TABLE public.llm_proxy_purpose_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_proxy_purpose_daily FORCE ROW LEVEL SECURITY;

CREATE INDEX llm_proxy_purpose_daily_day_idx
  ON public.llm_proxy_purpose_daily (kst_day);

REVOKE ALL ON TABLE public.llm_proxy_purpose_daily
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_llm_proxy_purpose_quota(
  p_user_id uuid,
  p_purpose text
)
RETURNS TABLE (allowed boolean, used integer, quota_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tier  text;
  v_day   date;
  v_limit integer;
  v_used  integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22023';
  END IF;
  IF p_purpose IS NULL OR p_purpose NOT IN (
    'secondb_chat',
    'crosscheck_challenge',
    'crosscheck_defend',
    'persona_synthesis',
    'persona_narrative',
    'axis_estimate',
    'digest_weekly'
  ) THEN
    RAISE EXCEPTION 'unsupported purpose' USING ERRCODE = '22023';
  END IF;

  v_day := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
  v_tier := public.effective_subscription_tier(p_user_id);
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'quota subject unavailable' USING ERRCODE = '22023';
  END IF;

  v_limit := CASE
    WHEN p_purpose = 'secondb_chat' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 250
      WHEN 'cortex' THEN 80
      WHEN 'soma'   THEN 30
      ELSE 5
    END
    WHEN p_purpose IN ('crosscheck_challenge', 'crosscheck_defend') THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 16
      WHEN 'cortex' THEN 8
      WHEN 'soma'   THEN 4
      ELSE 2
    END
    WHEN p_purpose = 'persona_synthesis' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 16
      WHEN 'cortex' THEN 8
      WHEN 'soma'   THEN 4
      ELSE 2
    END
    WHEN p_purpose = 'persona_narrative' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 50
      WHEN 'cortex' THEN 24
      WHEN 'soma'   THEN 12
      ELSE 6
    END
    WHEN p_purpose = 'axis_estimate' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 50
      WHEN 'cortex' THEN 20
      WHEN 'soma'   THEN 10
      ELSE 5
    END
    WHEN p_purpose = 'digest_weekly' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 4
      WHEN 'cortex' THEN 2
      WHEN 'soma'   THEN 1
      ELSE 1
    END
    ELSE NULL
  END;

  -- Preserve earned chat sends. The grant path caps the monthly credit at 20;
  -- clamp again here so even legacy/corrupt rows cannot widen a cost boundary.
  IF p_purpose = 'secondb_chat' THEN
    SELECT COALESCE((
      SELECT LEAST(20, GREATEST(0, COALESCE(cu.ad_bonus, 0)))
        FROM public.chat_usage AS cu
       WHERE cu.user_id = p_user_id
         AND cu.day = v_day
    ), 0)
      INTO v_used;
    v_limit := v_limit + v_used;
  END IF;

  -- Bounded per-user cleanup avoids a fleet-wide delete on the hot path while
  -- retaining enough history for incident review.
  DELETE FROM public.llm_proxy_purpose_daily
   WHERE user_id = p_user_id
     AND kst_day < v_day - 45;

  v_used := NULL;
  INSERT INTO public.llm_proxy_purpose_daily AS daily
    (user_id, kst_day, purpose, count, updated_at)
  VALUES
    (p_user_id, v_day, p_purpose, 1, now())
  ON CONFLICT (user_id, kst_day, purpose) DO UPDATE
    SET count = daily.count + 1,
        updated_at = now()
    WHERE daily.count < v_limit
  RETURNING daily.count INTO v_used;

  IF v_used IS NOT NULL THEN
    RETURN QUERY SELECT true, v_used, v_limit;
    RETURN;
  END IF;

  SELECT daily.count
    INTO v_used
    FROM public.llm_proxy_purpose_daily AS daily
   WHERE daily.user_id = p_user_id
     AND daily.kst_day = v_day
     AND daily.purpose = p_purpose;

  IF v_used IS NULL THEN
    RAISE EXCEPTION 'quota row unavailable' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT false, v_used, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text) TO service_role;

COMMENT ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text) IS
  'Service-only atomic KST-day allowance for high-cost LLM purposes; tier and limits are server-derived.';

DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.llm_proxy_purpose_daily', 'SELECT')
     OR has_table_privilege('authenticated', 'public.llm_proxy_purpose_daily', 'SELECT')
     OR has_table_privilege('service_role', 'public.llm_proxy_purpose_daily', 'SELECT')
     OR has_function_privilege(
       'anon',
       'public.consume_llm_proxy_purpose_quota(uuid, text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.consume_llm_proxy_purpose_quota(uuid, text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.consume_llm_proxy_purpose_quota(uuid, text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'purpose quota ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

COMMIT;
