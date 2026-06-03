-- 0034_fix_award_xp_trigger.sql
-- HIGH bug (2026-06-03 audit): the 0025 block_self_tier_change BEFORE UPDATE
-- trigger raises 42501 on ANY total_xp change unless request.jwt.claim.role =
-- 'service_role'. award_xp (0019) is SECURITY DEFINER, but that does NOT change
-- the caller's request.jwt.* GUCs -- for an authenticated PostgREST caller the
-- role stays 'authenticated', so the trigger aborts EVERY XP award. awardXpSafe()
-- swallows the error to a console.warn, so XP/leveling is silently broken in prod
-- (onboarding quest + levels never advance). CI never caught it because the
-- dry-run runs on vanilla Postgres and never calls award_xp under an authed JWT.
--
-- Fix: award_xp sets a transaction-local marker before its write; the guard
-- honors that marker ONLY for the server-derived progression columns (total_xp,
-- onboarding_quest_completed_at) while STILL blocking self-changes to
-- subscription_*/judge_mode even within the marked transaction. The 0025 REVOKE
-- keeps direct client writes blocked, and a PostgREST request cannot inject
-- set_config, so the marker is only ever set by this definer RPC.
--
-- Behavioral verification needs a live Supabase (auth.uid()/request.jwt.* GUCs);
-- the dry-run only validates syntax. Apply to prod after verifying on a branch.

-- Marker-aware guard: defense preserved, XP/onboarding writes authorized only via
-- the transaction-local marker award_xp sets.
CREATE OR REPLACE FUNCTION public.block_self_tier_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_xp_write boolean := current_setting('app.allow_xp_write', true) = '1';
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- subscription tier + judge_mode are NEVER self-writable (even during an XP
  -- award; award_xp never touches them, so NEW = OLD there in practice).
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.subscription_provider IS DISTINCT FROM OLD.subscription_provider
     OR NEW.judge_mode IS DISTINCT FROM OLD.judge_mode THEN
    RAISE EXCEPTION 'protected user column may only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;
  -- total_xp + onboarding_quest_completed_at: server-derived, only the SECURITY
  -- DEFINER award_xp RPC may change them (signalled by its transaction-local
  -- marker). A direct client UPDATE has neither the privilege (0025 REVOKE) nor
  -- the marker, so it is still rejected.
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

-- Recreate award_xp identical to 0019 except it authorizes its own protected
-- write via the transaction-local marker the guard honors.
CREATE OR REPLACE FUNCTION public.award_xp(p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_rule  public.xp_rules%ROWTYPE;
  v_total int;
  v_level int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'award_xp: not authenticated';
  END IF;
  SELECT * INTO v_rule FROM public.xp_rules WHERE action = p_action;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_xp: unknown action %', p_action;
  END IF;
  IF v_rule.once_only AND EXISTS (
    SELECT 1 FROM public.xp_events WHERE user_id = v_uid AND action = p_action
  ) THEN
    SELECT total_xp INTO v_total FROM public.users WHERE id = v_uid;
    RETURN jsonb_build_object('awarded', 0, 'total_xp', v_total,
      'level', public.level_for_xp(v_total), 'duplicate', true);
  END IF;
  -- Authorize the protected-column write for THIS transaction only. is_local =
  -- true => reset at transaction end; a PostgREST client cannot call set_config.
  PERFORM set_config('app.allow_xp_write', '1', true);
  UPDATE public.users SET total_xp = total_xp + v_rule.xp_value
    WHERE id = v_uid RETURNING total_xp INTO v_total;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'award_xp: no users row for %', v_uid;
  END IF;
  v_level := public.level_for_xp(v_total);
  INSERT INTO public.xp_events (user_id, action, xp_delta, total_after, level_after)
    VALUES (v_uid, p_action, v_rule.xp_value, v_total, v_level);
  RETURN jsonb_build_object('awarded', v_rule.xp_value, 'total_xp', v_total,
    'level', v_level, 'duplicate', false);
END;
$$;
