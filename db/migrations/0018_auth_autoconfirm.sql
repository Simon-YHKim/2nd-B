-- 0018_auth_autoconfirm.sql
-- Free-tier reality: the project has no SMTP configured, so GoTrue's
-- "confirm email" flow is a dead end -- a confirmation mail is generated but
-- never delivered, leaving every new account permanently unable to sign in.
-- This BEFORE INSERT trigger on auth.users stamps email_confirmed_at at
-- creation time, so signInWithPassword() (called right after signUp() in
-- src/lib/supabase/auth.ts) succeeds and the user receives a session.
-- Equivalent to the dashboard "Confirm email = off" toggle, but version
-- controlled and re-applied by supabase-dry-run CI.
--
-- SET search_path = '' hardens against search_path injection (Supabase
-- security advisor 0011_function_search_path_mutable). now() resolves from
-- pg_catalog, which is always searched implicitly.

CREATE OR REPLACE FUNCTION public.auth_autoconfirm_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_autoconfirm_email ON auth.users;
CREATE TRIGGER trg_auth_autoconfirm_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auth_autoconfirm_email();
