import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { checkAccountExportInventory, EXPORT_SOURCE, reachableAccountTables, renderAccountExportCatalogSql } from "../check-account-export-inventory";
import { loadRegistry, migrationsDir, replayMigrations } from "../generate-erasure-registry";

const root = resolve(__dirname, "../..");
const source = readFileSync(join(root, EXPORT_SOURCE), "utf8");
const direct = Object.keys(loadRegistry(root).tables);
const edges = replayMigrations(migrationsDir(root)).foreignKeys;
const check = (text = source, tables = direct, fks = edges) => checkAccountExportInventory(tables, fks, text);
const pending = [
  "interview_sessions", "interview_probe_verdicts",
  "llm_consent_receipts", "weather_consent_state", "weather_access_events", "dashboard_generation_settings",
];

// Parse real CREATE/ALTER syntax for the FK expansion probes. Fixtures stay in
// this checkout; no numbered migration or external/shared workspace is changed.
function fixtureEdges(sql: string) {
  const base = join(root, ".tmp", "account-export-inventory");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "fixture-"));
  try {
    writeFileSync(join(dir, "probe.sql"), sql);
    return replayMigrations(dir).foreignKeys;
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function replaceOnce(text: string, before: string | RegExp, after: string): string {
  const mutated = text.replace(before, after);
  expect(mutated).not.toBe(text);
  return mutated;
}

test("real descriptors classify 89 physical tables exactly once, plus the users profile", () => {
  const result = check();
  expect(result.errors).toEqual([]);
  expect(direct).toHaveLength(82);
  expect(result.tables.size).toBe(90);
  const count = (kind: string) => result.entries.filter(e => e.kind === kind && e.table !== "users" && result.tables.has(e.table)).length;
  expect([count("EXPORT"), count("EXCLUDED"), count("PENDING")]).toEqual([47, 36, 6]);
  expect(result.entries.filter(e => e.kind === "PENDING").map(e => e.table).sort()).toEqual(pending.sort());
  expect(result.entries.find(e => e.table === "knowledge_sources")?.kind).toBe("EXPORT");
  for (const table of ["interview_transcripts", "interview_transcript_turns"]) {
    expect(result.entries.find(e => e.table === table)?.kind).toBe("EXPORT");
  }
  for (const table of ["interview_sessions", "interview_probe_verdicts"]) {
    const reason = result.entries.find(e => e.table === table)?.reason;
    expect(reason).toContain("legal review");
    expect(reason).not.toContain("0225");
  }
  expect(result.entries.some(e => e.table === "knowledge_sources_contributed")).toBe(false);
  for (const table of ["crisis_events", "llm_proxy_capacity_reservations", "peer_response_rate_limits"]) {
    expect(result.entries.find(e => e.table === table)?.kind).toBe("EXCLUDED");
  }
});

const sourceMutations: [string, string, RegExp][] = [
  ["missing descriptor (a comment does not count)",
    replaceOnce(source, "{ table: 'records', fk: 'user_id' },", "// records is exported"), /records: expected exactly one.*0/],
  ["duplicate descriptor",
    replaceOnce(source, "{ table: 'records', fk: 'user_id' },", "{ table: 'records', fk: 'user_id' }, { table: 'records', fk: 'user_id' },"), /records: expected exactly one.*2/],
  ["export and excluded overlap",
    replaceOnce(source, "  ai_audit_log:", "  records: 'duplicate classification',\n  ai_audit_log:"), /records: expected exactly one.*2/],
  ["blank exclusion reason",
    replaceOnce(source, /ai_audit_log: '[^']*'/, "ai_audit_log: '  '"), /Empty EXCLUDED reason: ai_audit_log/],
  ["pending table inserted into the export descriptors",
    replaceOnce(source, "{ table: 'records', fk: 'user_id' },", "{ table: 'records', fk: 'user_id' }, { table: 'weather_access_events', fk: 'user_id' },"), /weather_access_events: expected exactly one.*2/],
  ["pending reason emptied",
    replaceOnce(source, /weather_access_events: '[^']*'/, "weather_access_events: ''"), /Empty PENDING reason: weather_access_events/],
  ["pending table queried outside the descriptors",
    source + "\nadmin.from('interview_sessions').select('*');", /Non-export table queried: interview_sessions/],
  ["duplicate excluded object key (not silently overwritten)",
    replaceOnce(source, "  ai_audit_log:", "  ai_audit_log: 'other reason',\n  ai_audit_log:"), /Duplicate inventory property: ai_audit_log/],
  ["duplicate pending object key",
    replaceOnce(source, "  weather_access_events:", "  weather_access_events: 'other reason',\n  weather_access_events:"), /Duplicate inventory property: weather_access_events/],
  ["pending and excluded overlap",
    replaceOnce(source, "  ai_audit_log:", "  weather_access_events: 'not permanent',\n  ai_audit_log:"), /weather_access_events: expected exactly one.*2/],
  ["physical table replaced by JSON alias",
    replaceOnce(source, "table: 'knowledge_sources'", "table: 'knowledge_sources_contributed'"), /knowledge_sources: expected exactly one.*0/],
  ["users profile query removed but left in a comment",
    replaceOnce(source, "await admin.from('users')", "null; // await admin.from('users')"), /users: missing owner-filtered profile read/],
  ["users profile not returned",
    replaceOnce(source, "tables.users = profileResult.data;", "// tables.users = profileResult.data;"), /users: missing owner-filtered profile read/],
];
test.each(sourceMutations)("source mutation goes red: %s", (_name, mutated, error) => {
  expect(check(mutated).errors.join("\n")).toMatch(error);
});

test("new direct registry table goes red until classified", () => {
  const extra = fixtureEdges("CREATE TABLE public.new_direct (user_id uuid REFERENCES public.users(id));");
  expect(extra).toHaveLength(1);
  expect(check(source, [...direct, "new_direct"], [...edges, ...extra]).errors)
    .toContain("new_direct: expected exactly one classification, found 0");
});

test.each(["CASCADE", "SET NULL", "RESTRICT", "NO ACTION", "SET DEFAULT"])(
  "new public child with ON DELETE %s goes red", action => {
    const extra = fixtureEdges(`CREATE TABLE public.new_child (record_id uuid REFERENCES public.records(id) ON DELETE ${action});`);
    expect(extra[0]).toMatchObject({ child: "new_child", parent: "records", onDelete: action.toLowerCase() });
    expect(check(source, direct, [...edges, ...extra]).errors).toContain("new_child: expected exactly one classification, found 0");
  },
);

test("new multi-level child goes red even when its direct parent is already classified", () => {
  const extra = fixtureEdges("CREATE TABLE public.new_grandchild (hold_id text REFERENCES public.reward_dispute_holds(transaction_id) ON DELETE SET NULL);");
  expect(extra).toHaveLength(1);
  expect(check(source, direct, [...edges, ...extra]).errors).toContain("new_grandchild: expected exactly one classification, found 0");
  expect(check().tables.has("reward_dispute_hold_events")).toBe(true);
});

test("FK closure follows ALTER constraints, default NO ACTION, cycles and multiple paths once", () => {
  const fixture = fixtureEdges(`
    CREATE TABLE public.child (id uuid PRIMARY KEY, user_id uuid REFERENCES public.users(id));
    CREATE TABLE public.grandchild (id uuid PRIMARY KEY, child_id uuid);
    ALTER TABLE public.grandchild ADD CONSTRAINT parent_fk FOREIGN KEY(child_id) REFERENCES public.child(id) ON DELETE RESTRICT;
    ALTER TABLE public.child ADD COLUMN other uuid REFERENCES public.grandchild(id) ON DELETE SET NULL;
    ALTER TABLE public.grandchild ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
    CREATE TABLE private.outside_graph (user_id uuid REFERENCES public.users(id));
    -- CREATE TABLE public.comment_only (user_id uuid REFERENCES public.users(id));
  `);
  expect(fixture).toHaveLength(4);
  expect([...reachableAccountTables([], fixture)].sort()).toEqual(["child", "grandchild", "users"]);
});

test("SQL fixture and CI compare the exact reachable table AND edge sets, independent of delete action", () => {
  const result = check();
  const sql = renderAccountExportCatalogSql(result.tables, edges);
  expect(sql).toContain("('reward_dispute_hold_events', 'reward_dispute_holds', 'transaction_id')");
  expect(sql.match(/\('ai_audit_log', 'users', 'user_id'\)/g)).toHaveLength(1);
  // Changing an action alone preserves connectivity; a new SET NULL child is
  // still rejected by the separate schema-input mutation above.
  expect(renderAccountExportCatalogSql(result.tables, edges.map(e => ({ ...e, onDelete: "no action" }))))
    .toBe(sql);
  expect(sql).not.toContain("'auth'");
  const regression = readFileSync(join(root, "db/tests/account_export_inventory_regression.sql"), "utf8");
  expect(regression).toContain("pg_catalog.pg_constraint");
  expect(regression).toContain("cn.nspname = 'public' AND pn.nspname = 'public'");
  expect(regression).toContain("EXCEPT SELECT table_name FROM account_export_expected_tables");
  expect(regression).toContain("EXCEPT SELECT * FROM account_export_expected_edges");
  expect(regression).toContain("SELECT * FROM account_export_expected_edges EXCEPT SELECT * FROM actual");
  const workflow = readFileSync(join(root, ".github/workflows/supabase-dry-run.yml"), "utf8");
  expect(workflow).toContain('npx tsx scripts/check-account-export-inventory.ts --catalog-sql "$RUNNER_TEMP/account-export-inventory.sql"');
  expect(workflow).toContain('-f db/tests/account_export_inventory_regression.sql');
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(pkg.scripts["check:account-export-inventory"]).toBe("tsx scripts/check-account-export-inventory.ts");
  expect(pkg.scripts.verify.split(" && ")).toContain("npm run check:account-export-inventory");
});

test("the deployment gate requires only active export tables, never pending/excluded prerequisites", () => {
  const run = spawnSync(process.execPath, ["scripts/check-edge-function-schema-deps.mjs", "list", "export-account"], {
    cwd: root, encoding: "utf8",
  });
  expect(run.status).toBe(0);
  const deps = JSON.parse(run.stdout);
  expect(deps.tables).toEqual(check().entries.filter(e => e.kind === "EXPORT").map(e => e.table).sort());
  expect(deps.functions).toEqual(["claim_account_export"]);
});
