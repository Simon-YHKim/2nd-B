-- 0005_revenue_events.sql
-- C4: revenue tracking with month_bucket + is_related_party + customer_relation_type.
-- RevenueCat / Toss / Stripe webhooks insert here.
--
-- month_bucket is populated by trigger (not GENERATED) because to_char on
-- timestamptz is STABLE, not IMMUTABLE, which Postgres rejects in generated
-- columns. Trigger keeps the value normalized to UTC YYYY-MM on every
-- insert/update of occurred_at.

CREATE TYPE customer_relation AS ENUM (
  'arms_length',
  'family',
  'friend',
  'employee',
  'self',
  'unknown'
);

CREATE TABLE IF NOT EXISTS revenue_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_cents             integer NOT NULL,
  currency                 char(3) NOT NULL,
  occurred_at              timestamptz NOT NULL,
  is_related_party         boolean NOT NULL,                                 -- C4
  customer_relation_type   customer_relation NOT NULL,                      -- C4
  month_bucket             text NOT NULL,                                    -- C4 (populated by trigger)
  source                   text NOT NULL,                                    -- 'revenuecat' | 'toss' | 'stripe' | 'manual'
  external_id              text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_revenue_month_bucket() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.month_bucket := to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_revenue_month_bucket
  BEFORE INSERT OR UPDATE OF occurred_at ON revenue_events
  FOR EACH ROW EXECUTE FUNCTION set_revenue_month_bucket();

CREATE INDEX IF NOT EXISTS revenue_month_bucket_idx ON revenue_events (month_bucket);
CREATE INDEX IF NOT EXISTS revenue_related_party_idx ON revenue_events (is_related_party);
