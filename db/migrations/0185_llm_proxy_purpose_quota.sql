-- 0185_llm_proxy_purpose_quota.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- A broad daily call counter is not a sufficient cost boundary for rare,
-- high-unit-cost seats. Keep an additional server-derived KST-day allowance
-- per purpose, shared by all four vendor proxies. No prompt or provider data is
-- stored here; only the minimum counter needed for authorization and cost.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.llm_proxy_purpose_daily (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kst_day    date NOT NULL,
  purpose    text NOT NULL,
  count      integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kst_day, purpose),
  CONSTRAINT llm_proxy_purpose_daily_purpose_check CHECK (
    purpose IN (
      'advisor',
      'audit_qa',
      'axis_estimate',
      'capture_classify',
      'capture_ocr',
      'capture_voice',
      'clipper_classify',
      'clipper_template_propose',
      'cluster_infer',
      'crosscheck_challenge',
      'crosscheck_defend',
      'digest_weekly',
      'embed_index',
      'gap_synthesize',
      'imagine',
      'import_ingest',
      'interview_probe',
      'northstar_propose',
      'ops_daily_brief',
      'ops_recommend',
      'persona_narrative',
      'persona_synthesis',
      'reasoning_connect',
      'safety_classify',
      'secondb_chat',
      'self_model_propose',
      'source_ingest',
      'ttfv_first_insight',
      'voice_transcribe'
    )
  ),
  CONSTRAINT llm_proxy_purpose_daily_count_check CHECK (count BETWEEN 1 AND 10000)
);

-- Upgrade a partially applied or earlier seven-purpose draft to the complete
-- app vocabulary. Replacing named checks makes the migration re-applicable and
-- verifies the final rule rather than trusting CREATE TABLE IF NOT EXISTS.
ALTER TABLE public.llm_proxy_purpose_daily
  DROP CONSTRAINT IF EXISTS llm_proxy_purpose_daily_purpose_check;
ALTER TABLE public.llm_proxy_purpose_daily
  ADD CONSTRAINT llm_proxy_purpose_daily_purpose_check CHECK (
    purpose IN (
      'advisor', 'audit_qa', 'axis_estimate', 'capture_classify',
      'capture_ocr', 'capture_voice', 'clipper_classify',
      'clipper_template_propose', 'cluster_infer', 'crosscheck_challenge',
      'crosscheck_defend', 'digest_weekly', 'embed_index', 'gap_synthesize',
      'imagine', 'import_ingest', 'interview_probe', 'northstar_propose',
      'ops_daily_brief', 'ops_recommend', 'persona_narrative',
      'persona_synthesis', 'reasoning_connect', 'safety_classify',
      'secondb_chat', 'self_model_propose', 'source_ingest',
      'ttfv_first_insight', 'voice_transcribe'
    )
  );
ALTER TABLE public.llm_proxy_purpose_daily
  DROP CONSTRAINT IF EXISTS llm_proxy_purpose_daily_count_check;
ALTER TABLE public.llm_proxy_purpose_daily
  ADD CONSTRAINT llm_proxy_purpose_daily_count_check
    CHECK (count BETWEEN 1 AND 10000);

ALTER TABLE public.llm_proxy_purpose_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_proxy_purpose_daily FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS llm_proxy_purpose_daily_day_idx
  ON public.llm_proxy_purpose_daily (kst_day);

REVOKE ALL ON TABLE public.llm_proxy_purpose_daily
  FROM PUBLIC, anon, authenticated, service_role;

-- The provider-less draft cannot prove that the caller's proxy has a seat for
-- this purpose. Remove it instead of retaining a bypass overload.
DROP FUNCTION IF EXISTS public.consume_llm_proxy_purpose_quota(uuid, text);

