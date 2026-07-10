-- 0075_reward_credits_cap.sql
-- Server-side ATOMIC, SERVER-CAPPED grant for rewarded watch-to-earn credits.
--
-- Background: rewarded credits were written by the client as a non-atomic
-- select-then-upsert with NO monthly ceiling (src/lib/entitlements/usage.ts
-- addRewardCredits), so a tampered or replayed client could self-grant unlimited
-- reasoning credits (audit M4) - which directly buys unlimited reasoning runs
-- because 0070 gates on reasoning_used < p_cap + reward_credits.
--
-- SECURITY: the ceiling is SERVER-OWNED, not a parameter. An earlier draft took
-- the cap as p_cap from the caller; since the CLIENT is the caller (unlike 0070,
-- which is called by a trusted server proxy), a tampered client could pass an
-- arbitrarily large p_cap/p_credits and self-grant. This version hardcodes the
-- monthly cap and per-call max inside the function and IGNORES any client value,
-- so the ceiling holds even against a hand-rolled RPC call. The constants MUST be
-- kept in sync with src/lib/entitlements/tiers.ts (REWARD_MONTHLY_CAP,
-- REWARD_PER_WATCH); the migration structural test asserts the numbers match.
--
-- Scope note: this closes the UNCAPPED self-grant hole. It does NOT verify an ad
-- was actually watched (AdMob server-side verification) - that is the separate D2
-- reward-SSV follow-up. Direct client column writes remain possible until the
-- usage_counters REVOKE lands (D1 Stage 3); this RPC is the server-owned write
-- path the client uses now.
--
-- p_month is the KST 'YYYY-MM' bucket from usage.ts monthBucket(). Returns the
-- resulting reward_credits balance.

CREATE OR REPLACE FUNCTION public.bump_reward_credits_if_under_cap(
  p_user_id uuid,
  p_month text,
  p_credits int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_credits int;
  v_grant int;
  -- Server-owned ceilings. MUST match src/lib/entitlements/tiers.ts:
  --   c_monthly_cap = REWARD_MONTHLY_CAP (20), c_per_call = REWARD_PER_WATCH (2).
  c_monthly_cap constant int := 20;
  c_per_call constant int := 2;
BEGIN
  -- Caller must be the row owner (same guard the client RLS path enforces).
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Never trust the client-supplied amount: one call grants at most one watch.
  v_grant := LEAST(GREATEST(COALESCE(p_credits, 0), 0), c_per_call);

  -- Nothing to grant: return the current balance without a write.
  IF v_grant = 0 THEN
    SELECT COALESCE(reward_credits, 0) INTO v_credits
      FROM public.usage_counters
      WHERE user_id = p_user_id AND month_bucket = p_month;
    RETURN COALESCE(v_credits, 0);
  END IF;

  -- Atomic insert-or-add, clamped to the SERVER monthly cap. GREATEST(...) never
  -- claws back a pre-existing balance that is already above the cap.
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reward_credits)
  VALUES (p_user_id, p_month, LEAST(v_grant, c_monthly_cap))
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reward_credits = GREATEST(uc.reward_credits, LEAST(uc.reward_credits + v_grant, c_monthly_cap)),
        updated_at = now()
  RETURNING reward_credits INTO v_credits;

  RETURN v_credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) TO authenticated;
