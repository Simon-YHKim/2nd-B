-- 0139_rbac_roles.sql
-- RBAC step 1: roles exist, the claim is issued, one guard reads it.
-- REQ-260821-02. Design + Simon's answers: docs/RBAC-DESIGN.md (D-1..D-4,
-- confirmed 2026-08-21 03:0x "권장대로 진행").
--
-- ⚠ APPLY THIS TOGETHER WITH 0138, IN THAT ORDER. Section 3 closes an INSERT
-- path that 0138 leaves open on its own; see that section for why.
--
-- ── WHAT SIMON CONFIRMED, AND HOW EACH ANSWER SHOWS UP HERE ──────────────────
--
--   D-1  admin may NOT read other people's records, only aggregates.
--        -> no policy in this file grants anyone else's rows. The only thing
--           admin can read here is the role table itself.
--   D-2  grants ride the JWT claim; revocation must be immediate where it
--        matters.
--        -> two functions, not one. has_app_role() reads the claim and is
--           cheap. has_app_role_now() also confirms against the table, and is
--           what a revocation-sensitive path calls.
--   D-3  leaked-password blocking is a client check (HIBP range API).
--        -> not in this file. It touches no schema.
--   D-4  admin / developer / support is enough.
--        -> CHECK constraint, so a typo cannot invent a fourth role silently.
--
-- ── WHY A TABLE AND NOT users.role ───────────────────────────────────────────
--
-- A person can hold two roles. Who granted it and when is worth keeping. And
-- users is the table the billing webhook writes: putting authority there makes
-- "a payment event overwrote an operator's role" a structurally possible bug.
-- judge_mode was that shape, which is what 0138 is cleaning up.
--
-- ── SAFE TO APPLY BEFORE ANYONE HAS A ROLE ───────────────────────────────────
--
-- With zero rows, every has_app_role() returns false and every policy added
-- here grants nothing. Turning the hook off later removes the claim, and the
-- guards fall back to false, which is the safe direction. That is why this
-- lands before the guards that will eventually depend on it.
--
-- ── NOT IN THIS FILE, ON PURPOSE ─────────────────────────────────────────────
--
-- The table-level ACL on public.users. anon and authenticated hold arwdDxtm
-- there (measured 2026-08-21), which is what made 0138's column REVOKE inert,
-- and RLS is the only thing standing in front of DELETE and TRUNCATE.
--
-- The census IS done, and it is small. Source scan of every client write:
--   INSERT: id, email, birth_date, locale, display_name  (+ judge_mode, which
--           this file removes from the client payload)
--   UPDATE: reasoning_prefs, birth_date, privacy_prefs, profile_details
--   DELETE: none
-- src/lib/supabase/__tests__/users-write-census.test.ts pins that list so it
-- cannot drift silently before the surgery happens.
--
-- What stops the surgery landing here is one thing I cannot check from a
-- repo: whether the sign-up INSERT runs as `authenticated` or as `anon`. Email
-- confirmation is on, and if the session is not yet established at that
-- moment, the insert arrives as anon and a REVOKE would break every new
-- account. That needs a dry run against production, so it is the console's
-- next migration, not this one. Getting it wrong is a sign-up outage.
--
-- Idempotent, forward-only. Safe to re-apply.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 1. The table
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('admin', 'developer', 'support')),
  granted_by uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note       text,
  PRIMARY KEY (user_id, role)
);

COMMENT ON TABLE public.user_roles IS
  'Job roles (admin/developer/support). Separate from users.subscription_tier '
  'on purpose: the billing webhook writes the tier, a person writes these, and '
  'one column holding both makes "a payment overwrote an operator role" '
  'possible. Writes are service_role only.';

CREATE INDEX IF NOT EXISTS user_roles_role_idx ON public.user_roles (role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------
-- 2. Reading a role
----------------------------------------------------------------------
-- ⚠ 0112. `request.jwt.claim.role` (singular GUC) is no longer set, so a
-- helper reading only that sees NULL for everyone. The claims JSON is the one
-- that carries. Same COALESCE shape billing_request_role() already uses.

-- Fast path: the claim only. This is what an ordinary gate calls.
CREATE OR REPLACE FUNCTION public.has_app_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb -> 'app_roles')
      ? p_role,
    false
  );
$$;

COMMENT ON FUNCTION public.has_app_role(text) IS
  'True when the caller''s access token carries this role. Lags revocation by '
  'the token lifetime by design (D-2). Use has_app_role_now() where that lag '
  'is not acceptable.';