CREATE OR REPLACE FUNCTION public.consume_llm_proxy_purpose_quota(
  p_user_id uuid,
  p_provider text,
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
  -- This mirrors the server-owned proxy policy. Unknown providers, unknown
  -- purposes, capture_voice (a routing alias), and mismatched proxy seats all
  -- fail before a counter row can be written.
  IF p_provider IS NULL OR p_purpose IS NULL OR NOT (CASE p_provider
    WHEN 'gemini' THEN p_purpose IN (
      'advisor', 'audit_qa', 'axis_estimate', 'capture_classify',
      'capture_ocr', 'clipper_classify', 'clipper_template_propose',
      'cluster_infer', 'digest_weekly', 'embed_index', 'gap_synthesize',
      'imagine', 'import_ingest', 'interview_probe', 'northstar_propose',
      'ops_daily_brief', 'ops_recommend', 'persona_narrative',
      'persona_synthesis', 'reasoning_connect', 'safety_classify',
      'secondb_chat', 'self_model_propose', 'source_ingest',
      'ttfv_first_insight', 'voice_transcribe'
    )
    WHEN 'openai' THEN p_purpose IN (
      'advisor', 'audit_qa', 'axis_estimate', 'capture_classify',
      'capture_ocr', 'clipper_classify', 'clipper_template_propose',
      'cluster_infer', 'crosscheck_challenge', 'digest_weekly', 'embed_index',
      'gap_synthesize', 'imagine', 'import_ingest', 'interview_probe',
      'northstar_propose', 'ops_daily_brief', 'ops_recommend',
      'persona_narrative', 'persona_synthesis', 'reasoning_connect',
      'safety_classify', 'secondb_chat', 'self_model_propose',
      'source_ingest', 'ttfv_first_insight', 'voice_transcribe'
    )
    WHEN 'claude' THEN p_purpose IN (
      'axis_estimate', 'crosscheck_defend', 'digest_weekly',
      'persona_narrative', 'persona_synthesis'
    )
    WHEN 'xai' THEN p_purpose IN (
      'advisor', 'axis_estimate', 'cluster_infer', 'digest_weekly',
      'gap_synthesize', 'northstar_propose', 'ops_daily_brief',
      'ops_recommend', 'persona_narrative', 'persona_synthesis',
      'secondb_chat', 'self_model_propose', 'ttfv_first_insight'
    )
    ELSE false
  END) THEN
    RAISE EXCEPTION 'unsupported provider purpose' USING ERRCODE = '22023';
  END IF;

  v_day := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
  v_tier := public.effective_subscription_tier(p_user_id);
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'quota subject unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_tier NOT IN ('free', 'soma', 'cortex', 'brain') THEN
    RAISE EXCEPTION 'quota tier unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_purpose = 'advisor' AND v_tier <> 'brain' THEN
    RAISE EXCEPTION 'purpose entitlement unavailable' USING ERRCODE = '42501';
  END IF;

  v_limit := CASE
    WHEN p_purpose = 'secondb_chat' THEN CASE COALESCE(v_tier, 'free')
      WHEN 'brain'  THEN 250
      WHEN 'cortex' THEN 80
      WHEN 'soma'   THEN 30
      ELSE 5
    END
    WHEN p_purpose IN (
      'advisor', 'crosscheck_challenge', 'crosscheck_defend',
      'imagine', 'reasoning_connect'
    ) THEN CASE v_tier
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
    WHEN p_purpose IN ('capture_ocr', 'voice_transcribe') THEN CASE v_tier
      WHEN 'brain'  THEN 200
      WHEN 'cortex' THEN 80
      WHEN 'soma'   THEN 30
      ELSE 10
    END
    WHEN p_purpose IN (
      'capture_classify', 'clipper_classify', 'embed_index', 'safety_classify'
    ) THEN CASE v_tier
      WHEN 'brain'  THEN 500
      WHEN 'cortex' THEN 350
      WHEN 'soma'   THEN 200
      ELSE 100
    END
    WHEN p_purpose IN (
      'audit_qa', 'capture_voice', 'clipper_template_propose', 'cluster_infer',
      'gap_synthesize', 'import_ingest', 'interview_probe',
      'northstar_propose', 'ops_daily_brief', 'ops_recommend',
      'self_model_propose', 'source_ingest', 'ttfv_first_insight'
    ) THEN CASE v_tier
      WHEN 'brain'  THEN 250
      WHEN 'cortex' THEN 100
      WHEN 'soma'   THEN 50
      ELSE 20
    END
    ELSE NULL
  END;
  IF v_limit IS NULL OR v_limit < 1 OR v_limit > 10000 THEN
    RAISE EXCEPTION 'quota policy unavailable' USING ERRCODE = 'P0001';
  END IF;

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

REVOKE ALL ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text) IS
  'Service-only atomic KST-day allowance with server-owned provider seats, tiers, and limits.';

DO $verify$
BEGIN
  IF has_table_privilege(
       'anon', 'public.llm_proxy_purpose_daily',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.llm_proxy_purpose_daily',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role', 'public.llm_proxy_purpose_daily',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_function_privilege(
       'anon',
       'public.consume_llm_proxy_purpose_quota(uuid, text, text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.consume_llm_proxy_purpose_quota(uuid, text, text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.consume_llm_proxy_purpose_quota(uuid, text, text)',
       'EXECUTE'
     )
     OR pg_catalog.to_regprocedure(
       'public.consume_llm_proxy_purpose_quota(uuid,text)'
     ) IS NOT NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_class
        WHERE oid = 'public.llm_proxy_purpose_daily'::regclass
          AND relrowsecurity
          AND relforcerowsecurity
     )
     OR NOT EXISTS (
       SELECT 1
        FROM pg_catalog.pg_proc
       WHERE oid = 'public.consume_llm_proxy_purpose_quota(uuid,text,text)'::regprocedure
          AND prosecdef
          AND EXISTS (
            SELECT 1
              FROM pg_catalog.unnest(proconfig) AS setting(value)
             WHERE setting.value LIKE 'search_path=%'
          )
     ) THEN
    RAISE EXCEPTION 'purpose quota ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

COMMIT;
