-- 0089_reasoning_weekly_cap.sql
-- Phase 4 paywall boundary (Simon 확정 2026-07-17): reasoning caps go WEEKLY --
--   free 주 2회 · soma/cortex(=plus) 주 7회 · brain(=pro) 무제한
-- replacing the monthly 30/60/60/unlimited of 0077/0088.
--
-- Shape: reasoning usage is now counted on KST ISO-week rows ('IYYY-Wnn') in
-- the SAME usage_counters table; rewarded credits stay MONTHLY ('YYYY-MM',
-- granted by 0075 / SSV 0079 -- those RPCs are untouched). A watch's +2 keeps
-- stretching the allowance across the whole month: once the weekly base is
-- spent, each further run CONSUMES one credit (new reward_consumed column, so
-- a credit spent in week 1 is gone in week 2).
--
-- Hardening over 0077/0088: the bucket strings are now DERIVED SERVER-SIDE
-- from now() in Asia/Seoul -- p_month joins p_cap as an ignored back-compat
-- parameter. Under 0077 a tampered client could rotate p_month to mint fresh
-- rows and dodge the cap through the honest RPC; now it cannot. (Skipping the
-- RPC entirely remains the documented residual until the proxy-side gate.)
--
-- Client mirror: src/lib/entitlements/tier-map.ts REASONING_PER_WEEK and
-- usage.ts weekBucket()/getReasoningUsage() -- the structural test
-- (reasoning-weekly-cap-migration.test.ts) pins the CASE arms to tier-map and
-- both bucket formats to the TS helpers. Judge comp + expiry come from
-- effective_subscription_tier (0088), unchanged.

-- Credit consumption ledger: how many of the month's earned credits are spent.
ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS reward_consumed int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_reasoning_usage_if_under_cap(
  p_user_id uuid,
  p_month text, -- IGNORED (kept for signature/back-compat); buckets are server-derived
  p_cap int     -- IGNORED (kept for signature/back-compat); the cap is server-derived
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_tier text;
  v_cap int;  -- NULL = unlimited (brain)
  v_week text;
  v_mon text;
  v_kst timestamp;
  v_credit_rows int;
BEGIN
  -- Caller must be the row owner.
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Server-derived KST buckets (client input ignored -- no bucket rotation).
  v_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_week := to_char(v_kst, 'IYYY-"W"IW');  -- ISO week, e.g. 2026-W29
  v_mon  := to_char(v_kst, 'YYYY-MM');

  -- Effective tier: judge comp + expiry-aware (0088). Values MUST match
  -- src/lib/entitlements/tier-map.ts REASONING_PER_WEEK.
  v_tier := public.effective_subscription_tier(p_user_id);
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN NULL   -- unlimited
    WHEN 'cortex' THEN 7
    WHEN 'soma'   THEN 7
    ELSE 2                    -- free (주 2회, Simon 2026-07-17)
  END;

  -- Unlimited tier: increment the week row without a cap gate.
  IF v_cap IS NULL THEN
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, v_week, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1,
          updated_at = now()
    RETURNING reasoning_used INTO v_count;
    RETURN v_count;
  END IF;

  -- Capped tier, step 1: atomic bump within the weekly base allowance.
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
  VALUES (p_user_id, v_week, 1)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reasoning_used = uc.reasoning_used + 1,
        updated_at = now()
    WHERE uc.reasoning_used < v_cap
  RETURNING reasoning_used INTO v_count;

  IF v_count IS NOT NULL THEN
    RETURN v_count;
  END IF;

  -- Step 2: weekly base spent -- consume ONE monthly rewarded credit, if any.
  -- The guarded UPDATE is the atomic permission; only on success does the week
  -- row increment (unconditionally, since the credit already paid for it).
  UPDATE public.usage_counters
     SET reward_consumed = reward_consumed + 1,
         updated_at = now()
   WHERE user_id = p_user_id
     AND month_bucket = v_mon
     AND reward_credits > reward_consumed;
  GET DIAGNOSTICS v_credit_rows = ROW_COUNT;

  IF v_credit_rows = 0 THEN
    RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
  VALUES (p_user_id, v_week, 1)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reasoning_used = uc.reasoning_used + 1,
        updated_at = now()
  RETURNING reasoning_used INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) TO authenticated;
