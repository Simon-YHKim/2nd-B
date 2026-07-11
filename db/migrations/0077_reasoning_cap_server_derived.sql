-- 0077_reasoning_cap_server_derived.sql
-- Make the atomic reasoning cap SERVER-DERIVED and adopt it (D1 Stage 2, audit M1).
--
-- 0070 added an atomic reasoning-cap RPC but (a) it was NEVER CALLED - the client
-- used a non-atomic, fail-open select-then-upsert (usage.ts incrementReasoningUsage)
-- - and (b) it took the cap as p_cap from the caller. This migration redefines the
-- RPC to derive the monthly cap from the user's subscription_tier server-side
-- (ignoring any client-supplied p_cap), and usage.ts is switched to call it, so
-- the honest client path is now atomic and cannot spoof its own cap or fail open.
--
-- NOTE on the residual threat: like the chat cap, a *tampered* client can still
-- skip this RPC entirely; making reasoning enforcement fully tamper-proof requires
-- the LLM proxy to count reasoning purposes server-side, which needs a validated
-- purpose->cap mapping and double-count handling - deferred as a flag-gated
-- follow-up (D1 Stage 2 proxy gate). This migration closes the cap-spoof /
-- non-atomic / fail-open holes now.
--
-- Caps MUST match src/lib/entitlements/reasoning-cap.ts reasoningCapForTier:
--   free 30, soma 60, cortex 60, brain unlimited. The effective limit adds the
--   row's rewarded credits (capped separately by 0075). p_month is the KST
--   'YYYY-MM' bucket from usage.ts monthBucket().

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
  -- Caller must be the row owner.
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Server-derive the monthly cap from the tier; client p_cap is ignored (M1).
  SELECT subscription_tier INTO v_tier FROM public.users WHERE id = p_user_id;
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN NULL   -- unlimited
    WHEN 'cortex' THEN 60
    WHEN 'soma'   THEN 60
    ELSE 30                   -- free (30/mo, Simon 2026-07-11)
  END;

  -- Unlimited tier: increment without a cap gate.
  IF v_cap IS NULL THEN
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, p_month, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1,
          updated_at = now()
    RETURNING reasoning_used INTO v_count;
    RETURN v_count;
  END IF;

  -- Capped tier: atomic check-and-bump. Effective limit = v_cap + rewarded credits.
  -- If the WHERE clause filters the row out, v_count stays NULL and we raise.
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
