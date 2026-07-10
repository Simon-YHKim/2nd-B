-- 0075_reward_credits_cap.sql
-- Server-side ATOMIC, CAPPED grant for rewarded watch-to-earn credits, mirroring
-- 0070's atomic reasoning-cap RPC.
--
-- Background: rewarded credits were written by the client as a non-atomic
-- select-then-upsert with NO monthly ceiling (src/lib/entitlements/usage.ts
-- addRewardCredits), so a tampered or replayed client could self-grant unlimited
-- reasoning credits (audit M4). This RPC collapses read-add-clamp into one atomic
-- statement, clamped to REWARD_MONTHLY_CAP (src/lib/entitlements/tiers.ts = 20),
-- so ads can never exceed the monthly ceiling even under concurrency.
--
-- Scope note: this closes the UNCAPPED-amount hole. It does NOT verify an ad was
-- actually watched (AdMob server-side verification, SSV) - that is the separate
-- D2 reward-SSV follow-up. Direct client writes are still possible until the
-- usage_counters column REVOKE lands (D1 Stage 3); once the client routes through
-- this RPC and the columns are locked, the ceiling is fully enforced.
--
-- p_month is the KST 'YYYY-MM' bucket from usage.ts monthBucket(). Returns the
-- resulting reward_credits balance.

CREATE OR REPLACE FUNCTION public.bump_reward_credits_if_under_cap(
  p_user_id uuid,
  p_month text,
  p_credits int,
  p_cap int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_credits int;
BEGIN
  -- Caller must be the row owner (same guard the client RLS path enforces).
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Nothing to grant: return the current balance without a write.
  IF p_credits <= 0 OR p_cap <= 0 THEN
    SELECT COALESCE(reward_credits, 0) INTO v_credits
      FROM public.usage_counters
      WHERE user_id = p_user_id AND month_bucket = p_month;
    RETURN COALESCE(v_credits, 0);
  END IF;

  -- Atomic insert-or-add, CLAMPED to the monthly cap so ads can never exceed it.
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reward_credits)
  VALUES (p_user_id, p_month, LEAST(p_credits, p_cap))
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reward_credits = LEAST(uc.reward_credits + p_credits, p_cap),
        updated_at = now()
  RETURNING reward_credits INTO v_credits;

  RETURN v_credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int, int) TO authenticated;
