-- 0025_security_hardening.sql
-- Security audit (docs/security/2026-05-26-SUMMARY.md) findings C1 + C2.
--
-- C1 — Subscription tier tampering
--   Problem: users_self_update RLS uses USING/WITH CHECK (id = auth.uid())
--   which lets the row owner UPDATE any column, including subscription_tier.
--   A client running `UPDATE users SET subscription_tier='brain' WHERE id =
--   auth.uid()` is accepted by RLS — paid tier without paying.
--   Fix: REVOKE UPDATE on the subscription/profile columns from `authenticated`.
--   Service-role (RevenueCat webhook / OAuth Edge Function) keeps the right
--   via the implicit superuser bypass. The user can still UPDATE locale,
--   consent_share_with_judges, etc.
--
-- C2 — chat_usage counter reset
--   Problem: chat_usage_owner_all is FOR ALL, so the owner can UPDATE or
--   DELETE their own row to reset the daily counter.
--   Fix: Replace with SELECT-only policy. bump_chat_usage becomes the only
--   write path; change it to SECURITY DEFINER + SET search_path = '' so it
--   bypasses RLS as the function owner.

----------------------------------------------------------------------
-- C1: lock down sensitive user columns
----------------------------------------------------------------------

REVOKE UPDATE (
  subscription_tier,
  subscription_expires_at,
  subscription_provider,
  judge_mode,
  total_xp,
  onboarding_quest_completed_at
) ON public.users FROM authenticated;

-- A defense-in-depth trigger: even if a future migration accidentally
-- re-grants UPDATE on these columns, the trigger blocks self-changes.
-- service_role bypasses RLS entirely so its writes still go through.
CREATE OR REPLACE FUNCTION public.block_self_tier_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.subscription_provider IS DISTINCT FROM OLD.subscription_provider
     OR NEW.judge_mode IS DISTINCT FROM OLD.judge_mode
     OR NEW.total_xp IS DISTINCT FROM OLD.total_xp
     OR NEW.onboarding_quest_completed_at IS DISTINCT FROM OLD.onboarding_quest_completed_at THEN
    RAISE EXCEPTION 'protected user column may only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_block_self_tier ON public.users;
CREATE TRIGGER trg_users_block_self_tier
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.block_self_tier_change();

----------------------------------------------------------------------
-- C2: chat_usage — SELECT-only for the owner, RPC owns writes
----------------------------------------------------------------------

DROP POLICY IF EXISTS chat_usage_owner_all ON public.chat_usage;

CREATE POLICY chat_usage_owner_select ON public.chat_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- bump_chat_usage becomes SECURITY DEFINER so it can INSERT/UPDATE the
-- row even though `authenticated` no longer has direct write privilege.
-- search_path is locked. Recreated with the same signature so the
-- client-side .rpc('bump_chat_usage', ...) keeps working unchanged.
CREATE OR REPLACE FUNCTION public.bump_chat_usage(p_user_id uuid, p_day date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  -- Sanity guard: the caller must be the same auth.uid() they pass in.
  -- Defense against a client trying to bump another user's counter.
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_usage AS cu (user_id, day, count)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day)
  DO UPDATE SET count = cu.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_chat_usage(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage(uuid, date) TO authenticated;
