-- 0137_credit_read_scope.sql
-- A signed-in person may read THEIR OWN credit balance, and nobody else's.
--
-- ── WHAT WAS WRONG, MEASURED AGAINST PRODUCTION ──────────────────────────────
--
-- 0134 created two read helpers and granted them EXECUTE for `authenticated`:
--
--     credit_available(p_user_id uuid, p_at timestamptz DEFAULT now())
--     credit_ad_earned_this_month(p_user_id uuid, p_at timestamptz DEFAULT now())
--
-- Both are SECURITY DEFINER, so they run as the owner and RLS on credit_ledger
-- does not apply to them. Neither has an ownership check. The user id is a
-- PARAMETER, and PostgREST exposes both at /rest/v1/rpc/<name>. So any signed-in
-- user could read any other user's credit balance by passing their uuid.
--
-- This is not inferred. Signed in as the shared QA account (.env.test) against
-- production on 2026-08-20, both of these returned HTTP 200 for a user id that
-- was not the caller:
--
--     POST /rest/v1/rpc/credit_available            {"p_user_id":"0000...0001"} -> 200
--     POST /rest/v1/rpc/credit_ad_earned_this_month {"p_user_id":"0000...0001"} -> 200
--
-- The same probe against a guarded function returns 403 42501 'caller must match
-- p_user_id', which is what these two should have been doing.
--
-- WHAT IT LEAKS TODAY: nothing, and only by luck. credit_ledger has 0 rows, so
-- both return 0 for everyone. The hole arms the moment credits exist - which is
-- the first rewarded-ad grant, not the first purchase. Everything else 0134/0135
-- exposed to `authenticated` does check (spend_credits, reserve_reasoning_run,
-- bump_reward_credits_if_under_cap all compare auth.uid() to p_user_id); these
-- two were the exception, and the exception was almost certainly an oversight
-- rather than a decision, because 0134's own comment calls the grant a reader
-- for "the client".
--
-- ── WHY NOT SIMPLY ADD auth.uid() = p_user_id INSIDE THEM ────────────────────
--
-- Because they are also called from paths where there is no JWT at all, and a
-- guard would abort those:
--
--   expire_credit_lots()   -- pg_cron, every 10 minutes
--     -> INSERT INTO credit_ledger (kind='expire')
--       -> trg_credit_ledger_mirror_counter (AFTER INSERT)
--         -> usage_counters_mirror_credits(user_id)
--           -> credit_ad_earned_this_month(user_id)   <- auth.uid() IS NULL here
--
-- Under pg_cron there is no request JWT, so auth.uid() is NULL and
-- billing_request_role() is not 'service_role' either. An in-body guard would
-- therefore break the nightly expiry mirror for every user whose lot expired -
-- trading a small read hole for a broken counter, which is a bad trade.
--
-- ── THE SHAPE INSTEAD: REMOVE THE PARAMETER, NOT THE ACCESS ──────────────────
--
-- The client never needed to name a user. It only ever wants "my balance". So:
--
--   1. the two user-id-taking helpers go back to being INTERNAL - revoked from
--      anon and authenticated, still reachable from the definer functions and
--      the trigger chain above, which run as the owner and keep EXECUTE;
--   2. a new credit_summary_self() takes NO ARGUMENTS and resolves the user from
--      auth.uid(). There is no parameter to tamper with, so this class of bug
--      cannot come back by someone forgetting a check - it is closed by shape.
--
-- Nothing breaks: a repo-wide grep for credit_available / credit_ad_earned_this_month
-- across src/, supabase/functions/ and scripts/ finds no caller outside tests, so
-- the deployed web bundle cannot notice the revoke.
--
-- credit_summary_self() is also the accessor the purchase path needs. The known
-- gap there is that purchased credits never reach usage_counters (0135's mirror
-- re-derives reward_credits from ad-earned only, deliberately), so a client that
-- reads only usage_counters shows "0 remaining" and its own depleted gate then
-- refuses to spend. Whoever writes the purchase path should read this function
-- rather than add a second user-id-taking RPC.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- 1. The self-scoped reader. No user id parameter, by design.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.credit_summary_self()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal record;
BEGIN
  -- No JWT means no subject to answer about. 42501 rather than an empty object,
  -- so a caller cannot read "0 credits" as a fact about anybody.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign-in required' USING ERRCODE = '42501';
  END IF;

  SELECT b.next_expiry_at, b.next_expiry_units
    INTO v_bal
    FROM public.credit_balance b
   WHERE b.user_id = v_uid;

  -- available is DERIVED from the ledger, not read from the credit_balance
  -- cache: 0134 is explicit that the cache row is a mutex and a tripwire, not a
  -- source of truth, and a user with no cache row still has a correct balance.
  RETURN jsonb_build_object(
    'available',            public.credit_available(v_uid),
    'ad_earned_this_month', public.credit_ad_earned_this_month(v_uid),
    'next_expiry_at',       v_bal.next_expiry_at,
    'next_expiry_units',    v_bal.next_expiry_units
  );
END;
$$;

COMMENT ON FUNCTION public.credit_summary_self() IS
  'The only credit reader a signed-in client may call. Takes no user id on purpose: the subject is auth.uid(), so there is no parameter to tamper with. credit_available(uuid,...) and credit_ad_earned_this_month(uuid,...) are internal as of 0137 because they had no ownership check while being granted to authenticated (verified against production 2026-08-20: both answered 200 for another user''s id).';

----------------------------------------------------------------------
-- 2. Make the two parameterised readers internal again
----------------------------------------------------------------------

-- Kept, not dropped: usage_counters_mirror_credits() and the pg_cron expiry
-- chain call them as the owner, which still holds EXECUTE.
REVOKE EXECUTE ON FUNCTION public.credit_available(uuid, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.credit_available(uuid, timestamptz) IS
  'INTERNAL as of 0137. SECURITY DEFINER with no ownership check, so it must never be granted to anon or authenticated again: the user id is a parameter and PostgREST would expose it as a cross-user read. Signed-in clients call credit_summary_self() instead. Internal callers (usage_counters_mirror_credits, the pg_cron expiry chain) run as the owner and are unaffected.';

COMMENT ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) IS
  'INTERNAL as of 0137, same reason as credit_available: SECURITY DEFINER, user id as a parameter, no ownership check. The monthly ad cap the limit sheet shows comes through credit_summary_self().';

----------------------------------------------------------------------
-- 3. Security posture
----------------------------------------------------------------------

-- Grants last, and nothing but grants after a grant: check:definer-grants
-- Rule A scans forward across statement boundaries and is comment-blind, so
-- prose sitting between a GRANT and a later CREATE trips it (0136 hit this).
--
-- Supabase auto-grants EXECUTE for anon AND authenticated the moment a function
-- is created, so REVOKE FROM PUBLIC alone is never enough (0036 / 0082 / 0098).

REVOKE ALL     ON FUNCTION public.credit_summary_self() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_summary_self() FROM anon;
GRANT  EXECUTE ON FUNCTION public.credit_summary_self() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.credit_summary_self() TO service_role;

REVOKE ALL     ON FUNCTION public.credit_available(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_available(uuid, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.credit_available(uuid, timestamptz) TO service_role;

REVOKE ALL     ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.credit_ad_earned_this_month(uuid, timestamptz) TO service_role;
