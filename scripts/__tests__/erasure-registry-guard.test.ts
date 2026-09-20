// Tests for the erasure-registry inventory and its CI guard.
//
// A guard nobody has watched fail is a guard nobody has tested, so every rule
// here is driven by a MUTATION: build a tree the guard accepts, prove it is
// green, change exactly one thing, and prove the matching rule goes red. The
// green-before step is not ceremony - without it a "red" could just as easily
// be the fixture never having worked (the no-op mutation trap).

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  discoverOwnedTables,
  renderRegistrySql,
  stripSqlComments,
  type Registry,
} from "../generate-erasure-registry";
import { collectErasureRegistryErrors } from "../check-erasure-registry";

const REPO_ROOT = resolve(__dirname, "../..");

const BASE_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY
);

-- Owner can delete: FOR ALL includes DELETE.
CREATE TABLE IF NOT EXISTS notes (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body    text
);
CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());

-- Owner cannot delete: SELECT only.
CREATE TABLE IF NOT EXISTS audit (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE POLICY audit_owner_select ON audit FOR SELECT TO authenticated USING (user_id = auth.uid());
`;

function baseRegistry(): Registry {
  return {
    version: 1,
    tables: {
      notes: { owner: "user_id", class: "client_erasable", order: 10, reason: "사용자가 쓴 메모 본문이다." },
      audit: { owner: "user_id", class: "account_delete_only", reason: "DELETE 정책이 없어 소유자가 지울 수 없다." },
    },
  };
}

/** A tree the guard accepts, apart from G6 (which names five real ledgers that
 *  a synthetic fixture has no reason to contain). Callers filter by rule. */
function makeTree(registry: Registry = baseRegistry(), extraSql?: string): string {
  const root = mkdtempSync(join(tmpdir(), "erasure-guard-"));
  mkdirSync(join(root, "db", "migrations"), { recursive: true });
  writeFileSync(join(root, "db", "migrations", "0001_base.sql"), BASE_SQL, "utf8");
  if (extraSql) writeFileSync(join(root, "db", "migrations", "0100_extra.sql"), extraSql, "utf8");
  writeFileSync(join(root, "db", "erasure-registry.json"), JSON.stringify(registry, null, 2), "utf8");
  writeFileSync(
    join(root, "db", "migrations", "0189_erasure_registry.sql"),
    `-- fixture\n${renderRegistrySql(registry)}\n`,
    "utf8",
  );
  return root;
}

function rulesFired(root: string, prefix: string): string[] {
  return collectErasureRegistryErrors(root).filter((e) => e.startsWith(prefix));
}

describe("discoverOwnedTables -- what counts as a user-owned table", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  test("finds owner columns by name and by a users FK, and skips the rest", () => {
    root = makeTree();
    const found = discoverOwnedTables(join(root, "db", "migrations"));
    expect(found.map((t) => t.table).sort()).toEqual(["audit", "notes"]);
    expect(found.find((t) => t.table === "notes")?.ownerColumns[0]).toEqual({
      name: "user_id",
      evidence: ["name", "references-users"],
    });
  });

  test("a dropped table leaves the inventory", () => {
    root = makeTree(baseRegistry(), `
      CREATE TABLE IF NOT EXISTS scratch (user_id uuid NOT NULL REFERENCES users(id));
      DROP TABLE IF EXISTS public.scratch;
    `);
    const found = discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table);
    expect(found).not.toContain("scratch");
  });

  test("TEMP tables are ignored but UNLOGGED ones are not", () => {
    root = makeTree(baseRegistry(), `
      CREATE TEMP TABLE ephemeral (user_id uuid PRIMARY KEY) ON COMMIT DROP;
      CREATE UNLOGGED TABLE durable_probe (user_id uuid NOT NULL REFERENCES users(id));
    `);
    const found = discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table);
    expect(found).not.toContain("ephemeral");
    expect(found).toContain("durable_probe");
  });

  test("a commented-out CREATE TABLE is not a table", () => {
    root = makeTree(baseRegistry(), `
      -- CREATE TABLE commented_out (user_id uuid NOT NULL REFERENCES users(id));
    `);
    const found = discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table);
    expect(found).not.toContain("commented_out");
  });

  test("stripSqlComments leaves dollar-quoted bodies intact", () => {
    // Migration bodies are full of `--` lines inside $mig$ ... $mig$; eating
    // those would corrupt the policy text the guard reads next.
    const kept = stripSqlComments("DO $mig$\n-- inside stays\nBEGIN END;\n$mig$;\n-- outside goes\n");
    expect(kept).toContain("-- inside stays");
    expect(kept).not.toContain("-- outside goes");
  });
});

describe("check:erasure-registry -- each rule fails on its own mutation", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  test("the unmutated fixture is green (no-op guard for every test below)", () => {
    root = makeTree();
    // G6 names five production ledgers a fixture has no reason to hold; every
    // other rule must be silent or the mutations below prove nothing.
    expect(collectErasureRegistryErrors(root).filter((e) => !e.startsWith("G6"))).toEqual([]);
  });

  test("G1: a new owner-column table that nobody classified", () => {
    root = makeTree(baseRegistry(), `
      CREATE TABLE IF NOT EXISTS secrets (
        id      uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    const fired = rulesFired(root, "G1");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("secrets");
  });

  test("G2: a classified table the schema no longer has", () => {
    const registry = baseRegistry();
    registry.tables.ghost = { owner: "user_id", class: "retained", reason: "존재하지 않는 표다." };
    root = makeTree(registry);
    const fired = rulesFired(root, "G2");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("ghost");
  });

  test("G3: client_erasable on a table with no DELETE path (the F1 defect)", () => {
    const registry = baseRegistry();
    registry.tables.audit = { owner: "user_id", class: "client_erasable", order: 20, reason: "잘못된 분류다." };
    root = makeTree(registry);
    const fired = rulesFired(root, "G3");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("audit");
    expect(fired[0]).toContain("0 rows");
  });

  test("G4: account_delete_only on a table the owner can in fact delete", () => {
    const registry = baseRegistry();
    registry.tables.notes = { owner: "user_id", class: "account_delete_only", reason: "잘못된 분류다." };
    root = makeTree(registry);
    const fired = rulesFired(root, "G4");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("notes_owner_all");
  });

  test("G5: a classification with no written reason, and a bad owner column", () => {
    const registry = baseRegistry();
    registry.tables.notes = { owner: "user_id", class: "client_erasable", order: 10, reason: "짧다" };
    registry.tables.audit = { owner: "nope_id", class: "account_delete_only", reason: "소유자 열 이름이 틀렸다." };
    root = makeTree(registry);
    const fired = rulesFired(root, "G5");
    expect(fired).toHaveLength(2);
    expect(fired.join(" ")).toContain("nope_id");
  });

  test("G5: two erasable tables cannot claim the same delete order", () => {
    const registry = baseRegistry();
    registry.tables.audit = { owner: "user_id", class: "client_erasable", order: 10, reason: "순서가 겹친다." };
    root = makeTree(registry);
    expect(rulesFired(root, "G5").join(" ")).toContain("delete order 10");
  });

  test("G7: the migration's seed block drifting from the JSON", () => {
    root = makeTree();
    const path = join(root, "db", "migrations", "0189_erasure_registry.sql");
    writeFileSync(path, readFileSync(path, "utf8").replace("'client_erasable'", "'retained'"), "utf8");
    const fired = rulesFired(root, "G7");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("--sql");
  });
});

describe("check:erasure-registry -- against the real repository", () => {
  test("main is green", () => {
    expect(collectErasureRegistryErrors(REPO_ROOT)).toEqual([]);
  });

  test("adding an unclassified table to a copy of the real tree turns it red", () => {
    // The dispatch asks for this one explicitly: a fake table must actually
    // make the guard fail. Copying db/ keeps it honest - same 172 migrations,
    // same registry, one added file.
    const root = mkdtempSync(join(tmpdir(), "erasure-real-"));
    try {
      cpSync(join(REPO_ROOT, "db"), join(root, "db"), { recursive: true });
      expect(collectErasureRegistryErrors(root)).toEqual([]);

      writeFileSync(
        join(root, "db", "migrations", "0190_unclassified_probe.sql"),
        `CREATE TABLE IF NOT EXISTS public.unclassified_probe (
           id      uuid PRIMARY KEY,
           user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
         );`,
        "utf8",
      );
      const after = collectErasureRegistryErrors(root);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatch(/^G1 unclassified_probe/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
