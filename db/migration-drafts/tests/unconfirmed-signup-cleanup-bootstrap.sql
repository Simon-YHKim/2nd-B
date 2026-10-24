-- Fresh loopback t07_cleanup_test* database only; runner validates the target.
CREATE SCHEMA auth;
CREATE SCHEMA storage;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role, supabase_auth_admin;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text,
  email_confirmed_at timestamptz, confirmation_sent_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
  raw_app_meta_data jsonb NOT NULL DEFAULT '{"provider":"email","providers":["email"]}',
  phone text, phone_confirmed_at timestamptz, last_sign_in_at timestamptz,
  is_sso_user boolean DEFAULT false, is_anonymous boolean DEFAULT false,
  invited_at timestamptz, deleted_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL, identity_data jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner_id text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text UNIQUE,
  birth_date date NOT NULL, judge_mode boolean DEFAULT false, locale text,
  display_name text, account_status text DEFAULT 'active', minor_tier text DEFAULT 'adult'
);
-- Real server gates and signup provisioning, not successful mock functions.
\ir ../../migrations/0030_server_age_gate.sql
\ir ../../migrations/0031_consent_records.sql
\ir ../../migrations/0130_safety_notice_ack.sql
\ir ../../migrations/0148_verified_email_signup_consent_ledger.sql
\ir ../../migrations/0149_atomic_complete_profile_signup_consent.sql
\ir ../../migrations/0150_signup_consent_contract_20260902.sql
CREATE TRIGGER trg_complete_verified_email_signup AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.complete_verified_email_signup();
-- Minimal registry catalog with all three real classifications. One table has
-- no FK, proving the registry check is needed beyond public.users/cascades.
CREATE TABLE public.erasure_registry (table_name text PRIMARY KEY, owner_column text NOT NULL, class text NOT NULL);
CREATE TABLE public.t07_retained (owner_id uuid);
CREATE TABLE public.t07_content (owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.t07_account_only (owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
INSERT INTO public.erasure_registry VALUES
 ('t07_retained','owner_id','retained'), ('t07_content','owner_id','client_erasable'),
 ('t07_account_only','owner_id','account_delete_only'), ('consent_records','user_id','retained');
-- Legacy under-14 values exist before installation, even on a confirmed row.
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
VALUES ('07000000-0000-0000-0000-000000000001','legacy@example.invalid',now(),
  jsonb_build_object('signup_birth_date',to_char(current_date - interval '10 years','YYYY-MM-DD'),'keep',true));
INSERT INTO auth.identities(user_id,provider,identity_data)
SELECT id,'email',raw_user_meta_data FROM auth.users;
