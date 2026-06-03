-- 0038_minor_tier_guard_and_audit_lockdown.sql
-- Re-audit round 3 (2026-06-03) — the two HIGH findings.
--
-- A1 (C10 minor-lock bypass): block_self_tier_change (0034/0037) protected
--   subscription*, judge_mode, total_xp, onboarding — but NOT minor_tier. A
--   minor_self user could `UPDATE users SET minor_tier='adult', privacy_prefs=
--   '{...all true...}'` in one statement: the age gate only fires OF birth_date
--   so it never re-derived minor_tier, and clamp_minor_privacy_prefs branched on
--   the CLIENT-supplied NEW.minor_tier='adult', so it skipped the clamp — the
--   14-17 high-privacy lock was defeated. Two independent fixes:
--     (a) block_self_tier_change now rejects a self-change of minor_tier UNLESS
--         birth_date is also changing (the only legitimate path — the age gate
--         re-derives minor_tier from birth_date and overwrites any client value).
--         minor_tier becomes server-only, exactly like judge_mode.
--     (b) clamp_minor_privacy_prefs now keys off COALESCE(OLD.minor_tier,
--         NEW.minor_tier): on UPDATE it uses the row's REAL (unforgeable) tier,
--         on INSERT (OLD is NULL) it uses the age-gate-derived NEW. So even if a
--         forged NEW.minor_tier ever slipped past (a), the clamp still fires for
--         a real minor.
--
-- A2 (C3 audit forge): 0011 audit_owner_insert granted authenticated a blanket
--   INSERT on ai_audit_log (WITH CHECK user_id = auth.uid() only), so a client
--   could forge or spam its own audit rows. Prod web already writes the
--   authoritative row server-side in gemini-proxy (service_role, bypasses RLS),
--   so the blanket grant is pure attack surface. Replace it with a SECURITY
--   DEFINER RPC (log_ai_audit) that stamps user_id := auth.uid() server-side,
--   validates the zone, and is the only authenticated write path; the blanket
--   INSERT policy is dropped. service_role writers (the proxy) are unaffected.
--   The direct/native client path now writes via the RPC (see
--   src/lib/supabase/audit.ts), so it keeps auditing without the forgeable grant.
--
-- Idempotent (CREATE OR REPLACE / DROP IF EXISTS). Applied + verified on prod
-- before the commit that carries this file.

-- ---- A1 (a): minor_tier is server-only (like judge_mode) -------------------
CREATE OR REPLACE FUNCTION public.block_self_tier_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_xp_write boolean := current_setting('app.allow_xp_write', true) IS NOT DISTINCT FROM '1';
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.subscription_provider IS DISTINCT FROM OLD.subscription_provider
     OR NEW.judge_mode IS DISTINCT FROM OLD.judge_mode THEN
    RAISE EXCEPTION 'protected user column may only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;
  -- minor_tier is derived from birth_date by the age gate (trg_enforce_user_age_tier,
  -- BEFORE INSERT OR UPDATE OF birth_date). Allow it to differ from OLD only when
  -- birth_date is ALSO changing (the age-gate path, which re-derives + overwrites
  -- it regardless of the client value). A standalone self-write is rejected — that
  -- was the C10 high-privacy escape.
  IF NEW.minor_tier IS DISTINCT FROM OLD.minor_tier
     AND NEW.birth_date IS NOT DISTINCT FROM OLD.birth_date THEN
    RAISE EXCEPTION 'minor_tier may only be changed by the age gate (via birth_date) or service_role'
      USING ERRCODE = '42501';
  END IF;
  IF NOT v_xp_write AND (
       NEW.total_xp IS DISTINCT FROM OLD.total_xp
       OR NEW.onboarding_quest_completed_at IS DISTINCT FROM OLD.onboarding_quest_completed_at
     ) THEN
    RAISE EXCEPTION 'total_xp / onboarding_quest_completed_at may only be changed by award_xp'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ---- A1 (b): clamp keys off the REAL (unforgeable) tier --------------------
CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs() RETURNS trigger AS $$
BEGIN
  -- On UPDATE, OLD.minor_tier is the row's real tier (a client cannot forge it
  -- past block_self_tier_change above); on INSERT, OLD is NULL so fall back to the
  -- age-gate-derived NEW.minor_tier. Either way a 14-17 minor is clamped.
  IF COALESCE(OLD.minor_tier, NEW.minor_tier) = 'minor_self' THEN
    NEW.privacy_prefs := COALESCE(NEW.privacy_prefs, '{}'::jsonb) || jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ---- A2: replace the forgeable client INSERT with a controlled RPC ---------
-- RLS must be on for the dropped policy to actually deny (no policy = deny).
ALTER TABLE public.ai_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_owner_insert ON ai_audit_log;

CREATE OR REPLACE FUNCTION public.log_ai_audit(
  p_prompt_hash    text,
  p_output_hash    text,
  p_model_used     text,
  p_vertex_backend boolean,
  p_safety_zone    text,
  p_latency_ms     integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_safety_zone NOT IN ('green', 'yellow', 'red') THEN
    RAISE EXCEPTION 'log_ai_audit: invalid safety_zone %', p_safety_zone
      USING ERRCODE = '22023';
  END IF;
  -- user_id is the authenticated caller, stamped server-side — never client input.
  INSERT INTO public.ai_audit_log (
    user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms
  ) VALUES (
    auth.uid(),
    p_prompt_hash,
    p_output_hash,
    p_model_used,
    p_vertex_backend,
    p_safety_zone::public.safety_zone,
    p_latency_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.log_ai_audit(text, text, text, boolean, text, integer) TO authenticated;
