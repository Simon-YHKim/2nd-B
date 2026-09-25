import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractRegistrySql, renderRegistrySql, replayMigrations, type Registry } from "./generate-erasure-registry";

const BASE = "0189_erasure_registry.sql";
export const ADDITIONS_BEGIN = "-- <<< erasure-registry:additions from db/erasure-registry.json >>>";
export const ADDITIONS_END = "-- <<< /erasure-registry:additions >>>";
const identifier = /^[a-z][a-z0-9_]*$/;
const literal = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Check each boundary independently: joining prefix and suffix would let a
 * block comment wrap (and disable) the entire generated migration. PostgreSQL
 * permits nested block comments; an unfinished line comment in a prefix would
 * swallow the BEGIN marker, so require its terminating newline too. */
function completeCommentsOnly(sql: string, prefix: boolean): boolean {
  let at = 0;
  while (at < sql.length) {
    if (/[ \t\r\n\f]/.test(sql[at])) { at++; continue; }
    if (sql.startsWith("--", at)) {
      const end = sql.indexOf("\n", at + 2);
      if (end < 0) return !prefix;
      at = end + 1;
      continue;
    }
    if (!sql.startsWith("/*", at)) return false;
    let depth = 1;
    at += 2;
    while (at < sql.length && depth > 0) {
      if (sql.startsWith("/*", at)) { depth++; at += 2; }
      else if (sql.startsWith("*/", at)) { depth--; at += 2; }
      else at++;
    }
    if (depth !== 0) return false;
  }
  return true;
}

/** A forward migration only upserts its declared additions. Never prune the
 * existing registry with a partial snapshot, and never provision user tables
 * in a migration that 0189's rollback must replay. */
export function renderRegistryAdditionsSql(registry: Registry): string {
  const names = Object.keys(registry.tables).sort();
  if (!names.length) throw new Error("registry additions must not be empty");
  const rows = names.map((name) => {
    const e = registry.tables[name];
    if (!identifier.test(name) || !identifier.test(e.owner) ||
        !["retained", "client_erasable", "account_delete_only"].includes(e.class) ||
        typeof e.reason !== "string" || !e.reason.trim() ||
        (e.class === "client_erasable" && (!Number.isSafeInteger(e.order) || e.order! < 1)) ||
        (e.cascadesFrom !== undefined && !identifier.test(e.cascadesFrom))) {
      throw new Error(`invalid registry addition: ${name}`);
    }
    return `    (${literal(name)}, ${literal(e.owner)}, ${literal(e.class)}, ${e.class === "client_erasable" ? e.order : "NULL"}, ${e.cascadesFrom === undefined ? "NULL" : literal(e.cascadesFrom)}, ${literal(e.reason)})`;
  });
  return [
    ADDITIONS_BEGIN,
    "-- Generated additions only. Existing registry rows and user data remain untouched.",
    "DO $erasure_additions$",
    "DECLARE target record;",
    "BEGIN",
    "  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN",
    "    RAISE EXCEPTION 'erasure_additions_prerequisites_missing';",
    "  END IF;",
    "  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')",
    "     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN",
    "    RAISE EXCEPTION 'erasure_additions_rpc_must_remain_locked';",
    "  END IF;",
    "  FOR target IN SELECT * FROM (VALUES",
    names.map((name) => `    (${literal(name)}, ${literal(registry.tables[name].owner)})`).join(",\n"),
    "  ) AS additions(table_name,owner_column) LOOP",
    "    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c",
    "      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
    "      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid",
    "      WHERE n.nspname='public' AND c.relname=target.table_name AND c.relkind IN ('r','p')",
    "        AND a.attname=target.owner_column AND a.attnum>0 AND NOT a.attisdropped",
    "        AND a.atttypid='uuid'::regtype) THEN",
    "      RAISE EXCEPTION 'erasure_additions_owner_table_missing';",
    "    END IF;",
    "  END LOOP;",
    "END $erasure_additions$;",
    "WITH incoming (table_name,owner_column,class,delete_order,cascades_from,reason) AS (",
    "  VALUES",
    rows.join(",\n"),
    ")",
    "INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)",
    "SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i",
    "ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,",
    "  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;",
    ADDITIONS_END,
  ].join("\n");
}

