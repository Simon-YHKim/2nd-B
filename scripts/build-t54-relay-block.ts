// Local artifact builder only. No database connection or environment-file reads.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const T54_BODY_MD5 = "455fdf6e2ef02ba68ee1e055e077cff3";
export const T54_EXPECTED = {
  sourcesBefore: "7f1153faff057989785dd7bc3c190ac4",
  sourcesAfter: "2ec5cd68ac4f0bbb9d16dc7943b078a5",
  triggers: "d4293a68fb609923d404e4a1bf234cc5",
  recordsMarker: "db9032428b9c0e618c947a22a68ca898",
};
export const T54_PREREQUISITES = [
  "0022_wiki_rag", "0218_records_system_tags", "0223_minor_locked_import_sources",
  "0239_profile_context_import", "0242_profile_context_import_integrity", "0251_reasoning_proposals_purge",
] as const;

// NOT NULL is checked by attnotnull. PG18 also exposes contype='n', PG17 does not.
export const T54_SOURCES_SCHEMA = `SELECT md5(COALESCE(string_agg(item, E'\\n' ORDER BY item COLLATE "C"),'')) FROM (
 SELECT jsonb_build_array('column',a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,
   pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated,
   col_description(a.attrelid,a.attnum),
   (SELECT jsonb_agg(x::text ORDER BY x::text COLLATE "C") FROM unnest(a.attacl) x))::text AS item
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.sources'::regclass AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT jsonb_build_array('table',c.relrowsecurity,c.relforcerowsecurity,c.relkind,c.relpersistence,
   pg_get_userbyid(c.relowner),(SELECT jsonb_agg(x::text ORDER BY x::text COLLATE "C") FROM unnest(c.relacl) x))::text
 FROM pg_class c WHERE c.oid='public.sources'::regclass
 UNION ALL SELECT jsonb_build_array('constraint',conname,contype,condeferrable,condeferred,
   convalidated,conislocal,connoinherit,pg_get_constraintdef(oid))::text
 FROM pg_constraint WHERE conrelid='public.sources'::regclass AND contype <> 'n'
 UNION ALL SELECT jsonb_build_array('index',c.relname,i.indisunique,i.indisvalid,i.indisready,i.indimmediate,
   pg_get_indexdef(i.indexrelid))::text FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
 WHERE i.indrelid='public.sources'::regclass
 UNION ALL SELECT jsonb_build_array('policy',policyname,permissive,roles,cmd,qual,with_check)::text
 FROM pg_policies WHERE schemaname='public' AND tablename='sources'
) fingerprints`;

export const T54_SOURCE_TRIGGERS = `SELECT md5(COALESCE(string_agg(jsonb_build_array(
 t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),p.proname,pg_get_function_identity_arguments(p.oid),
 md5(replace(p.prosrc,chr(13),'')),p.prosecdef,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner),
 (SELECT jsonb_agg(x::text ORDER BY x::text COLLATE "C") FROM unnest(p.proacl) x))::text,
 E'\\n' ORDER BY t.tgname COLLATE "C"),''))
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE t.tgrelid='public.sources'::regclass AND NOT t.tgisinternal`;

// 0263 changes other records columns/triggers. Only the actual 0218 prerequisite
// belongs here, so 0264 can run before or after the independent 0263 migration.
export const T54_RECORDS_MARKER = `SELECT md5(COALESCE(string_agg(item,E'\\n' ORDER BY item COLLATE "C"),'')) FROM (
 SELECT jsonb_build_array('column',a.attname,a.atttypid::regtype::text,a.attnotnull,
   pg_get_expr(d.adbin,d.adrelid),col_description(a.attrelid,a.attnum))::text AS item
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.records'::regclass AND a.attname='system_tags' AND NOT a.attisdropped
 UNION ALL SELECT jsonb_build_array('constraint',conname,contype,convalidated,conislocal,connoinherit,
   pg_get_constraintdef(oid))::text FROM pg_constraint
 WHERE conrelid='public.records'::regclass AND conname='records_system_tags_shape' AND contype <> 'n'
) fingerprints`;

const sourceRows = `SELECT md5(COALESCE(string_agg((to_jsonb(s)-'system_tags')::text,E'\\n' ORDER BY s.id),'')) FROM public.sources s`;
const ledgerMatch = (name: string) => `(name='${name}' OR (version='${name.slice(0, 4)}' AND name='${name.slice(5)}'))`;
const applied = ledgerMatch("0264_sources_system_tags");

export function t54PrestateQuery(): string {
  return `-- Read-only. The three expressions below are identical to the Relay guards.
SELECT (${T54_SOURCES_SCHEMA}) AS sources_schema_md5,
  (${T54_SOURCE_TRIGGERS}) AS source_triggers_md5,
  (${T54_RECORDS_MARKER}) AS records_marker_md5;
`;
}

