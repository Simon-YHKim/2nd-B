import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  extractRegistrySql,
  renderRegistrySql,
  replayMigrations,
  type Registry,
  type RegistryEntry,
} from "./generate-erasure-registry";

const BASE = "0189_erasure_registry.sql";
export const ADDITIONS_BEGIN = "-- <<< erasure-registry:additions from db/erasure-registry.json >>>";
export const ADDITIONS_END = "-- <<< /erasure-registry:additions >>>";
export const REVISIONS_BEGIN = "-- <<< erasure-registry:revisions from db/erasure-registry.json >>>";
export const REVISIONS_END = "-- <<< /erasure-registry:revisions >>>";
const REVISIONS_TAG = "$erasure_revisions$";
const identifier = /^[a-z][a-z0-9_]*$/;
const forwardFile = /^(\d{4})_[a-z][a-z0-9_]*\.sql$/;
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

/** True when `file` holds `expected` once, with only complete comments around it. */
function holdsExactlyGenerated(file: string, expected: string, begin: string): boolean {
  const sql = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const at = sql.indexOf(begin);
  return at >= 0 && sql.slice(at, at + expected.length) === expected &&
    completeCommentsOnly(sql.slice(0, at), true) &&
    completeCommentsOnly(sql.slice(at + expected.length), false);
}

function validEntry(name: string, e: RegistryEntry): boolean {
  return identifier.test(name) && identifier.test(e.owner) &&
    ["retained", "client_erasable", "account_delete_only"].includes(e.class) &&
    typeof e.reason === "string" && Boolean(e.reason.trim()) &&
    !(e.class === "client_erasable" && (!Number.isSafeInteger(e.order) || e.order! < 1)) &&
    !(e.cascadesFrom !== undefined && !identifier.test(e.cascadesFrom));
}

/** A forward migration only upserts its declared additions. Never prune the
 * existing registry with a partial snapshot, and never provision user tables
 * in a migration that 0189's rollback must replay. */
