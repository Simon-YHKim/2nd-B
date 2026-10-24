import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRegistry, migrationsDir, replayMigrations } from "../generate-erasure-registry";
import { readExportInventory } from "../check-account-export-inventory";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const migration = read("db/migrations/0270_crisis_ai_hold.sql");
const workflow = read(".github/workflows/supabase-dry-run.yml");

test("0270 is the exact reviewed LF blob, including its final newline", () => {
  expect(createHash("sha256").update(migration).digest("hex"))
    .toBe("a14c2b01e2e2eed933581fe0dab735ec031f32a7e25ad7e939e9f6c1a728fc61");
});

test("CI exercises both the pre-install backfill and final numbered schema", () => {
  expect(workflow).toContain("for boundary in 0265 0266 0267 0270 final; do");
  const backfill = workflow.split("- name: Exercise numbered D4 AI hold")[1].split("- name:")[0];
  expect(backfill).toContain("PGDATABASE: t39_t40_before_0270");
  expect(backfill).toContain("-f db/tests/crisis_ai_hold_regression.sql");
  const installed = workflow.split("- name: Exercise installed 0270")[1].split("- name:")[0];
  expect(installed).not.toContain("PGDATABASE:");
  expect(installed).toContain("-f db/tests/crisis_ai_hold_installed.sql");
});

test("numbered hold tables retain erasure and export classification after replay", () => {
  const schema = replayMigrations(migrationsDir(root));
  const registry = loadRegistry(root);
  const inventory = readExportInventory(read("supabase/functions/export-account/index.ts"));
  for (const name of ["records", "sources", "wiki_pages"]) {
    expect(schema.tables.has(name)).toBe(true);
    expect(migration).toContain(`ALTER TABLE public.${name} ADD COLUMN IF NOT EXISTS ai_hold boolean`);
    expect(registry.tables[name]?.class).toBe("client_erasable");
    expect(inventory.entries.filter(entry => entry.table === name).map(entry => entry.kind)).toEqual(["EXPORT"]);
  }
  expect(read("docs/legal/DPIA-2ndB-minors-draft.md"))
    .toContain("`db/migrations/0270_crisis_ai_hold.sql`");
});

test("rollback retires only AI views and has a held-row round trip", () => {
  const down = read("db/migrations/rollback/0270_down.sql");
  const executable = down.replace(/--[^\n]*/g, "");
  expect(executable.match(/DROP VIEW IF EXISTS public\.\w+_ai_eligible;/g)).toHaveLength(3);
  expect(executable).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE|ALTER|CASCADE)\b|DROP\s+(?:TABLE|COLUMN|FUNCTION|TRIGGER)/i);
  const regression = read("db/tests/crisis_ai_hold_installed.sql");
  expect(regression).toContain("\\ir ../migrations/rollback/0270_down.sql");
  expect(regression).toContain("RAISE EXCEPTION '0270 down released a hold'");
  expect(regression).toContain("RAISE EXCEPTION '0270 down changed held/original data'");
  expect(regression).toContain("RAISE EXCEPTION '0270 reapply did not restore exact views and ACLs'");
});
