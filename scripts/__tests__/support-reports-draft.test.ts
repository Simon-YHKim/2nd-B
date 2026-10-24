import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkAccountExportInventory } from "../check-account-export-inventory";
import { loadRegistry, migrationsDir, replayMigrations, type ForeignKeyEdge } from "../generate-erasure-registry";

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const draft = read("db/migration-drafts/UNNUMBERED_support_reports.sql");
const inventory = JSON.parse(read("db/migration-drafts/support-reports.inventory.json"));

test("draft erasure overlay is classified without pretending the table is deployed", () => {
  expect(inventory.table).toBe("support_reports");
  expect(inventory.erasure.owner).toBe("user_id");
  expect(inventory.erasure.class).toBe("account_delete_only");
  expect(draft).toContain("'support_reports','user_id','account_delete_only',NULL,NULL");
  expect(draft).toContain(inventory.erasure.reason);
  expect(draft).toContain("REFERENCES public.users(id) ON DELETE CASCADE");
  expect(loadRegistry(root).tables).not.toHaveProperty("support_reports");
});

test("draft export overlay passes the real classification ratchet and omission fails", () => {
  const registry = loadRegistry(root);
  const { foreignKeys } = replayMigrations(migrationsDir(root));
  const source = read("supabase/functions/export-account/index.ts");
  expect(inventory.export.kind).toBe("PENDING");
  const edges: ForeignKeyEdge[] = [...foreignKeys, { child: "support_reports", parent: "users", childColumns: ["user_id"], onDelete: "cascade", definedIn: "T53 draft", constraintName: null }];
  const direct = [...Object.keys(registry.tables), "support_reports"];
  const overlay = source.replace('const PENDING_EXPORT: Readonly<Record<string, string>> = Object.freeze({',
    `const PENDING_EXPORT: Readonly<Record<string, string>> = Object.freeze({support_reports: ${JSON.stringify(inventory.export.reason)},`);
  expect(checkAccountExportInventory(direct, edges, overlay).errors).toEqual([]);
  expect(checkAccountExportInventory(direct, edges, source).errors).toContain("support_reports: expected exactly one classification, found 0");
});

test("RPC serialization, explicit ACLs, return-only receipt and retention remain in draft", () => {
  for (const marker of ["FOR UPDATE", "RETURNS uuid", "auth.uid()", ">= 2", ">= 10", "interval '24 hours'",
    "interval '30 days'", "ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY",
    "FROM PUBLIC, anon, authenticated, service_role", "TO authenticated;", "support_request_conflict",
    "cron.schedule('purge-support-reports'", "p_metadata - ARRAY['app_version','screen_path','locale']"]) expect(draft).toContain(marker);
  expect(draft.indexOf("RETURN v_existing.id")).toBeLessThan(draft.indexOf("support_rate_limited"));
});
