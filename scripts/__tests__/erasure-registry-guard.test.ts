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
function makeTree(
  registry: Registry = baseRegistry(),
  extraSql?: string,
  baseSql: string = BASE_SQL,
  // The FILE NAME the mutation lands in, because one exemption is now scoped to
  // a named migration: an opaque value spliced inside a dynamic `USING (...)` is
  // trusted in 0102_rls_wrap_auth_uid.sql and nowhere else (r43 artifact gate
  // M2). A mutation that has to be somewhere specific says so here.
  extraName: string = "0100_extra.sql",
  // Extra migrations beyond the first, for the cross-FILE shapes: a routine
  // defined in one migration and called in a later one (r43 artifact gate M1).
  moreSql: Record<string, string> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "erasure-guard-"));
  mkdirSync(join(root, "db", "migrations"), { recursive: true });
  writeFileSync(join(root, "db", "migrations", "0001_base.sql"), baseSql, "utf8");
  if (extraSql) writeFileSync(join(root, "db", "migrations", extraName), extraSql, "utf8");
  for (const [name, body] of Object.entries(moreSql)) {
    writeFileSync(join(root, "db", "migrations", name), body, "utf8");
  }
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
    // Published 0189 is historical. A later table addition must not prompt an
    // operator to replace that migration with a new full-registry seed.
    expect(fired[0]).toContain("Preserve 0189");
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

  function green(
    sql?: string,
    baseSql: string = BASE_SQL,
    extraName: string = "0100_extra.sql",
    moreSql: Record<string, string> = {},
  ): string[] {
    const probe = makeTree(baseRegistry(), sql, baseSql, extraName, moreSql);
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

  /** The file the exemption is scoped to. `green(sql, base, ZERO_ONE_ZERO_TWO)`
   *  therefore asks "would 0102 be exempt", and `green(sql)` asks "would anyone
   *  else be" -- two different questions since the r43 artifact gate (M2). */
  const ZERO_ONE_ZERO_TWO = "0102_rls_wrap_auth_uid.sql";

  test("[18] 0102's expression-only dynamic ALTER POLICY is exempt, counted and NOT silent -- and exempt ONLY there", () => {
    expect(green(DYNAMIC_ALTER_0102, BASE_SQL, ZERO_ONE_ZERO_TWO)).toEqual([]);
    root = makeTree(baseRegistry(), DYNAMIC_ALTER_0102, BASE_SQL, ZERO_ONE_ZERO_TWO);
    const replay = replayMigrations(join(root, "db", "migrations"));
    expect(replay.beyondModel).toEqual([]);
    expect(replay.expressionOnlyRewrites).toHaveLength(1);
    expect(replay.expressionOnlyRewrites[0].detail).toContain("ALTER POLICY");
    rmSync(root, { recursive: true, force: true });
    root = "";

    // THE SAME BYTES IN ANOTHER MIGRATION ARE REFUSED. This assertion is the
    // r43 artifact gate's M2: the exemption rests entirely on the value's
    // provenance, and "some migration does what 0102 does" is not provenance.
    // Measured 2026-09-20: 0102 is the only migration in db/migrations that
    // issues a dynamic ALTER POLICY at all, so this narrowing exempts nothing
    // that used to be exempt.
    expect(green(DYNAMIC_ALTER_0102).join(" | ")).toContain("dynamic-ddl");
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

  // -- r43: the two paths the r42 artifact gate walked through green ---------
  //
  // Both are "the parser could not follow the execution path and carried on",
  // which is the same family as [10]-[12] and [18]-[19]. Each gate case is
  // paired with the control that must NOT move, because the fix for a false
  // green is only worth having if it does not manufacture a false red.

  test("[24] a function CREATEd and then CALLED in the same migration is executed code (r42 artifact gate M1)", () => {
    mutate({
      mutation: `
        CREATE OR REPLACE FUNCTION public.notes_probe() RETURNS void
        LANGUAGE plpgsql AS $body$
        BEGIN
          EXECUTE 'ALTER POLICY notes_owner_all ON public.notes TO anon';
        END;
        $body$;
        SELECT public.notes_probe();
        DROP FUNCTION public.notes_probe();`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[25] ...but DEFINING one and never calling it is not, which is 0015's admin_exec_sql", () => {
    expect(
      green(`
        CREATE OR REPLACE FUNCTION public.notes_unused() RETURNS void
        LANGUAGE plpgsql AS $body$
        BEGIN
          EXECUTE 'ALTER POLICY notes_owner_all ON public.notes TO anon';
        END;
        $body$;
        REVOKE EXECUTE ON FUNCTION public.notes_unused() FROM anon;
        DROP FUNCTION public.notes_unused();`),
    ).toEqual([]);
  });

  test("[26] attaching it as a TRIGGER counts as running it -- any DML reaches the body from there", () => {
    mutate({
      mutation: `
        CREATE OR REPLACE FUNCTION public.notes_trg() RETURNS trigger
        LANGUAGE plpgsql AS $body$
        BEGIN
          EXECUTE 'ALTER POLICY notes_owner_all ON public.notes TO anon';
          RETURN NEW;
        END;
        $body$;
        CREATE TRIGGER notes_t AFTER INSERT ON public.notes
          FOR EACH ROW EXECUTE FUNCTION public.notes_trg();`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[27] a DECLARE-initialised variable that appends ` TO anon` is followed, not ignored (r42 artifact gate M1)", () => {
    mutate({
      mutation: `
        DO $x$
        DECLARE
          stmt        text;
          role_clause text := ' TO anon';
        BEGIN
          stmt := 'ALTER POLICY notes_owner_all ON public.notes' || role_clause;
          EXECUTE stmt;
        END
        $x$;`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[28] and a value it cannot follow at all, appended outside the USING parens, fails closed", () => {
    // A RECORD FIELD, deliberately: it carries no literal of its own, so the
    // previous version saw only the ALTER POLICY half, read the payload as a
    // bare target with nothing after it, and EXEMPTED it. The same shape with
    // a `current_setting('x')` suffix was already red by accident -- the stray
    // 'x' literal landed in the fragment list -- and an accident is not a
    // property worth resting a guard on.
    mutate({
      mutation: `
        DO $x$
        DECLARE
          stmt text;
          r    record;
        BEGIN
          stmt := 'ALTER POLICY notes_owner_all ON public.notes' || r.extra;
          EXECUTE stmt;
        END
        $x$;`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[29] the opaque-USING exemption is 0102's ALONE -- the same payload anywhere else fails closed", () => {
    // A value spliced strictly inside the USING parens is the one thing a
    // static reader cannot evaluate, so the exemption can only ever be as good
    // as the value's PROVENANCE. 0102's provenance is the whole argument: the
    // value is `r.qual` read back from pg_policies, which renders it through
    // pg_get_expr and therefore cannot emit an unbalanced parenthesis or a
    // second clause.
    //
    // A PREVIOUS VERSION OF THIS TEST PINNED THE OPPOSITE -- it asserted
    // `green(...) = []` and `expressionOnlyRewrites = 1` for this payload in an
    // arbitrary migration, and the r43 artifact gate (M2) used exactly that to
    // walk a DORMANT TRIGGER through: `current_setting('app.policy_qual')`
    // spliced into the same position, attached to a trigger that CI never
    // fires, so the catalog lane cannot see it either. Both lanes green on a
    // policy that widens to every row at the next UPDATE.
    const INSIDE_PARENS = `
DO $x$
DECLARE
  stmt text;
  r    record;
BEGIN
  stmt := 'ALTER POLICY notes_owner_all ON public.notes USING (' || r.qual || ')';
  EXECUTE stmt;
END
$x$;
`;
    // Anywhere but 0102: red, and it names the catalog test.
    mutate({ mutation: INSIDE_PARENS, rule: "G3c", says: "dynamic-ddl" });

    // In 0102, and reading pg_policies: exempt, counted, printed -- unchanged.
    expect(green(DYNAMIC_ALTER_0102, BASE_SQL, ZERO_ONE_ZERO_TWO)).toEqual([]);

    // ...and THE FILE NAME IS NOT THE WHOLE TEST. 0102 is trusted because of
    // where its value comes from, so the same position filled from somewhere
    // else -- a bare record field, or `current_setting('app.q')` -- is red even
    // inside 0102. Otherwise "put it in 0102" would simply be the new bypass.
    expect(green(INSIDE_PARENS, BASE_SQL, ZERO_ONE_ZERO_TWO).join(" | ")).toContain("dynamic-ddl");
    root = makeTree(
      baseRegistry(),
      `
DO $x$
DECLARE
  stmt text;
BEGIN
  stmt := 'ALTER POLICY notes_owner_all ON public.notes USING (' || pg_catalog.current_setting('app.q') || ')';
  EXECUTE stmt;
END
$x$;
`,
      BASE_SQL,
      ZERO_ONE_ZERO_TWO,
    );
    expect(rulesFired(root, "G3c").join(" | ")).toContain("dynamic-ddl");
  });

  test("[30] the F2 pair, asserted TOGETHER: only the static replay can tell these two apart (r42 authorisation gate F2)", () => {
    // In a database with no platform default privileges -- which is every CI
    // scratch DB, because the stub cannot install them without breaking 0179 --
    // these two statements leave BYTE-IDENTICAL ACLs: revoking a privilege the
    // role never held is a no-op either way. So the catalog test in
    // db/tests/erasure_registry_regression.sql cannot be the one to tell them
    // apart, and this guard has to be. Split across two tests they read as
    // unrelated; the pairing IS the contract.
    expect(green(`REVOKE GRANT OPTION FOR DELETE ON public.notes FROM authenticated;`)).toEqual([]);
    root = makeTree(baseRegistry(), `REVOKE DELETE ON public.notes FROM authenticated;`);
    const fired = rulesFired(root, "G3b");
    expect(fired.join(" | ")).toContain("TABLE-level DELETE privilege");
  });

  // -- r43: the ACL spelling, the execution path, and the floor -------------

  test("[31] the F2 pair AGAIN, quoted -- `\"public\".\"notes\"` revokes exactly what `public.notes` does", () => {
    // The r43 authorisation gate (F2) ran both statements and measured
    // `bare_revoke RED` / `quoted_schema_revoke GREEN errors=[] canDelete=true`:
    // the ACL pattern required the literal unquoted `public.`, so the quoted
    // form took DELETE away in the database and nothing at all in the model.
    // Paired with the GRANT OPTION control for the same reason [30] gives --
    // the two spellings must stay on OPPOSITE sides of the verdict.
    for (const quoted of [
      `REVOKE DELETE ON "public"."notes" FROM authenticated;`,
      `REVOKE DELETE ON "public".notes FROM authenticated;`,
      `REVOKE DELETE ON TABLE public."notes" FROM authenticated;`,
    ]) {
      const probe = makeTree(baseRegistry(), quoted);
      try {
        expect(rulesFired(probe, "G3b").join(" | ")).toContain("TABLE-level DELETE privilege");
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    }
    expect(green(`REVOKE SELECT ON "public"."notes" FROM authenticated;`).join(" | ")).toContain(
      "TABLE-level SELECT privilege",
    );
    // ...and the no-op keeps taking nothing away, in the quoted form too.
    expect(green(`REVOKE GRANT OPTION FOR DELETE ON "public"."notes" FROM authenticated;`)).toEqual([]);
  });

  test("[32] a GRANT/REVOKE spelling NEITHER pattern reads is refused, not ignored", () => {
    // The lesson of r40/r41/r42/r43 read from the other end: widening a regex
    // closes the spelling it was shown and nothing else. So an ACL statement
    // that names a table-shaped object and does not parse is now a question for
    // the catalog test. Measured over db/migrations on 2026-09-20: 85 statements
    // name a table, 85 parse, so this rule adds no failure to the real tree --
    // it is the floor under the NEXT spelling.
    mutate({
      mutation: `REVOKE DELETE ON postgres.public.notes FROM authenticated;`,
      rule: "G3c",
      says: "unparsed-acl",
    });
    // Object kinds that are not tables stay out of scope, or every migration
    // would turn red: 483 of the 568 GRANT/REVOKEs in db/migrations are
    // `ON FUNCTION`.
    expect(green(`GRANT EXECUTE ON FUNCTION public.note_count(uuid) TO authenticated;`)).toEqual([]);
    expect(green(`GRANT USAGE ON SCHEMA public TO authenticated;`)).toEqual([]);
    expect(green(`GRANT USAGE, SELECT ON SEQUENCE public.notes_seq TO authenticated;`)).toEqual([]);
  });

  test("[33] role membership is reported, because it is what makes a policy for ANOTHER role a delete path", () => {
    // `CREATE ROLE review_group; GRANT review_group TO authenticated;` plus a
    // policy `FOR DELETE TO review_group` is the r42/r43 authorisation gate F1
    // counter-example. Every piece of it is ordinary PostgreSQL and NONE of it
    // is readable from the policy text, so all three are reported: the role, the
    // membership, and the policy scoped to a role this guard cannot place.
    mutate({ mutation: `CREATE ROLE review_group;`, rule: "G3c", says: "role-membership" });
    mutate({ mutation: `GRANT review_group TO authenticated;`, rule: "G3c", says: "role-membership" });
    mutate({
      mutation: `CREATE POLICY notes_review_extra ON notes FOR DELETE TO review_group
  USING (EXISTS (SELECT 1 FROM note_links AS mine WHERE mine.user_id = auth.uid()));`,
      rule: "G3c",
      says: "review_group",
    });
    // The four Supabase roles stay silent, or every table would be a question:
    // `authenticated` and PUBLIC are judged outright, and `anon` /
    // `service_role` are peers of `authenticated` under `authenticator`, never
    // its parents.
    // `USING (true)` would trip the pre-existing constant-filter rule and prove
    // nothing about roles, so the control carries the owner-bound filter.
    expect(
      green(`CREATE POLICY notes_svc ON notes FOR DELETE TO service_role USING (user_id = auth.uid());`),
    ).toEqual([]);
    expect(green(`CREATE POLICY notes_anon ON notes FOR DELETE TO anon USING (user_id = auth.uid());`)).toEqual([]);
  });

  test("[34] a routine defined in ONE migration and run by a LATER one is still run", () => {
    // The r43 artifact gate (M1) reproduced this twice and got `errors=[] GREEN`
    // both times, because `executedBlocks` took a single file's text: the
    // definition in 0187 and the call in 0188 were unrelated strings. Not a
    // hypothetical shape here -- 41 of db/migrations' 124 routine names are
    // redefined in a later file and `billing_request_role` is called from 22.
    const DEFINE = `
CREATE FUNCTION public.cross_probe() RETURNS void LANGUAGE plpgsql AS $x$
BEGIN
  EXECUTE 'REVOKE DELETE ON public.notes FROM authenticated';
END
$x$;
`;
    expect(green(DEFINE, BASE_SQL, "0100_extra.sql", { "0101_call.sql": `SELECT public.cross_probe();` }).join(" | ")).toContain(
      "dynamic-ddl",
    );
    // ...and by a trigger attached in a later file, which reaches the body at
    // the next DML rather than at apply time.
    expect(
      green(DEFINE, BASE_SQL, "0100_extra.sql", {
        "0101_attach.sql": `CREATE TRIGGER probe_t AFTER UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION public.cross_probe();`,
      }).join(" | "),
    ).toContain("dynamic-ddl");

    // DEFINING IS STILL NOT RUNNING -- 0015's admin_exec_sql depends on it.
    expect(green(DEFINE)).toEqual([]);
    // ...and a routine dropped BEFORE the call is not running either. Ordering
    // inside and across files is the whole point of the tracker.
    expect(
      green(DEFINE, BASE_SQL, "0100_extra.sql", {
        "0101_drop.sql": `DROP FUNCTION public.cross_probe();`,
        "0102_call.sql": `SELECT public.cross_probe();`,
      }),
    ).toEqual([]);
  });

  test("[35] a body written `AS '...'` is a body, and a body this parser cannot read fails closed", () => {
    // PostgreSQL's original spelling. The previous version looked for a dollar
    // tag and `continue`d when there was none, so a valid single-quoted function
    // body vanished -- the r43 artifact gate's third reproduction, GREEN. Worse,
    // the tag search was not bounded to the CREATE statement, so such a routine
    // would have ADOPTED the next dollar-quoted block in the file as its body.
    const SINGLE_QUOTED = `
CREATE FUNCTION public.sq_probe() RETURNS void LANGUAGE plpgsql AS
'BEGIN EXECUTE ''REVOKE DELETE ON public.notes FROM authenticated''; END;';
SELECT public.sq_probe();
`;
    mutate({ mutation: SINGLE_QUOTED, rule: "G3c", says: "dynamic-ddl" });
    // Across files as well.
    expect(
      green(
        `CREATE FUNCTION public.sq2_probe() RETURNS void LANGUAGE plpgsql AS
'BEGIN EXECUTE ''REVOKE DELETE ON public.notes FROM authenticated''; END;';`,
        BASE_SQL,
        "0100_extra.sql",
        { "0101_call.sql": `SELECT public.sq2_probe();` },
      ).join(" | "),
    ).toContain("dynamic-ddl");

    // A form it can read NEITHER way -- the SQL-standard `RETURN expr` body --
    // is refused when something calls it, and silent when nothing does. "I
    // cannot read this" must not become "this is fine".
    mutate({
      mutation: `CREATE FUNCTION public.atomic_probe(p int) RETURNS int LANGUAGE sql RETURN p + 1;
SELECT public.atomic_probe(1);`,
      rule: "G3c",
      says: "cannot",
    });
    expect(green(`CREATE FUNCTION public.atomic_quiet(p int) RETURNS int LANGUAGE sql RETURN p + 1;`)).toEqual([]);

    // A header clause carrying a quoted value is not a body: `SET search_path =
    // ''` must not be read as one, or the real dollar-quoted body below it is
    // lost. 0189's own erase_my_data has exactly this shape.
    mutate({
      mutation: `CREATE FUNCTION public.hdr_probe() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $h$
BEGIN
  EXECUTE 'REVOKE DELETE ON public.notes FROM authenticated';
END
$h$;
SELECT public.hdr_probe();`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });

  test("[36] the dormant-trigger shape the r43 gate used: an opaque USING that CI never fires", () => {
    // The combination is what made it invisible to BOTH lanes: the payload is
    // exempt statically (an opaque value inside the USING parens), and the
    // trigger does not fire while the migrations are applied, so the catalog
    // regression afterwards observes only the PRE-change policy. Scoping the
    // exemption to 0102 is what closes it.
    mutate({
      mutation: `
CREATE FUNCTION public.dorm_probe() RETURNS trigger LANGUAGE plpgsql AS $t$
DECLARE stmt text;
BEGIN
  stmt := 'ALTER POLICY notes_owner_all ON public.notes USING (' || pg_catalog.current_setting('app.policy_qual') || ')';
  EXECUTE stmt;
  RETURN NEW;
END
$t$;
CREATE TRIGGER dorm_t AFTER UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION public.dorm_probe();`,
      rule: "G3c",
      says: "dynamic-ddl",
    });
  });
});

describe("G10 -- the catalog test's privilege floor may not grant back what a migration revoked (r43)", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  /** A tree that also carries the one line of db/tests/... that G10 owns. */
  function treeWithPin(pin: string | null, extraSql?: string): string {
    const built = makeTree(baseRegistry(), extraSql);
    mkdirSync(join(built, "db", "tests"), { recursive: true });
    writeFileSync(
      join(built, "db", "tests", "erasure_registry_regression.sql"),
      pin === null
        ? `DO $baseline$\nDECLARE\n  v_revoked_pin text := '';\nBEGIN\nEND;\n$baseline$;\n`
        : `DO $baseline$\nDECLARE\n  v_revoked_pin text := '${pin}'; -- G10-ACL-PIN\nBEGIN\nEND;\n$baseline$;\n`,
      "utf8",
    );
    return built;
  }

  test("[37] an empty pin is correct only while db/migrations revokes nothing", () => {
    // WHY THIS RULE EXISTS. The catalog test installs a privilege floor because
    // the CI database has no Supabase ALTER DEFAULT PRIVILEGES. Two versions of
    // that floor were disproved by execution, the second one by the r43 gates:
    // a migration that really revokes DELETE leaves the CI stub in the same
    // state as one that revokes nothing, so a floor reading
    // `has_table_privilege` GRANTED IT BACK and the revocation became invisible
    // in the catalog lane as well. The floor therefore subtracts only what THIS
    // rule recomputes from the migration text.
    root = treeWithPin("");
    expect(rulesFired(root, "G10")).toEqual([]);
    rmSync(root, { recursive: true, force: true });

    // A pin claiming a revocation that db/migrations does not contain would
    // make the floor revoke a privilege that is still granted -- a healthy
    // table turned red, the r41 F2 failure from the other side.
    root = treeWithPin("notes.delete");
    expect(rulesFired(root, "G10").join(" | ")).toContain("db/migrations leaves nothing revoked");
  });

  test("[38] a real REVOKE makes the pin stale, and BOTH lanes say so", () => {
    root = treeWithPin("", `REVOKE DELETE ON "public"."notes" FROM authenticated;`);
    const errors = collectErasureRegistryErrors(root);
    // The text lane: the privilege is gone.
    expect(errors.filter((e) => e.startsWith("G3b")).join(" | ")).toContain("TABLE-level DELETE privilege");
    // The floor lane: and the floor is not allowed to put it back.
    expect(errors.filter((e) => e.startsWith("G10")).join(" | ")).toContain("Set it to 'notes.delete'");

    // Updating the pin instead is the OTHER acceptable state -- G10 goes quiet,
    // the floor revokes DELETE again, and block (8) of the catalog test fails on
    // the row count. There is no third option where the revocation disappears.
    rmSync(root, { recursive: true, force: true });
    root = treeWithPin("notes.delete", `REVOKE DELETE ON "public"."notes" FROM authenticated;`);
    expect(rulesFired(root, "G10")).toEqual([]);
    expect(rulesFired(root, "G3b").join(" | ")).toContain("TABLE-level DELETE privilege");
  });

  test("[39] losing the pin line is a failure, not a default", () => {
    root = treeWithPin(null);
    expect(rulesFired(root, "G10").join(" | ")).toContain("G10-ACL-PIN");
  });

  test("[40] the real tree: the pin is empty, and that is a measurement", () => {
    // All 26 client_erasable tables still hold SELECT and DELETE for
    // `authenticated` after the full replay -- only 2 of the 26 are named by any
    // GRANT/REVOKE at all. An empty pin therefore means the floor reproduces the
    // Supabase default and subtracts nothing, which is the strongest state this
    // rule can report.
    expect(collectErasureRegistryErrors(REPO_ROOT).filter((e) => e.startsWith("G10"))).toEqual([]);
    const pinLine = readFileSync(join(REPO_ROOT, "db", "tests", "erasure_registry_regression.sql"), "utf8").match(
      /v_revoked_pin\s+text\s*:=\s*'([^']*)';\s*--\s*G10-ACL-PIN/,
    );
    expect(pinLine).not.toBeNull();
    expect(pinLine?.[1]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// r44 gates, F1/F2/F3 and M1. Three mutations walked through the static lane
// GREEN, and two of them took the catalog lane with them: the tracker keyed
// routines by their BARE NAME, so a DROP naming a signature that does not exist
// deleted the live body and a same-named routine in another schema stood in for
// it; and `DO '...'` -- PostgreSQL's plain-string spelling of an anonymous
// block -- was not read at all, which is how the gate's own counter-example
// slipped past G3c the role grant it needed.
//
// These cases live in their own describe because `mutate()` above is scoped to
// the r42 block; `fired()` below is the same idea in three lines, and it keeps
// the [41]+ numbering in file order.
// ---------------------------------------------------------------------------

describe("routine identity and the DO spelling (r44 artifact M1 / authorisation F2, F3)", () => {
  /** G3 verdicts for BASE_SQL plus one extra migration, and optionally more. */
  function fired(sql: string, moreSql: Record<string, string> = {}): string[] {
    const probe = makeTree(baseRegistry(), sql, BASE_SQL, "0100_extra.sql", moreSql);
    try {
      return rulesFired(probe, "G3");
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
  }

  /** The live body: it REVOKEs DELETE on an erasable table from `authenticated`,
   *  which both lanes must see. Written once so every case below differs from
   *  the others in exactly one thing. */
  const LIVE = [
    "CREATE FUNCTION public.sig_probe(p text) RETURNS void LANGUAGE plpgsql AS $s$",
    "BEGIN",
    "  EXECUTE 'REVOKE DELETE ON public.notes FROM authenticated';",
    "END",
    "$s$;",
    "",
  ].join("\n");

  test("[41] dropping a signature that does not exist does not delete the one that does", () => {
    // THE r44 ARTIFACT GATE'S M1, verbatim. `DROP FUNCTION IF EXISTS f(integer)`
    // is a no-op in PostgreSQL when the only f takes text -- it skips the
    // missing overload and leaves the live one alone. The old tracker deleted
    // the NAME, so the call below resolved to nothing: G3b never saw the
    // REVOKE, the G10 pin stayed empty, and the regression SQL's privilege
    // floor then granted DELETE back, so the catalog lane could not see it
    // either. One missing identity, both lanes false green.
    expect(fired(LIVE)).toEqual([]); // defining is still not running
    expect(
      fired(`${LIVE}DROP FUNCTION IF EXISTS public.sig_probe(integer);\nSELECT public.sig_probe('x'::text);`).join(
        " | ",
      ),
    ).toContain("dynamic-ddl");

    // The control that proves the SIGNATURE is doing the work and not the mere
    // presence of a DROP: drop the one that IS live and the call resolves to
    // nothing, exactly as Postgres would have raised there.
    expect(
      fired(`${LIVE}DROP FUNCTION IF EXISTS public.sig_probe(text);\nSELECT public.sig_probe('x'::text);`),
    ).toEqual([]);

    // ...and a signature-less DROP takes every overload, which is what Postgres
    // does -- it errors when there is more than one, so a migration cannot mean
    // anything else by it.
    expect(fired(`${LIVE}DROP FUNCTION public.sig_probe;\nSELECT public.sig_probe('x'::text);`)).toEqual([]);

    // Type modifiers are not part of a routine's identity, so `numeric(10,2)`
    // and `numeric` name the same argument and this DROP really does land.
    const MOD = [
      "CREATE FUNCTION public.mod_probe(p numeric(10,2)) RETURNS void LANGUAGE plpgsql AS $m$",
      "BEGIN",
      "  EXECUTE 'REVOKE DELETE ON public.notes FROM authenticated';",
      "END",
      "$m$;",
      "",
    ].join("\n");
    expect(fired(`${MOD}DROP FUNCTION public.mod_probe(numeric);\nSELECT public.mod_probe(1);`)).toEqual([]);
  });

  test("[42] a second overload does not replace the first, and a call reaches both", () => {
    // THE r44 AUTHORISATION GATE'S F3. `ovl_probe()` and `ovl_probe(integer)`
    // are two routines. The tracker treated the second CREATE as a replacement,
    // so it inspected the harmless body and reported `[]` while the dangerous
    // one was the one being called. Resolving WHICH overload a call means needs
    // SQL type inference, so the tracker collects them all instead -- an
    // over-approximation that can only add a report, never remove one.
    const OVERLOAD = [
      "CREATE FUNCTION public.ovl_probe() RETURNS void LANGUAGE plpgsql AS $a$",
      "BEGIN",
      "  EXECUTE 'REVOKE DELETE ON public.notes FROM authenticated';",
      "END",
      "$a$;",
      "CREATE FUNCTION public.ovl_probe(x integer) RETURNS void LANGUAGE plpgsql AS $b$",
      "BEGIN",
      "  NULL;",
      "END",
      "$b$;",
      "",
    ].join("\n");
    expect(fired(`${OVERLOAD}SELECT public.ovl_probe();`).join(" | ")).toContain("dynamic-ddl");
    // Which overload the call names is not what saves it either.
    expect(fired(`${OVERLOAD}SELECT public.ovl_probe(1);`).join(" | ")).toContain("dynamic-ddl");
    // The negative control -- only the harmless body exists -- stays green, so
    // this is not a rule that says no to every overload.
    expect(
      fired(
        [
          "CREATE FUNCTION public.ovl_quiet(x integer) RETURNS void LANGUAGE plpgsql AS $b$",
          "BEGIN",
          "  NULL;",
          "END",
          "$b$;",
          "SELECT public.ovl_quiet(1);",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("[43] a same-named routine in ANOTHER schema is another routine", () => {
    // The gate's `schema_collision` control. Nothing in this parser used to
    // keep a schema, so `review.sig_probe()` overwrote `public.sig_probe` and
    // an explicit `SELECT public.sig_probe(...)` was judged against the wrong
    // body.
    const HARMLESS = [
      "CREATE SCHEMA IF NOT EXISTS review;",
      LIVE,
      "CREATE FUNCTION review.sig_probe(p text) RETURNS void LANGUAGE plpgsql AS $q$",
      "BEGIN",
      "  NULL;",
      "END",
      "$q$;",
      "",
    ].join("\n");
    expect(fired(`${HARMLESS}SELECT public.sig_probe('x'::text);`).join(" | ")).toContain("dynamic-ddl");
    // ...and calling the OTHER one really is calling the other one.
    expect(fired(`${HARMLESS}SELECT review.sig_probe('x'::text);`)).toEqual([]);
  });

  test("[44] `DO '...'` is an executable block, and it fails closed", () => {
    // THE r44 AUTHORISATION GATE'S F2. PostgreSQL takes DO's code argument as a
    // plain string literal; the dollar spelling is a convenience, not a
    // requirement. `doBlocks` accepted the dollar spelling only, AND
    // `maskInertSql` blanks single-quoted text -- so a REVOKE written this way
    // was invisible to the dynamic-DDL lane, the ACL replay and the
    // role-membership scan at once. The gate used exactly that to smuggle in
    // the `GRANT anon TO authenticated` its F1 counter-example needed, which a
    // plain `GRANT` would have been refused for.
    expect(fired(`DO 'BEGIN EXECUTE ''REVOKE DELETE ON public.notes FROM authenticated''; END';`).join(" | ")).toContain(
      "dynamic-ddl",
    );
    // The role grant itself, which is the half that mattered to F1.
    expect(fired(`DO 'BEGIN EXECUTE ''GRANT anon TO authenticated''; END';`).join(" | ")).toContain("dynamic-ddl");

    // It is reported for what it IS, not only for what it carries: the rest of
    // the replay still reads `maskInertSql` output, which cannot see inside a
    // single-quoted body, so even an empty one goes to the catalog test.
    // Reading a body is not the same as modelling it.
    expect(fired(`DO 'BEGIN NULL; END';`).join(" | ")).toContain("DO '...'");
    // `LANGUAGE` in front changes nothing.
    expect(fired(`DO LANGUAGE plpgsql 'BEGIN NULL; END';`).join(" | ")).toContain("DO '...'");
    // `E'...'` carries escapes this parser does not decode, so its body is
    // recorded as unread rather than half-read.
    expect(fired(`DO E'BEGIN NULL; END';`).join(" | ")).toContain("not read at all");

    // The positive control: the dollar spelling of the SAME empty block is
    // modelled, and stays green. Without it the cases above would pass just as
    // well on a rule that refused every DO.
    expect(fired(`DO $q$ BEGIN NULL; END $q$;`)).toEqual([]);

    // And db/migrations contains none today, which is why this costs the real
    // tree nothing. It is the floor under the next spelling, not a ratchet.
    expect(replayMigrations(migrationsDir(REPO_ROOT)).routineIdentity.quotedDo).toBe(0);
  });

  test("[45] the real corpus really does exercise signature keying", () => {
    // A rule tested only on fixtures is a rule that might be keying on nothing.
    // These are measurements of db/migrations, reprinted by the PASS line, and
    // they say the distinction is load-bearing on the tree that ships: names
    // really are redefined, overloads really do coexist, and every argument
    // list was read -- a signature this parser could not read would show up
    // here, and it would be a definition no DROP can ever remove.
    const stats = replayMigrations(migrationsDir(REPO_ROOT)).routineIdentity;
    expect(stats.definitions).toBeGreaterThan(100);
    expect(stats.identities).toBeGreaterThan(0);
    expect(stats.identities).toBeLessThan(stats.definitions); // replacements really happen
    expect(stats.overloadedNames).toBeGreaterThan(0); // and so do real overloads
    expect(stats.signatureless).toBe(0);
    expect(collectErasureRegistryErrors(REPO_ROOT)).toEqual([]);
  });
});
