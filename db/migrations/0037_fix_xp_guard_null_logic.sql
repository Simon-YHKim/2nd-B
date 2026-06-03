-- 0037_fix_xp_guard_null_logic.sql
-- Re-audit MED (proven on the live prod DB, 2026-06-03): 0034's guard declared
--   v_xp_write boolean := current_setting('app.allow_xp_write', true) = '1';
-- When the transaction-local marker is unset -- a direct authenticated client
-- UPDATE, the exact attack the guard exists to block -- current_setting(...,true)
-- returns NULL, so `NULL = '1'` is NULL, v_xp_write is NULL, and the protective
-- branch `NOT v_xp_write AND (total_xp IS DISTINCT FROM OLD.total_xp ...)`
-- evaluates `NOT NULL AND TRUE` = NULL. A NULL IF condition does NOT fire, so the
-- self-write of total_xp / onboarding_quest_completed_at was silently permitted
-- (an authenticated user could `update({ total_xp: 999999 })`). The unconditional
-- subscription/judge_mode branch was unaffected (no NULL there).
--
-- Fix: make the marker test NULL-safe with IS NOT DISTINCT FROM, so an unset
-- marker resolves to false ("not authorized"). award_xp (which sets the marker
-- to '1' via set_config before its UPDATE) still passes; service_role still
-- early-returns. Applied + verified on prod before this commit.
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
