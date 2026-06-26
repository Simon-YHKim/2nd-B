-- 0058_relation_people.sql
-- Layer-A domain backing for the 관계(relation) star. Until now the relation
-- domain had NO structured table — it lit only from free-text records tagged
-- `domain:relation`, so the assistant had nothing concrete to cite ("who are my
-- people, how close, how often do we talk"). This adds a deterministic,
-- manual-input table of named people + lightweight relationship signals, exactly
-- mirroring the ops_* manage-layer pattern (ops_ledger 0052, ops_routines 0048):
-- no Gemini call lives here, so no new C1/C9/C3 surface.
--
-- Vocabulary stays lifestyle-neutral per blueprint §3 (lexicon.ts): closeness +
-- contact cadence, NOT clinical attachment/pathology terms. Owner-only RLS
-- (auth.uid() = user_id). Additive + idempotent so re-running is safe.

----------------------------------------------------------------------
-- relation_people: one person the user has a relationship with
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS relation_people (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name        text NOT NULL,
  relation_kind       text NOT NULL DEFAULT 'other'
                        CHECK (relation_kind IN ('family','partner','friend','colleague','mentor','other')),
  closeness           int  CHECK (closeness BETWEEN 1 AND 5),        -- subjective 1..5, optional
  contact_cadence     text CHECK (contact_cadence IN ('daily','weekly','monthly','rarely')),  -- rhythm signal, optional
  last_interaction_on date,                                          -- recency signal for advice, optional
  note                text,
  tags                text[] NOT NULL DEFAULT '{}',                  -- presence marks the row "organized" (domain-confidence ②)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relation_people_user_idx
  ON relation_people (user_id, last_interaction_on DESC NULLS LAST);

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors ops_ledger_owner_all in 0052)
----------------------------------------------------------------------

ALTER TABLE relation_people ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS relation_people_owner_all ON relation_people;
    CREATE POLICY relation_people_owner_all ON relation_people
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
