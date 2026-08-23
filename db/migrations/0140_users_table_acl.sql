-- 0140_users_table_acl.sql
-- Take the table-level grant off public.users and hand back only the columns
-- the client actually writes. REQ-260821-02, the half RBAC deferred.
--
-- ── WHY THIS IS THE FIX AND 0138's REVOKE WAS NOT ────────────────────────────
--
-- 0138 tried to close judge_mode with a column-level REVOKE and it did nothing:
--
--   pg_class.relacl(users)          -> anon=arwdDxtm/postgres,
--                                      authenticated=arwdDxtm/postgres
--   pg_attribute.attacl(judge_mode) -> NULL
--
-- A column REVOKE removes column ACL entries, and there were none; table
-- privileges imply every column. So the guard ended up being a trigger, which
-- works but sits one `DROP TRIGGER` away from being gone. THIS migration is
-- what makes the column-level REVOKE in 0138 mean something, and it closes the
-- rest of the surface at the same time: anon currently holds arwdDxtm, which
-- includes DELETE and TRUNCATE, with RLS the only thing standing in front.
--
-- ── WHY IT IS SAFE TO RUN NOW, AND HOW THAT WAS ESTABLISHED ──────────────────
--
-- Deferred once for a reason: whether the sign-up INSERT arrives as
-- `authenticated` or as `anon` cannot be read off the repo, email confirmation
-- is on, and getting it wrong is a sign-up outage. The console answered it
-- against production on 2026-08-23:
--
--   * Email sign-up does NOT insert from the client at all.
--     auth.users trg_complete_verified_email_signup (SECURITY DEFINER, owner
--     postgres, from 0086) creates the profile row on the confirmation
--     transition. Trigger and owner both verified.
--   * OAuth sign-up (ensureUserProfile) requires a session, so its INSERT
--     arrives as `authenticated`.
--   * There is no anon INSERT path. anon needs no write grant at all.
--
-- Then the statements below were run against production inside a transaction
-- and measured before rollback:
--
--   anon           ins=f upd=f del=f sel=t
--   authenticated  ins(table)=f  ins(id,email)=t  upd(reasoning_prefs)=t
--                  upd(judge_mode)=f  del=f  sel=t
--   service_role   unaffected
--
-- ⚠ supabase_auth_admin comes out with ins=f, and that is FINE ONLY BECAUSE the
-- sign-up trigger is SECURITY DEFINER owned by postgres. If anyone ever changes
-- that function to SECURITY INVOKER, sign-up breaks the moment this migration
-- is in place, and the error will point at the trigger rather than here. That
-- is the one line to remember from this file.
--
-- ── THE COLUMN LISTS ARE NOT HAND-MAINTAINED ─────────────────────────────────
--
-- They come from a source scan, and
-- src/lib/supabase/__tests__/users-write-census.test.ts recomputes that scan on
-- every run and fails if the code grows a write these lists do not cover. A
-- hand-copied list is the thing this repo has been bitten by before; a list
-- that recomputes itself is why this migration can be trusted a month from now.
--
--   INSERT: id, email, birth_date, locale, display_name
--   UPDATE: reasoning_prefs, birth_date, privacy_prefs, profile_details
--   DELETE: none - account deletion goes through its own path, not a client
--           DELETE, which is what makes revoking DELETE a bounded change.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
--
-- SELECT is left alone for both roles. RLS governs which rows come back, that
-- is the design, and narrowing reads is a different question from stopping
-- writes - it belongs with whoever decides what a support role may see, not
-- with a privilege cleanup.
--
-- The judge_mode triggers from 0138/0139 STAY. After this migration they are
-- belt-and-suspenders rather than the only belt, and that is the right number
-- of belts for a column that grants the top paid tier. The console also
-- measured a third guard already in place (block_self_tier_change returns
-- 42501 on a client judge_mode UPDATE), so removing any one of them still
-- leaves the column held.
--
-- Idempotent, forward-only. Safe to re-apply.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 1. Drop the table-level write grants
----------------------------------------------------------------------
-- DELETE and TRUNCATE first: they are the two nobody intended to hand out and
-- the two RLS is weakest in front of. REFERENCES and TRIGGER go with them
-- because a client has no business creating either against this table.

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.users FROM anon, authenticated;

----------------------------------------------------------------------
-- 2. Hand back exactly the columns the client writes
----------------------------------------------------------------------
-- authenticated only. anon gets nothing back: measured above, it has no write
-- path, and the email sign-up that looks like one runs as postgres.

GRANT INSERT (id, email, birth_date, locale, display_name) ON public.users TO authenticated;
GRANT UPDATE (reasoning_prefs, birth_date, privacy_prefs, profile_details) ON public.users TO authenticated;

----------------------------------------------------------------------
-- 3. Leave service_role whole
----------------------------------------------------------------------
-- Webhooks, the sign-up trigger's owner path, support tooling and every
-- SECURITY DEFINER function reach this table as service_role or postgres. The
-- REVOKEs above name anon and authenticated only, so this is a restatement
-- rather than a change - written down because "did we just break the billing
-- webhook" is the first question this migration invites.

GRANT ALL ON TABLE public.users TO service_role;

COMMIT;
