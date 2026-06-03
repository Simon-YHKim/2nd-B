-- 0035_gemini_spend_daily.sql
-- Audit HIGH (gemini-proxy spend cap): the daily Jarvis limit is enforced
-- client-side / via bump_chat_usage, but the gemini-proxy Edge Function itself
-- has no per-user/day cost backstop. Any authenticated caller (a free/unlimited
-- judge account, or anyone replaying a captured JWT) can loop full-length
-- gemini-2.5-pro prompts and bypass the daily cap -- a paid-API cost
-- amplification path the $0/mo promise (blueprint §5) explicitly guards against.
--
-- This adds a server-authoritative counter the proxy bumps on EVERY Gemini call
-- (chat, classify, persona, OCR, imagine -- all purposes, since the cap is a
-- cost backstop, NOT the product-level Jarvis chat cap which stays in
-- chat_usage). The proxy calls bump_gemini_spend() with the service-role key
-- BEFORE the upstream fetch; when the cap is reached the RPC raises and the
-- proxy returns 429 without spending an upstream call.

CREATE TABLE IF NOT EXISTS gemini_spend_daily (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  calls       int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day),
  CONSTRAINT gemini_spend_calls_nonneg CHECK (calls >= 0)
);

CREATE INDEX IF NOT EXISTS gemini_spend_user_day_idx ON gemini_spend_daily (user_id, day DESC);

ALTER TABLE gemini_spend_daily ENABLE ROW LEVEL SECURITY;

-- Owner may read their own spend (for a future "usage" surface); writes happen
-- ONLY through the service-role RPC below, never directly from a client.
DROP POLICY IF EXISTS gemini_spend_owner_select ON gemini_spend_daily;
CREATE POLICY gemini_spend_owner_select ON gemini_spend_daily
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- updated_at maintainer (re-uses set_updated_at from 0010_triggers.sql).
DROP TRIGGER IF EXISTS trg_gemini_spend_updated_at ON gemini_spend_daily;
CREATE TRIGGER trg_gemini_spend_updated_at
  BEFORE UPDATE ON gemini_spend_daily
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Atomic check-and-bump, mirroring bump_chat_usage_if_under_cap (0026): the
-- row lock + count check + increment happen in one statement so N parallel
-- proxy calls can't all read the same count and overspend. Raises
-- 'gemini_spend_exceeded' (P0001) when the cap is already reached.
--
-- SECURITY DEFINER and intended to be called ONLY by the proxy via the
-- service-role key, so it does NOT check auth.uid() (service role has none);
-- it trusts the user_id the proxy derives from the verified JWT. Execute is
-- revoked from PUBLIC/authenticated and granted only to service_role.
CREATE OR REPLACE FUNCTION public.bump_gemini_spend(
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
  v_calls int;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22004';
  END IF;
  IF p_cap <= 0 THEN
    RAISE EXCEPTION 'gemini_spend_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.gemini_spend_daily AS gs (user_id, day, calls)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET calls = gs.calls + 1
    WHERE gs.calls < p_cap
  RETURNING calls INTO v_calls;

  IF v_calls IS NULL THEN
    RAISE EXCEPTION 'gemini_spend_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_calls;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_gemini_spend(uuid, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_gemini_spend(uuid, date, int) TO service_role;
