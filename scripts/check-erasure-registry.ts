// check:erasure-registry -- keeps the deletion registry honest against the schema.
//
// WHY THIS EXISTS. docs/S3-SERVER-DELETION.md measured three defects in the
// hand-maintained delete list, and all three are the same defect:
//
//   F1  `deleteAllUserData` DELETEs chat_usage and reports the row count. That
//       count is always 0, because 0025 dropped chat_usage_owner_all and left a
//       SELECT-only policy. RLS filters rows, it does not raise, so a wipe that
//       erased nothing reported success.
//   F2  A comment in delete-bulk.ts claimed personas had no DELETE policy. It has
//       had `personas_owner_all FOR ALL` since 0009.
//   F4  Eleven owner-deletable tables were never in the delete list at all.
//
// Prose cannot hold a fact this shaped. So the classification lives in
// db/erasure-registry.json and this guard re-derives the schema every run and
// refuses to let the two disagree. Seven rules, each tied to the defect it stops:
//
//   G1 completeness    every public table with an owner column is classified   (F4)
//   G2 no stale rows   every classified table still exists                     (drift)
//   G3 policy match    client_erasable really has a DELETE or ALL policy       (F1)
//   G4 policy match    account_delete_only really has neither                  (F4/F2)
//   G5 well-formed     reason present, owner column real, delete order sane
//   G6 retention       the retention ledgers are never erasure targets
//   G7 one original    0189's seed block is byte-identical to a fresh render
//
// G3/G4 read the migrations, not production. That is the honest limit and it is
// stated in the failure text: prod is behind main, so a policy added after the
// last applied migration is true here and not yet true there.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  discoverOwnedTables,
  extractRegistrySql,
  loadRegistry,
  migrationsDir,
  renderRegistrySql,
  stripSqlComments,
  ERASURE_CLASSES,
  REGISTRY_PATH,
  type ErasureClass,
  type Registry,
} from "./generate-erasure-registry";

/** The migration that carries the DB-side copy of the registry. */
const REGISTRY_MIGRATION = "0189_erasure_registry.sql";

/** Ledgers the erasure path must never target. The dispatch and
 *  docs/S3-SERVER-DELETION.md 6 both name these five; pinning them here means a
 *  future edit that reclassifies one has to delete this line and explain why. */
const MUST_BE_RETAINED = [
  "consent_records",
  "ai_audit_log",
  "revenue_events",
  "credit_ledger",
  "paddle_webhook_events",
];

type PolicyState = { command: string; roles: string; file: string };

/**
 * Final RLS policy state per table, replaying db/migrations in apply order.
 *
 * A policy name can be dropped and recreated across migrations (0025 does this
 * to chat_usage; 0102 rewrote the whole schema for the initplan wrap), so the
 * LAST statement for a given (table, policy name) wins. Reading only CREATE
 * statements would report chat_usage as deletable, which is exactly the wrong
 * answer.
 */
function finalPolicies(MIGRATIONS: string): Map<string, Map<string, PolicyState | null>> {
  const byTable = new Map<string, Map<string, PolicyState | null>>();
  const slot = (table: string): Map<string, PolicyState | null> => {
    const existing = byTable.get(table);
    if (existing) return existing;
    const fresh = new Map<string, PolicyState | null>();
    byTable.set(table, fresh);
    return fresh;
  };

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), "utf8"));

    const dropRe =
      /\bdrop\s+policy\s+(?:if\s+exists\s+)?"?([A-Za-z_][\w]*)"?\s+on\s+(?:(?:public|storage)\s*\.\s*)?"?([A-Za-z_][\w]*)"?/gi;
    let m: RegExpExecArray | null;
    while ((m = dropRe.exec(sql)) !== null) slot(m[2].toLowerCase()).set(m[1].toLowerCase(), null);

    // The tail is bounded because a policy body can be long; everything we need
    // (FOR <cmd>, TO <roles>) sits before the first USING / WITH CHECK.
    const createRe =
      /\bcreate\s+policy\s+"?([A-Za-z_][\w]*)"?\s+on\s+(?:(?:public|storage)\s*\.\s*)?"?([A-Za-z_][\w]*)"?([\s\S]{0,240}?)(?:using|with\s+check|;|\$p\$)/gi;
    while ((m = createRe.exec(sql)) !== null) {
      const tail = m[3];
      // Postgres defaults an unqualified policy to FOR ALL.
      const command = (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(tail)?.[1] ?? "all").toLowerCase();
      const roles = (/\bto\s+([a-z_,\s]+)/i.exec(tail)?.[1] ?? "public").trim();
      slot(m[2].toLowerCase()).set(m[1].toLowerCase(), { command, roles, file });
    }
  }
  return byTable;
}

