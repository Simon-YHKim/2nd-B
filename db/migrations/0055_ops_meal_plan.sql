-- 0055_ops_meal_plan.sql
-- Wave 2 (weekly_meals / simple_meals) manage layer: a deterministic weekly meal
-- plan. Pairs with the MFDS nutrition source (src/lib/nutrition/foods.ts): a food
-- idea gets placed into a (day, slot) cell. Manual structured input — no Gemini
-- call, no new C1/C9/C3 surface. $0. This is the persistence the meals screen
-- needs (the grid was ephemeral until now).
--
-- Owner-only RLS, mirroring ops_routines_owner_all (0048) / ops_ledger (0052).
-- One row per (user, day, slot); upsert makes re-planning a cell idempotent.

CREATE TABLE IF NOT EXISTS ops_meal_plan (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date    date NOT NULL,
  slot         text NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
  title        text NOT NULL,
  kcal         int CHECK (kcal IS NULL OR kcal >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_meal_plan_one_per_slot UNIQUE (user_id, plan_date, slot)
);

CREATE INDEX IF NOT EXISTS ops_meal_plan_user_week_idx
  ON ops_meal_plan (user_id, plan_date);

ALTER TABLE ops_meal_plan ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ops_meal_plan_owner_all ON ops_meal_plan;
    CREATE POLICY ops_meal_plan_owner_all ON ops_meal_plan
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
