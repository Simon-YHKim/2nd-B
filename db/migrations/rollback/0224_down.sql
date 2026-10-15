-- rollback/0224_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- ⚠ Order: first ship a client whose ledger-ratify no longer sends `import_key`
-- (createImportedLedgerEntry upserts on user_id,import_key and fails without the
-- column). Then run this. Dropping the column discards the keys only; the ledger
-- rows stay, and re-importing a statement can book duplicates again.

DROP INDEX IF EXISTS ops_ledger_user_import_key_uidx;
ALTER TABLE ops_ledger DROP CONSTRAINT IF EXISTS ops_ledger_import_key_format;
ALTER TABLE ops_ledger DROP COLUMN IF EXISTS import_key;
