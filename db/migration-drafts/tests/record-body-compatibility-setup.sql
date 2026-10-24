-- Disposable fixture tables for the actual 0236/0244/0263 functions and triggers.
-- Embedding arithmetic is not exercised; real[] stands in for vector storage.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_owner ON public.users TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
GRANT SELECT,UPDATE(privacy_prefs) ON public.users TO authenticated;
CREATE TABLE public.records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  embedding real[],embedding_model text);
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records FORCE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE(embedding,embedding_model) ON public.records TO authenticated;
CREATE TABLE public.ops_routines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text,active boolean DEFAULT true,created_at timestamptz DEFAULT now(),recurrence text DEFAULT 'daily',weekday smallint);
CREATE TABLE public.ops_routine_logs(routine_id uuid REFERENCES public.ops_routines(id) ON DELETE CASCADE,user_id uuid,completed_on date);
\ir ../../migrations/0004_ai_audit_log.sql
\ir ../../migrations/0073_ai_audit_axis_columns.sql
ALTER TABLE public.ai_audit_log ADD COLUMN event_source text DEFAULT 'legacy_unknown',ADD COLUMN outbox_event_id text;
\ir ../../migrations/0236_dashboard_generation.sql
\ir ../../migrations/0244_dashboard_generation_audit_and_withdrawal.sql
\ir ../../migrations/0263_records_embedding_consent_guard.sql

-- This actor, lease and ready cache exist BEFORE the T10 draft is installed.
INSERT INTO auth.users(id,email_confirmed_at) VALUES('66666666-6666-4666-8666-666666666666',now());
INSERT INTO public.users(id,birth_date,minor_tier,locale,privacy_prefs)
VALUES('66666666-6666-4666-8666-666666666666','1990-01-01','adult','en','{"recommendations":true}');
INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,purposes,
  required_ack,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale)
VALUES('66666666-6666-4666-8666-666666666666','adult','adult','2026-10-18','2026-10-07','2026-10-05','["service"]',true,true,true,true,true,'en');
INSERT INTO public.ops_routines(user_id,title) VALUES('66666666-6666-4666-8666-666666666666','Read a book');
SET LOCAL request.jwt.claim.role='service_role';
CREATE TEMP TABLE t10_existing_state AS SELECT id AS user_id,privacy_prefs,
  public.effective_llm_consent_snapshot_v2(id,false) AS lease,
  public.dashboard_generation_request(id,'open','UTC','en') AS run
  FROM public.users WHERE id='66666666-6666-4666-8666-666666666666';
DO $$ DECLARE s record; BEGIN
  SELECT * INTO s FROM t10_existing_state;
  IF s.lease->'allowed' IS DISTINCT FROM 'true'::jsonb OR s.run->>'kind'<>'claimed'
    OR NOT public.dashboard_generation_dispatch(s.user_id,(s.run->>'id')::uuid)
    OR NOT public.dashboard_generation_finish(s.user_id,(s.run->>'id')::uuid,'{"line":"Ready before T10"}') THEN
    RAISE EXCEPTION 'invalid pre-T10 fixture';
  END IF;
END $$;
SET LOCAL request.jwt.claim.role='authenticated';
