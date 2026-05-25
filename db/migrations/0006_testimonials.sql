-- 0006_testimonials.sql
-- C5: testimonials require explicit consent before any display.
-- consent_given_at is NOT NULL: rows without timestamp cannot be inserted.

CREATE TABLE IF NOT EXISTS testimonials (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body                     text NOT NULL,
  locale                   text NOT NULL CHECK (locale IN ('en', 'ko')),
  consent_given_at         timestamptz NOT NULL,                             -- C5
  consent_ip               inet,
  share_with_judges_flag   boolean NOT NULL DEFAULT false,                   -- C5
  approved_for_public      boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonials_user_idx ON testimonials (user_id);
CREATE INDEX IF NOT EXISTS testimonials_judge_share_idx
  ON testimonials (share_with_judges_flag)
  WHERE share_with_judges_flag = true;
