-- 0090_chat_ad_bonus.sql
-- Phase 4 (Simon 확정 2026-07-17): rewarded ads can top up the CHAT daily cap --
-- one watch grants +2 chat sends for TODAY (KST), earnable up to 20 credits per
-- KST month. This is a NEW ledger beside the reasoning watch-to-earn (0075/0079
-- -- kept, per Simon: "채팅 +2 신설 + 리즈닝 리워드도 유지"); each kind caps
-- monthly on its own so ads can never fully replace a subscription.
--
-- Shape:
--   chat_usage.ad_bonus          -- today's extra allowance (resets with the day row)
--   usage_counters.chat_ad_credits -- monthly earned ledger ('YYYY-MM' rows), cap 20
--   bump_chat_usage_if_under_cap -- 0088 body + the allowance is v_cap + ad_bonus
--   grant_chat_ad_bonus          -- atomic earn: monthly guard then today's bonus
--
-- Buckets/day are DERIVED SERVER-SIDE (KST), like 0089. The direct grant RPC is
-- the default-off-SSV dev seam (mirrors 0075's bump_reward_credits path); when
-- EXPO_PUBLIC_REWARD_SSV goes on for chat, the SSV callback must call the same
-- guarded grant so the ceiling holds -- extending rewarded-ssv is that later
-- change's job, deliberately NOT smuggled in here.
--
-- Caps MUST stay in sync with src/lib/chat/limits.ts CHAT_DAILY_LIMIT and
-- src/lib/entitlements/tiers.ts REWARD_PER_WATCH / REWARD_MONTHLY_CAP
-- (structural test: chat-ad-bonus-migration.test.ts).

ALTER TABLE public.chat_usage
  ADD COLUMN IF NOT EXISTS ad_bonus int NOT NULL DEFAULT 0;

ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS chat_ad_credits int NOT NULL DEFAULT 0;

-- Chat cap bump: 0088 body, with today's allowance widened by ad_bonus.
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

  -- Today's allowance = tier cap + rewarded ad bonus (0090).
  INSERT INTO public.chat_usage AS cu (user_id, day, count)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = cu.count + 1
    WHERE cu.count < v_cap + cu.ad_bonus
  RETURNING count INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'chat_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) TO authenticated;

-- Rewarded earn for chat: +2 to TODAY's allowance, at most 20 credits per KST
-- month. The monthly guard is the atomic permission; only on success does the
-- day row gain its bonus. Day and month are server-derived (KST) so a tampered
-- client cannot rotate either. Returns today's total ad_bonus.
CREATE OR REPLACE FUNCTION public.grant_chat_ad_bonus(
  p_user_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
  v_mon text;
  v_kst timestamp;
  v_rows int;
  v_bonus int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  v_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_day := v_kst::date;
  v_mon := to_char(v_kst, 'YYYY-MM');

  -- Monthly ceiling: 20 credits => a +2 grant only while credits <= 18.
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, chat_ad_credits)
  VALUES (p_user_id, v_mon, 2)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET chat_ad_credits = uc.chat_ad_credits + 2,
        updated_at = now()
    WHERE uc.chat_ad_credits <= 18;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'chat_reward_cap_reached' USING ERRCODE = 'P0001';
  END IF;

  -- The credit already paid for it: widen today's allowance unconditionally.
  INSERT INTO public.chat_usage AS cu (user_id, day, count, ad_bonus)
  VALUES (p_user_id, v_day, 0, 2)
  ON CONFLICT (user_id, day) DO UPDATE
    SET ad_bonus = cu.ad_bonus + 2
  RETURNING ad_bonus INTO v_bonus;
  RETURN v_bonus;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_chat_ad_bonus(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_chat_ad_bonus(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_chat_ad_bonus(uuid) TO authenticated;
