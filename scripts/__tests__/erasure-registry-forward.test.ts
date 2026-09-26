import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { collectErasureRegistryErrors } from "../check-erasure-registry";
import { renderRegistrySql, type Registry } from "../generate-erasure-registry";
import { ADDITIONS_BEGIN, ADDITIONS_END, renderRegistryAdditionsSql } from "../erasure-registry-forward";

const FORWARD = "0192_registry_additions.sql";
const entry = { owner: "user_id", class: "retained" as const, reason: "Existing quota survives content deletion." };
const baseline: Registry = { version: 1, tables: { audit: entry } };
const addition: Registry = { version: 1, tables: { usage: entry } };
type WithHistory = Registry & { forwardAdditions?: unknown };
let root = "";

test("the inactive service-contract forward is generated from its four-row sidecar", () => {
  const drafts = resolve(__dirname, "../../db/migration-drafts");
  const registry = JSON.parse(readFileSync(join(drafts, "service-contract-erasure-entries.json"), "utf8"));
  const sql = readFileSync(join(drafts, registry.forwardMigration), "utf8").replace(/\r\n/g, "\n");
  expect(Object.keys(registry.tables).sort()).toEqual([
    "account_deletion_tombstones", "llm_consent_receipts", "polaris_generations", "reward_ssv_issue_rate_limits",
  ]);
  expect(sql.slice(sql.indexOf(ADDITIONS_BEGIN), sql.indexOf(ADDITIONS_END) + ADDITIONS_END.length))
    .toBe(renderRegistryAdditionsSql(registry));
});
const write = (file: string, text: string) => writeFileSync(join(root, file), text, "utf8");
const canonical = (value: WithHistory) => write("db/erasure-registry.json", JSON.stringify(value));
const g7 = () => collectErasureRegistryErrors(root).filter((error) => error.startsWith("G7"));

function fixture(): WithHistory {
  root = mkdtempSync(join(tmpdir(), "erasure-forward-"));
  mkdirSync(join(root, "db/migrations"), { recursive: true });
  write("db/migrations/0001_base.sql", "CREATE TABLE public.audit (user_id uuid);");
  write("db/migrations/0189_erasure_registry.sql", renderRegistrySql(baseline));
  write("db/migrations/0191_usage.sql", "CREATE TABLE public.usage (user_id uuid);");
  write(`db/migrations/${FORWARD}`, renderRegistryAdditionsSql(addition));
  const value = { version: 1, tables: { ...baseline.tables, ...addition.tables }, forwardAdditions: { [FORWARD]: ["usage"] } };
  canonical(value);
  return value;
}

afterEach(() => {
  if (!root) return;
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("erasure-forward-")) {
    throw new Error("Refusing cleanup outside the generated fixture directory");
  }
  rmSync(root, { recursive: true, force: true });
  root = "";
});

test("new registry rows can be promoted without rewriting historical 0189", () => {
  fixture();
  expect(g7()).toEqual([]);
  expect(readFileSync(join(root, "db/migrations/0189_erasure_registry.sql"), "utf8")).toBe(renderRegistrySql(baseline));
  expect(collectErasureRegistryErrors(root).filter((e) => /^G[12] /.test(e))).toEqual([]);
});

test("historical classification changes are still rejected", () => {
  const value = fixture();
  expect(g7()).toEqual([]);
  value.tables.audit = { ...entry, reason: "Changed history without a reviewed migration." };
  canonical(value);
  expect(g7().join(" ")).toContain("historical subset");
});

test("unregistered owner tables still fail completeness", () => {
  const value = fixture();
  expect(g7()).toEqual([]);
  delete value.tables.usage;
  canonical(value);
  expect(collectErasureRegistryErrors(root).some((e) => e.startsWith("G1") && e.includes("usage"))).toBe(true);
  expect(g7().length).toBeGreaterThan(0);
});

test.each([
  "CREATE TABLE public.unrelated (id int);",
  "DELETE FROM public.audit;",
  "DO $x$ BEGIN EXECUTE 'TRUNCATE public.audit'; END $x$;",
])("a registry replay cannot silently include provisioning or data changes: %s", (extra) => {
  fixture();
  expect(g7()).toEqual([]);
  write(`db/migrations/${FORWARD}`, renderRegistryAdditionsSql(addition) + "\n" + extra);
  expect(g7().join(" ")).toContain("provisioning cannot be replayed");
});

test("forward rows and their classification must match the canonical source", () => {
  fixture();
  expect(g7()).toEqual([]);
  write(`db/migrations/${FORWARD}`, renderRegistryAdditionsSql({ version: 1, tables: { usage: { ...entry, owner: "owner_id" } } }));
  expect(g7().length).toBeGreaterThan(0);
});

