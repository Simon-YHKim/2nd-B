-- 0101_revoke_public_award_xp_and_health_trigger.sql
-- Follow-up to 0098 + 0100, from prod verification on 2026-07-27.
--
-- (1) 0098 did not achieve its stated goal for award_xp.
--     It ran `REVOKE EXECUTE ... FROM anon` on BOTH functions, but award_xp had no
--     explicit anon grant to remove -- it was open through the DEFAULT PUBLIC grant:
--
--       award_xp(text)              acl: =X/postgres   <-- PUBLIC
--                                        postgres=X
--                                        authenticated=X
--                                        service_role=X
--       bump_chat_usage(uuid,date)  acl: postgres=X
--                                        authenticated=X   <-- correctly locked by 0098
--                                        service_role=X
--
--     So `FROM anon` was a no-op there and has_function_privilege('anon', ...) stayed true.
--     0098's own header had the diagnosis right ("never had a FROM anon revoke") but applied
--     bump_chat_usage's prescription to both. This revokes the PUBLIC grant, which is what
--     award_xp actually needed.
--
--     Safe: `authenticated=X/postgres` is a separate explicit grant, so the app's XP path
--     (src/lib/progression/xp.ts -> award_xp RPC) keeps working. Confirmed twice --
--     in the ACL above, and by a live smoke on 2026-07-27 where the app issued
--     POST /rest/v1/rpc/award_xp and got 200 as `authenticated`.
--
-- (2) 0100 created reject_minor_health_rows() without any REVOKE, so Supabase default
--     privileges auto-granted it to anon AND left the PUBLIC default:
--
--       reject_minor_health_rows()  acl: =X/postgres, postgres=X, anon=X,
--                                        authenticated=X, service_role=X
--
--     Not exploitable -- Postgres refuses a direct call to a trigger function -- but it
--     breaks the house rule every other function follows (0039/0082/0095, and 0097's own
--     bump_clipper_template_reports() which revokes PUBLIC/anon/authenticated explicitly).
--
-- Forward-only; both statements are idempotent and safe to re-run.

REVOKE EXECUTE ON FUNCTION public.award_xp(text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.reject_minor_health_rows() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_minor_health_rows() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_minor_health_rows() FROM authenticated;
