-- 0044_ingest.sql
-- §1 ingest gate (AI-OS Personal Context Layer, queue B). Backs the dedup +
-- relevance gate that sits in front of Phase 1/2 normalization.
--
-- Two parts:
--   1. `sources` gains the gate's bookkeeping columns:
--      - content_hash    post-scrub normalized-text idempotency key (C2),
--                        produced by src/lib/ingest/dedup.ts contentHash().
--                        A partial UNIQUE (user_id, content_hash) makes exact
--                        dedup a DB invariant — re-dumping the same clipping
--                        can't create a second row even if the client gate is
--                        bypassed (defense in depth).
--      - relevance_score Gemini-derived 1..5 (distinct from simon_relevance,
--                        which the clipper template supplies). Below-threshold
--                        clips are dropped to ingest_log, NOT stored here.
--      - dedup_of        when a near-duplicate is kept and linked to the
--                        earlier survivor instead of dropped (normally NULL).
--
--   2. `ingest_log` — the drop ledger. Drops that happen BEFORE any Gemini
--      call (exact/near duplicate, policy block) never produce an ai_audit_log
--      row (C1/C3: ai_audit_log records Gemini calls only). This table is the
--      separate accountability trail for "why was my clip discarded", so a
--      dropped clipping is explainable without a Gemini round-trip.
--
-- Append-only: select/insert policies only, no update/delete — a drop record
-- can't be rewritten after the fact (mirrors consent_records, 0031).
--
-- NOT YET WIRED: src/lib/ingest/gate.ts (queue C) writes here. Adding the
-- schema first keeps that change pure-orchestration.

-- 1. sources gate columns (idempotent) -------------------------------------
ALTER TABLE sources ADD COLUMN IF NOT EXISTS content_hash    text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS relevance_score int;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS dedup_of        uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sources_dedup_of_fkey'
  ) THEN
    ALTER TABLE sources
      ADD CONSTRAINT sources_dedup_of_fkey
      FOREIGN KEY (dedup_of) REFERENCES sources(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sources_relevance_score_range'
  ) THEN
    ALTER TABLE sources
      ADD CONSTRAINT sources_relevance_score_range
      CHECK (relevance_score IS NULL OR relevance_score BETWEEN 1 AND 5);
  END IF;
END $$;

-- Exact-dedup idempotency as a DB invariant (partial: only enforced once a
-- hash is set, so legacy rows with NULL content_hash are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS sources_user_content_hash_uniq
  ON sources (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- 2. ingest_log drop ledger -------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_hash  text,                                   -- the dropped clip's hash (nullable: pre-hash failures)
  stage         text NOT NULL CHECK (stage IN (
                  'exact_duplicate',   -- content_hash already ingested
                  'near_duplicate',    -- MinHash-LSH match above threshold
                  'low_relevance',     -- Gemini relevance below keep threshold
                  'schema_invalid',    -- normalization output failed Zod after retries
                  'policy_block'       -- ingest safety policy quarantined it (A5)
                )),
  reason        text,                                   -- human-readable detail (no PII)
  survivor_id   uuid REFERENCES sources(id) ON DELETE SET NULL,  -- the kept row a dup collapsed onto
  dropped_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_log_user_idx
  ON ingest_log (user_id, dropped_at DESC);

ALTER TABLE ingest_log ENABLE ROW LEVEL SECURITY;

-- Per-user RLS (0031 idiom). A user reads and appends only their own drop
-- records. No UPDATE/DELETE policies -> the ledger is immutable from the
-- client; service_role (server) bypasses RLS.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ingest_log_select_own ON ingest_log;
    DROP POLICY IF EXISTS ingest_log_insert_own ON ingest_log;

    CREATE POLICY ingest_log_select_own ON ingest_log
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    CREATE POLICY ingest_log_insert_own ON ingest_log
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
