-- 0051_srs_cards.sql
-- Wave 1 (language_practice ops domain): spaced-repetition flashcards. A review
-- session deterministically ticks the user's language_practice routine the same
-- way a logged workout ticks exercise_routine (0049) and a Pomodoro ticks
-- daily_focus (0048) — no Gemini call lives anywhere in this path. The
-- scheduling math is owned by ts-fsrs (MIT, pure JS, $0); these tables only
-- persist the FSRS Card state and the review log.
--
-- Privacy posture: owner-only RLS (auth.uid() = user_id), mirroring
-- health_samples_owner_all (0049) and ops_routines_owner_all (0048). The
-- explicit user_id argument must equal auth.uid() or the policy rejects the
-- write.
--
-- FORWARD-ONLY: this is an additive, idempotent migration (create table if not
-- exists, guarded create policy, create index if not exists). Re-running it is a
-- no-op. Never edit a shipped migration — add a new numbered one instead.

----------------------------------------------------------------------
-- srs_cards: one flashcard per row. The FSRS state columns map ts-fsrs
-- `Card` 1:1 (due/stability/difficulty/elapsed_days/scheduled_days/reps/
-- lapses/state/last_review) so rowToFsrsCard / fsrsCardToRow is a pure shuffle.
-- state: 0=New, 1=Learning, 2=Review, 3=Relearning (ts-fsrs State enum).
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS srs_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  front           text NOT NULL,
  back            text NOT NULL,
  -- nullable topic/lang tag (e.g. 'es', 'verbs'); groups a deck for review.
  deck            text,
  -- FSRS Card state (ts-fsrs) -----------------------------------------
  due             timestamptz NOT NULL,
  stability       double precision,
  difficulty      double precision,
  elapsed_days    integer,
  scheduled_days  integer,
  reps            integer NOT NULL DEFAULT 0,
  lapses          integer NOT NULL DEFAULT 0,
  state           smallint NOT NULL DEFAULT 0,
  last_review     timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- The due-queue read (due <= now, owner-scoped) is the hot path.
CREATE INDEX IF NOT EXISTS srs_cards_user_due_idx
  ON srs_cards (user_id, due);

----------------------------------------------------------------------
-- srs_reviews: append-only log of each grading. rating maps ts-fsrs Rating
-- 1=Again, 2=Hard, 3=Good, 4=Easy. reviewed_on is the local calendar day,
-- mirroring ops_routine_logs.completed_on, so the "queue cleared today"
-- auto-complete rule is computable.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS srs_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          smallint NOT NULL,
  reviewed_on     date NOT NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS srs_reviews_user_reviewed_idx
  ON srs_reviews (user_id, reviewed_on DESC);

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors health_samples_owner_all in 0049)
----------------------------------------------------------------------

ALTER TABLE srs_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS srs_cards_owner_all ON srs_cards;
    CREATE POLICY srs_cards_owner_all ON srs_cards
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS srs_reviews_owner_all ON srs_reviews;
    CREATE POLICY srs_reviews_owner_all ON srs_reviews
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
