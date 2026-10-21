// Classify every registered user table and every reachable public FK child.
// This checks inventory, not row ownership, effective ACLs or legal access rights.
// The SQL CI lane compares this parser's reachable graph with pg_constraint.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { loadRegistry, migrationsDir, replayMigrations, type ForeignKeyEdge } from "./generate-erasure-registry";

export const EXPORT_SOURCE = "supabase/functions/export-account/index.ts";
const OUTSIDE_GRAPH_EXCLUSIONS = new Set([
  "crisis_events", "llm_proxy_capacity_reservations", "peer_response_rate_limits",
]);
type Classification = "EXPORT" | "EXCLUDED" | "PENDING";
export type InventoryEntry = { table: string; kind: Classification; reason?: string };

function literal(node: ts.Node | undefined): string {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text;
  throw new Error("Inventory values must be string literals");
}

function properties(node: ts.Expression): Map<string, ts.Expression> {
  if (!ts.isObjectLiteralExpression(node)) throw new Error("Inventory entry must be an object literal");
  const result = new Map<string, ts.Expression>();
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop) ||
        (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name))) {
      throw new Error("Inventory properties must be explicit (no spread or computed keys)");
    }
    if (result.has(prop.name.text)) throw new Error(`Duplicate inventory property: ${prop.name.text}`);
    result.set(prop.name.text, prop.initializer);
  }
  return result;
}

/** Read actual declarations with the TS parser: comments, JSON aliases, duplicate
 * object keys and executable/dynamic expressions cannot masquerade as entries. */
export function readExportInventory(source: string): { entries: InventoryEntry[]; errors: string[] } {
  const file = ts.createSourceFile(EXPORT_SOURCE, source, ts.ScriptTarget.Latest, true);
  const entries: InventoryEntry[] = [];
  const errors: string[] = [];
  const initializers = new Map<string, ts.Expression>();
  for (const stmt of file.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) initializers.set(decl.name.text, decl.initializer);
    }
  }
  for (const [name, kind] of [
    ["EXPORT_TABLES", "EXPORT"], ["EXCLUDED", "EXCLUDED"], ["PENDING_EXPORT", "PENDING"],
  ] as const) {
    try {
      const init = initializers.get(name);
      if (!init || !ts.isCallExpression(init) || init.expression.getText(file) !== "Object.freeze" || init.arguments.length !== 1) {
        throw new Error(`${name} must be Object.freeze of an explicit literal`);
      }
      const value = init.arguments[0];
      if (kind === "EXPORT") {
        if (!ts.isArrayLiteralExpression(value)) throw new Error("EXPORT_TABLES must be an array literal");
        for (const item of value.elements) {
          const descriptor = properties(item);
          if (!literal(descriptor.get("fk")).trim()) throw new Error("Export descriptor needs an owner predicate");
          entries.push({ table: literal(descriptor.get("table")), kind });
        }
      } else {
        for (const [table, reason] of properties(value)) entries.push({ table, kind, reason: literal(reason) });
      }
    } catch (error) {
      errors.push(`${name}: ${(error as Error).message}`);
    }
  }

  // users is deliberately outside EXPORT_TABLES: require its real profile read
  // and payload assignment, rather than a table name somewhere in a comment.
  let profileRead = false;
  let profileOutput = false;
  const notQueried = new Set(entries.filter(e => e.kind !== "EXPORT").map(e => e.table));
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "profileResult" && node.initializer) {
      const expr = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      profileRead = expr.getText(file).replace(/\s+/g, "").replace(/"/g, "'") ===
        "admin.from('users').select('*').eq('id',userId).maybeSingle()";
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.left.getText(file) === "tables.users" && node.right.getText(file) === "profileResult.data") profileOutput = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "from" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
        notQueried.has(node.arguments[0].text)) errors.push(`Non-export table queried: ${node.arguments[0].text}`);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!profileRead || !profileOutput) errors.push("users: missing owner-filtered profile read or tables.users assignment");
  else entries.push({ table: "users", kind: "EXPORT" });
  return { entries, errors };
}