export function buildT54RelayBlock(migration: string): string {
  const q = migration.replace(/\r\n/g, "\n");
  if (createHash("md5").update(q).digest("hex") !== T54_BODY_MD5) throw new Error("T54_REVIEWED_BODY_CHANGED");
  const guards = T54_PREREQUISITES.map((name) => `  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE ${ledgerMatch(name)}) THEN
    RAISE EXCEPTION 'needs_prerequisites_0264: ${name}';
  END IF;`).join("\n");
  return `-- 2ndB / T54 / 2ndb-4e / Relay executes this WHOLE file with execute_sql.
-- Prepared locally. Coordinator compares prestate-query.sql before Relay applies.
-- Never use apply_migration: this block writes its own timestamp-version ledger row.
-- 0263 is independent. Relay applies SQL; coordinator owns #2658 merge and web publish.
-- Embedded reviewed 0264 is unchanged after CRLF -> LF normalization.
DO $apply0264$
DECLARE q text := $mig0264$${q}$mig0264$;
  v_rows text; v_version text; v_tries integer := 0;
BEGIN
  PERFORM set_config('lock_timeout','10s',true);
  q := replace(q,chr(13),'');
  IF md5(q) <> '${T54_BODY_MD5}' THEN RAISE EXCEPTION 'text_mismatch_0264'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('2ndb:relay:t54-system-tags',0));
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE ${applied}) THEN
    RAISE EXCEPTION 'already_applied_0264';
  END IF;
${guards}
  LOCK TABLE public.records IN ACCESS SHARE MODE;
  LOCK TABLE public.sources IN ACCESS EXCLUSIVE MODE;
  IF (${T54_SOURCES_SCHEMA}) IS DISTINCT FROM '${T54_EXPECTED.sourcesBefore}' THEN RAISE EXCEPTION 'unexpected_sources_schema_0264'; END IF;
  IF (${T54_SOURCE_TRIGGERS}) IS DISTINCT FROM '${T54_EXPECTED.triggers}' THEN RAISE EXCEPTION 'unexpected_source_triggers_0264'; END IF;
  IF (${T54_RECORDS_MARKER}) IS DISTINCT FROM '${T54_EXPECTED.recordsMarker}' THEN RAISE EXCEPTION 'unexpected_records_marker_0264'; END IF;
  SELECT (${sourceRows}) INTO v_rows;
  EXECUTE q;
  IF (${sourceRows}) IS DISTINCT FROM v_rows THEN RAISE EXCEPTION 'source_data_mismatch_0264'; END IF;
  IF EXISTS (SELECT 1 FROM public.sources WHERE cardinality(system_tags)<>0) THEN RAISE EXCEPTION 'source_markers_not_empty_0264'; END IF;
  IF (${T54_SOURCES_SCHEMA}) IS DISTINCT FROM '${T54_EXPECTED.sourcesAfter}' THEN RAISE EXCEPTION 'sources_schema_differs_from_replica_0264'; END IF;
  IF (${T54_SOURCE_TRIGGERS}) IS DISTINCT FROM '${T54_EXPECTED.triggers}' THEN RAISE EXCEPTION 'source_triggers_changed_0264'; END IF;
  IF (${T54_RECORDS_MARKER}) IS DISTINCT FROM '${T54_EXPECTED.recordsMarker}' THEN RAISE EXCEPTION 'records_marker_changed_0264'; END IF;
  v_version := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYYMMDDHH24MISS');
  WHILE EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=v_version) LOOP
    v_tries := v_tries+1;
    IF v_tries>5 THEN RAISE EXCEPTION 'ledger_version_taken_0264'; END IF;
    PERFORM pg_sleep(1);
    v_version := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYYMMDDHH24MISS');
  END LOOP;
  INSERT INTO supabase_migrations.schema_migrations(version,statements,name,created_by)
    VALUES(v_version,ARRAY[q],'0264_sources_system_tags','hwanydanh@gmail.com');
END
$apply0264$;
SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE ${applied}) AS ledger_0264,
  (${T54_SOURCES_SCHEMA})='${T54_EXPECTED.sourcesAfter}' AS sources_schema_matches,
  (${T54_SOURCE_TRIGGERS})='${T54_EXPECTED.triggers}' AS source_triggers_match,
  (${T54_RECORDS_MARKER})='${T54_EXPECTED.recordsMarker}' AS records_marker_matches,
  NOT EXISTS (SELECT 1 FROM public.sources WHERE cardinality(system_tags)<>0) AS source_markers_empty,
  (SELECT count(*) FROM public.sources) AS sources_rows;
`;
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out || process.argv.length !== 3) throw new Error("Usage: npx tsx scripts/build-t54-relay-block.ts <output-directory>");
  const migration = readFileSync(resolve("db/migrations/0264_sources_system_tags.sql"), "utf8");
  const block = buildT54RelayBlock(migration);
  mkdirSync(resolve(out), { recursive: true });
  writeFileSync(resolve(out, "coding-4e-0264-apply-block.sql"), block, { flag: "wx" });
  writeFileSync(resolve(out, "prestate-query.sql"), t54PrestateQuery(), { flag: "wx" });
}
