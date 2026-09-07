-- 0172_reward_authorization_hardening.sql
-- Integration candidate only: re-scan remote and local migration
-- reservations immediately before push; renumber again if precedence changed.
-- Reward authority is server-side verification (SSV), never an authenticated
-- client assertion. This forward-only migration closes the two historical
-- client grant seams, prevents community membership probing, and re-checks the
-- user's current server-owned eligibility before either SSV reward is issued.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

DO $preconditions$
BEGIN
  IF to_regprocedure('public.grant_chat_ad_bonus(uuid)') IS NULL
     OR to_regprocedure('public.bump_reward_credits_if_under_cap(uuid,text,integer)') IS NULL
     OR to_regprocedure('public.grant_chat_ad_bonus_ssv(uuid,text)') IS NULL
     OR to_regprocedure('public.grant_reward_credits_ssv(uuid,text,integer,text)') IS NULL
     OR to_regprocedure('public.community_is_member(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'reward authorization precondition failed';
  END IF;
END
$preconditions$;

----------------------------------------------------------------------
-- 1. Retire client-asserted reward grants without breaking signatures
----------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.grant_chat_ad_bonus(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) FROM PUBLIC, anon, authenticated, service_role;

----------------------------------------------------------------------
-- 2. Preserve the policy helper signature but bind it to the caller
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_is_member(p_room uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_user = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.community_room_members m
      WHERE m.room_id = p_room
        AND m.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.community_is_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_is_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.community_is_member(uuid, uuid) TO authenticated;

----------------------------------------------------------------------
-- 3. SSV chat grant: dedup first, then current server eligibility
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_chat_ad_bonus_ssv(
  p_user_id uuid,
  p_txn_id text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
  v_mon text;
  v_kst timestamp;
  v_rows int;
  v_bonus int;
  v_eligible boolean;
BEGIN
  -- Keep the server boundary fail-closed even if a later ACL migration drifts.
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22004';
  END IF;
  IF p_txn_id IS NULL OR length(p_txn_id) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'invalid transaction_id' USING ERRCODE = '22023';
  END IF;

  v_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_day := v_kst::date;
  v_mon := to_char(v_kst, 'YYYY-MM');

  -- Consume the signed impression before checking eligibility. An ineligible
  -- impression must not become banked credit after a later consent/tier change.
  INSERT INTO public.rewarded_ssv_txns (transaction_id, user_id)
  VALUES (p_txn_id, p_user_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT COALESCE(ad_bonus, 0) INTO v_bonus
      FROM public.chat_usage
      WHERE user_id = p_user_id AND day = v_day;
    RETURN COALESCE(v_bonus, 0);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.account_status = 'active'
      AND u.minor_tier = 'adult'
      AND u.privacy_prefs ->> 'ads' = 'true'
      AND public.effective_subscription_tier(u.id) = 'free'
  ) INTO v_eligible;

  IF NOT v_eligible THEN
    SELECT COALESCE(ad_bonus, 0) INTO v_bonus
      FROM public.chat_usage
      WHERE user_id = p_user_id AND day = v_day;
    RETURN COALESCE(v_bonus, 0);
  END IF;

  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, chat_ad_credits)
  VALUES (p_user_id, v_mon, 2)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET chat_ad_credits = uc.chat_ad_credits + 2,
        updated_at = now()
    WHERE uc.chat_ad_credits <= 18;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT COALESCE(ad_bonus, 0) INTO v_bonus
      FROM public.chat_usage
      WHERE user_id = p_user_id AND day = v_day;
    RETURN COALESCE(v_bonus, 0);
  END IF;

  INSERT INTO public.chat_usage AS cu (user_id, day, count, ad_bonus)
  VALUES (p_user_id, v_day, 0, 2)
  ON CONFLICT (user_id, day) DO UPDATE
    SET ad_bonus = cu.ad_bonus + 2
  RETURNING ad_bonus INTO v_bonus;
  RETURN v_bonus;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid, text) TO service_role;

----------------------------------------------------------------------
-- 4. SSV reasoning grant: same eligibility and shared replay ledger
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_reward_credits_ssv(
  p_user_id uuid,
  p_month text,
  p_grant int,
  p_txn_id text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
  v_grant int;
  v_earned int;
  v_allow int;
  v_eligible boolean;
  c_monthly_cap constant int := 20;
  c_per_call constant int := 2;
BEGIN
  -- Keep the server boundary fail-closed even if a later ACL migration drifts.
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22004';
  END IF;
  IF p_txn_id IS NULL OR length(p_txn_id) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'invalid transaction_id' USING ERRCODE = '22023';
  END IF;
  v_grant := LEAST(GREATEST(COALESCE(p_grant, 0), 0), c_per_call);

  INSERT INTO public.rewarded_ssv_txns (transaction_id, user_id)
  VALUES (p_txn_id, p_user_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN public.credit_ad_earned_this_month(p_user_id);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.account_status = 'active'
      AND u.minor_tier = 'adult'
      AND u.privacy_prefs ->> 'ads' = 'true'
      AND public.effective_subscription_tier(u.id) = 'free'
  ) INTO v_eligible;

  IF NOT v_eligible THEN
    RETURN public.credit_ad_earned_this_month(p_user_id);
  END IF;

  INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

  v_earned := public.credit_ad_earned_this_month(p_user_id);
  v_allow := GREATEST(LEAST(v_grant, c_monthly_cap - v_earned), 0);
  IF v_allow = 0 THEN RETURN v_earned; END IF;

  PERFORM public.grant_credits_free_internal(
    p_user_id,
    v_allow,
    'ad_reward',
    public.kst_month_end(now()),
    'rewarded SSV ' || p_txn_id,
    NULL
  );
  RETURN v_earned + v_allow;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) TO service_role;

-- Verify the final ACL so a future default privilege or typo cannot make a
-- partially hardened migration appear successful.
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.grant_chat_ad_bonus(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.grant_chat_ad_bonus(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.grant_chat_ad_bonus(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bump_reward_credits_if_under_cap(uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bump_reward_credits_if_under_cap(uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.bump_reward_credits_if_under_cap(uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.grant_chat_ad_bonus_ssv(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.grant_chat_ad_bonus_ssv(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.grant_chat_ad_bonus_ssv(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.grant_reward_credits_ssv(uuid,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.grant_reward_credits_ssv(uuid,text,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.grant_reward_credits_ssv(uuid,text,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.community_is_member(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reward authorization ACL verification failed' USING ERRCODE = '42501';
  END IF;
END
$verify$;

