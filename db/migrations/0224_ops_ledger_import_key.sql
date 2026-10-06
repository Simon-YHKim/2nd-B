-- 0224_ops_ledger_import_key.sql
-- H1 (재설계 통합 회신 v2, Simon 확인 2026-10-07 01:20): importing the same bank or card
-- statement twice booked every row twice. ops_ledger had no natural key, and
-- src/lib/import/ledger-ratify.ts recorded that as a known limitation.
--
-- The client now sends one key per imported row, `csv:v1:` + 16 hex characters. The key hashes
-- the row's date, kind, amount and label together with the row's position among identical rows
-- of the same import, so two identical coffees on one day stay two rows while a second import of
-- the same file finds both keys taken. Hand-entered rows have no key (NULL), and NULLs never
-- collide in a unique index, so manual booking is unchanged.
--
-- The index is not partial on purpose: PostgREST upsert names its conflict columns
-- (`on_conflict=user_id,import_key`) and cannot add the WHERE clause a partial index would need.
-- Additive and idempotent. Production held 0 ops_ledger rows on 2026-10-07 00:4x KST.

ALTER TABLE ops_ledger ADD COLUMN IF NOT EXISTS import_key text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ops_ledger_import_key_format'
  ) THEN
    ALTER TABLE ops_ledger ADD CONSTRAINT ops_ledger_import_key_format
      CHECK (import_key IS NULL OR import_key ~ '^csv:v1:[0-9a-f]{16}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ops_ledger_user_import_key_uidx
  ON ops_ledger (user_id, import_key);
