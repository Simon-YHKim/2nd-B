-- 0076_chat_cap_server_derived.sql
-- Make the atomic chat-usage cap SERVER-DERIVED (D1 Stage 2, audit M3).
--
-- 0026 made bump_chat_usage_if_under_cap atomic, but it took the cap as p_cap -
-- and the CLIENT is the caller (src/lib/chat/conversation.ts passes
-- CHAT_DAILY_LIMIT[input.tier], where input.tier comes from the client-held
-- progression). A tampered client can therefore pass tier='brain' (or an
-- arbitrary p_cap) and lift its own free 2/day chat gate to 250/day (bounded only
-- by the separate per-day spend cap ~100x higher).
--
-- Fix: the RPC now looks up the user's subscription_tier server-side and derives
-- the cap itself, IGNORING the client-supplied p_cap. The signature is unchanged
-- (uuid, date, int) so existing callers keep working; p_cap is vestigial. This
-- mirrors how bump_gemini_spend already derives the daily call cap server-side.
--
-- The per-tier caps MUST stay in sync with src/lib/chat/limits.ts CHAT_DAILY_LIMIT
-- (the migration structural test asserts the numbers match).

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
  -- Same caller-uid guard as before.
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;

  -- Server-derive the daily cap from the user's tier; the client-supplied p_cap
  -- is deliberately ignored (audit M3). Values MUST match
  -- src/lib/chat/limits.ts CHAT_DAILY_LIMIT.
  SELECT subscription_tier INTO v_tier FROM public.users WHERE id = p_user_id;
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN 250
    WHEN 'cortex' THEN 80
    WHEN 'soma'   THEN 30
    ELSE 5                    -- free (5/day, Simon 2026-07-11)
  END;

  IF v_cap <= 0 THEN
    RAISE EXCEPTION 'chat_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic insert-or-increment with the SERVER cap gate.
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
