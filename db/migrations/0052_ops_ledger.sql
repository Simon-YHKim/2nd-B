-- 0052_ops_ledger.sql
-- Wave 2 (money_check / 재정 점검) manage layer: a deterministic manual ledger.
-- The user records income/expense rows; the monthly summary is computed from
-- them (src/lib/finance/ledger.ts). No Gemini call lives here — this is a manual
-- structured-input source, so there is no new C1/C9/C3 surface. FX conversion
-- (src/lib/finance/fx.ts) is optional client-side enrichment, not stored here.
--
-- Owner-only RLS (auth.uid() = user_id), mirroring ops_routines_owner_all in
-- 0048. Additive + idempotent (create table if not exists, guarded create
-- policy) so re-running is safe. NOTE: this is the PERSONAL ledger, distinct from
-- the business `revenue_events` table (constraint C4) — different table, no
-- overlap.

----------------------------------------------------------------------
-- ops_ledger: one manual income/expense entry per row
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_on  date NOT NULL DEFAULT CURRENT_DATE,
  kind         text NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_krw   bigint NOT NULL CHECK (amount_krw >= 0),                 -- whole won; KRW has no minor unit
  category     text NOT NULL DEFAULT '기타',
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_ledger_user_month_idx
  ON ops_ledger (user_id, occurred_on DESC);

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors ops_routines_owner_all in 0048)
----------------------------------------------------------------------

ALTER TABLE ops_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ops_ledger_owner_all ON ops_ledger;
    CREATE POLICY ops_ledger_owner_all ON ops_ledger
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
