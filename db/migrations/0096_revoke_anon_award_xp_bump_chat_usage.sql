-- 0096: REVOKE anon EXECUTE on award_xp + bump_chat_usage (house-rule catch-up)
--
-- Prod audit (2026-07-26) found two SECURITY DEFINER functions still anon-EXECUTE
-- while the other 27 are correctly anon=false:
--   - public.award_xp(text)             -- never had a FROM anon revoke (0019/0034/0037)
--   - public.bump_chat_usage(uuid,date) -- 0025 revoked FROM PUBLIC only, which does
--                                          NOT remove Supabase's explicit anon grant
--                                          (the exact footgun 0036/0082 documented:
--                                          `ALTER DEFAULT PRIVILEGES` auto-GRANTs anon,
--                                          so `REVOKE ... FROM PUBLIC` is insufficient).
--
-- Both self-guard on auth.uid() (award_xp RAISEs when auth.uid() IS NULL;
-- bump_chat_usage RAISEs unless auth.uid() = p_user_id), so anon calls already
-- fail closed -- this is defense-in-depth + restoring the house-rule invariant
-- (every DEFINER RPC must explicitly REVOKE FROM anon), NOT an active-exploit fix.
--
-- Clients call BOTH as `authenticated` (src/lib/progression/xp.ts award_xp,
-- src/lib/chat/usage.ts bump_chat_usage), so authenticated retains EXECUTE and no
-- code path breaks. FROM anon only. Forward-only; safe to re-run (idempotent).

REVOKE EXECUTE ON FUNCTION public.award_xp(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_chat_usage(uuid, date) FROM anon;
