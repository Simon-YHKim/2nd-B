-- 0059_recreation_items.sql
-- Layer-A domain backing for the 오락(recreation) star. Like 관계 before 0058,
-- recreation had NO structured table — it lit only from free-text records tagged
-- `domain:recreation` plus weak `sources` clip signals, so taste/leisure was
-- invisible to the assistant ("what do I actually enjoy, what am I into lately").
-- This adds a deterministic manual log of leisure items (games, films, music,
-- trips, shows, hobbies) with a status + optional taste rating, mirroring the
-- ops_reading (0053) shelf pattern. No Gemini call here: no new C1/C9/C3 surface.
--
-- Vocabulary neutral per blueprint §3. Owner-only RLS. Additive + idempotent.

----------------------------------------------------------------------
-- recreation_items: one leisure / taste item the user logs
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recreation_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  category     text NOT NULL DEFAULT 'other'
                 CHECK (category IN ('game','movie','music','travel','show','hobby','other')),
  status       text NOT NULL DEFAULT 'done'
                 CHECK (status IN ('want','active','done')),
  rating       int  CHECK (rating BETWEEN 1 AND 5),                -- taste signal, optional
  note         text,
  tags         text[] NOT NULL DEFAULT '{}',                       -- presence marks the row "organized" (domain-confidence ②)
  occurred_on  date,                                               -- recency signal, optional
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recreation_items_user_idx
  ON recreation_items (user_id, occurred_on DESC NULLS LAST);

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors ops_ledger_owner_all in 0052)
----------------------------------------------------------------------

ALTER TABLE recreation_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS recreation_items_owner_all ON recreation_items;
    CREATE POLICY recreation_items_owner_all ON recreation_items
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
