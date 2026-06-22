-- 20260622_usage_counters.sql
-- Per-user, per-month reasoning usage counter backing the new pricing tiers
-- (별바라기 / 항해자 / 북극성). One row per (user_id, month_bucket); the row
-- bumps on each reasoning run and accumulates rewarded watch-to-earn credits.
-- The tier -> cap mapping lives in the application layer
-- (src/lib/entitlements/reasoning-cap.ts); this table only records the counts.
--
-- month_bucket is a KST 'YYYY-MM' string computed by the client
-- (src/lib/entitlements/usage.ts monthBucket()) so the reset boundary follows
-- KST month rollover. Reads fail OPEN on the client side, so an absent table
-- never wrongly blocks a user.

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  month_bucket    text NOT NULL,
  reasoning_used  int NOT NULL DEFAULT 0,
  reward_credits  int NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_bucket),
  CONSTRAINT usage_counters_reasoning_nonneg CHECK (reasoning_used >= 0),
  CONSTRAINT usage_counters_credits_nonneg   CHECK (reward_credits >= 0)
);

CREATE INDEX IF NOT EXISTS usage_counters_user_month_idx
  ON usage_counters (user_id, month_bucket DESC);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

-- A user can read and write only their own rows. Split per command so the
-- intent is explicit (SELECT / INSERT / UPDATE), each scoped to auth.uid().
DROP POLICY IF EXISTS usage_counters_owner_select ON usage_counters;
CREATE POLICY usage_counters_owner_select ON usage_counters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS usage_counters_owner_insert ON usage_counters;
CREATE POLICY usage_counters_owner_insert ON usage_counters
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS usage_counters_owner_update ON usage_counters;
CREATE POLICY usage_counters_owner_update ON usage_counters
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at maintainer (re-uses set_updated_at from 0010_triggers.sql).
DROP TRIGGER IF EXISTS trg_usage_counters_updated_at ON usage_counters;
CREATE TRIGGER trg_usage_counters_updated_at
  BEFORE UPDATE ON usage_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
