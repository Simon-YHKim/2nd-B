-- 0264_sources_system_tags.sql
-- T54 / Q-261013-40, Q-261013-41: sources joins records' explicit app markers.
-- Schema only. Never infer provenance from old tags or rewrite existing rows.
-- Existing sources owner RLS, managed-import guards, indexes and grants stay as-is.
-- No destructive DOWN: retain this column and its markers during app recovery.
-- Apply this entire file in ONE transaction (CLI or Relay); no outer BEGIN/COMMIT.
-- Operations: docs/ops/t54-system-tags-0264.md. Records ratification requires 0218.

SET LOCAL lock_timeout = '10s';

DO $prerequisites$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=to_regclass('public.records') AND a.attname='system_tags' AND NOT a.attisdropped
      AND a.atttypid='text[]'::regtype AND a.attnotnull
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) IN ('ARRAY[]::text[]', '''{}''::text[]')) THEN
    RAISE EXCEPTION '0264: records.system_tags (0218) is required';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION '0264: public.sources (0022) is required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='public.sources'::regclass AND attname='system_tags' AND NOT attisdropped)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.sources'::regclass AND a.attname='system_tags' AND NOT a.attisdropped
        AND a.atttypid='text[]'::regtype AND a.attnotnull
        AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) IN ('ARRAY[]::text[]', '''{}''::text[]')
    ) THEN
    RAISE EXCEPTION '0264: existing sources.system_tags differs from text[] NOT NULL DEFAULT empty array';
  END IF;
END $prerequisites$;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Parse the exact 0218 shape in this server. A temporary constraint name lets us
-- compare an existing check's parsed expression without replacing it or relying
-- on PostgreSQL-version-specific pretty-printing. It is never left in the schema.
ALTER TABLE public.sources ADD CONSTRAINT sources_system_tags_0264_expected CHECK (
  CASE
    WHEN cardinality(system_tags) = 0 THEN true
    WHEN array_ndims(system_tags) <> 1 OR array_lower(system_tags, 1) <> 1 THEN false
    WHEN array_position(system_tags, NULL) IS NOT NULL THEN false
    WHEN cardinality(system_tags) > 16 THEN false
    WHEN length(array_to_string(system_tags, ','))
         - length(replace(array_to_string(system_tags, ','), ',', '')) <> cardinality(system_tags) - 1 THEN false
    WHEN array_to_string(system_tags, ',') !~ '^[A-Za-z0-9_.:-]{1,64}(,[A-Za-z0-9_.:-]{1,64})*$' THEN false
    WHEN lower(array_to_string(system_tags, ',')) ~ '(^|,)domain:' THEN false
    ELSE true
  END
) NOT VALID;

DO $shape$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.sources'::regclass AND conname='sources_system_tags_shape') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint actual
      JOIN pg_catalog.pg_constraint expected ON expected.conrelid=actual.conrelid
        AND expected.conname='sources_system_tags_0264_expected'
      WHERE actual.conrelid='public.sources'::regclass AND actual.conname='sources_system_tags_shape'
        AND actual.contype='c' AND actual.convalidated AND actual.conislocal AND NOT actual.connoinherit
        AND pg_catalog.pg_get_expr(actual.conbin,actual.conrelid)
          = pg_catalog.pg_get_expr(expected.conbin,expected.conrelid)
    ) THEN
      RAISE EXCEPTION '0264: existing sources_system_tags_shape differs from the required validated check';
    END IF;
    ALTER TABLE public.sources DROP CONSTRAINT sources_system_tags_0264_expected;
  ELSE
    ALTER TABLE public.sources RENAME CONSTRAINT sources_system_tags_0264_expected TO sources_system_tags_shape;
    ALTER TABLE public.sources VALIDATE CONSTRAINT sources_system_tags_shape;
  END IF;
END $shape$;

COMMENT ON COLUMN public.sources.system_tags IS
  'Markers explicitly attached by the app, including reasoning:ratified. Never inferred from old tags; sources.tags keeps user tags and domain: classification.';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.sources'::regclass AND a.attname='system_tags' AND NOT a.attisdropped
      AND a.atttypid='text[]'::regtype AND a.attnotnull
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) IN ('ARRAY[]::text[]', '''{}''::text[]')
      AND pg_catalog.col_description(a.attrelid,a.attnum) =
        'Markers explicitly attached by the app, including reasoning:ratified. Never inferred from old tags; sources.tags keeps user tags and domain: classification.'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.sources'::regclass
      AND conname='sources_system_tags_shape' AND contype='c' AND convalidated
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.sources'::regclass
      AND conname='sources_system_tags_0264_expected'
  ) THEN
    RAISE EXCEPTION '0264: sources.system_tags schema postcondition failed';
  END IF;
  -- P2: user trigger bodies must neither read nor write this marker column.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='public.sources'::regclass AND NOT t.tgisinternal
      AND position('system_tags' IN lower(p.prosrc))>0
  ) THEN
    RAISE EXCEPTION '0264: a sources user trigger references system_tags';
  END IF;
END $verify$;
