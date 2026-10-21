-- Run after all migrations in the isolated SQL CI database, in the same psql
-- session as check-account-export-inventory.ts --catalog-sql's temp tables.
-- Inventory only: this does not assert row ownership, SELECT ACLs or legal scope.
BEGIN;

CREATE TEMP VIEW account_export_catalog_edges AS
SELECT DISTINCT child.relname::text AS child, parent.relname::text AS parent,
       (SELECT string_agg(a.attname, ',' ORDER BY k.ordinality)
          FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum
       ) AS child_columns
FROM pg_catalog.pg_constraint fk
JOIN pg_catalog.pg_class child ON child.oid = fk.conrelid
JOIN pg_catalog.pg_namespace cn ON cn.oid = child.relnamespace
JOIN pg_catalog.pg_class parent ON parent.oid = fk.confrelid
JOIN pg_catalog.pg_namespace pn ON pn.oid = parent.relnamespace
WHERE fk.contype = 'f' AND cn.nspname = 'public' AND pn.nspname = 'public';

CREATE TEMP VIEW account_export_catalog_tables AS
WITH RECURSIVE reachable(table_name) AS (
  SELECT table_name::text COLLATE "C" FROM public.erasure_registry
  UNION
  SELECT e.child FROM account_export_catalog_edges e JOIN reachable r ON r.table_name = e.parent
), with_users(table_name) AS (
  -- users is also a root, independently of whether it is in erasure_registry.
  SELECT 'users'::text COLLATE "C"
  UNION
  SELECT e.child FROM account_export_catalog_edges e JOIN with_users r ON r.table_name = e.parent
)
SELECT table_name FROM reachable UNION SELECT table_name FROM with_users;

DO $inventory$
DECLARE delta text;
BEGIN
  SELECT string_agg(direction || ':' || table_name, ', ' ORDER BY direction, table_name)
  INTO delta FROM (
    SELECT 'catalog-only' AS direction, table_name FROM (
      SELECT table_name FROM account_export_catalog_tables
      EXCEPT SELECT table_name FROM account_export_expected_tables
    ) a
    UNION ALL
    SELECT 'static-only', table_name FROM (
      SELECT table_name FROM account_export_expected_tables
      EXCEPT SELECT table_name FROM account_export_catalog_tables
    ) b
  ) diff;
  IF delta IS NOT NULL THEN RAISE EXCEPTION 'Account export table-set mismatch: %', delta; END IF;

  -- Compare edges too, so a parser blind spot cannot hide behind a table that
  -- happens to be reachable by another FK. All delete actions are included;
  -- action labels and duplicate constraints do not change FK connectivity.
  WITH actual AS (
    SELECT e.* FROM account_export_catalog_edges e
    JOIN account_export_catalog_tables t ON t.table_name = e.parent
  ), diff AS (
    (SELECT * FROM actual EXCEPT SELECT * FROM account_export_expected_edges)
    UNION ALL
    (SELECT * FROM account_export_expected_edges EXCEPT SELECT * FROM actual)
  )
  SELECT string_agg(child || '(' || child_columns || ')->' || parent, ', ')
  INTO delta FROM diff;
  IF delta IS NOT NULL THEN RAISE EXCEPTION 'Account export FK-set mismatch: %', delta; END IF;

  RAISE NOTICE 'Account export catalog parity PASS: % tables plus users, % reachable FK edges',
    (SELECT count(*) - 1 FROM account_export_catalog_tables),
    (SELECT count(*) FROM account_export_catalog_edges e
      JOIN account_export_catalog_tables t ON t.table_name = e.parent);
END
$inventory$;

ROLLBACK;