-- Revocation-sensitive path: the claim AND the table. Costs a lookup, so it is
-- deliberately a separate function rather than the default.
CREATE OR REPLACE FUNCTION public.has_app_role_now(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_app_role(p_role)
     AND EXISTS (
           SELECT 1 FROM public.user_roles r
            WHERE r.user_id = auth.uid()
              AND r.role = p_role
         );
$$;

COMMENT ON FUNCTION public.has_app_role_now(text) IS
  'has_app_role() plus a table confirmation, so a revoked role stops working '
  'immediately instead of at token expiry (D-2).';

----------------------------------------------------------------------
-- 3. The claim: custom access token hook
----------------------------------------------------------------------
-- Free on every Supabase plan. Registering it is a dashboard action
-- (Authentication -> Hooks -> Customize Access Token), NOT something a
-- migration can do, so this file only creates the function it will point at.
-- Until it is registered, app_roles is absent and every guard reads false.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_roles text[];
  v_claims jsonb;
BEGIN
  SELECT array_agg(r.role ORDER BY r.role)
    INTO v_roles
    FROM public.user_roles r
   WHERE r.user_id = (event ->> 'user_id')::uuid;

  v_claims := event -> 'claims';
  -- Always write the key, even when empty. An absent claim and an empty one
  -- read the same to has_app_role(), but a guard that has to distinguish
  -- "no roles" from "hook not running" can, and an operator debugging a token
  -- can see at a glance that the hook fired.
  v_claims := jsonb_set(v_claims, '{app_roles}', to_jsonb(COALESCE(v_roles, ARRAY[]::text[])));

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

----------------------------------------------------------------------
-- 4. Policies
----------------------------------------------------------------------

-- Everyone sees their own roles. Needed for the client to know whether to
-- show an operator surface at all.
DROP POLICY IF EXISTS user_roles_select_self ON public.user_roles;
CREATE POLICY user_roles_select_self ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- An admin managing roles has to see them. This is the guard that reads the
-- claim (completion condition 3), and it is deliberately the ONLY thing an
-- admin can read that is not their own: D-1 says the role does not open other
-- people's records, and this table holds no personal data.
--
-- has_app_role_now(), not has_app_role(): revoking someone's admin should stop
-- them reading the role table in the same second, not at token expiry.
DROP POLICY IF EXISTS user_roles_select_admin ON public.user_roles;
CREATE POLICY user_roles_select_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_app_role_now('admin'));

-- The hook runs as supabase_auth_admin and must read past RLS to build the
-- claim. Without this the hook returns an empty array for everyone and the
-- whole mechanism looks like it works while granting nothing.
DROP POLICY IF EXISTS user_roles_select_auth_admin ON public.user_roles;
CREATE POLICY user_roles_select_auth_admin ON public.user_roles
  FOR SELECT TO supabase_auth_admin
  USING (true);

-- No INSERT/UPDATE/DELETE policy exists, so writes are refused for every
-- client role. Granting a role is a service_role action, which is the point:
-- it should leave a deliberate trace, not be reachable from a session.

----------------------------------------------------------------------
-- 5. Close the INSERT path 0138 leaves open
----------------------------------------------------------------------
-- 0138 drops auto_judge_mode(), which was a BEFORE INSERT trigger. It existed
-- to derive judge_mode from the email domain, and dropping it is right. But it
-- was ALSO overwriting whatever the client sent, and the client does send the
-- column (src/lib/supabase/auth.ts, both sign-up paths). With the trigger gone
-- and the column revoke inert, a crafted sign-up could insert judge_mode=true
-- and be comped to the top tier on its very first request.
--
-- 0138's replacement guard is BEFORE UPDATE only, because an UPDATE has an OLD
-- row to fall back to and an INSERT does not. The INSERT answer is different:
-- there is no prior value to restore, so the guard forces the default.
--
-- Same three branches as 0138's, for the same reasons: service_role passes,
-- no-JWT paths pass (pg_cron/psql/migrations, the 42501 trap from 2026-08-20),
-- and a client is corrected rather than rejected.

CREATE OR REPLACE FUNCTION public.enforce_judge_mode_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.judge_mode IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  IF v_role = 'service_role' OR v_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Corrected, not rejected: raising here would fail the sign-up itself, and a
  -- refused comp should not cost someone their account.
  NEW.judge_mode := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_enforce_judge_insert ON public.users;
CREATE TRIGGER trg_users_enforce_judge_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_judge_mode_insert();

COMMENT ON FUNCTION public.enforce_judge_mode_insert() IS
  'Forces users.judge_mode to false on client INSERT. Pairs with 0138''s '
  'BEFORE UPDATE guard; together they are what actually holds the column, '
  'because the column-level REVOKE cannot cut the table-level GRANT.';

----------------------------------------------------------------------
-- 6. Grants (kept at the end of the file on purpose)
----------------------------------------------------------------------
-- check:definer-grants Rule A scans without stripping comments and matches
-- across statement boundaries, so a GRANT followed by prose containing a bare
-- "to" and a later "public." produces a false positive. Collecting them here
-- is the workaround this repo already uses.
--
-- Supabase auto-grants EXECUTE on new functions to PUBLIC, which includes
-- anon. REVOKE FROM PUBLIC alone is not enough; anon has to be named.

REVOKE ALL     ON FUNCTION public.has_app_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_app_role(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_app_role(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_app_role(text) TO service_role;

REVOKE ALL     ON FUNCTION public.has_app_role_now(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_app_role_now(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_app_role_now(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_app_role_now(text) TO service_role;

REVOKE ALL     ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

REVOKE ALL ON TABLE public.user_roles FROM PUBLIC;
REVOKE ALL ON TABLE public.user_roles FROM anon;
GRANT  SELECT ON TABLE public.user_roles TO authenticated;
GRANT  SELECT ON TABLE public.user_roles TO supabase_auth_admin;
GRANT  ALL    ON TABLE public.user_roles TO service_role;

COMMIT;
