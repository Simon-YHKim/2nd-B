-- 0070_reasoning_usage_cap.sql
-- Server-side ATOMIC cap for the reasoning-run counter (별바라기 / 항해자 /
-- 북극성 tiers), mirroring 0026's atomic chat-usage RPC.
--
-- Background: reasoning runs (chat "깊이 묻기", 세컨비 northstar / axis proposals)
-- are gated ONLY on the client today (getReasoningUsage + a soft check). A
-- bypassed or parallel client can read the same `used` in several requests and
-- each one bills an opus/sonnet reasoning call. This RPC collapses check-and-bump
-- into one atomic statement so the row lock + cap check + increment happen in a
-- single transaction — the same fix 0026 applied to chat_usage.
--
-- The effective limit is p_cap + reward_credits (mirrors remainingReasoning in
-- src/lib/entitlements/reasoning-cap.ts: rewarded watch-to-earn credits add to
-- the monthly allowance). The caller passes the tier's base cap; unlimited tiers
-- (북극성 / brain) must NOT call this (they have no cap). p_month is the KST
-- 'YYYY-MM' bucket from usage.ts monthBucket().
--
-- Wiring note (follow-up, NOT in this migration): the LLM proxy enforcement that
-- CALLS this RPC for reasoning purposes (claude-proxy / gemini-proxy) touches the
-- paid-AI cost boundary and the client increment path (double-count avoidance),
-- so it ships separately after runtime testing + Simon's go. This migration is
-- the safe, additive foundation: an unused RPC changes no behavior until adopted.

CREATE OR REPLACE FUNCTION public.bump_reasoning_usage_if_under_cap(
  p_user_id uuid,
  p_month text,
  p_cap int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  -- Caller must be the row owner (same guard the client RLS path enforces).
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_cap <= 0 THEN
    RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic insert-or-increment with a cap gate. The effective limit includes the
  -- row's rewarded credits (p_cap + reward_credits). If the WHERE clause filters
  -- the row out, no row is returned, v_count stays NULL, and we raise.
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reasoning_used = uc.reasoning_used + 1,
        updated_at = now()
    WHERE uc.reasoning_used < p_cap + uc.reward_credits
  RETURNING reasoning_used INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) TO authenticated;