test.each([null, [], "0192_registry_additions.sql", { "../outside.sql": ["usage"] }, { "0189_old.sql": ["usage"] }, { [FORWARD]: [] }, { [FORWARD]: ["usage", "usage"] }, { [FORWARD]: ["missing"] }])(
  "malformed or unsafe history declarations fail closed: %j", (mapping) => {
    const value = fixture();
    expect(g7()).toEqual([]);
    value.forwardAdditions = mapping;
    canonical(value);
    expect(g7().length).toBeGreaterThan(0);
  },
);

test("missing forward files cannot authorize omission from the historical seed", () => {
  const value = fixture();
  expect(g7()).toEqual([]);
  value.forwardAdditions = { "0193_missing.sql": ["usage"] };
  canonical(value);
  expect(g7().join(" ")).toContain("missing");
});

test("a generated forward block must be declared even if its rows are identical", () => {
  fixture();
  expect(g7()).toEqual([]);
  write("db/migrations/0193_unlisted.sql", renderRegistryAdditionsSql(addition));
  expect(g7().join(" ")).toContain("undeclared forward additions");
});

test("one table cannot be assigned to two replayable migrations", () => {
  const value = fixture();
  expect(g7()).toEqual([]);
  write("db/migrations/0193_repeated.sql", renderRegistryAdditionsSql(addition));
  value.forwardAdditions = { [FORWARD]: ["usage"], "0193_repeated.sql": ["usage"] };
  canonical(value);
  expect(g7().join(" ")).toContain("repeated registry table");
});

test("ordinary comments and CRLF conversion do not change the replay contract", () => {
  fixture();
  write(`db/migrations/${FORWARD}`, ("-- A reviewed forward migration.\n" + renderRegistryAdditionsSql(addition) + "\n/* No user-table provisioning. */\n").replace(/\n/g, "\r\n"));
  expect(g7()).toEqual([]);
});

test.each([
  (sql: string) => `/*\n${sql}\n*/`,
  (sql: string) => `-- disabled ${sql}`,
  (sql: string) => `/* unterminated\n${sql}`,
  (sql: string) => `${sql}\n/* unterminated`,
  (sql: string) => `/* outer /* inner */\n${sql}\n*/`,
])("comment boundaries cannot hide executable additions", (wrap) => {
  fixture();
  write(`db/migrations/${FORWARD}`, wrap(renderRegistryAdditionsSql(addition)));
  expect(g7().join(" ")).toContain("provisioning cannot be replayed");
});

test("complete nested comments before and after the block are valid", () => {
  fixture();
  write(`db/migrations/${FORWARD}`, `/* outer /* inner */ tail */\n${renderRegistryAdditionsSql(addition)}\n/* another /* nested */ comment */`);
  expect(g7()).toEqual([]);
});

test.each(["00000192_registry_additions.sql", "192_registry_additions.sql", "0193-unlisted.sql"])(
  "noncanonical forward filename cannot evade ordering or declaration: %s", (file) => {
    const value = fixture();
    renameSync(join(root, `db/migrations/${FORWARD}`), join(root, `db/migrations/${file}`));
    value.forwardAdditions = { [file]: ["usage"] };
    canonical(value);
    expect(g7().join(" ")).toContain("invalid forwardAdditions");
    expect(g7().join(" ")).toContain("undeclared forward additions");
  },
);

test("undeclared blocks are rejected in every SQL file the schema replay reads", () => {
  fixture();
  write("db/migrations/0193-unlisted.sql", renderRegistryAdditionsSql(addition));
  expect(g7().join(" ")).toContain("undeclared forward additions");
});

test("table provisioning must precede its registry additions", () => {
  fixture();
  renameSync(join(root, "db/migrations/0191_usage.sql"), join(root, "db/migrations/0193_usage.sql"));
  expect(g7().join(" ")).toContain("owner column must exist before");
});

test("adding the owner column after registration is also rejected", () => {
  fixture();
  write("db/migrations/0191_usage.sql", "CREATE TABLE public.usage (id uuid);");
  write("db/migrations/0193_owner.sql", "ALTER TABLE public.usage ADD COLUMN user_id uuid;");
  expect(g7().join(" ")).toContain("owner column must exist before");
});

test("a registry forward cannot reuse another migration's number", () => {
  fixture();
  write("db/migrations/0192_already_reserved.sql", "-- Existing migration.");
  expect(g7().join(" ")).toContain("migration number is already used");
});

test("historical rows cannot be reclassified as new forward additions", () => {
  const value = fixture();
  value.forwardAdditions = { [FORWARD]: ["usage", "audit"] };
  canonical(value);
  write(`db/migrations/${FORWARD}`, renderRegistryAdditionsSql(value));
  expect(g7().join(" ")).toContain("historical subset");
});
