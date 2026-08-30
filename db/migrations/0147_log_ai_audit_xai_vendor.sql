-- 0147: log_ai_audit accepts 'xai' as a reasoning vendor.
--
-- WHY: 0095's vendor allowlist was written when three proxies existed
-- (gemini, claude, openai). xai-proxy joined on 2026-08-21 (#1317, Simon:
-- "grok 투입 그냥 해") and the client records reasoning_vendor = 'xai' for
-- calls it serves — but the CASE below turned that into NULL, so every
-- xai-served row in ai_audit_log has been logged WITHOUT its vendor. Found by
-- the T1 residue sweep's completeness critic on 2026-08-30 (side finding,
-- docs/GEMINI-RETIREMENT-INVENTORY.md). The ledger is the only place anyone
-- can check which vendor did what; a NULL here is a hole in that ledger.
--
-- 'gemini' stays in the list ON PURPOSE: old installed builds still call
-- gemini-proxy until the alpha track carries a post-rework build, and their
-- rows must keep their vendor. The retirement PR removes it together with the
-- proxy, not before.
--
-- Body is 0095's verbatim except the one IN list. CREATE OR REPLACE keeps the
-- existing ACL, but the grants are restated per house rule (0039/0095): a
-- reader of this file must not have to trust that.

CREATE OR REPLACE FUNCTION public.log_ai_audit(
  p_prompt_hash      text,
  p_output_hash      text,
  p_model_used       text,
  p_vertex_backend   boolean,
  p_safety_zone      text,
  p_latency_ms       integer,
  p_purpose          text DEFAULT NULL,
  p_reasoning_vendor text DEFAULT NULL,
  p_reasoning_effort text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_purpose text;
  v_vendor  text;
  v_effort  text;
BEGIN
  IF p_safety_zone NOT IN ('green', 'yellow', 'red') THEN
    RAISE EXCEPTION 'log_ai_audit: invalid safety_zone %', p_safety_zone
      USING ERRCODE = '22023';
  END IF;
  v_purpose := NULLIF(left(btrim(p_purpose), 64), '');
  v_vendor  := CASE
    WHEN p_reasoning_vendor IN ('gemini', 'claude', 'openai', 'xai') THEN p_reasoning_vendor
  END;
  v_effort  := CASE
    WHEN p_reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'none') THEN p_reasoning_effort
  END;
  INSERT INTO public.ai_audit_log (
    user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms,
    purpose, reasoning_vendor, reasoning_effort
  ) VALUES (
    auth.uid(),
    p_prompt_hash,
    p_output_hash,
    p_model_used,
    p_vertex_backend,
    p_safety_zone::public.safety_zone,
    p_latency_ms,
    v_purpose,
    v_vendor,
    v_effort
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) IS
  'C3 audit insert (0095 signature). reasoning_vendor allowlist: gemini, claude, openai, xai (0147). Other values become NULL.';
