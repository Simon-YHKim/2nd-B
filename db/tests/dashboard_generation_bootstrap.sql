\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^dashboard_test[a-z0-9_]*$' OR current_user <> 'dashboard_local'
    OR to_regnamespace('auth') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'Requires a fresh local dashboard test database';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status text DEFAULT 'active',minor_tier text DEFAULT 'adult',birth_date date DEFAULT '1990-01-01',
  test_consent boolean DEFAULT true,test_token text DEFAULT repeat('a',64),privacy_prefs jsonb DEFAULT '{"recommendations":true}');
CREATE TABLE public.account_deletion_tombstones(user_id uuid PRIMARY KEY);
CREATE TABLE public.ops_routines(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text,active boolean DEFAULT true,created_at timestamptz DEFAULT now(),recurrence text DEFAULT 'daily',weekday smallint);
CREATE TABLE public.ops_routine_logs(routine_id uuid REFERENCES public.ops_routines(id) ON DELETE CASCADE,user_id uuid,
  completed_on date);
CREATE TABLE public.erasure_registry(table_name text,owner_column text,class text,reason text,delete_order integer);
-- Production-shaped consent/audit columns for the 0244 triggers. The canonical
-- consent decision is stubbed here; its full contract has a separate SQL job.
CREATE TABLE public.consent_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  purposes jsonb DEFAULT '["service"]',required_ack boolean DEFAULT true,llm_processing_ack boolean DEFAULT true,
  overseas_transfer_ack boolean DEFAULT true,sensitive_data_ack boolean DEFAULT true,safety_notice_ack boolean DEFAULT true,
  optional_consents jsonb DEFAULT '{}',consent_version text,policy_version text,terms_version text,
  created_at timestamptz DEFAULT now(),ip_hash text,ua_hash text,age_band text,minor_tier text,locale text);
CREATE TABLE public.llm_consent_receipts(consent_record_id uuid PRIMARY KEY REFERENCES public.consent_records(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,state_revision bigint DEFAULT 0,
  optional_consents_since timestamptz,service_action text,contract_revision text,receipt_order bigint GENERATED ALWAYS AS IDENTITY);
CREATE TABLE public.consent_changes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  pref_key text,event_type text,created_at timestamptz DEFAULT now(),ip_hash text,ua_hash text);
CREATE FUNCTION public.llm_consent_current_decision(p_user_id uuid) RETURNS TABLE(allowed boolean,token text)
LANGUAGE sql AS $$ SELECT test_consent,test_token FROM public.users WHERE id=p_user_id $$;
\ir ../migrations/0004_ai_audit_log.sql
\ir ../migrations/0073_ai_audit_axis_columns.sql
ALTER TABLE public.ai_audit_log DROP CONSTRAINT ai_audit_log_user_id_fkey;
ALTER TABLE public.ai_audit_log ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.ai_audit_log ADD FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_audit_log ADD COLUMN event_source text DEFAULT 'legacy_unknown',ADD COLUMN outbox_event_id text;
-- Preserve 0179/0181 bounds for v2 run:lease lineage and attempt placeholders.
ALTER TABLE public.ai_audit_log ADD CONSTRAINT ai_audit_log_outbox_event_id_format CHECK (
  outbox_event_id IS NULL OR (char_length(outbox_event_id) BETWEEN 1 AND 128 AND outbox_event_id ~ '^[A-Za-z0-9._:-]+$'));
ALTER TABLE public.ai_audit_log ADD CONSTRAINT ai_audit_log_event_source_check
  CHECK(event_source IN ('server_verified','client_unverified','legacy_unknown'));
CREATE UNIQUE INDEX ai_audit_log_owner_outbox_event_unique ON public.ai_audit_log(user_id,outbox_event_id) WHERE outbox_event_id IS NOT NULL;
ALTER TABLE public.ai_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_audit_log,public.llm_consent_receipts FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.effective_llm_consent_snapshot_v2(p_user_id uuid,p_allow_legacy boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object('allowed',test_consent,'token',CASE WHEN test_consent THEN test_token END) FROM public.users WHERE id=p_user_id $$;
-- @LOAD_CONSENT_INVALIDATION@
\ir ../migrations/0236_dashboard_generation.sql
\ir ../migrations/0238_dashboard_terminal_states.sql
COMMIT;
\ir dashboard_generation_regression.sql

-- Existing withdrawn content before the forward migration, including an
-- in-flight attempt without output and a still-consented control account.
BEGIN;
INSERT INTO auth.users(id) SELECT ('00000000-0000-0000-0000-00000000002'||n)::uuid FROM generate_series(1,3) n;
INSERT INTO public.users(id,test_consent,privacy_prefs) SELECT id,right(id::text,1)<>'2',
  jsonb_build_object('recommendations',right(id::text,1)<>'1') FROM auth.users;
INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,expires_at)
  SELECT id,'daily_note','backfill','hash',test_token,'ready','{"line":"old"}',now()+interval '1 day' FROM public.users;
INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,expires_at)
  SELECT id,'daily_note','stale-token','hash',repeat('b',64),'ready','{"line":"old grant"}',now()+interval '1 day'
    FROM public.users WHERE id::text LIKE '%0023';
INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,created_at,expires_at)
  SELECT id,'daily_note','old-recommendation','hash',test_token,'ready','{"line":"old recommendation"}',now()-interval '1 hour',now()+interval '1 day'
    FROM public.users WHERE id::text LIKE '%0023';
INSERT INTO public.consent_changes(user_id,pref_key,event_type,created_at)
  SELECT id,'recommendations','revoke',now()-interval '30 minutes' FROM public.users WHERE id::text LIKE '%0023';
\ir ../migrations/0244_dashboard_generation_audit_and_withdrawal.sql
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id::text LIKE '%0021' AND (output IS NOT NULL OR status<>'failed'))
    OR EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id::text LIKE '%0022' AND (output IS NOT NULL OR status<>'failed'))
    OR EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE request_key IN ('stale-token','old-recommendation') AND (output IS NOT NULL OR status<>'failed'))
    OR NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id::text LIKE '%0023' AND request_key='backfill' AND output IS NOT NULL AND status='ready')
    THEN RAISE EXCEPTION '0244 backfill isolation'; END IF;
END $$;
-- Keep the migration but roll back only fixture data via the account cascade.
DELETE FROM auth.users WHERE id::text LIKE '00000000-0000-0000-0000-00000000002%';
COMMIT;
\ir ../migrations/0245_dashboard_retention_heartbeat.sql
-- Same RPCs called by the old Edge must work with the new DB.
\ir dashboard_generation_regression.sql
\ir dashboard_generation_audit_withdrawal_regression.sql
\ir dashboard_reservation_recovery_regression.sql

\ir ../migration-drafts/UNNUMBERED_dashboard_last_note.sql
\ir dashboard_last_note_regression.sql

\ir dashboard_retention_heartbeat_regression.sql
