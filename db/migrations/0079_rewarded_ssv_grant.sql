-- 0079_rewarded_ssv_grant.sql
-- Atomic + IDEMPOTENT reward grant for the AdMob SSV callback (D2, pre-deploy
-- review P1/P3 fix).
--
-- The rewarded-ssv edge function verifies the AdMob signature, but a first draft
-- then did a non-atomic read-modify-write and had NO replay protection: the same
-- valid signed callback (or an AdMob retry) could be replayed to inflate a single
-- real impression up to the full monthly cap (partially re-opening the self-grant
-- hole). This migration provides:
--   1. rewarded_ssv_txns: a dedup ledger keyed by AdMob transaction_id.
--   2. grant_reward_credits_ssv(): SECURITY DEFINER, service_role-only (the caller
--      is a verified AdMob callback, not a user, so there is no auth.uid to guard
--      on — hence a dedicated function rather than bump_reward_credits_if_under_cap,
--      whose auth.uid()=p_user_id guard would reject a service-role call). It
--      inserts the transaction_id ON CONFLICT DO NOTHING and grants ONLY on first
--      sight, clamped to the server-owned monthly cap, all in one statement-set so
--      concurrent callbacks cannot lose an update or double-grant.
--
-- Constants MUST match src/lib/entitlements/tiers.ts (REWARD_MONTHLY_CAP=20,
-- REWARD_PER_WATCH=2); the structural test asserts they match.

CREATE TABLE IF NOT EXISTS public.rewarded_ssv_txns (
  transaction_id text PRIMARY KEY,
  user_id        uuid NOT NULL,
  granted_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rewarded_ssv_txns ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) ever touches this table.

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
  v_credits int;
  v_rows int;
  v_grant int;
  c_monthly_cap constant int := 20;  -- REWARD_MONTHLY_CAP (tiers.ts)
  c_per_call constant int := 2;      -- REWARD_PER_WATCH
BEGIN
  IF p_txn_id IS NULL OR length(p_txn_id) = 0 THEN
    RAISE EXCEPTION 'transaction_id required' USING ERRCODE = '22004';
  END IF;
  v_grant := LEAST(GREATEST(COALESCE(p_grant, 0), 0), c_per_call);

  -- Idempotency: record the transaction; only proceed on FIRST sight.
  INSERT INTO public.rewarded_ssv_txns (transaction_id, user_id)
  VALUES (p_txn_id, p_user_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Already processed (replay / AdMob retry), or nothing to grant: return current.
  IF v_rows = 0 OR v_grant = 0 THEN
    SELECT COALESCE(reward_credits, 0) INTO v_credits
      FROM public.usage_counters
      WHERE user_id = p_user_id AND month_bucket = p_month;
    RETURN COALESCE(v_credits, 0);
  END IF;

  -- First sight: atomic clamped add. GREATEST avoids clawing back an over-cap row.
  INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reward_credits)
  VALUES (p_user_id, p_month, LEAST(v_grant, c_monthly_cap))
  ON CONFLICT (user_id, month_bucket) DO UPDATE
    SET reward_credits = GREATEST(uc.reward_credits, LEAST(uc.reward_credits + v_grant, c_monthly_cap)),
        updated_at = now()
  RETURNING reward_credits INTO v_credits;

  RETURN v_credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) TO service_role;
