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
  replayMigrations,
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

-- A CASCADE child of an erasable parent, for G8 (both ends erasable) and G9
-- (the child is kept, yet the parent takes it along).
CREATE TABLE IF NOT EXISTS note_links (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE
);
CREATE POLICY note_links_owner_all ON note_links FOR ALL TO authenticated USING (user_id = auth.uid());

-- SET NULL, not CASCADE: the row survives, so an inverted order here is legal
-- and neither rule may fire on it. (The real pair is ops_routine_logs 60 ->
-- health_samples 53, which a naive "child order must be lower" rule would flag.)
CREATE TABLE IF NOT EXISTS note_echoes (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL
);
CREATE POLICY note_echoes_owner_all ON note_echoes FOR ALL TO authenticated USING (user_id = auth.uid());
`;

function baseRegistry(): Registry {
  return {
    version: 1,
    tables: {
      notes: { owner: "user_id", class: "client_erasable", order: 10, reason: "사용자가 쓴 메모 본문이다." },
      audit: { owner: "user_id", class: "account_delete_only", reason: "DELETE 정책이 없어 소유자가 지울 수 없다." },
      note_links: { owner: "user_id", class: "client_erasable", order: 9, reason: "메모 사이의 연결. 부모보다 먼저 지운다." },
      note_echoes: { owner: "user_id", class: "client_erasable", order: 20, reason: "SET NULL 이라 부모 뒤에 와도 된다." },
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
    expect(found.map((t) => t.table).sort()).toEqual(["audit", "note_echoes", "note_links", "notes"]);
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

describe("replayMigrations -- statement order, not regex order", () => {
  // Both cases come from the r38 artifact gate, which built them by hand and
  // watched the old parser get them backwards. It processed every CREATE in a
  // file, then every ALTER, then every DROP -- and for policies every DROP before
  // every CREATE -- so the winner was whichever regex ran last, not whichever
  // statement Postgres would run last.
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  test("a table dropped and then re-created in the same file is still there", () => {
    root = makeTree(baseRegistry(), `
      CREATE TABLE public.probe (user_id uuid NOT NULL REFERENCES users(id));
      DROP TABLE public.probe;
      CREATE TABLE public.probe (user_id uuid NOT NULL REFERENCES users(id));
    `);
    expect(discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table)).toContain("probe");
  });

  test("...and the reverse order still removes it", () => {
    root = makeTree(baseRegistry(), `
      CREATE TABLE public.probe (user_id uuid NOT NULL REFERENCES users(id));
      DROP TABLE public.probe;
    `);
    expect(discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table)).not.toContain("probe");
  });

  test("a policy created and then dropped in the same file is gone", () => {
    // G3 is the observable consequence: give audit a DELETE policy and drop it
    // again in the same file. audit must stay undeletable.
    const registry = baseRegistry();
    registry.tables.audit = { owner: "user_id", class: "client_erasable", order: 30, reason: "정책이 최종적으로 없다." };
    root = makeTree(registry, `
      CREATE POLICY audit_delete ON audit FOR DELETE TO authenticated USING (user_id = auth.uid());
      DROP POLICY audit_delete ON audit;
    `);
    expect(rulesFired(root, "G3").join(" ")).toContain("audit");
  });

  test("...and the reverse order leaves it alive", () => {
    const registry = baseRegistry();
    registry.tables.audit = { owner: "user_id", class: "client_erasable", order: 30, reason: "정책이 최종적으로 있다." };
    root = makeTree(registry, `
      DROP POLICY IF EXISTS audit_delete ON audit;
      CREATE POLICY audit_delete ON audit FOR DELETE TO authenticated USING (user_id = auth.uid());
    `);
    expect(rulesFired(root, "G3")).toEqual([]);
  });

  test("DROP TABLE a, b drops both, not just the first", () => {
    root = makeTree(baseRegistry(), `
      CREATE TABLE public.probe_a (user_id uuid NOT NULL REFERENCES users(id));
      CREATE TABLE public.probe_b (user_id uuid NOT NULL REFERENCES users(id));
      DROP TABLE public.probe_a, public.probe_b;
    `);
    const found = discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table);
    expect(found).not.toContain("probe_a");
    expect(found).not.toContain("probe_b");
  });

  test("the foreign keys it reports carry the right ON DELETE action", () => {
    root = makeTree();
    const intoNotes = replayMigrations(join(root, "db", "migrations")).foreignKeys
      .filter((f) => f.parent === "notes")
      .map((f) => f.child + ":" + f.onDelete)
      .sort();
    expect(intoNotes).toEqual(["note_echoes:set null", "note_links:cascade"]);
  });
});

describe("check:erasure-registry -- G6, G8 and G9", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  // G6 had no negative mutation until the r38 gate counted them: the green
  // baseline filters G6 out and the real-tree tests only assert it is absent, so
  // the one rule protecting the retention ledgers was the one nobody had watched
  // fail.
  test("G6: a retention ledger reclassified as erasable", () => {
    const registry = baseRegistry();
    registry.tables.consent_records = {
      owner: "user_id",
      class: "client_erasable",
      order: 99,
      reason: "동의 원장을 지우려는 시도다.",
    };
    root = makeTree(registry, `
      CREATE TABLE IF NOT EXISTS consent_records (user_id uuid NOT NULL REFERENCES users(id));
      CREATE POLICY consent_all ON consent_records FOR ALL TO authenticated USING (user_id = auth.uid());
    `);
    const fired = rulesFired(root, "G6").filter((e) => e.includes("consent_records"));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("client_erasable");
  });

  test("G6: a retention ledger missing from the registry entirely", () => {
    // Every makeTree() fixture is in this state for all five ledgers. Assert it
    // instead of filtering it away.
    root = makeTree();
    expect(rulesFired(root, "G6")).toHaveLength(5);
    expect(rulesFired(root, "G6").join(" ")).toContain("must appear");
  });

  // G8 -- the F2 defect: wiki_links sat after wiki_pages, so the cascade emptied
  // it before its own DELETE ran and the receipt reported 0 rows destroyed.
  test("G8: a CASCADE child ordered after its parent", () => {
    const registry = baseRegistry();
    registry.tables.note_links = { owner: "user_id", class: "client_erasable", order: 11, reason: "부모보다 뒤에 있다." };
    root = makeTree(registry);
    const fired = rulesFired(root, "G8");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("note_links");
    expect(fired[0]).toContain("0 rows");
  });

  test("G8: an equal order is a violation too, not only a greater one", () => {
    const registry = baseRegistry();
    registry.tables.note_links = { owner: "user_id", class: "client_erasable", order: 10, reason: "부모와 순서가 같다." };
    root = makeTree(registry);
    expect(rulesFired(root, "G8")).toHaveLength(1);
  });

  test("G8 stays silent on SET NULL, where the row survives", () => {
    // note_echoes (20) sits after notes (10) but the FK is SET NULL, so the row
    // is still there to be counted. A rule that flagged every inverted order
    // would fail here -- and would fire falsely on the real ops_routine_logs pair.
    root = makeTree();
    expect(rulesFired(root, "G8")).toEqual([]);
  });

  // G9 -- the F3 defect: content_reports was reported as kept while
  // clipper_templates took it along.
  test("G9: a kept table that a cascade silently destroys", () => {
    const registry = baseRegistry();
    registry.tables.note_links = { owner: "user_id", class: "account_delete_only", reason: "남긴다고 적어 두었다." };
    root = makeTree(registry);
    const fired = rulesFired(root, "G9");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("note_links");
    expect(fired[0]).toContain("cascadesFrom");
  });

  test("G9: declaring the cascade silences it", () => {
    const registry = baseRegistry();
    registry.tables.note_links = {
      owner: "user_id",
      class: "account_delete_only",
      cascadesFrom: "notes",
      reason: "부모와 함께 사라진다고 적었다.",
    };
    root = makeTree(registry);
    expect(rulesFired(root, "G9")).toEqual([]);
  });

  test("G9: a declared cascade the schema does not have", () => {
    const registry = baseRegistry();
    registry.tables.audit = {
      owner: "user_id",
      class: "account_delete_only",
      cascadesFrom: "notes",
      reason: "있지도 않은 연쇄를 주장한다.",
    };
    root = makeTree(registry);
    const fired = rulesFired(root, "G9");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("no ");
  });

  test("G9: cascadesFrom on a client_erasable table is a category error", () => {
    const registry = baseRegistry();
    registry.tables.note_links = {
      owner: "user_id",
      class: "client_erasable",
      order: 9,
      cascadesFrom: "notes",
      reason: "명시 삭제 대상인데 연쇄라고도 적었다.",
    };
    root = makeTree(registry);
    expect(rulesFired(root, "G9").join(" ")).toContain("only for tables");
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
