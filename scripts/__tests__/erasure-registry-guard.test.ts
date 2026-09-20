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
  maskInertSql,
  ownerRoleCanDelete,
  renderRegistrySql,
  replayMigrations,
  stripForDdlScan,
  stripSqlComments,
  type Registry,
} from "../generate-erasure-registry";
import { collectErasureRegistryErrors, isOwnerBoundUsing } from "../check-erasure-registry";
import { loadRegistry, migrationsDir } from "../generate-erasure-registry";

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
function makeTree(registry: Registry = baseRegistry(), extraSql?: string, baseSql: string = BASE_SQL): string {
  const root = mkdtempSync(join(tmpdir(), "erasure-guard-"));
  mkdirSync(join(root, "db", "migrations"), { recursive: true });
  writeFileSync(join(root, "db", "migrations", "0001_base.sql"), baseSql, "utf8");
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

  // One ALTER TABLE statement can carry several comma-separated clauses, and
  // this repo writes them that way (0186 adds two FKs in one statement). Reading
  // the statement with a single `([^;]*)` tail attributes every later clause to
  // the first one. Found by adversarial review of this change, not by the gate;
  // before the fix the parser reported knowledge_sources.verified_by -> users as
  // NO ACTION where pg_constraint says SET NULL.
  test("every clause of a multi-clause ALTER TABLE is read on its own", () => {
    root = makeTree(baseRegistry(), `
      CREATE TABLE public.kid (a_id uuid, b_id uuid, user_id uuid NOT NULL REFERENCES users(id));
      ALTER TABLE public.kid
        ADD CONSTRAINT kid_a_fk FOREIGN KEY (a_id) REFERENCES public.notes (id),
        ADD CONSTRAINT kid_b_fk FOREIGN KEY (b_id) REFERENCES public.notes (id) ON DELETE CASCADE;
    `);
    const fks = replayMigrations(join(root, "db", "migrations")).foreignKeys
      .filter((f) => f.child === "kid" && f.parent === "notes");
    expect(fks.map((f) => `${f.constraintName}:${f.onDelete}`).sort()).toEqual([
      "kid_a_fk:no action", // its own clause has no ON DELETE...
      "kid_b_fk:cascade", // ...and must not inherit the next clause's
    ]);
  });

  test("a multi-clause ADD COLUMN credits each column with its own definition", () => {
    // The dangerous direction: crediting user_id's `uuid ... REFERENCES users`
    // to session_id makes the guard name session_id as the only owner candidate
    // and reject the correct one. An owner column that is not the owner makes
    // every DELETE match 0 rows -- defect F1, reintroduced through the guard.
    root = makeTree(baseRegistry(), `
      CREATE TABLE public.chat_turns (id uuid PRIMARY KEY);
      ALTER TABLE public.chat_turns
        ADD COLUMN IF NOT EXISTS session_id uuid,
        ADD COLUMN IF NOT EXISTS user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE;
    `);
    const found = replayMigrations(join(root, "db", "migrations")).tables.get("chat_turns");
    expect(found?.ownerColumns.map((c) => c.name)).toEqual(["user_id"]);
  });

  test("ALTER TABLE ONLY ... ADD COLUMN still puts the table in the inventory", () => {
    // ONLY was accepted by the FK and DROP CONSTRAINT patterns but not by
    // ADD COLUMN, so a table whose owner column arrived that way was invisible
    // to G1 -- unclassified, and silently outside the delete list (F4).
    root = makeTree(baseRegistry(), `
      CREATE TABLE public.mood_notes (id uuid PRIMARY KEY);
      ALTER TABLE ONLY public.mood_notes
        ADD COLUMN user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE;
    `);
    expect(discoverOwnedTables(join(root, "db", "migrations")).map((t) => t.table)).toContain("mood_notes");
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

// ---------------------------------------------------------------------------
// r40 gate, M1 and M2. Three mutations went through G3 untouched, all three
// wearing a correct-looking policy header: DDL that existed only as text, a
// `USING (false)` that admits no rows, and a revoked table-level DELETE grant.
// Each gets a negative control (mutated -> red) AND a positive control
// (the same construct, genuinely correct -> green), because a rule that says no
// to everything is not a guard either.
// ---------------------------------------------------------------------------

/** The gate's own M1 repro: a table with NO policy whatsoever, whose only
 *  `CREATE POLICY` is the text of a log line inside a DO block. */
const GHOST_POLICY_SQL = `
CREATE TABLE IF NOT EXISTS ghosts (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
DO $mig$
BEGIN
  RAISE NOTICE 'CREATE POLICY ghost ON ghosts FOR ALL TO authenticated USING (user_id = auth.uid());';
END
$mig$;
`;

/** The same DO block, but the DDL is real this time. */
const REAL_DO_POLICY_SQL = `
CREATE TABLE IF NOT EXISTS ghosts (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
DO $mig$
BEGIN
  CREATE POLICY ghost ON ghosts FOR ALL TO authenticated USING (user_id = auth.uid());
END
$mig$;
`;

function withGhost(entry: Record<string, unknown>): Registry {
  const registry = baseRegistry();
  (registry.tables as Record<string, unknown>).ghosts = entry;
  return registry;
}

const GHOST_ERASABLE = { owner: "user_id", class: "client_erasable", order: 30, reason: "테스트용 소유자 데이터다." };

describe("maskInertSql -- inert text is not schema (r40 M1)", () => {
  test("blanks a string literal's contents and keeps the byte length", () => {
    const sql = "SELECT 'CREATE POLICY p ON t';";
    const masked = maskInertSql(sql);
    expect(masked).toHaveLength(sql.length);
    expect(masked).not.toContain("CREATE POLICY");
    expect(masked.startsWith("SELECT '")).toBe(true);
    expect(masked.endsWith("';")).toBe(true);
  });

  test("descends INTO a dollar body: real DDL survives, a literal inside it does not", () => {
    const masked = maskInertSql(
      "DO $mig$ BEGIN CREATE POLICY real ON t FOR ALL TO authenticated USING (user_id = auth.uid()); RAISE NOTICE 'DROP POLICY real ON t'; END $mig$;",
    );
    expect(masked).toContain("CREATE POLICY real ON t");
    expect(masked).not.toContain("DROP POLICY real ON t");
  });

  test("a -- comment inside a dollar body is blanked too (stripSqlComments cannot reach it)", () => {
    const body = "DO $mig$ BEGIN -- CREATE POLICY commented ON t FOR ALL TO authenticated\n  PERFORM 1;\nEND $mig$;";
    expect(stripSqlComments(body)).toContain("CREATE POLICY commented");
    expect(stripForDdlScan(body)).not.toContain("CREATE POLICY commented");
  });

  test("nested dollar tags recurse rather than terminate the scan", () => {
    const masked = maskInertSql("DO $mig$ BEGIN EXECUTE $p$ CREATE POLICY inner ON t $p$; RAISE NOTICE 'CREATE POLICY faked ON t'; END $mig$;");
    expect(masked).toContain("CREATE POLICY inner ON t");
    expect(masked).not.toContain("CREATE POLICY faked");
  });

  test("an escaped quote inside a literal does not end it early", () => {
    const sql = "SELECT 'it''s CREATE POLICY p ON t' , 1;";
    const masked = maskInertSql(sql);
    expect(masked).toHaveLength(sql.length);
    expect(masked).not.toContain("CREATE POLICY");
    expect(masked.trimEnd().endsWith(", 1;")).toBe(true);
  });
});

describe("check:erasure-registry -- G3 reads rows, not headers (r40 M1/M2)", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  test("M1 negative control: a policy that exists only inside RAISE NOTICE is not a policy", () => {
    root = makeTree(withGhost(GHOST_ERASABLE), GHOST_POLICY_SQL);
    const fired = rulesFired(root, "G3");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("ghosts");
    expect(fired[0]).toContain("no DELETE or ALL policy");
  });

  test("M1 positive control: the same DO block with real DDL is accepted", () => {
    root = makeTree(withGhost(GHOST_ERASABLE), REAL_DO_POLICY_SQL);
    expect(rulesFired(root, "G3")).toEqual([]);
  });

  test("M1 sibling: a commented-out CREATE POLICY inside a DO block is not a policy either", () => {
    root = makeTree(
      withGhost(GHOST_ERASABLE),
      `
      CREATE TABLE IF NOT EXISTS ghosts (
        id      uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
      );
      DO $mig$
      BEGIN
        -- CREATE POLICY ghost ON ghosts FOR ALL TO authenticated USING (user_id = auth.uid());
        PERFORM 1;
      END
      $mig$;
      `,
    );
    const fired = rulesFired(root, "G3");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("no DELETE or ALL policy");
  });

  test("M2 baseline: the unmutated fixture's owner policy passes the USING allowlist", () => {
    root = makeTree();
    expect(rulesFired(root, "G3")).toEqual([]);
  });

  test("M2 mutation: USING (false) has the right header and admits no rows", () => {
    root = makeTree(
      baseRegistry(),
      undefined,
      BASE_SQL.replace(
        "CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());",
        "CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (false) WITH CHECK (false);",
      ),
    );
    const fired = rulesFired(root, "G3");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("notes");
    expect(fired[0]).toContain("USING (false)");
    // r42: a constant row filter is no longer judged ("this admits nothing, so
    // the owner cannot delete") but FAILED CLOSED. What `USING (false)` does
    // depends on the other policies on the table, and that composition is the
    // thing this guard stopped claiming to know.
    expect(fired[0]).toMatch(/^G3c /);
    expect(fired[0]).toContain("erasure_registry_regression.sql");
  });

  test("M2 mutation: a FOR ALL policy with no USING at all is not owner-bound", () => {
    root = makeTree(
      baseRegistry(),
      undefined,
      BASE_SQL.replace(
        "CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());",
        "CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated WITH CHECK (user_id = auth.uid());",
      ),
    );
    const fired = rulesFired(root, "G3");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("<absent>");
  });

  test("M2 mutation: a USING that widens past the owner's own rows is rejected", () => {
    root = makeTree(
      baseRegistry(),
      undefined,
      BASE_SQL.replace(
        "CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());",
        "CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid() OR body IS NOT NULL);",
      ),
    );
    expect(rulesFired(root, "G3")).toHaveLength(1);
  });

  test("M2 positive control: every shape the 26 real tables use is accepted", () => {
    for (const shape of [
      "user_id = auth.uid()",
      "user_id = (select auth.uid())",
      "(select auth.uid()) = user_id",
      "(user_id = auth.uid())",
      "((select auth.uid()) = user_id)",
    ]) {
      expect(isOwnerBoundUsing(shape, "user_id")).toBe(true);
    }
    for (const shape of ["false", "true", "user_id = auth.uid() or is_shared", "other_id = auth.uid()", "user_id = auth.jwt()"]) {
      expect(isOwnerBoundUsing(shape, "user_id")).toBe(false);
    }
    expect(isOwnerBoundUsing(null, "user_id")).toBe(false);
    // The parens in `(a) = (b)` do not enclose the expression and must not be
    // stripped into `a) = (b`.
    expect(isOwnerBoundUsing("(user_id) = (auth.uid())", "user_id")).toBe(false);
  });

  test("M2 mutation: REVOKE DELETE leaves a perfect policy that can still delete nothing", () => {
    root = makeTree(baseRegistry(), "REVOKE DELETE ON TABLE public.notes FROM authenticated;");
    const fired = rulesFired(root, "G3");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("TABLE-level DELETE privilege");
  });

  test("M2 mutation: REVOKE ALL is caught too, and from PUBLIC alone is not enough to save it", () => {
    root = makeTree(baseRegistry(), `
      REVOKE ALL ON TABLE public.notes FROM anon, authenticated;
      GRANT SELECT, INSERT ON TABLE public.notes TO authenticated;
    `);
    expect(rulesFired(root, "G3")).toHaveLength(1);
  });

  test("M2 positive control: the REVOKE ALL then GRANT-back pattern (0097 template_blocks) stays green", () => {
    root = makeTree(baseRegistry(), `
      REVOKE ALL ON TABLE public.notes FROM anon, authenticated;
      GRANT SELECT, INSERT, DELETE ON TABLE public.notes TO authenticated;
    `);
    expect(rulesFired(root, "G3")).toEqual([]);
  });

  test("M2 positive control: a GRANT to PUBLIC restores the delete path", () => {
    root = makeTree(baseRegistry(), `
      REVOKE DELETE ON TABLE public.notes FROM authenticated;
      GRANT DELETE ON TABLE public.notes TO PUBLIC;
    `);
    expect(rulesFired(root, "G3")).toEqual([]);
  });

  test("the ACL replay is ordered, not last-regex-wins", () => {
    const revokeThenGrant = makeTree(baseRegistry(), `
      REVOKE ALL ON TABLE public.notes FROM authenticated;
      GRANT DELETE ON TABLE public.notes TO authenticated;
    `);
    const grantThenRevoke = makeTree(baseRegistry(), `
      GRANT DELETE ON TABLE public.notes TO authenticated;
      REVOKE ALL ON TABLE public.notes FROM authenticated;
    `);
    try {
      expect(ownerRoleCanDelete(replayMigrations(join(revokeThenGrant, "db", "migrations")), "notes")).toBe(true);
      expect(ownerRoleCanDelete(replayMigrations(join(grantThenRevoke, "db", "migrations")), "notes")).toBe(false);
    } finally {
      rmSync(revokeThenGrant, { recursive: true, force: true });
      rmSync(grantThenRevoke, { recursive: true, force: true });
    }
  });

  test("a column-qualified GRANT is not read as a table privilege", () => {
    // `GRANT INSERT (id) ON users` (0139's shape) must not be split into a
    // table-wide INSERT, and REVOKE DELETE must still be the deciding verb.
    root = makeTree(baseRegistry(), `
      REVOKE DELETE ON TABLE public.notes FROM authenticated;
      GRANT INSERT (id, body) ON TABLE public.notes TO authenticated;
    `);
    expect(rulesFired(root, "G3")).toHaveLength(1);
  });

  test("a GRANT on a FUNCTION or SCHEMA never touches table privileges", () => {
    root = makeTree(baseRegistry(), `
      REVOKE EXECUTE ON FUNCTION public.notes FROM authenticated;
      GRANT USAGE ON SCHEMA notes TO authenticated;
    `);
    expect(rulesFired(root, "G3")).toEqual([]);
  });

  test("a DROP TABLE resets the grants, so a pre-DROP revoke does not outlive it", () => {
    root = makeTree(baseRegistry(), `
      REVOKE DELETE ON TABLE public.notes FROM authenticated;
      DROP TABLE IF EXISTS public.notes;
      CREATE TABLE notes (
        id      uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body    text
      );
      CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());
    `);
    expect(rulesFired(root, "G3")).toEqual([]);
  });
});

describe("the real registry still classifies the same 66 rows (r40 M1/M2)", () => {
  test("all 26 client_erasable tables are owner-bound and still hold the DELETE grant", () => {
    const replay = replayMigrations(migrationsDir(REPO_ROOT));
    const registry = loadRegistry(REPO_ROOT);
    const erasable = Object.entries(registry.tables).filter(([, e]) => e.class === "client_erasable");
    expect(erasable).toHaveLength(26);

    const shapes = new Set<string>();
    for (const [table, entry] of erasable) {
      const policies = [...(replay.policies.get(table) ?? new Map())].filter(
        ([, state]) => state.command === "delete" || state.command === "all",
      );
      expect(policies.length).toBeGreaterThan(0);
      const bound = policies.filter(([, state]) => isOwnerBoundUsing(state.using, entry.owner));
      // Named in the message so a future failure says WHICH table drifted.
      expect(bound.map(([name]) => `${table}:${name}`).length).toBeGreaterThan(0);
      for (const [, state] of bound) shapes.add(String(state.using).replace(entry.owner, "<owner>"));
      expect(ownerRoleCanDelete(replay, table)).toBe(true);
    }

    // The allowlist was derived from exactly these three spellings. A fourth
    // showing up is the signal to re-read the allowlist comment, not to widen
    // it silently.
    expect([...shapes].sort()).toEqual([
      "(select auth.uid()) = <owner>",
      "<owner> = (select auth.uid())",
      "<owner> = auth.uid()",
    ]);
  });

  test("the 13 account_delete_only tables still have no owner delete path", () => {
    const replay = replayMigrations(migrationsDir(REPO_ROOT));
    const registry = loadRegistry(REPO_ROOT);
    const kept = Object.entries(registry.tables).filter(([, e]) => e.class === "account_delete_only");
    expect(kept).toHaveLength(13);
    for (const [table] of kept) {
      const policies = [...(replay.policies.get(table) ?? new Map())].filter(
        ([, state]) =>
          (state.command === "delete" || state.command === "all") && /authenticated|public/.test(state.roles),
      );
      expect(policies.map(([name]) => `${table}:${name}`)).toEqual([]);
    }
  });
});

// ===========================================================================
// r42 -- THE BOUNDARY MOVED, AND THIS IS THE TABLE THAT HOLDS IT
// ===========================================================================
//
// Three review rounds closed the exact SQL spellings they were shown and the
// next round found equivalent ones. Every entry below is a mutation one of
// those rounds walked through the guard GREEN. Each must now end in one of two
// states, never a third:
//
//   RED          the static text contradicts the registry outright
//   FAIL CLOSED  the static text cannot answer, so the guard says so and names
//                db/tests/erasure_registry_regression.sql
//
// A silent pass is the failure mode this table exists to make impossible, so
// every row asserts which rule fired as well as that one did, and each row is
// preceded by its own green baseline (the no-op mutation trap: a "red" that
// was never green proves nothing).
describe("check:erasure-registry -- every mutation the r40/r41 gates walked through (r42)", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  /** notes gains its own SELECT policy beside the FOR ALL one, which is the
   *  real shape of clipper_templates and template_blocks. */
  const WITH_SELECT_POLICY = `${BASE_SQL}
CREATE POLICY notes_owner_select ON notes FOR SELECT TO authenticated USING (user_id = auth.uid());
`;

  /** 0102's shape: a DO block that builds an ALTER POLICY out of pg_policies
   *  and executes it. It names no table, so nothing static can bound its
   *  reach -- which is why the guard stopped judging policy EXPRESSIONS. */
  const DYNAMIC_ALTER_0102 = `
DO $rewrite$
DECLARE
  r    record;
  stmt text;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public'
  LOOP
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    stmt := stmt || ' USING (' || r.qual || ')';
    EXECUTE stmt;
  END LOOP;
END
$rewrite$;
`;

  function green(sql?: string, baseSql: string = BASE_SQL): string[] {
    const probe = makeTree(baseRegistry(), sql, baseSql);
    try {
      return rulesFired(probe, "G3");
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
  }

  /** Green baseline, then exactly one change, then the rule that must fire. */
  function mutate(opts: {
    baseline?: string;
    baseSql?: string;
    mutation: string;
    rule: "G3a" | "G3b" | "G3c";
    says: string;
  }): void {
    expect(green(opts.baseline, opts.baseSql)).toEqual([]);
    root = makeTree(baseRegistry(), `${opts.baseline ?? ""}\n${opts.mutation}`, opts.baseSql);
    const fired = rulesFired(root, "G3");
    // `some`, not `every`: a mutation may legitimately trip two rules at once.
    // `EXECUTE $p$DROP POLICY ...$p$` is both unmodelled (G3c) and, because a
    // dollar body opened by EXECUTE really is code, replayed as a DROP (G3b).
    // Two reds are a stronger result than one; zero is the only failure.
    expect(fired.some((e) => e.startsWith(opts.rule))).toBe(true);
    expect(fired.join(" | ")).toContain(opts.says);
    if (opts.rule === "G3c") {
      expect(fired.filter((e) => e.startsWith("G3c")).join(" | ")).toContain("erasure_registry_regression.sql");
    }
  }

  // -- forged policies: text that mentions DDL is not DDL -------------------

  test("[1] a policy forged in a single-quoted RAISE NOTICE does not replace the real one", () => {
    mutate({
      mutation: `
        DROP POLICY notes_owner_all ON notes;
        DO $x$ BEGIN
          RAISE NOTICE 'CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());';
        END $x$;`,
      rule: "G3b",
      says: "no DELETE or ALL policy",
    });
  });

  test("[2] and the same forgery in a DOLLAR-quoted NOTICE body (r41 gate F3)", () => {
    mutate({
      mutation: `
        DROP POLICY notes_owner_all ON notes;
        DO $x$ BEGIN
          RAISE NOTICE $msg$CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());$msg$;
        END $x$;`,
      rule: "G3b",
      says: "no DELETE or ALL policy",
    });
  });

  test("[3] and in a dollar-quoted VARIABLE initialiser (r41 gate F3)", () => {
    mutate({
      mutation: `
        DROP POLICY notes_owner_all ON notes;
        DO $x$
        DECLARE example text := $msg$CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());$msg$;
        BEGIN
          RAISE NOTICE '%', example;
        END $x$;`,
      rule: "G3b",
      says: "no DELETE or ALL policy",
    });
  });

  // -- ALTER POLICY: modelled in its literal form ---------------------------

  test("[4] ALTER POLICY inverting the owner test is a contradiction, not a pass (r41 gate F1)", () => {
    mutate({
      mutation: `ALTER POLICY notes_owner_all ON public.notes USING (user_id <> auth.uid());`,
      rule: "G3a",
      says: "binds something other than",
    });
  });

  test("[5] ALTER POLICY ... TO anon takes the owner's delete path away", () => {
    mutate({
      mutation: `ALTER POLICY notes_owner_all ON public.notes TO anon;`,
      rule: "G3b",
      says: "no DELETE or ALL policy",
    });
  });

  test("[6] ALTER POLICY ... USING (false) fails closed on the constant", () => {
    mutate({
      mutation: `ALTER POLICY notes_owner_all ON public.notes USING (false);`,
      rule: "G3c",
      says: "constant row filter USING (false)",
    });
  });

  // -- policy COMPOSITION: never modelled, always fail closed ---------------

  test("[7] a second permissive policy is ORed in by Postgres, so the guard stops (r41 gate F1)", () => {
    mutate({
      mutation: `CREATE POLICY notes_broad ON public.notes FOR ALL TO authenticated USING (true);`,
      rule: "G3c",
      says: "permissive policies reach DELETE",
    });
  });

  test("[8] AS RESTRICTIVE is ANDed on top, so the guard stops (r41 gate F1)", () => {
    mutate({
      mutation: `CREATE POLICY notes_deny ON public.notes AS RESTRICTIVE FOR DELETE TO authenticated USING (false);`,
      rule: "G3c",
      says: "AS RESTRICTIVE",
    });
  });

  test("[9] narrowing the SELECT policy is caught although DELETE is untouched (r41 gate F1)", () => {
    mutate({
      baseSql: WITH_SELECT_POLICY,
      mutation: `
        DROP POLICY notes_owner_select ON public.notes;
        CREATE POLICY notes_owner_select ON public.notes FOR SELECT TO authenticated USING (false);`,
      rule: "G3c",
      says: "constant row filter USING (false)",
    });
  });

  // -- dynamic DDL, in any quoting ------------------------------------------

  test("[10] EXECUTE of a SINGLE-quoted DROP POLICY fails closed (r41 gate M1)", () => {
    mutate({
      mutation: `DO $x$ BEGIN EXECUTE 'DROP POLICY notes_owner_all ON public.notes'; END $x$;`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[11] EXECUTE of a DOLLAR-quoted DROP POLICY fails closed", () => {
    mutate({
      mutation: `DO $x$ BEGIN EXECUTE $p$DROP POLICY notes_owner_all ON public.notes$p$; END $x$;`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[12] EXECUTE format(...) that builds a REVOKE fails closed", () => {
    mutate({
      mutation: `DO $x$ BEGIN EXECUTE format('REVOKE DELETE ON public.notes FROM %I', 'authenticated'); END $x$;`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  // -- privileges -----------------------------------------------------------

  test("[13] a per-table REVOKE DELETE still goes red (r40 gate M2, kept)", () => {
    mutate({
      mutation: `REVOKE DELETE ON public.notes FROM authenticated;`,
      rule: "G3b",
      says: "TABLE-level DELETE privilege",
    });
  });

  test("[14] REVOKE SELECT ends owner deletion too, because the WHERE reads the owner column", () => {
    mutate({
      mutation: `REVOKE SELECT ON public.notes FROM authenticated;`,
      rule: "G3b",
      says: "TABLE-level SELECT privilege",
    });
  });

  test("[15] REVOKE ... ON ALL TABLES IN SCHEMA public fails closed (r41 gate M3)", () => {
    mutate({
      mutation: `REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM PUBLIC, authenticated;`,
      rule: "G3c",
      says: "schema-wide-acl",
    });
  });

  test("[16] REVOKE USAGE ON SCHEMA public fails closed (r41 gate F2)", () => {
    mutate({
      mutation: `REVOKE USAGE ON SCHEMA public FROM PUBLIC, authenticated;`,
      rule: "G3c",
      says: "schema-wide-acl",
    });
  });

  test("[17] a role whose NAME merely contains 'authenticated' is a different role (r41 gate M2)", () => {
    mutate({
      mutation: `
        DROP POLICY notes_owner_all ON public.notes;
        CREATE POLICY notes_owner_all ON public.notes FOR ALL TO not_authenticated USING (user_id = auth.uid());`,
      rule: "G3b",
      says: "no DELETE or ALL policy",
    });
  });

  // -- the exemption, and its own mutation ----------------------------------

  test("[18] 0102's expression-only dynamic ALTER POLICY is exempt, counted and NOT silent", () => {
    expect(green(DYNAMIC_ALTER_0102)).toEqual([]);
    root = makeTree(baseRegistry(), DYNAMIC_ALTER_0102);
    const replay = replayMigrations(join(root, "db", "migrations"));
    expect(replay.beyondModel).toEqual([]);
    expect(replay.expressionOnlyRewrites).toHaveLength(1);
    expect(replay.expressionOnlyRewrites[0].detail).toContain("ALTER POLICY");
  });

  test("[19] ...and the moment that same statement can also change the ROLE, it fails closed", () => {
    mutate({
      mutation: DYNAMIC_ALTER_0102.replace(
        "stmt := stmt || ' USING (' || r.qual || ')';",
        "stmt := stmt || ' TO anon';",
      ),
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  // -- false REDS the gates also found. A guard that cries wolf gets widened,
  //    and a widened guard is how the holes above got in.

  test("[20] REVOKE GRANT OPTION FOR DELETE leaves DELETE itself, and must stay green (r41 gate F2)", () => {
    expect(green(`REVOKE GRANT OPTION FOR DELETE ON public.notes FROM authenticated;`)).toEqual([]);
  });

  test("[21] dynamic DDL aimed outside the registry (storage.objects, a FUNCTION) stays green", () => {
    expect(
      green(`
        DO $x$ BEGIN
          EXECUTE $p$CREATE POLICY raw_owner ON storage.objects FOR SELECT TO authenticated USING (true)$p$;
          EXECUTE 'REVOKE EXECUTE ON FUNCTION public.some_fn(text) FROM anon';
        END $x$;`),
    ).toEqual([]);
  });

  test("[22] a real CREATE POLICY inside a DO block is still read as DDL", () => {
    expect(
      green(`
        DROP POLICY notes_owner_all ON notes;
        DO $mig$ BEGIN
          CREATE POLICY notes_owner_all ON notes FOR ALL TO authenticated USING (user_id = auth.uid());
        END $mig$;`),
    ).toEqual([]);
  });

  test("[23] an ALTER POLICY that only re-spells auth.uid() is not a contradiction", () => {
    expect(green(`ALTER POLICY notes_owner_all ON public.notes USING (user_id = (select auth.uid()));`)).toEqual([]);
  });
});