/** No ON DELETE filter: SET NULL, RESTRICT, NO ACTION and SET DEFAULT count too.
 * A visited set terminates cycles and folds multiple ownership paths. */
export function reachableAccountTables(direct: Iterable<string>, edges: readonly ForeignKeyEdge[]): Set<string> {
  const tables = new Set(["users", ...direct]);
  for (const parent of tables) {
    for (const edge of edges) if (edge.parent === parent) tables.add(edge.child);
  }
  return tables;
}

export function checkAccountExportInventory(
  direct: Iterable<string>, edges: readonly ForeignKeyEdge[], source: string,
): { tables: Set<string>; entries: InventoryEntry[]; errors: string[] } {
  const tables = reachableAccountTables(direct, edges);
  const { entries, errors } = readExportInventory(source);
  const byTable = new Map<string, InventoryEntry[]>();
  for (const entry of entries) {
    const group = byTable.get(entry.table) ?? [];
    group.push(entry);
    byTable.set(entry.table, group);
    if (!/^[a-z_][a-z0-9_]*$/.test(entry.table)) errors.push(`Not a physical public table name: ${entry.table}`);
    if (!tables.has(entry.table) && !(entry.kind === "EXCLUDED" && OUTSIDE_GRAPH_EXCLUSIONS.has(entry.table))) {
      errors.push(`Table outside account inventory: ${entry.table}`);
    }
    if (entry.kind !== "EXPORT" && !entry.reason?.trim()) errors.push(`Empty ${entry.kind} reason: ${entry.table}`);
  }
  for (const table of new Set([...tables, ...byTable.keys()])) {
    const count = byTable.get(table)?.length ?? 0;
    if (count !== 1) errors.push(`${table}: expected exactly one classification, found ${count}`);
  }
  return { tables, entries, errors };
}

// A generated, session-local SQL fixture avoids a hand-maintained second list.
// Only identifiers/actions enter it, never exclusion prose or account data.
export function renderAccountExportCatalogSql(tables: Set<string>, edges: readonly ForeignKeyEdge[]): string {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const tuples = [...new Set(edges.filter(e => tables.has(e.parent)).map(e =>
    `(${quote(e.child)}, ${quote(e.parent)}, ${quote(e.childColumns.join(","))}, ${quote(e.onDelete)})`,
  ))].sort();
  return [
    "CREATE TEMP TABLE account_export_expected_tables (table_name text PRIMARY KEY);",
    `INSERT INTO account_export_expected_tables VALUES ${[...tables].sort().map(t => `(${quote(t)})`).join(",\n")};`,
    "CREATE TEMP TABLE account_export_expected_edges (child text, parent text, child_columns text, on_delete text);",
    ...(tuples.length ? [`INSERT INTO account_export_expected_edges VALUES ${tuples.join(",\n")};`] : []),
    "",
  ].join("\n");
}

function main(): void {
  const root = process.cwd();
  const direct = Object.keys(loadRegistry(root).tables);
  const { foreignKeys } = replayMigrations(migrationsDir(root));
  const result = checkAccountExportInventory(direct, foreignKeys, readFileSync(join(root, EXPORT_SOURCE), "utf8"));
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  const arg = process.argv.slice(2);
  if (arg.length) {
    if (arg.length !== 2 || arg[0] !== "--catalog-sql") throw new Error("Usage: check-account-export-inventory.ts [--catalog-sql path]");
    writeFileSync(arg[1], renderAccountExportCatalogSql(result.tables, foreignKeys));
  }
  const counts = (["EXPORT", "EXCLUDED", "PENDING"] as const).map(kind =>
    `${kind}=${result.entries.filter(e => e.kind === kind && e.table !== "users" && result.tables.has(e.table)).length}`,
  );
  console.log(`Account export inventory PASS: ${result.tables.size - 1} tables (${direct.length} direct), ${counts.join(", ")}; users separately verified; omissions/overlaps=0. Catalog/ACL/ownership are separate checks.`);
}

if (require.main === module) main();
