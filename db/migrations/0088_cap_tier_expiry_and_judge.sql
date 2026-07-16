-- 0088_cap_tier_expiry_and_judge.sql
-- U5 (commerce audit): the cap RPCs read subscription_tier but never checked
-- subscription_expires_at, so a lapsed subscription kept paid caps forever --
-- the entitlement never actually expired anywhere. And C6 judge accounts had no
-- comp entitlement: a judge evaluating the app could hit the free 5/day chat gate.
--
-- Fix (handoff option (a): read-time derivation, no cron, effective immediately):
-- one helper derives the EFFECTIVE tier -- judge_mode comps to 'brain' (C6),
-- an expired subscription collapses to 'free' -- and both cap RPCs
-- (0076 chat / 0077 reasoning) are redefined to use it. Bodies are otherwise
-- byte-equivalent to 0076/0077; signatures and grants unchanged. A NULL
-- subscription_expires_at means non-expiring (manually granted tiers keep working).
--
-- The webhook path (0087) still writes tier down on subscription.canceled; this
-- covers the lapse window where no webhook arrives (missed delivery, dunning).
-- Caps MUST stay in sync with src/lib/chat/limits.ts CHAT_DAILY_LIMIT and
-- src/lib/entitlements/reasoning-cap.ts reasoningCapForTier (structural test).

-- Effective tier, service-internal. Called from inside the SECURITY DEFINER cap
-- RPCs (definer context executes it); client roles cannot call it directly.
CREATE OR REPLACE FUNCTION public.effective_subscription_tier(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN u.judge_mode THEN 'brain'  -- C6 comp entitlement: judges evaluate uncapped
    WHEN u.subscription_expires_at IS NOT NULL
         AND u.subscription_expires_at < now() THEN 'free'  -- lapsed -> free (U5)
    ELSE COALESCE(u.subscription_tier, 'free')
  END
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.effective_subscription_tier(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.effective_subscription_tier(uuid) FROM anon, authenticated;

-- Chat cap (0076 body, tier lookup swapped for the effective-tier helper).
CREATE OR REPLACE FUNCTION public.bump_chat_usage_if_under_cap(
  p_user_id uuid,
  p_day date,
  p_cap int  -- IGNORED (kept for signature/back-compat); the cap is server-derived
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_tier text;
  v_cap int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Effective tier: judge comp + expiry-aware (0088). Values MUST match
  -- src/lib/chat/limits.ts CHAT_DAILY_LIMIT.
  v_tier := public.effective_subscription_tier(p_user_id);
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN 250
    WHEN 'cortex' THEN 80
    WHEN 'soma'   THEN 30
    ELSE 5                    -- free (5/day, Simon 2026-07-11)
  END;

  IF v_cap <= 0 THEN
    RAISE EXCEPTION 'chat_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chat_usage AS cu (user_id, day, count)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = cu.count + 1
    WHERE cu.count < v_cap
  RETURNING count INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'chat_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) TO authenticated;

-- Reasoning cap (0077 body, same swap).
CREATE OR REPLACE FUNCTION public.bump_reasoning_usage_if_under_cap(
  p_user_id uuid,
  p_month text,
  p_cap int  -- IGNORED (kept for signature/back-compat); the cap is server-derived
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
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Effective tier: judge comp + expiry-aware (0088). Values MUST match
  -- src/lib/entitlements/reasoning-cap.ts reasoningCapForTier.
  v_tier := public.effective_subscription_tier(p_user_id);
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN NULL   -- unlimited
    WHEN 'cortex' THEN 60
    WHEN 'soma'   THEN 60
    ELSE 30                   -- free (30/mo, Simon 2026-07-11)
  END;

  IF v_cap IS NULL THEN
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, p_month, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1,
          updated_at = now()
    RETURNING reasoning_used INTO v_count;
    RETURN v_count;
  END IF;

  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reasoning_used = uc.reasoning_used + 1,
        updated_at = now()
    WHERE uc.reasoning_used < v_cap + uc.reward_credits
  RETURNING reasoning_used INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) TO authenticated;