function ownerDeletePolicies(
  policies: Map<string, Map<string, PolicyState | null>>,
  table: string,
): { name: string; state: PolicyState }[] {
  const found: { name: string; state: PolicyState }[] = [];
  for (const [name, state] of policies.get(table) ?? new Map<string, PolicyState | null>()) {
    if (state === null) continue;
    if (state.command !== "delete" && state.command !== "all") continue;
    // service_role bypasses RLS anyway; a policy scoped only to it is not an
    // owner-facing delete path.
    if (!/authenticated|public/.test(state.roles)) continue;
    found.push({ name, state });
  }
  return found;
}

function isErasureClass(value: unknown): value is ErasureClass {
  return typeof value === "string" && (ERASURE_CLASSES as readonly string[]).includes(value);
}

/**
 * Every rule, as a list of human-readable failures. Exported so the tests can
 * feed it a mutated tree and prove the guard actually goes red - a guard nobody
 * has seen fail is a guard nobody has tested.
 */
export function collectErasureRegistryErrors(root: string): string[] {
  const MIGRATIONS = migrationsDir(root);
  const errors: string[] = [];
  const discovered = discoverOwnedTables(MIGRATIONS);
  const discoveredByName = new Map(discovered.map((d) => [d.table, d]));

  let registry: Registry;
  try {
    registry = loadRegistry(root);
  } catch (e) {
    return [`${REGISTRY_PATH} could not be read: ${String(e)}`];
  }

  const policies = finalPolicies(MIGRATIONS);

  // G1 -- a new user-owned table must be classified before it can merge.
  for (const d of discovered) {
    if (d.table in registry.tables) continue;
    errors.push(
      `G1 ${d.table} (${d.definedIn}) has an owner column (${d.ownerColumns
        .map((c) => c.name)
        .join(", ")}) but no entry in ${REGISTRY_PATH}. ` +
        `Run \`npx tsx scripts/generate-erasure-registry.ts --missing\` and classify it. ` +
        `Leaving it out is how eleven tables drifted out of the delete list (F4).`,
    );
  }

  // G2 -- and a table that is gone must not linger in the registry.
  for (const table of Object.keys(registry.tables)) {
    if (discoveredByName.has(table)) continue;
    errors.push(
      `G2 ${REGISTRY_PATH} classifies ${table}, but no CREATE TABLE in db/migrations gives it ` +
        `an owner column. Remove the entry, or fix the owner-column name.`,
    );
  }

  const seenOrders = new Map<number, string>();
  for (const [table, entry] of Object.entries(registry.tables)) {
    const discoveredEntry = discoveredByName.get(table);
    if (!discoveredEntry) continue; // already reported by G2

    // G5 -- well-formedness. A classification without a reason is how the wrong
    // fate becomes invisible; require one for every class, not only `retained`.
    if (!isErasureClass(entry.class)) {
      errors.push(`G5 ${table}: class must be one of ${ERASURE_CLASSES.join(" | ")}, got ${String(entry.class)}`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) {
      errors.push(`G5 ${table}: every entry needs a written reason (>= 10 chars).`);
    }
    if (!discoveredEntry.ownerColumns.some((c) => c.name === entry.owner)) {
      errors.push(
        `G5 ${table}: owner "${entry.owner}" is not a column the schema gives it. ` +
          `Candidates: ${discoveredEntry.ownerColumns.map((c) => c.name).join(", ")}`,
      );
    }
    if (entry.class === "client_erasable") {
      if (typeof entry.order !== "number" || !Number.isInteger(entry.order)) {
        errors.push(`G5 ${table}: client_erasable needs an integer "order" (FK and CHECK order is real).`);
      } else {
        const clash = seenOrders.get(entry.order);
        if (clash) errors.push(`G5 ${table}: delete order ${entry.order} already used by ${clash}.`);
        else seenOrders.set(entry.order, table);
      }
    } else if (entry.order !== undefined) {
      errors.push(`G5 ${table}: only client_erasable carries a delete order.`);
    }

    const deletable = ownerDeletePolicies(policies, table);

    // G3 -- the F1 check. Promising to erase a table the owner cannot touch is
    // how a wipe returns 0 and calls it success.
    if (entry.class === "client_erasable" && deletable.length === 0) {
      errors.push(
        `G3 ${table} is client_erasable but db/migrations leaves it with no DELETE or ALL policy ` +
          `for authenticated. That is the chat_usage defect (F1): the DELETE would match 0 rows ` +
          `and report success. Either add the policy in a migration, or reclassify.`,
      );
    }

    // G4 -- the F4 check, from the other side.
    if (entry.class === "account_delete_only" && deletable.length > 0) {
      errors.push(
        `G4 ${table} is account_delete_only but the owner CAN delete it ` +
          `(${deletable.map((p) => `${p.name} FOR ${p.state.command.toUpperCase()} @ ${p.state.file}`).join(", ")}). ` +
          `Classify it client_erasable, or retained with a written reason.`,
      );
    }
  }

  // G6 -- the retention ledgers.
  for (const table of MUST_BE_RETAINED) {
    const entry = registry.tables[table];
    if (!entry) {
      errors.push(`G6 ${table} must appear in ${REGISTRY_PATH} as retained.`);
    } else if (entry.class !== "retained") {
      errors.push(
        `G6 ${table} is classified ${entry.class}. It is a retention ledger and must be retained ` +
          `(docs/S3-SERVER-DELETION.md 6).`,
      );
    }
  }

  // G7 -- one original. The DB copy is a render of the JSON or it is nothing.
  const migrationPath = join(MIGRATIONS, REGISTRY_MIGRATION);
  let migrationSql: string | null = null;
  try {
    migrationSql = readFileSync(migrationPath, "utf8");
  } catch {
    errors.push(`G7 db/migrations/${REGISTRY_MIGRATION} is missing; the registry has no DB copy.`);
  }
  if (migrationSql !== null) {
    const embedded = extractRegistrySql(migrationSql);
    const expected = renderRegistrySql(registry);
    if (embedded === null) {
      errors.push(
        `G7 db/migrations/${REGISTRY_MIGRATION} has no generated block. Insert the output of ` +
          `\`npx tsx scripts/generate-erasure-registry.ts --sql\` between its markers.`,
      );
    } else if (embedded.replace(/\r\n/g, "\n") !== expected) {
      errors.push(
        `G7 the seed block in db/migrations/${REGISTRY_MIGRATION} no longer matches ${REGISTRY_PATH}. ` +
          `Regenerate it: \`npx tsx scripts/generate-erasure-registry.ts --sql\`. ` +
          `Two copies of one fact always end up disagreeing; that is the point of this rule.`,
      );
    }
  }

  return errors;
}

function main(): void {
  const root = process.cwd();
  const errors = collectErasureRegistryErrors(root);
  if (errors.length > 0) {
    console.error("ERASURE FAIL  deletion registry does not match the schema:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  const registry = loadRegistry(root);
  const counts: Record<string, number> = {};
  for (const e of Object.values(registry.tables)) counts[e.class] = (counts[e.class] ?? 0) + 1;
  console.log(
    `ERASURE PASS  ${discoverOwnedTables(migrationsDir(root)).length} owner-column tables, ` +
      `all classified (${ERASURE_CLASSES.map((c) => `${c} ${counts[c] ?? 0}`).join(", ")}); ` +
      `policy match + 0189 seed parity verified.`,
  );
}

if (require.main === module) main();
