import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { collectErasureRegistryErrors } from "../check-erasure-registry";
import { renderRegistrySql, type Registry } from "../generate-erasure-registry";
import {
  ADDITIONS_BEGIN,
  ADDITIONS_END,
  REVISIONS_BEGIN,
  REVISIONS_END,
  renderRegistryAdditionsSql,
  renderRegistryRevisionsSql,
} from "../erasure-registry-forward";

const FORWARD = "0192_registry_additions.sql";
const entry = { owner: "user_id", class: "retained" as const, reason: "Existing quota survives content deletion." };
const baseline: Registry = { version: 1, tables: { audit: entry } };
const addition: Registry = { version: 1, tables: { usage: entry } };
type WithHistory = Registry & { forwardAdditions?: unknown; forwardRevisions?: unknown };
let root = "";

test("the numbered 0198 service-contract forward is generated from its four-row sidecar", () => {
  const repo = resolve(__dirname, "../..");
  const registry = JSON.parse(
    readFileSync(join(repo, "db/migration-drafts/service-contract-erasure-entries.json"), "utf8"),
  );
  // The draft was deleted when 0198 got its number (Q-261005-07); the sidecar
  // names the one remaining copy by its repository path.
  expect(registry.forwardMigration).toBe("db/migrations/0198_service_contract_erasure_registry.sql");
  const sql = readFileSync(join(repo, registry.forwardMigration), "utf8").replace(/\r\n/g, "\n");
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

// ---------------------------------------------------------------------------
// forwardRevisions: a later numbered file may rewrite the REASON of a row that
// already exists, and nothing else. The JSON keeps the current reason; each
// revision records the one it replaces, so 0189 (or the forward that added the
// row) is still rendered from history and compared byte for byte.
// ---------------------------------------------------------------------------
const REVISION = "0193_audit_reason.sql";
const revised = "Quota survives content deletion; account deletion now removes it.";
type Revisions = Record<string, Record<string, { previousReason: string }>>;
const revisionOf = (table: string, value: WithHistory, previousReason: string) =>
  ({ [table]: { entry: value.tables[table], previousReason } });

function revisionFixture(): WithHistory {
  const value = fixture();
  value.tables.audit = { ...entry, reason: revised };
  value.forwardRevisions = { [REVISION]: { audit: { previousReason: entry.reason } } };
  write(`db/migrations/${REVISION}`, renderRegistryRevisionsSql(revisionOf("audit", value, entry.reason)));
  canonical(value);
  return value;
}

test("a historical row's reason can be revised forward without rewriting 0189", () => {
  revisionFixture();
  expect(g7()).toEqual([]);
  expect(readFileSync(join(root, "db/migrations/0189_erasure_registry.sql"), "utf8")).toBe(renderRegistrySql(baseline));
  expect(collectErasureRegistryErrors(root).filter((e) => /^G[12] /.test(e))).toEqual([]);
});

test("an undeclared revision still fails: the JSON reason moved and nothing records the old one", () => {
  const value = revisionFixture();
  expect(g7()).toEqual([]);
  delete value.forwardRevisions;
  canonical(value);
  const errors = g7().join(" ");
  expect(errors).toContain("historical subset");
  expect(errors).toContain("undeclared forward revisions");
});

test("a recorded previous reason that 0189 never carried fails the historical comparison", () => {
  const value = revisionFixture();
  expect(g7()).toEqual([]);
  const invented = "A reason 0189 never shipped with.";
  value.forwardRevisions = { [REVISION]: { audit: { previousReason: invented } } };
  canonical(value);
  write(`db/migrations/${REVISION}`, renderRegistryRevisionsSql(revisionOf("audit", value, invented)));
  expect(g7().join(" ")).toContain("historical subset");
});

test("a revision cannot carry a reclassification: class stays pinned to 0189", () => {
  const value = revisionFixture();
  expect(g7()).toEqual([]);
  value.tables.audit = { ...value.tables.audit, class: "account_delete_only" };
  canonical(value);
  write(`db/migrations/${REVISION}`, renderRegistryRevisionsSql(revisionOf("audit", value, entry.reason)));
  expect(g7().join(" ")).toContain("historical subset");
});

test.each([
  ["a different reason", (sql: string) => sql.replace("now removes it", "now keeps it")],
  ["an appended data change", (sql: string) => `${sql}\nDELETE FROM public.audit;`],
  ["an appended provisioning statement", (sql: string) => `${sql}\nCREATE TABLE public.unrelated (id int);`],
  ["a prefixed statement", (sql: string) => `SELECT 1;\n${sql}`],
  ["the block wrapped in a comment", (sql: string) => `/*\n${sql}\n*/`],
  ["an unterminated trailing comment", (sql: string) => `${sql}\n/* unterminated`],
])("a revision migration must hold exactly its generated block: %s", (_label, mutate) => {
  revisionFixture();
  expect(g7()).toEqual([]);
  write(`db/migrations/${REVISION}`, mutate(readFileSync(join(root, `db/migrations/${REVISION}`), "utf8")));
  expect(g7().join(" ")).toContain("exact generated revisions");
});

test("comments and CRLF around a revision block do not change the replay contract", () => {
  const value = revisionFixture();
  const block = renderRegistryRevisionsSql(revisionOf("audit", value, entry.reason));
  write(`db/migrations/${REVISION}`, ("-- Reviewed reason revision.\n" + block + "\n/* registry only */\n").replace(/\n/g, "\r\n"));
  expect(g7()).toEqual([]);
});

test.each([
  null,
  [],
  "0193_audit_reason.sql",
  { "0189_old.sql": { audit: { previousReason: entry.reason } } },
  { "193_audit_reason.sql": { audit: { previousReason: entry.reason } } },
  { [REVISION]: {} },
  { [REVISION]: [] },
  { [REVISION]: { audit: {} } },
  { [REVISION]: { audit: "Existing quota survives content deletion." } },
  { [REVISION]: { audit: { previousReason: "" } } },
  { [REVISION]: { audit: { previousReason: entry.reason, class: "retained" } } },
  { [REVISION]: { missing: { previousReason: entry.reason } } },
])("malformed or unsafe revision declarations fail closed: %j", (mapping) => {
  const value = revisionFixture();
  expect(g7()).toEqual([]);
  value.forwardRevisions = mapping;
  canonical(value);
  expect(g7().length).toBeGreaterThan(0);
});

test("a revision whose recorded previous reason equals the new one is refused", () => {
  const value = revisionFixture();
  value.forwardRevisions = { [REVISION]: { audit: { previousReason: revised } } };
  canonical(value);
  expect(g7().join(" ")).toContain("changes nothing");
});

test("a missing revision file cannot authorise a changed reason", () => {
  const value = revisionFixture();
  value.forwardRevisions = { "0194_missing.sql": { audit: { previousReason: entry.reason } } };
  canonical(value);
  const errors = g7().join(" ");
  expect(errors).toContain("missing");
  expect(errors).toContain("undeclared forward revisions");
});

test("a generated revision block must be declared, even in a second file", () => {
  const value = revisionFixture();
  expect(g7()).toEqual([]);
  write("db/migrations/0194_unlisted.sql", renderRegistryRevisionsSql(revisionOf("audit", value, entry.reason)));
  expect(g7().join(" ")).toContain("undeclared forward revisions");
});

test("a revision cannot reuse another migration's number", () => {
  revisionFixture();
  write("db/migrations/0193_already_reserved.sql", "-- Existing migration.");
  expect(g7().join(" ")).toContain("migration number is already used");
});

test("one file cannot be both an additions forward and a revision", () => {
  const value = revisionFixture();
  value.forwardRevisions = { [FORWARD]: { audit: { previousReason: entry.reason } } };
  canonical(value);
  expect(g7().join(" ")).toContain("both forwardAdditions and forwardRevisions");
});

test("revisions chain in number order, each rendering the reason the next one replaces", () => {
  const value = revisionFixture();
  const third = "Quota survives content deletion; account deletion removes it (second revision).";
  value.tables.audit = { ...entry, reason: third };
  (value.forwardRevisions as Revisions)["0194_audit_reason_again.sql"] = { audit: { previousReason: revised } };
  canonical(value);
  write("db/migrations/0194_audit_reason_again.sql",
    renderRegistryRevisionsSql({ audit: { entry: { ...entry, reason: third }, previousReason: revised } }));
  expect(g7()).toEqual([]);
  // The first file must keep rendering the INTERMEDIATE reason, not the current one.
  write(`db/migrations/${REVISION}`,
    renderRegistryRevisionsSql({ audit: { entry: { ...entry, reason: third }, previousReason: entry.reason } }));
  expect(g7().join(" ")).toContain(`${REVISION} must contain only its exact generated revisions`);
});

test("a forward-added row can be revised later; its additions file keeps rendering history", () => {
  const value = fixture();
  value.tables.usage = { ...entry, reason: revised };
  value.forwardRevisions = { [REVISION]: { usage: { previousReason: entry.reason } } };
  canonical(value);
  write(`db/migrations/${REVISION}`, renderRegistryRevisionsSql(revisionOf("usage", value, entry.reason)));
  expect(g7()).toEqual([]);
  // Re-rendering the additions file from the CURRENT reason is what G7 refuses.
  write(`db/migrations/${FORWARD}`, renderRegistryAdditionsSql({ version: 1, tables: { usage: value.tables.usage } }));
  expect(g7().join(" ")).toContain(`${FORWARD} must contain only its exact generated additions`);
});

test("a revision may not precede the forward migration that adds its row", () => {
  const value = fixture();
  renameSync(join(root, `db/migrations/${FORWARD}`), join(root, "db/migrations/0195_registry_additions.sql"));
  value.forwardAdditions = { "0195_registry_additions.sql": ["usage"] };
  value.tables.usage = { ...entry, reason: revised };
  value.forwardRevisions = { [REVISION]: { usage: { previousReason: entry.reason } } };
  canonical(value);
  write(`db/migrations/${REVISION}`, renderRegistryRevisionsSql(revisionOf("usage", value, entry.reason)));
  expect(g7().join(" ")).toContain("before the forward migration that adds it");
});

test("the renderer refuses a reason that could close its dollar-quoted body", () => {
  expect(() => renderRegistryRevisionsSql({
    audit: { entry: { ...entry, reason: "ends $erasure_revisions$; DROP TABLE public.audit; --" }, previousReason: entry.reason },
  })).toThrow("invalid registry revision");
  expect(() => renderRegistryRevisionsSql({})).toThrow("must not be empty");
});

test("the shipped credit_ledger revision keeps 0189 historical and the JSON current", () => {
  const repo = resolve(__dirname, "../..");
  const json = JSON.parse(readFileSync(join(repo, "db/erasure-registry.json"), "utf8"));
  const file = "0205_credit_ledger_erasure_registry_reason.sql";
  const previous: string = json.forwardRevisions[file].credit_ledger.previousReason;
  const seed = readFileSync(join(repo, "db/migrations/0189_erasure_registry.sql"), "utf8");
  expect(seed).toContain(`('credit_ledger', 'user_id', 'retained', NULL, NULL, '${previous}')`);
  expect(json.tables.credit_ledger.class).toBe("retained");
  expect(json.tables.credit_ledger.reason).not.toBe(previous);
  expect(json.tables.credit_ledger.reason).toMatch(/promo/);
  // 0212 revised credit_ledger again (88-day reward purge, 0211). The reason 0205
  // wrote is therefore the one 0212 records as its previous reason, not the row
  // the JSON holds now.
  const after0205: string =
    json.forwardRevisions["0212_reward_records_erasure_registry_reason.sql"].credit_ledger.previousReason;
  expect(after0205).toMatch(/promo/);
  expect(after0205).not.toBe(json.tables.credit_ledger.reason);
  const sql = readFileSync(join(repo, "db/migrations", file), "utf8").replace(/\r\n/g, "\n");
  expect(sql.slice(sql.indexOf(REVISIONS_BEGIN), sql.indexOf(REVISIONS_END) + REVISIONS_END.length))
    .toBe(renderRegistryRevisionsSql({
      credit_ledger: { entry: { ...json.tables.credit_ledger, reason: after0205 }, previousReason: previous },
    }));
});

test("the shipped reward-records revision renders the four current reasons from their recorded predecessors", () => {
  const repo = resolve(__dirname, "../..");
  const json = JSON.parse(readFileSync(join(repo, "db/erasure-registry.json"), "utf8"));
  const file = "0212_reward_records_erasure_registry_reason.sql";
  const revision: Record<string, { previousReason: string }> = json.forwardRevisions[file];
  expect(Object.keys(revision).sort()).toEqual(
    ["credit_ledger", "reward_ssv_issue_rate_limits", "reward_ssv_tickets", "rewarded_ssv_txns"],
  );
  for (const table of Object.keys(revision)) {
    expect(json.tables[table].class).toBe("retained");
    expect(json.tables[table].reason).not.toBe(revision[table].previousReason);
  }
  // The purge (0211) deletes three of these; the tickets row only gains the
  // one-day cleanup 0196 already performs.
  for (const table of ["credit_ledger", "reward_ssv_issue_rate_limits", "rewarded_ssv_txns"]) {
    expect(json.tables[table].reason).toMatch(/0211/);
  }
  const sql = readFileSync(join(repo, "db/migrations", file), "utf8").replace(/\r\n/g, "\n");
  expect(sql.slice(sql.indexOf(REVISIONS_BEGIN), sql.indexOf(REVISIONS_END) + REVISIONS_END.length))
    .toBe(renderRegistryRevisionsSql(Object.fromEntries(Object.keys(revision).map((table) => [
      table, { entry: json.tables[table], previousReason: revision[table].previousReason },
    ]))));
});

test("the 0217 deletion ops ledger is added by 0228 and the tombstone reason is restated by 0227", () => {
  const repo = resolve(__dirname, "../..");
  const json = JSON.parse(readFileSync(join(repo, "db/erasure-registry.json"), "utf8"));
  expect(json.forwardAdditions["0228_account_deletion_ops_erasure_registry.sql"]).toEqual(["account_deletion_ops"]);
  expect(json.tables.account_deletion_ops).toMatchObject({ owner: "owner_id", class: "retained" });
  expect(json.tables.account_deletion_ops.reason).toMatch(/0217/);
  const revision = json.forwardRevisions["0227_account_deletion_tombstones_erasure_registry_reason.sql"];
  expect(Object.keys(revision)).toEqual(["account_deletion_tombstones"]);
  // The reason it replaces is the one 0198 wrote, and the new one names the Q6 release.
  expect(revision.account_deletion_tombstones.previousReason).toMatch(/^Durable account-deletion fence\./);
  expect(json.tables.account_deletion_tombstones.class).toBe("retained");
  expect(json.tables.account_deletion_tombstones.reason).toMatch(/Q6/);

  const additions = readFileSync(join(repo, "db/migrations/0228_account_deletion_ops_erasure_registry.sql"), "utf8")
    .replace(/\r\n/g, "\n");
  expect(additions.slice(additions.indexOf(ADDITIONS_BEGIN), additions.indexOf(ADDITIONS_END) + ADDITIONS_END.length))
    .toBe(renderRegistryAdditionsSql({ version: json.version, tables: { account_deletion_ops: json.tables.account_deletion_ops } }));
  const revisions = readFileSync(join(repo, "db/migrations/0227_account_deletion_tombstones_erasure_registry_reason.sql"), "utf8")
    .replace(/\r\n/g, "\n");
  expect(revisions.slice(revisions.indexOf(REVISIONS_BEGIN), revisions.indexOf(REVISIONS_END) + REVISIONS_END.length))
    .toBe(renderRegistryRevisionsSql({
      account_deletion_tombstones: {
        entry: json.tables.account_deletion_tombstones,
        previousReason: revision.account_deletion_tombstones.previousReason,
      },
    }));
});