/** The current canonical JSON owns every row. forwardAdditions only assigns
 * new rows to later numbered files; subtract them to verify historical 0189
 * without rewriting it. This does not permit changes to historical rows. */
export function collectErasureSeedHistoryErrors(root: string, registry: Registry): string[] {
  const errors: string[] = [];
  const migrations = join(root, "db", "migrations");
  const raw = JSON.parse(readFileSync(join(root, "db", "erasure-registry.json"), "utf8")) as { forwardAdditions?: unknown };
  const mapping = raw.forwardAdditions;
  if (mapping !== undefined && (mapping === null || typeof mapping !== "object" || Array.isArray(mapping))) {
    return ["G7 forwardAdditions must map numbered migration filenames to nonempty table-name arrays."];
  }
  const assigned = new Set<string>();
  const files = new Set<string>();
  const sqlFiles = readdirSync(migrations).filter((name) => name.endsWith(".sql"));
  for (const [file, value] of Object.entries(mapping ?? {})) {
    const match = /^(\d{4})_[a-z][a-z0-9_]*\.sql$/.exec(file);
    if (!match || Number(match[1]) <= 189 || !Array.isArray(value) || !value.length) {
      errors.push(`G7 invalid forwardAdditions entry: ${file}`);
      continue;
    }
    files.add(file);
    if (sqlFiles.some((other) => other !== file && Number(/^(\d+)[_-]/.exec(other)?.[1]) === Number(match[1]))) {
      errors.push(`G7 ${file} migration number is already used by another SQL file.`);
    }
    const before = replayMigrations(migrations, file);
    const selected: Registry = { version: registry.version, tables: {} };
    for (const table of value) {
      if (typeof table !== "string" || !identifier.test(table) ||
          !Object.hasOwn(registry.tables, table) || assigned.has(table)) {
        errors.push(`G7 ${file} has an unknown or repeated registry table.`);
        continue;
      }
      assigned.add(table);
      selected.tables[table] = registry.tables[table];
      if (!before.tables.get(table)?.ownerColumns.some((column) => column.name === registry.tables[table].owner)) {
        errors.push(`G7 ${table}.${registry.tables[table].owner} owner column must exist before ${file}.`);
      }
    }
    try {
      const sql = readFileSync(join(migrations, file), "utf8").replace(/\r\n/g, "\n");
      const expected = renderRegistryAdditionsSql(selected);
      const at = sql.indexOf(ADDITIONS_BEGIN);
      if (at < 0 || sql.slice(at, at + expected.length) !== expected ||
          !completeCommentsOnly(sql.slice(0, at), true) ||
          !completeCommentsOnly(sql.slice(at + expected.length), false)) {
        errors.push(`G7 ${file} must contain only its exact generated additions and comments; provisioning cannot be replayed with the registry.`);
      }
    } catch {
      errors.push(`G7 ${file} is missing or its additions cannot be rendered.`);
    }
  }
  for (const file of sqlFiles) {
    if (readFileSync(join(migrations, file), "utf8").includes(ADDITIONS_BEGIN) && !files.has(file)) {
      errors.push(`G7 ${file} contains undeclared forward additions.`);
    }
  }
  const baseline: Registry = { version: registry.version, tables: Object.fromEntries(
    Object.entries(registry.tables).filter(([name]) => !assigned.has(name)),
  ) };
  try {
    const embedded = extractRegistrySql(readFileSync(join(migrations, BASE), "utf8"));
    if (embedded === null || embedded.replace(/\r\n/g, "\n") !== renderRegistrySql(baseline)) {
      errors.push(`G7 the seed block in db/migrations/${BASE} no longer matches the historical subset of db/erasure-registry.json. Preserve 0189; declare new rows in forwardAdditions.`);
    }
  } catch {
    errors.push(`G7 db/migrations/${BASE} is missing or cannot be rendered.`);
  }
  return errors;
}
