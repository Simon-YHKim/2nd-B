-- 0069_ops_daily_brief.sql (D-26 A17 / docs/LLM-ROUTING.md).
--
-- Per-user, per-KST-day cache of the consolidated ops recommendations across
-- ALL life domains, produced by ONE LLM call. Before this, the ops home
-- auto-ran recommendForDomain per group-tab on every visit (an in-session TTL
-- cache softened it, but a fresh app open each day still fired one LLM call
-- PER domain viewed). Now the first ops visit of the day builds the whole
-- brief once; every later visit/tab-flip serves from this row (0 LLM) — the
-- D-26 "-1,700 RPD" consolidation lever.
--
-- `brief` is a JSON object { <domainId>: OpsRecommendation[] }. It is DERIVED
-- data (regenerable from the wiki snapshot), so no backfill and no strong
-- consistency needs — a missing/updated row just means one rebuild.
--
-- The `day` column resets the cache at KST midnight (callers pass the KST date
-- via kstDayKey, same boundary as chat_usage / ops_usage).

CREATE TABLE IF NOT EXISTS ops_daily_brief (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  brief       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS ops_daily_brief_user_day_idx ON ops_daily_brief (user_id, day DESC);

ALTER TABLE ops_daily_brief ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_daily_brief_owner_all ON ops_daily_brief;
CREATE POLICY ops_daily_brief_owner_all ON ops_daily_brief
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
