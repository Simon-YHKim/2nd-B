-- 0082_lock_definer_fn_grants.sql
-- Post-deploy security fix (caught by get_advisors right after applying 0074-0081).
--
-- Supabase configures ALTER DEFAULT PRIVILEGES to auto-GRANT EXECUTE to anon +
-- authenticated on every newly created public function. So the "REVOKE EXECUTE
-- ... FROM PUBLIC" in 0075/0076/0077/0079 did NOT remove anon access -- those are
-- explicit per-role grants, not PUBLIC -- leaving anon=X on all four functions.
--
-- For the self-guarded cap RPCs (bump_*_if_under_cap) this was harmless: each
-- raises immediately when auth.uid() IS NULL or != p_user_id, so an anon call
-- cannot do anything. But grant_reward_credits_ssv has NO auth.uid guard -- it is
-- meant to be service_role-only, called by the trusted rewarded-ssv callback -- so
-- an anon/authenticated user could POST /rest/v1/rpc/grant_reward_credits_ssv and
-- self-grant reward credits (capped at 20/mo, but free reasoning runs) with no ad
-- watched at all. That re-opens the monetization bypass D2 was meant to close.
--
-- Fix: lock grant_reward_credits_ssv to service_role only, and drop the
-- unnecessary anon grant on the cap RPCs (defense in depth; authenticated is kept
-- because the client legitimately calls them for itself).
--
-- (Applied to prod via MCP during the 2026-07-10 deploy, immediately after
-- get_advisors flagged it; recorded here so the migration history stays complete.)

REVOKE EXECUTE ON FUNCTION public.grant_reward_credits_ssv(uuid, text, int, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_reward_credits_if_under_cap(uuid, text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_chat_usage_if_under_cap(uuid, date, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_reasoning_usage_if_under_cap(uuid, text, int) FROM anon;
