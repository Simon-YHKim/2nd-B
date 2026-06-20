-- 0054_ops_milestones.sql
-- Wave 3 (learning_goals / career_check) manage layer: manual milestones. The
-- gate-0 deterministic core of 학습 목표 + 커리어 성장 점검 — the user records
-- goals/steps and tracks status; periodic AI reflection (recommend.ts) sits on
-- top later. Manual structured input — no Gemini call here, no new C1/C9/C3
-- surface. $0. One table covers both areas (domain_id distinguishes).
--
-- Owner-only RLS, mirroring ops_routines_owner_all (0048). Additive + idempotent.

CREATE TABLE IF NOT EXISTS ops_milestones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_id    text NOT NULL,                                    -- one of OPS_DOMAIN_IDS (e.g. learning_goals, career_check)
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done')),
  target_date  date,                                             -- optional due date
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_milestones_user_domain_idx
  ON ops_milestones (user_id, domain_id, status);

ALTER TABLE ops_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ops_milestones_owner_all ON ops_milestones;
    CREATE POLICY ops_milestones_owner_all ON ops_milestones
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
