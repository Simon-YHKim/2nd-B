-- 0091_chat_ad_bonus_ssv.sql
-- SSV twin of 0090's grant_chat_ad_bonus: when AdMob server-side verification
-- is the grant authority (REWARD_SSV_ENABLED=1 + EXPO_PUBLIC_REWARD_SSV=true),
-- the verified callback -- not the client -- must be able to award the chat +2
-- with the same monthly ceiling. Mirrors 0079's reasoning-SSV design:
--
--   - dedup on rewarded_ssv_txns.transaction_id (SHARED ledger -- one AdMob
--     impression is one watch and funds exactly one grant of ONE kind, so the
--     existing PK is the correct idempotency key; no kind column needed)
--   - SECURITY DEFINER, service_role-only (the caller is the signature-verified
--     edge function, not a user -- no auth.uid to guard on, unlike 0090's
--     client-path grant)
--   - KST day/month derived server-side; ceiling identical to 0090
--     (chat_ad_credits max 20/month, +2 per watch -- REWARD_MONTHLY_CAP /
--     REWARD_PER_WATCH in tiers.ts; structural test pins them)
--
-- Replay / clamp semantics (matches 0079): a replayed transaction_id or an
-- at-cap month returns TODAY's current ad_bonus without granting. The edge
-- function routes here when custom_data is "<userId>|chat"; bare custom_data
-- stays the reasoning path (grant_reward_credits_ssv, untouched).

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
BEGIN
  IF p_txn_id IS NULL OR length(p_txn_id) = 0 THEN
    RAISE EXCEPTION 'transaction_id required' USING ERRCODE = '22004';
  END IF;

  v_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_day := v_kst::date;
  v_mon := to_char(v_kst, 'YYYY-MM');

  -- Idempotency: record the transaction; only grant on FIRST sight.
  INSERT INTO public.rewarded_ssv_txns (transaction_id, user_id)
  VALUES (p_txn_id, p_user_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Replay / AdMob retry: no grant; report today's current bonus.
    SELECT COALESCE(ad_bonus, 0) INTO v_bonus
      FROM public.chat_usage
      WHERE user_id = p_user_id AND day = v_day;
    RETURN COALESCE(v_bonus, 0);
  END IF;

  -- Monthly ceiling: 20 credits => a +2 grant only while credits <= 18 (0090).
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, chat_ad_credits)
  VALUES (p_user_id, v_mon, 2)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET chat_ad_credits = uc.chat_ad_credits + 2,
        updated_at = now()
    WHERE uc.chat_ad_credits <= 18;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- At the monthly cap: transaction consumed, nothing granted (0079 clamp
    -- semantics -- an over-cap watch is not banked for later months).
    SELECT COALESCE(ad_bonus, 0) INTO v_bonus
      FROM public.chat_usage
      WHERE user_id = p_user_id AND day = v_day;
    RETURN COALESCE(v_bonus, 0);
  END IF;

  -- The credit already paid for it: widen today's allowance.
  INSERT INTO public.chat_usage AS cu (user_id, day, count, ad_bonus)
  VALUES (p_user_id, v_day, 0, 2)
  ON CONFLICT (user_id, day) DO UPDATE
    SET ad_bonus = cu.ad_bonus + 2
  RETURNING ad_bonus INTO v_bonus;
  RETURN v_bonus;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid, text) TO service_role;
