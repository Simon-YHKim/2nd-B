-- 0095_ai_audit_purpose_rpc.sql
-- QA-F2 (2026-07-18 라이브 QA, docs/HANDOFF.md Latest): client-written
-- ai_audit_log rows carried NO purpose attribution — the native/direct path's
-- log_ai_audit RPC (0038) predates the 0073 re-decomposition columns
-- (purpose / reasoning_vendor / reasoning_effort / key_combo / total_tokens),
-- so every row the CLIENT writes (mock mode, output-swap, crisis routing,
-- direct/Vertex calls, proxy-audit fallback, the safety classifier) left them
-- NULL while the service-role proxies populate them. 0073's header explicitly
-- deferred this ("a follow-up can thread them through the RPC +
-- src/lib/supabase/audit.ts") — this is that follow-up.
--
-- Signature change: CREATE OR REPLACE cannot add parameters, so the 6-arg
-- function is DROPPED and recreated with three OPTIONAL params (DEFAULT NULL).
-- PostgREST matches named arguments against one function and fills defaults,
-- so an OLD client sending 6 named args keeps working against the NEW
-- function. The reverse is not true:
--
--   ⚠ APPLY ORDER (S5): apply this migration BEFORE merging the client that
--   sends the new named args (src/lib/supabase/audit.ts). A new client against
--   the old 6-arg function fails to match; the audit-write outbox then queues
--   and retries the row, so nothing is lost, but rows stall locally until the
--   migration lands.
--
-- key_combo / total_tokens stay proxy-only: the client cannot know which
-- server secret signed a call or the vendor's token usage.
--
-- Enrichment values are NORMALIZED, never rejected (only the pre-existing
-- safety_zone validation still raises): C3 prefers a row with a NULL
-- enrichment over losing the audit row entirely.

DROP FUNCTION IF EXISTS public.log_ai_audit(text, text, text, boolean, text, integer);

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
  -- Normalize the 0073 enrichment axes. purpose is free text (proxy labels like
  -- 'embed_index' / 'voice_transcribe' / 'safety_classify' included) — clamp
  -- length so an authenticated caller cannot stuff the column. vendor/effort
  -- take small allowlists (0073 column comments); anything else becomes NULL.
  v_purpose := NULLIF(left(btrim(p_purpose), 64), '');
  v_vendor  := CASE
    WHEN p_reasoning_vendor IN ('gemini', 'claude', 'openai') THEN p_reasoning_vendor
  END;
  v_effort  := CASE
    WHEN p_reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'none') THEN p_reasoning_effort
  END;
  -- user_id is the authenticated caller, stamped server-side — never client input.
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

-- Grants for the NEW signature (a dropped function loses its ACL). Explicit
-- anon REVOKE per house rule (0039: REVOKE FROM PUBLIC alone is insufficient).
REVOKE ALL ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer, text, text, text) TO authenticated;
