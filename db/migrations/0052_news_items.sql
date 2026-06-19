-- 0052_news_items.sql
-- Wave 2: per-user news digest cache for the news_digest ops domain.
--
-- RSS is the ground truth ($0, deterministic): fetched articles are cached here
-- as rows. The AI summary is an OPT-IN, CAPPED, CACHED step — `summary` is NULL
-- until the user explicitly asks, and the UNIQUE(user_id, url) key guarantees an
-- article is stored (and therefore summarized) at most ONCE per user. That key
-- makes a re-pull idempotent (ON CONFLICT DO NOTHING) and is the cost guard for
-- summaries: setSummary writes onto the single existing row, so we never pay to
-- summarize the same article twice.
--
-- Privacy posture: owner-only RLS (auth.uid() = user_id), mirroring
-- health_samples_owner_all in 0049 / ops_routines_owner_all in 0048. Each row is
-- scoped to the signed-in user.
--
-- Additive + idempotent (create table if not exists, guarded create policy,
-- create index if not exists) and forward-only, so re-running is safe.

----------------------------------------------------------------------
-- news_items: one row per (user, article-url) cached news article
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS news_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          text NOT NULL,
  title           text NOT NULL,
  url             text NOT NULL,
  published_at    timestamptz,
  snippet         text,
  -- NULL until the user opts in to an AI summary; written once via setSummary.
  summary         text,
  -- Atomic double-bill guard (Codex P2 #2). The in-memory "already cached"
  -- check cannot stop two concurrent callers (two tabs/devices) from BOTH
  -- reaching callGemini for the same article. summary_status is the DB
  -- compare-and-set claim: claimSummarySlot flips 'none' -> 'pending' for
  -- exactly one caller (UPDATE ... WHERE summary_status='none'), the loser sees
  -- 0 rows affected and skips the LLM. On success the row becomes 'done'; a
  -- blocked/failed call releases it back to 'none' so a later retry can claim.
  --   none    = no summary, free to claim
  --   pending = a caller has claimed the slot and the LLM call is in flight
  --   done    = a real summary is stored (the only state listDigest treats as summarized)
  summary_status  text NOT NULL DEFAULT 'none'
                  CHECK (summary_status IN ('none', 'pending', 'done')),
  created_at      timestamptz DEFAULT now(),
  -- Idempotent re-pull AND "summarize once": the same article for the same user
  -- collapses to one row, so the cached summary is never recomputed.
  CONSTRAINT news_items_user_url_unique UNIQUE (user_id, url)
);

-- Idempotent add for environments where news_items already exists from an
-- earlier run of this (still unapplied) migration. NOT NULL DEFAULT 'none' is
-- safe to backfill; legacy rows that already carry a summary are normalized to
-- 'done' so listDigest keeps treating them as summarized.
ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS summary_status text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'news_items_summary_status_check'
  ) THEN
    ALTER TABLE news_items
      ADD CONSTRAINT news_items_summary_status_check
      CHECK (summary_status IN ('none', 'pending', 'done'));
  END IF;
END $$;

UPDATE news_items
  SET summary_status = 'done'
  WHERE summary IS NOT NULL AND length(btrim(summary)) > 0 AND summary_status <> 'done';

CREATE INDEX IF NOT EXISTS news_items_user_published_idx
  ON news_items (user_id, published_at DESC);

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors health_samples_owner_all in 0049)
----------------------------------------------------------------------

ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS news_items_owner_all ON news_items;
    CREATE POLICY news_items_owner_all ON news_items
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
