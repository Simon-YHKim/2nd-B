-- 0026_atomic_chat_usage.sql
-- Codex challenge follow-up R2 (docs/security/2026-05-26-codex-challenge.md).
--
-- Problem: the existing flow is
--   1. SELECT count   → client reads `used`
--   2. compare to cap  → client decides allowed/blocked
--   3. call LLM
--   4. INSERT/UPDATE   → bump_chat_usage()
-- Between steps 1 and 4 the user can fire N parallel requests; all of them
-- see the same `used`, all of them pass the client-side cap check, and all
-- of them bump the counter and bill an LLM call. With the Brain tier cap
-- of 250 a malicious client could call Gemini ~349 times in a single day
-- before chat_usage finally exceeds the cap.
--
-- Fix: collapse check-and-bump into a single atomic SQL statement. The
-- new RPC takes the cap as a parameter, uses INSERT ... ON CONFLICT DO
-- UPDATE ... WHERE cu.count < p_cap so the row lock + count check + bump
-- happen in one tx. If the cap is reached the UPDATE WHERE clause filters
-- the row, RETURNING yields no row, the count comes back NULL, and we
-- RAISE 'chat_limit_exceeded'. The client wraps the call in try/catch.

CREATE OR REPLACE FUNCTION public.bump_chat_usage_if_under_cap(
  p_user_id uuid,
  p_day date,
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
  -- Same caller-uid guard as bump_chat_usage.
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_cap <= 0 THEN
    RAISE EXCEPTION 'chat_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic insert-or-increment with cap gate.
  INSERT INTO public.chat_usage AS cu (user_id, day, count)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = cu.count + 1
    WHERE cu.count < p_cap
  RETURNING count INTO v_count;

  -- If the WHERE clause filtered out the row, no row is returned and
  -- v_count stays NULL. That means the cap was already reached.
  IF v_count IS NULL THEN
    RAISE EXCEPTION 'chat_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) TO authenticated;

-- The old bump_chat_usage stays for backward compatibility (it's still
-- referenced by SQL tests and the type-generated client). We may drop
-- it in a later migration once nothing calls it.
COMMENT ON FUNCTION public.bump_chat_usage(uuid, date) IS
  'DEPRECATED — use bump_chat_usage_if_under_cap. Kept for backward compat.';
