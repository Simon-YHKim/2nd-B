-- 0040_insert_guard_and_crisis_rpc.sql
-- Re-audit round 4 (2026-06-04) -- two HIGH findings, DB side.
--
-- H2 (users INSERT self-escalation): every protected-column guard is UPDATE-only.
--   block_self_tier_change is BEFORE UPDATE (0034/0037/0038), the 0025 column
--   REVOKE only blocks UPDATE, and users_self_insert (0009) checks only
--   id = auth.uid(). So a brand-new user can POST /rest/v1/users with
--   subscription_tier='brain', subscription_expires_at='2099-..', total_xp=999999
--   and KEEP it -- a free user self-grants the top paid tier + max level. Fix: a
--   BEFORE INSERT trigger that, for non-service_role callers, OVERWRITES the
--   server-controlled columns back to their safe defaults (overwrite, not RAISE,
--   so sign-up still succeeds). Mirrors block_self_tier_change for the INSERT side.
--   (judge_mode is already forced on INSERT by auto_judge_mode/0010, so it is not
--   re-handled here.)
--
-- H3 (crisis_events RLS deny-all silently drops client RED logging): crisis_events
--   is RLS-on with NO policies (0012, service-role-only by design), but the prod
--   write path insertCrisisEvent runs as the authenticated client, so every
--   client-side RED insert (callAdvisor input-RED + both output-swaps) throws and
--   is swallowed by console.warn -- the C3-adjacent crisis ledger never fills. The
--   input-RED + web-lexicon paths short-circuit BEFORE the proxy, so a server-only
--   proxy write can't cover them. Fix (mirror log_ai_audit/0038): a SECURITY
--   DEFINER RPC log_crisis_event() that writes server-side, stamps user_id_hash
--   from auth.uid() (unforgeable; md5 is a stronger, still-non-reversible-without-
--   the-id obfuscation than the prior client djb2 -- see L10 for salted-SHA256),
--   and is callable ONLY by authenticated (anon/service_role revoked up front per
--   the 0038->0039 lesson).
--
-- Idempotent. Applied + verified on prod before the commit that carries this file.

-- ---- H2: users INSERT self-escalation guard --------------------------------
CREATE OR REPLACE FUNCTION public.block_self_tier_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Normal sign-up (authenticated POST to /rest/v1/users): force the
  -- server-controlled columns to their safe defaults so a crafted INSERT cannot
  -- self-grant a paid tier or XP. Overwrite (not RAISE) so sign-up still works.
  NEW.subscription_tier := 'free';
  NEW.subscription_expires_at := NULL;
  NEW.subscription_provider := NULL;
  NEW.total_xp := 0;
  NEW.onboarding_quest_completed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_block_self_insert ON users;
CREATE TRIGGER trg_users_block_self_insert
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION block_self_tier_insert();

-- ---- H3: server-side crisis_events write via SECURITY DEFINER RPC -----------
CREATE OR REPLACE FUNCTION public.log_crisis_event(
  p_classifier_confidence    numeric,
  p_trigger_categories       text[],
  p_cssrs_level              integer,
  p_routing_template_version text,
  p_locale                   text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_locale NOT IN ('ko', 'en') THEN
    RAISE EXCEPTION 'log_crisis_event: invalid locale %', p_locale USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.crisis_events (
    user_id_hash, zone, classifier_confidence, trigger_categories,
    cssrs_level, routing_template_version, locale
  ) VALUES (
    -- Stamped server-side from the authenticated caller -- never client input.
    md5(auth.uid()::text),
    'red',
    p_classifier_confidence,
    COALESCE(p_trigger_categories, '{}'),
    p_cssrs_level,
    p_routing_template_version,
    p_locale
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.log_crisis_event(numeric, text[], integer, text, text) TO authenticated;
