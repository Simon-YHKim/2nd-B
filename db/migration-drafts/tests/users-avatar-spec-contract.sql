-- Scratch-only contract for the inactive users.avatar_spec draft. The CI
-- database is discarded; this never applies the draft to a real Supabase DB.
-- Run after all numbered migrations so the current users ACL/RLS is present.
\ir ../UNNUMBERED_users_avatar_spec.sql
\ir ../UNNUMBERED_users_avatar_spec.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'avatar_spec' AND data_type = 'jsonb' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'nullable users.avatar_spec jsonb is missing';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.users', 'avatar_spec', 'UPDATE')
     OR has_column_privilege('anon', 'public.users', 'avatar_spec', 'UPDATE') THEN
    RAISE EXCEPTION 'avatar_spec update grant is not authenticated-only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'users_self_select' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'users_self_update' AND cmd = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'users owner RLS policies are missing';
  END IF;
END $$;

-- This scratch database lacks Supabase's production table-wide SELECT grant.
-- Supply the read floor needed to exercise the already-installed owner RLS.
GRANT SELECT ON public.users TO authenticated;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('a6a7a800-0000-4000-8000-000000000001', 'avatar-contract-a@example.test'),
  ('a6a7a800-0000-4000-8000-000000000002', 'avatar-contract-b@example.test');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('a6a7a800-0000-4000-8000-000000000001', 'avatar-contract-a@example.test', '1990-01-01', 'en'),
  ('a6a7a800-0000-4000-8000-000000000002', 'avatar-contract-b@example.test', '1990-01-01', 'en');

SET LOCAL request.jwt.claim.sub = 'a6a7a800-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  changed integer;
  violated_constraint text;
BEGIN
  IF (SELECT count(*) FROM public.users WHERE id IN (
    'a6a7a800-0000-4000-8000-000000000001',
    'a6a7a800-0000-4000-8000-000000000002'
  )) <> 1 THEN
    RAISE EXCEPTION 'avatar SELECT leaked another user row';
  END IF;

  UPDATE public.users SET avatar_spec = '{"v":64,"type":"human"}'::jsonb
  WHERE id = 'a6a7a800-0000-4000-8000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'owner avatar update failed'; END IF;

  UPDATE public.users SET avatar_spec = '{"v":64,"type":"animal"}'::jsonb
  WHERE id = 'a6a7a800-0000-4000-8000-000000000002';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'avatar UPDATE reached another user'; END IF;

  BEGIN
    UPDATE public.users SET avatar_spec = '{"type":"human"}'::jsonb
    WHERE id = 'a6a7a800-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'avatar object without version passed CHECK';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint IS DISTINCT FROM 'users_avatar_spec_shape' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.users SET avatar_spec = '{"v":64}'::jsonb
    WHERE id = 'a6a7a800-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'avatar object without type passed CHECK';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint IS DISTINCT FROM 'users_avatar_spec_shape' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.users SET avatar_spec = jsonb_build_object(
      'v', 64, 'type', 'human', 'seed', repeat('x', 5000)
    ) WHERE id = 'a6a7a800-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'oversized avatar passed CHECK';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint IS DISTINCT FROM 'users_avatar_spec_shape' THEN
      RAISE;
    END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;