export function renderRegistryAdditionsSql(registry: Registry): string {
  const names = Object.keys(registry.tables).sort();
  if (!names.length) throw new Error("registry additions must not be empty");
  const rows = names.map((name) => {
    const e = registry.tables[name];
    if (!validEntry(name, e)) {
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

/** What one forward revision renders for one table: the row as it stands after
 * the revision, and the reason it replaces. */
export type RegistryRevision = { entry: RegistryEntry; previousReason: string };

/** A reason revision rewrites ONE column of rows that already exist. It never
 * inserts, never prunes, and never touches owner, class, order or cascade: the
 * UPDATE only matches a row whose classification is exactly the one recorded,
 * whose reason is the recorded previous one (or already the new one, so a
 * replay converges), and it must match exactly one row per table. A row in any
 * other state is drift the author has to look at, so the migration stops. */
export function renderRegistryRevisionsSql(revisions: Record<string, RegistryRevision>): string {
  const names = Object.keys(revisions).sort();
  if (!names.length) throw new Error("registry revisions must not be empty");
  const rows = names.map((name) => {
    const { entry: e, previousReason } = revisions[name];
    if (!validEntry(name, e) || typeof previousReason !== "string" || !previousReason.trim() ||
        previousReason === e.reason || e.reason.includes(REVISIONS_TAG) || previousReason.includes(REVISIONS_TAG)) {
      throw new Error(`invalid registry revision: ${name}`);
    }
    return `    (${literal(name)}, ${literal(e.owner)}, ${literal(e.class)}, ${e.class === "client_erasable" ? e.order : "NULL"}::int, ${e.cascadesFrom === undefined ? "NULL" : literal(e.cascadesFrom)}::text,\n` +
      `     ${literal(previousReason)},\n` +
      `     ${literal(e.reason)})`;
  });
  return [
    REVISIONS_BEGIN,
    "-- Generated reason revisions only. Owner, class, order and cascade stay as they were;",
    "-- no row is added or removed and user data remains untouched.",
    `DO ${REVISIONS_TAG}`,
    "DECLARE",
    "  target record;",
    "  v_rows bigint;",
    "BEGIN",
    "  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN",
    "    RAISE EXCEPTION 'erasure_revisions_prerequisites_missing';",
    "  END IF;",
    "  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')",
    "     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN",
    "    RAISE EXCEPTION 'erasure_revisions_rpc_must_remain_locked';",
    "  END IF;",
    "  FOR target IN SELECT * FROM (VALUES",
    rows.join(",\n"),
    "  ) AS revisions(table_name,owner_column,class,delete_order,cascades_from,previous_reason,reason) LOOP",
    "    UPDATE public.erasure_registry AS r SET reason = target.reason",
    "     WHERE r.table_name = target.table_name AND r.owner_column = target.owner_column",
    "       AND r.class = target.class AND r.delete_order IS NOT DISTINCT FROM target.delete_order",
    "       AND r.cascades_from IS NOT DISTINCT FROM target.cascades_from",
    "       AND r.reason IN (target.previous_reason, target.reason);",
    "    GET DIAGNOSTICS v_rows = ROW_COUNT;",
    "    IF v_rows <> 1 THEN",
    "      RAISE EXCEPTION 'erasure_revisions_row_not_in_recorded_state: %', target.table_name;",
    "    END IF;",
    "  END LOOP;",
    `END ${REVISIONS_TAG};`,
    REVISIONS_END,
  ].join("\n");
}

type Revision = { file: string; number: number; previousReason: string };

/** The current canonical JSON owns every row. forwardAdditions only assigns
 * new rows to later numbered files; subtract them to verify historical 0189
 * without rewriting it. forwardRevisions records, per later numbered file and
 * table, the REASON the row carried before that file: walking those back gives
 * the historical reason 0189 (or the forward that added the row) must still
 * render byte-for-byte, and walking forward gives what each revision file must
 * render. Only the reason may be revised. Owner, class, order and cascade are
 * still pinned to 0189 by the same comparison, so a reclassification still
 * needs its own reviewed design. */
export function collectErasureSeedHistoryErrors(root: string, registry: Registry): string[] {
  const errors: string[] = [];
  const migrations = join(root, "db", "migrations");
  const raw = JSON.parse(readFileSync(join(root, "db", "erasure-registry.json"), "utf8")) as {
    forwardAdditions?: unknown;
    forwardRevisions?: unknown;
  };
  const mapping = raw.forwardAdditions;
  if (mapping !== undefined && (mapping === null || typeof mapping !== "object" || Array.isArray(mapping))) {
    return ["G7 forwardAdditions must map numbered migration filenames to nonempty table-name arrays."];
  }
  const revisionMap = raw.forwardRevisions;
  if (revisionMap !== undefined && (revisionMap === null || typeof revisionMap !== "object" || Array.isArray(revisionMap))) {
    return ["G7 forwardRevisions must map numbered migration filenames to {table: {previousReason}} objects."];
  }
  const sqlFiles = readdirSync(migrations).filter((name) => name.endsWith(".sql"));
  const numberTaken = (file: string, number: number): boolean =>
    sqlFiles.some((other) => other !== file && Number(/^(\d+)[_-]/.exec(other)?.[1]) === number);

  // Revisions first: the additions check and the 0189 baseline both need the
  // historical reason, which is the earliest revision's recorded previous one.
  const revisionFiles = new Set<string>();
  const chains = new Map<string, Revision[]>();
  for (const [file, value] of Object.entries(revisionMap ?? {})) {
    const match = forwardFile.exec(file);
    if (!match || Number(match[1]) <= 189 || value === null || typeof value !== "object" ||
        Array.isArray(value) || !Object.keys(value).length) {
      errors.push(`G7 invalid forwardRevisions entry: ${file}`);
      continue;
    }
    revisionFiles.add(file);
    if (numberTaken(file, Number(match[1]))) {
      errors.push(`G7 ${file} migration number is already used by another SQL file.`);
    }
    if (Object.hasOwn(mapping ?? {}, file)) {
      errors.push(`G7 ${file} is declared in both forwardAdditions and forwardRevisions; give each its own file.`);
    }
    for (const [table, revision] of Object.entries(value as Record<string, unknown>)) {
      const previous = (revision as { previousReason?: unknown } | null)?.previousReason;
      if (!identifier.test(table) || !Object.hasOwn(registry.tables, table) || revision === null ||
          typeof revision !== "object" || Array.isArray(revision) ||
          Object.keys(revision).join() !== "previousReason" ||
          typeof previous !== "string" || !previous.trim()) {
        errors.push(`G7 ${file} revises an unknown table or records a malformed previousReason.`);
        continue;
      }
      const chain = chains.get(table) ?? [];
      chain.push({ file, number: Number(match[1]), previousReason: previous });
      chains.set(table, chain);
    }
  }
  for (const chain of chains.values()) chain.sort((a, b) => a.number - b.number);
  const historical = (table: string): RegistryEntry => {
    const first = chains.get(table)?.[0];
    return first ? { ...registry.tables[table], reason: first.previousReason } : registry.tables[table];
  };
  const reasonAfter = (table: string, file: string): string => {
    const chain = chains.get(table) ?? [];
    const next = chain[chain.findIndex((r) => r.file === file) + 1];
    return next ? next.previousReason : registry.tables[table].reason;
  };

  const assigned = new Map<string, number>();
  const files = new Set<string>();
  for (const [file, value] of Object.entries(mapping ?? {})) {
    const match = forwardFile.exec(file);
    if (!match || Number(match[1]) <= 189 || !Array.isArray(value) || !value.length) {
      errors.push(`G7 invalid forwardAdditions entry: ${file}`);
      continue;
    }
    files.add(file);
    if (numberTaken(file, Number(match[1]))) {
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
      assigned.set(table, Number(match[1]));
      selected.tables[table] = historical(table);
      if (!before.tables.get(table)?.ownerColumns.some((column) => column.name === registry.tables[table].owner)) {
        errors.push(`G7 ${table}.${registry.tables[table].owner} owner column must exist before ${file}.`);
      }
    }
    try {
      if (!holdsExactlyGenerated(join(migrations, file), renderRegistryAdditionsSql(selected), ADDITIONS_BEGIN)) {
        errors.push(`G7 ${file} must contain only its exact generated additions and comments; provisioning cannot be replayed with the registry.`);
      }
    } catch {
      errors.push(`G7 ${file} is missing or its additions cannot be rendered.`);
    }
  }

  for (const file of revisionFiles) {
    const number = Number(forwardFile.exec(file)![1]);
    const selected: Record<string, RegistryRevision> = {};
    for (const [table, chain] of chains) {
      const revision = chain.find((r) => r.file === file);
      if (!revision) continue;
      const addedIn = assigned.get(table);
      if (addedIn !== undefined && number <= addedIn) {
        errors.push(`G7 ${file} revises ${table} before the forward migration that adds it.`);
      }
      const reason = reasonAfter(table, file);
      if (reason === revision.previousReason) {
        errors.push(`G7 ${file} records a revision of ${table} that changes nothing; drop it.`);
      }
      selected[table] = { entry: { ...registry.tables[table], reason }, previousReason: revision.previousReason };
    }
    if (!Object.keys(selected).length) continue; // every table was malformed and already reported
    try {
      if (!holdsExactlyGenerated(join(migrations, file), renderRegistryRevisionsSql(selected), REVISIONS_BEGIN)) {
        errors.push(`G7 ${file} must contain only its exact generated revisions and comments; provisioning cannot be replayed with the registry.`);
      }
    } catch {
      errors.push(`G7 ${file} is missing or its revisions cannot be rendered.`);
    }
  }

  for (const file of sqlFiles) {
    const text = readFileSync(join(migrations, file), "utf8");
    if (text.includes(ADDITIONS_BEGIN) && !files.has(file)) {
      errors.push(`G7 ${file} contains undeclared forward additions.`);
    }
    if (text.includes(REVISIONS_BEGIN) && !revisionFiles.has(file)) {
      errors.push(`G7 ${file} contains undeclared forward revisions.`);
    }
  }
  const baseline: Registry = { version: registry.version, tables: Object.fromEntries(
    Object.keys(registry.tables).filter((name) => !assigned.has(name)).map((name) => [name, historical(name)]),
  ) };
  try {
    const embedded = extractRegistrySql(readFileSync(join(migrations, BASE), "utf8"));
    if (embedded === null || embedded.replace(/\r\n/g, "\n") !== renderRegistrySql(baseline)) {
      errors.push(`G7 the seed block in db/migrations/${BASE} no longer matches the historical subset of db/erasure-registry.json. Preserve 0189; declare new rows in forwardAdditions and reason changes in forwardRevisions.`);
    }
  } catch {
    errors.push(`G7 db/migrations/${BASE} is missing or cannot be rendered.`);
  }
  return errors;
}
