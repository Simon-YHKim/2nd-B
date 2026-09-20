// Static structural assertions for db/migrations/0189_erasure_registry.sql, and
// for 0190_lock_erase_my_data_authenticated.sql, which completes the lock 0189
// claimed and did not have (see LOCK_FILE below).
//
// Behaviour is exercised against a real database by
// db/tests/erasure_registry_regression.sql, which supabase-dry-run runs on the
// job-local scratch DB after the staged migrations are applied. These
// assertions are the cheap half: they pin the properties whose absence would be
// invisible until it mattered, in the shape the repo already uses for migration
// tests (read the SQL text, assert on it).
//
// ⚠ That first sentence was not true when this file was written. The workflow
// applied 0189 and checked the migration ledger; nothing ever CALLED the
// function. The r38 artifact gate measured it, and the cost was F1: a
// schema-qualified COALESCE that raises 42883 and rolls the whole deletion
// back, while all thirteen assertions below stayed green. Text assertions
// cannot see a run-time name resolution. Keep both halves.
//
// The security-relevant ones are the first three. A SECURITY DEFINER function
// bypasses RLS, so `auth.uid()` is not a convenience here - it is the ONLY
// thing that keeps `erase_my_data` from deleting somebody else's rows.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  extractRegistrySql,
  loadRegistry,
  renderRegistrySql,
  stripForDdlScan,
} from "../../../../scripts/generate-erasure-registry";

const ROOT = resolve(__dirname, "../../../..");
const MIGRATIONS = join(ROOT, "db", "migrations");
const FILE = "0189_erasure_registry.sql";
// 0189 described the RPC as shipping locked and revoked only PUBLIC and anon.
// Supabase grants EXECUTE on every new public function to `authenticated` BY
// NAME, so that revoke left it callable (R48 artifact gate F-02). 0189 was
// already merged, so the correction is a new number.
const LOCK_FILE = "0190_lock_erase_my_data_authenticated.sql";

/** Comments must not be able to satisfy an assertion about behaviour. */
const stripSqlComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

const raw = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = stripSqlComments(raw);
const lockRaw = readFileSync(join(MIGRATIONS, LOCK_FILE), "utf8");
const lockCode = stripSqlComments(lockRaw);

// The ledger name is not typed a second time anywhere below: it is what the
// pinned CLI derives from the FILE name (pkg/migration/file.go at v2.116.0:
// `^([0-9]+)_(.*)\.sql$`, Name = group 2), and supabase-dry-run.yml re-reads it
// from the ledger after every push. Rename a migration and this follows.
const ledgerName = (file: string): string => {
  const match = /^[0-9]+_(.*)\.sql$/.exec(file);
  if (!match) throw new Error(`not a migration file name: ${file}`);
  return match[1];
};

type Migration = { file: string; sql: string };

/** Every numbered migration, in apply order. `db/migrations/*.sql` is a
 *  non-recursive glob, so rollback/ stays out, as it does for the CLI. */
const migrationsOnDisk = (): Migration[] =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS, file), "utf8") }));

// Does a migration LEAN on the two objects 0189 creates? "Lean" = its SQL names
// one of them where Postgres would execute it. rollback/0189_down.sql DROPs both,
// and a DROP takes everything hung on the object with it (a column, a policy, a
// trigger, a re-defined body, a GRANT, a registry row), so the migration that hung
// it there has to be re-applied by the next push, which happens only if its
// ledger row goes too.
//
// The reading is `stripForDdlScan`, the discriminator the erasure-registry guard
// already stands on (scripts/generate-erasure-registry.ts): comments go, string
// literals and inert dollar bodies (RAISE NOTICE $m$...$m$, COMMENT ... IS) are
// blanked, and the bodies that DO run (DO, a function's AS, EXECUTE $p$...$p$)
// are descended into. This file's own stripSqlComments is not enough here: it
// keeps a comment that trails code on the same line, and it keeps every literal,
// so a file that only TALKS about erase_my_data would be told to join the
// rollback. A rule that cries wolf gets switched off, and then it guards nothing.
//
// Names, not statement kinds. A list of "the statements that modify a table"
// would be one more list to forget an entry of; any executed mention is cheaper
// to get right, and its one cost is stated in the test below.
const LEANED_ON = /erase_my_data|erasure_registry/i;
const leansOnErasureObjects = (sql: string): boolean => LEANED_ON.test(stripForDdlScan(sql));
const rollbackSetFor = (migrations: readonly Migration[]): string[] =>
  migrations.filter((m) => leansOnErasureObjects(m.sql)).map((m) => ledgerName(m.file));

/** The names the rollback's DELETE actually receives (c_names), comments gone. */
const rollbackLedgerNames = (): string[] => {
  const down = stripSqlComments(readFileSync(join(MIGRATIONS, "rollback", "0189_down.sql"), "utf8"));
  const declared = /c_names\s+constant\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/.exec(down);
  if (!declared) throw new Error("rollback/0189_down.sql no longer declares c_names");
  // Trailing comments go first, so a name that survives only in a remark beside
  // the array cannot stand in for one the DELETE actually receives.
  return [...declared[1].replace(/--.*$/gm, "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe(`${FILE} -- structure`, () => {
  test("the migration number is not reused", () => {
    const clashes = readdirSync(MIGRATIONS).filter((f) => /^0189_/.test(f));
    expect(clashes).toEqual([FILE]);
  });

  test("no top-level transaction wrapper (the Supabase CLI opens its own)", () => {
    // Same expression supabase-dry-run.yml:178 rejects on. A nested BEGIN here
    // fails the whole staged-apply job rather than this file alone.
    const transaction = /^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/gim;
    expect(raw.match(transaction)).toBeNull();
  });

  test("erase_my_data is SECURITY DEFINER with a pinned search_path", () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.erase_my_data\(\s*p_scope text/);
    expect(code).toMatch(/SECURITY DEFINER/);
    expect(code).toMatch(/SET search_path = ''/);
  });

  test("a caller with no auth.uid() is refused before anything is deleted", () => {
    // The NULL check must sit ahead of the delete loop, not merely exist.
    const guardAt = code.search(/IF v_uid IS NULL THEN[\s\S]{0,200}RAISE EXCEPTION/);
    const deleteAt = code.search(/DELETE FROM public\.%I/);
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(deleteAt);
    expect(code).toMatch(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/);
  });

  test("every delete is owner-scoped and identifier-quoted", () => {
    // %I quotes the identifier; $1/USING binds the uuid. A %s or a concatenated
    // literal here would turn a registry row into arbitrary SQL.
    expect(code).toMatch(
      /pg_catalog\.format\(\s*'DELETE FROM public\.%I WHERE %I = \$1',[\s\S]{0,120}?\)\s*USING v_uid/,
    );
    expect(code).not.toMatch(/DELETE FROM public\.%s/);
  });

  test("only the content scope is accepted (account deletion stays elsewhere)", () => {
    expect(code).toMatch(/p_scope IS DISTINCT FROM 'content'[\s\S]{0,160}RAISE EXCEPTION/);
  });

  test("the receipt is a versioned public contract, not the registry read aloud", () => {
    // r39 gate finding 1. The receipt used to hand every `authenticated` caller
    // the raw table names of the retention, billing and audit ledgers, the
    // stated reason each one is protected, the FK parent that destroys it, and
    // the migration numbers embedded in those reasons. None of that is needed
    // to erase your own content; all of it is reconnaissance. The detail still
    // exists -- in public.erasure_registry, which anon and authenticated have
    // no rights on at all, so service_role is already the admin-only path.
    for (const key of [
      "'receipt_version'",
      "'scope'",
      "'executed_at'",
      "'status'",
      "'count_semantics'",
      "'direct_deleted_total'",
      "'outcomes'",
    ]) {
      expect(code).toContain(key);
    }
    expect(code).toMatch(/GET DIAGNOSTICS v_deleted = ROW_COUNT/);
    expect(code).toMatch(/WHERE r\.class <> 'client_erasable'/);

    // ...and the keys that carried the names are gone. Asserted as absences
    // because that is what the finding was: a present field, not a wrong one.
    const receipt = code.slice(code.indexOf("RETURN pg_catalog.jsonb_build_object"));
    expect(receipt).not.toMatch(/'table',/);
    expect(receipt).not.toMatch(/r\.table_name/);
    expect(receipt).not.toMatch(/r\.class/);
    expect(receipt).not.toMatch(/r\.reason/);
    expect(receipt).not.toMatch(/r\.cascades_from/);
  });

  test("...and the total's name matches what it counts", () => {
    // r39 gate finding 2. `deleted_total` read as "rows deleted" and was not:
    // it is the sum of the explicit DELETEs' ROW_COUNT, and FK cascades take
    // rows it never sees. The regression fixture is itself the counter-example
    // -- 6 returned, 7 rows gone. A comment could not fix that, because the
    // consumer of a network response does not read comments. The name and an
    // explicit count_semantics can.
    expect(code).toMatch(/'direct_deleted_total',\s*v_total/);
    expect(code).toMatch(/'count_semantics',\s*'direct_only'/);
    expect(code).toMatch(/'receipt_version',\s*1/);
    expect(code).not.toMatch(/'deleted_total'/);
    expect(code).not.toMatch(/'erased_at'/);
  });

  test("the refusal does not echo the caller's scope back", () => {
    // r39 gate finding 4: `RAISE EXCEPTION '... %', p_scope` put untrusted
    // input into the error response AND the database error log, where a token
    // would be retained and a newline would split a log line.
    expect(code).toMatch(/MESSAGE\s*=\s*'erase_my_data: unknown scope'/);
    expect(code).not.toMatch(/unknown scope %/);
  });

  test("...and separates both from 'a cascade took it anyway'", () => {
    // r38 F3: content_reports was reported as kept while clipper_templates took
    // it with it. Three buckets, not two -- and the split is driven by
    // cascades_from, so it cannot drift from the registry.
    // Three buckets, not two, and the split is still driven by cascades_from,
    // so it cannot drift from the registry. What changed in r39 is that the
    // buckets carry COUNTS instead of names -- "one category went with its
    // parent", not "content_reports went with clipper_templates".
    expect(code).toMatch(/'outcome',\s*'erased'/);
    expect(code).toMatch(/'outcome',\s*'kept'/);
    expect(code).toMatch(/'outcome',\s*'removed_with_parent'/);
    expect(code).toMatch(/FILTER \(WHERE r\.cascades_from IS NULL\)/);
    expect(code).toMatch(/FILTER \(WHERE r\.cascades_from IS NOT NULL\)/);
    // A client_erasable row is deleted explicitly, so it can never be cascaded.
    expect(code).toMatch(/cascades_from IS NULL OR class <> 'client_erasable'/);
  });

  test("no SQL construct is schema-qualified as if it were a function", () => {
    // r38 F1, and the reason this file alone was not enough. COALESCE, CASE,
    // NULLIF, GREATEST, LEAST, EXTRACT and the SQL-syntax forms of OVERLAY /
    // POSITION / SUBSTRING / TRIM are conditional expressions and syntax, not
    // pg_proc entries: the parser builds them from the bare keyword without a
    // catalog lookup, so `pg_catalog.coalesce(...)` falls through to ordinary
    // function resolution, finds nothing, and raises 42883 at RUN time. Every
    // string assertion in this file passed while that sat in the receipt SELECT
    // and rolled the whole deletion back.
    //
    // `SET search_path = ''` does not require it either -- it never applied to
    // constructs. Real functions (jsonb_agg, jsonb_build_object, format, ...)
    // still must be qualified, and are.
    const constructs = [
      "coalesce", "nullif", "greatest", "least", "case",
      "extract", "overlay", "position", "substring", "trim",
    ];
    const offenders = constructs.filter((c) => new RegExp(`pg_catalog\\.${c}\\s*\\(`, "i").test(code));
    expect(offenders).toEqual([]);
    // ...and the other half of the same lesson: a REAL function in that same
    // SELECT still must be qualified. The receipt SELECT that raised 42883 no
    // longer uses COALESCE at all (r39 dropped the two jsonb_agg branches for
    // two counts), so the pairing is asserted on what replaced it. FILTER is
    // syntax and is bare; count() is a function and is not.
    expect(code).toMatch(/pg_catalog\.count\(\*\) FILTER/);
    expect(code).not.toMatch(/pg_catalog\.filter/i);
  });

  test("apply-time check: a declared cascade must exist in pg_constraint", () => {
    expect(code).toMatch(/pg_catalog\.pg_constraint/);
    expect(code).toMatch(/confdeltype = 'c'/);
    expect(code).toMatch(/RAISE EXCEPTION 'erasure_registry declares a cascade the schema does not have/);
  });

  test("the destructive RPC is exercised against a real database, not only read", () => {
    // The claim this file's header used to make and the workflow did not keep.
    // If the regression file or its CI step is ever dropped, this goes red
    // rather than the coverage silently reverting to string matching.
    const regression = readFileSync(join(ROOT, "db", "tests", "erasure_registry_regression.sql"), "utf8");
    expect(regression).toMatch(/public\.erase_my_data\(/);
    const workflow = readFileSync(join(ROOT, ".github", "workflows", "supabase-dry-run.yml"), "utf8");
    expect(workflow).toMatch(/db\/tests\/erasure_registry_regression\.sql/);
  });

  test("the RPC ships LOCKED: no client role holds EXECUTE, authenticated included", () => {
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.erase_my_data\(text\) FROM PUBLIC, anon;/,
    );
    // That line alone is NOT a lock, and this test used to say it was. Supabase's
    // default privileges grant EXECUTE on every new public function to anon,
    // authenticated and service_role BY NAME (0036:11-13 recorded prod's ACL after
    // a PUBLIC-only revoke: all three still there), so revoking PUBLIC and anon
    // leaves `authenticated=X` standing. The
    // R48 artifact gate (F-02) caught it before 0189 reached prod; 0190 is the
    // revoke that was missing, and it restates all three so the shipped ACL can
    // be read off one file.
    expect(lockCode).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.erase_my_data\(text\) FROM PUBLIC, anon, authenticated;/,
    );
    // Across the two files, every client role is named in a REVOKE. Computed from
    // the statements rather than pinned to one spelling, so splitting the revoke
    // stays green and dropping a role does not.
    const revoked = new Set(
      [...`${code}\n${lockCode}`.matchAll(
        /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.erase_my_data\(text\)\s+FROM\s+([^;]+);/gi,
      )].flatMap((m) => m[1].split(",").map((role) => role.trim().toLowerCase())),
    );
    expect([...revoked]).toEqual(expect.arrayContaining(["public", "anon", "authenticated"]));
    // ...and 0190 refuses to finish applying unless that is the end state. On prod
    // the floor exists, so this check is the one place the lock is verified
    // against the real platform rather than a reproduction of it.
    expect(lockCode).toMatch(
      /has_function_privilege\('authenticated', 'public\.erase_my_data\(text\)', 'EXECUTE'\)[\s\S]{0,400}RAISE EXCEPTION/,
    );
    // 0190 is CLI-managed like 0189: no top-level transaction, number not reused.
    expect(
      lockRaw.match(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/gim),
    ).toBeNull();
    expect(readdirSync(MIGRATIONS).filter((f) => /^0190_/.test(f))).toEqual([LOCK_FILE]);

    // ...and no grant back, in ANY migration. This line used to assert
    // that the GRANT was PRESENT; the 8th artifact gate (2026-09-20, M1) is why it
    // now asserts the opposite. erase_my_data walks 26 tables in delete_order, and
    // the ROW EXCLUSIVE lock a DELETE takes does not exclude a concurrent INSERT --
    // so a SECOND SESSION OF THE SAME USER can commit a row into a table the sweep
    // has already passed. That row survives, the sweep never learns of it, and the
    // `status=ok` receipt is then false. It opens when a per-user delete fence and
    // generation land (S3-C / S3-D) and a two-session regression shows the late
    // INSERT refused or the call retried.
    //
    // Rule B of check:definer-grants is untouched: it wants the REVOKE above in the
    // same file, and that stays. db/tests/erasure_registry_regression.sql block (L)
    // asserts the same lock against a real catalog AND a real refused call; this is
    // the cheap half, and the half that goes red the moment the grant is typed back.
    //
    // Every migration is read, not just these two: the grant that reopens the RPC
    // would arrive in a LATER file. When S3-C / S3-D land and it is opened on
    // purpose, this assertion is changed in that same PR.
    const granting = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /GRANT\s+(?:ALL|EXECUTE)[^;]*\bON\s+FUNCTION\s+public\.erase_my_data\b/i.test(
          stripSqlComments(readFileSync(join(MIGRATIONS, f), "utf8")),
        ),
      );
    expect(granting).toEqual([]);
    // Rule A of check:definer-grants, asserted here too so a local edit fails fast.
    expect(code).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*\bTO\b[^;]*\banon\b/i);
    expect(lockCode).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*\bTO\b[^;]*\banon\b/i);
  });

  test("...and the lock assertion cannot pass on a database that has no floor", () => {
    // Why the missing revoke was invisible (R48 artifact gate F-02). Block (L) of
    // the DB regression asserted has_function_privilege('authenticated', ...) =
    // false, but the CI scratch database created the roles and none of Supabase's
    // default privileges. With no by-name grant to take away, that assertion was
    // true of ANY function whose migration revoked PUBLIC -- it stayed green with
    // the authenticated revoke absent. Measured on a scratch PostgreSQL 18.3 with
    // 0001-0189 applied: no floor -> ACL {postgres=X/postgres}, block (L) green;
    // floor -> {postgres=X/postgres,authenticated=X/postgres,
    // service_role=X/postgres}, block (L) red until 0190.
    //
    // Two pins, because either half alone can rot silently:
    //   1. the workflow installs the floor BEFORE the first migration is applied
    //      (a default privilege is stamped at CREATE time and never afterwards);
    //   2. block (L) proves the floor exists before it concludes anything, so a
    //      floor-less database is RED rather than vacuously green.
    // Line comments only (SQL `--` and YAML `#`). The block-comment half of
    // stripSqlComments must not run over YAML: `db/migrations/*.sql` opens a
    // "comment" that swallows everything up to the next `*/` -- measured, it
    // deleted the very statement this test looks for.
    const workflow = readFileSync(join(ROOT, ".github", "workflows", "supabase-dry-run.yml"), "utf8")
      .replace(/^\s*(--|#).*$/gm, "");
    const floorAt = workflow.search(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;/,
    );
    const firstApplyAt = workflow.indexOf("Apply baseline migrations");
    expect(floorAt).toBeGreaterThanOrEqual(0);
    expect(firstApplyAt).toBeGreaterThanOrEqual(0);
    expect(floorAt).toBeLessThan(firstApplyAt);

    const regression = stripSqlComments(
      readFileSync(join(ROOT, "db", "tests", "erasure_registry_regression.sql"), "utf8"),
    );
    const probeAt = regression.indexOf("CREATE FUNCTION public.erasure_lock_floor_probe()");
    const verdictAt = regression.search(
      /has_function_privilege\(\s*'authenticated', 'public\.erase_my_data\(text\)', 'EXECUTE'\)/,
    );
    expect(probeAt).toBeGreaterThanOrEqual(0);
    expect(verdictAt).toBeGreaterThanOrEqual(0);
    expect(probeAt).toBeLessThan(verdictAt);
    // BY NAME: through PUBLIC every new function is executable by everyone, floor
    // or no floor, so has_function_privilege() on the probe could not tell the
    // two databases apart. The explicit ACL entry can.
    expect(regression).toMatch(/aclexplode\(p\.proacl\)/);
    expect(regression).toMatch(/does not reproduce the Supabase default privileges for functions/);
  });

  test("the registry table is unreachable from the client", () => {
    expect(code).toMatch(/ALTER TABLE public\.erasure_registry ENABLE ROW LEVEL SECURITY;/);
    expect(code).toMatch(/REVOKE ALL ON public\.erasure_registry FROM anon, authenticated;/);
    // RLS on with zero policies is the deny-all; a policy here would be a bug.
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.erasure_registry/i);
  });

  test("the order column exists for erasable rows and only for them", () => {
    expect(code).toMatch(/class = 'client_erasable' AND delete_order IS NOT NULL/);
    expect(code).toMatch(/class <> 'client_erasable' AND delete_order IS NULL/);
    expect(code).toMatch(/ORDER BY r\.delete_order, r\.table_name/);
  });

  test("apply-time check: the registry may not name a column the catalog lacks", () => {
    expect(code).toMatch(/pg_catalog\.pg_attribute/);
    expect(code).toMatch(/RAISE EXCEPTION 'erasure_registry names columns that do not exist/);
  });

  test("the seed block is a render of db/erasure-registry.json, not a second copy", () => {
    const embedded = extractRegistrySql(raw);
    expect(embedded).not.toBeNull();
    expect(embedded?.replace(/\r\n/g, "\n")).toBe(renderRegistrySql(loadRegistry(ROOT)));
  });

  test("a rollback twin exists and is outside the apply glob", () => {
    const down = readFileSync(join(MIGRATIONS, "rollback", "0189_down.sql"), "utf8");
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.erase_my_data\(text\);/);
    expect(down).toMatch(/DROP TABLE IF EXISTS public\.erasure_registry;/);
    // `db/migrations/*.sql` is non-recursive, so the twin is never applied.
    expect(readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))).not.toContain("0189_down.sql");
  });

  test("the rollback clears BOTH ledger rows, inside the transaction that drops the function", () => {
    // 0190 locks the function OBJECT that 0189 creates, so dropping the function
    // takes 0190's revoke with it. The rollback used to delete only its own
    // ledger row (name = 'erasure_registry'). 0190's row survived, the next push
    // re-created the function from 0189 and SKIPPED 0190, and erase_my_data came
    // back with the platform default: authenticated=X, under a ledger that read as
    // fully applied (r49, two gates separately: B-K01 and B-EX-01). Measured
    // 2026-09-20 with the pinned CLI 2.116.0: a plain `db push` refuses the
    // out-of-order 0189 and itself suggests `--include-all`; taking that advice
    // is what re-opens the function.
    //
    // The behaviour is proved against a real database by the workflow step pinned
    // in the next test. This is the cheap half: it goes red in `npm run verify`,
    // with no database, the moment the second name leaves the set.
    const down = stripSqlComments(readFileSync(join(MIGRATIONS, "rollback", "0189_down.sql"), "utf8"));

    // The ledger names come from the FILE names (ledgerName, at the top).
    const expected = [FILE, LOCK_FILE].map(ledgerName);
    expect(expected).toEqual(["erasure_registry", "lock_erase_my_data_authenticated"]);

    // These two at least. The list grows with every later migration that leans on
    // the same objects, and the next test is what makes it grow; pinning it to
    // exactly two here would turn that growth red.
    const names = rollbackLedgerNames();
    expect(names).toEqual(expect.arrayContaining(expected));

    // Naming both is not deleting both. Measured: with the array intact and this
    // predicate put back to `m.name = 'erasure_registry'`, the file's own NOTICE
    // still LISTS both names as deleted (the list is read from the array) beside
    // a row count of 1, and 0190's row survives.
    const deletes = [
      ...down.matchAll(/DELETE\s+FROM\s+supabase_migrations\.schema_migrations[^;]*;/gi),
    ].map((m) => m[0]);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/WHERE\s+m\.name\s*=\s*ANY\s*\(\s*c_names\s*\)\s*;$/);

    // One transaction, in this order. Cut anywhere between the DROP and the DELETE
    // and what is left is "no function, 0190 recorded as applied": the hole.
    const beginAt = down.search(/^[ \t]*BEGIN;/m);
    const dropAt = down.search(/DROP FUNCTION IF EXISTS public\.erase_my_data\(text\);/);
    const deleteAt = down.search(/DELETE\s+FROM\s+supabase_migrations\.schema_migrations/i);
    const commitAt = down.search(/^[ \t]*COMMIT;/m);
    expect(Math.min(beginAt, dropAt, deleteAt, commitAt)).toBeGreaterThanOrEqual(0);
    expect(beginAt).toBeLessThan(dropAt);
    expect(dropAt).toBeLessThan(deleteAt);
    expect(deleteAt).toBeLessThan(commitAt);
    expect(down.match(/^[ \t]*BEGIN;/gm)).toHaveLength(1);
    expect(down.match(/^[ \t]*COMMIT;/gm)).toHaveLength(1);
  });

  test("...and the NEXT migration that leans on either object cannot be left out of that list", () => {
    // r50 artifact gate, B-NEW-01. The test above knew two names and the rollback
    // knows two names, so a third migration was nobody's job to notice. The
    // gate's counter-example: a later 0191 runs
    //   ALTER TABLE public.erasure_registry ADD COLUMN deletion_generation ...
    // and is not added to c_names. The rollback drops the table and the column
    // with it, 0191's ledger row stays, the next push skips 0191, and the fence
    // is gone under a ledger that reads as complete. It is the 0190 hole again,
    // one migration later.
    //
    // So the list is no longer compared with two names typed here. It is compared
    // with what the migrations on disk say: every file whose EXECUTED SQL names
    // either object (leansOnErasureObjects, at the top) must be in c_names, and
    // c_names may hold nothing else. The author of the next such migration meets
    // this in `npm run verify`, with no database, before anything is pushed.
    //
    // What to do when it goes red: add the ledger name to c_names in
    // rollback/0189_down.sql, in the same PR. Listed means RE-APPLIED after a
    // rollback, so the file has to survive being applied twice; the workflow's
    // round trip is what proves that it does, against a real database.
    const names = rollbackLedgerNames();
    const onDisk = migrationsOnDisk();
    const required = rollbackSetFor(onDisk);

    // Not vacuous: the reading finds the two files that are known to lean. A
    // discriminator that blanked everything would otherwise agree with an empty
    // list.
    expect(required).toEqual(expect.arrayContaining([FILE, LOCK_FILE].map(ledgerName)));
    expect(new Set(names).size).toBe(names.length);
    // The keys are the message.
    expect({
      leansOnTheTwoObjectsButItsLedgerRowSurvivesTheRollback: required.filter((n) => !names.includes(n)),
      listedInTheRollbackButNoSuchMigrationLeans: names.filter((n) => !required.includes(n)),
    }).toEqual({
      leansOnTheTwoObjectsButItsLedgerRowSurvivesTheRollback: [],
      listedInTheRollbackButNoSuchMigrationLeans: [],
    });

    // The control, fixed here so the rule is shown to bite on every run and not
    // only on the day it was written: the gate's statement, in a file that does
    // not exist, under a name no real migration will take. The rule must demand
    // that name. It says nothing about the shipped list, on purpose. MEASURED
    // 2026-09-21 00:59 KST: the first version used the gate's own file name and
    // also asserted that c_names did NOT hold 'erasure_generation'. With a real
    // 0191_erasure_generation.sql on disk and correctly listed, that line was the
    // only red in the suite: a control that fails the author who did it right.
    // (Same run, the other direction: that file on disk and NOT listed turns the
    // assertion above red, and it names the file.)
    const gateCounterExample: Migration = {
      file: "9999_rollback_rule_control.sql",
      sql: "ALTER TABLE public.erasure_registry ADD COLUMN deletion_generation bigint NOT NULL DEFAULT 0;\n",
    };
    expect(rollbackSetFor([...onDisk, gateCounterExample])).toEqual([...required, "rollback_rule_control"]);
    // ...and a later file that only TALKS about the two objects demands nothing.
    const talksAboutThem: Migration = {
      file: "9998_rollback_rule_prose.sql",
      sql: [
        "-- erase_my_data sweeps this table once it is in erasure_registry.",
        "CREATE TABLE public.notes (id uuid PRIMARY KEY); -- not in erasure_registry yet",
        "COMMENT ON TABLE public.notes IS 'erase_my_data does not reach this table yet';",
        "",
      ].join("\n"),
    };
    expect(rollbackSetFor([...onDisk, talksAboutThem])).toEqual(required);
  });

  test("...reading the SQL that executes, not what a file says about it", () => {
    // Both directions are pinned, because the rule can fail in both. Missing a
    // real reference is the hole above. Flagging prose is how a rule gets deleted:
    // the third time a comment turns CI red, someone removes the check.
    const leans: Array<[string, string]> = [
      ["the gate's counter-example", "ALTER TABLE public.erasure_registry ADD COLUMN deletion_generation bigint NOT NULL DEFAULT 0;"],
      [
        "a re-defined body (the fence that S3-C / S3-D will add)",
        "CREATE OR REPLACE FUNCTION public.erase_my_data(p_scope text) RETURNS jsonb LANGUAGE plpgsql AS $fn$ BEGIN RETURN NULL; END $fn$;",
      ],
      ["the grant that opens the RPC", "GRANT EXECUTE ON FUNCTION public.erase_my_data(text) TO authenticated;"],
      ["a registry row", "INSERT INTO public.erasure_registry (table_name, owner_column, class, reason) VALUES ('notes', 'user_id', 'retained', 'r');"],
      ["lower case, unqualified, quoted", 'alter table "erasure_registry" enable row level security;'],
      ["inside a DO body", "DO $mig$ BEGIN ALTER TABLE public.erasure_registry FORCE ROW LEVEL SECURITY; END $mig$;"],
      [
        "dynamic SQL in a dollar body, which EXECUTE runs",
        "DO $mig$ BEGIN EXECUTE $p$CREATE POLICY registry_read ON public.erasure_registry FOR SELECT TO service_role USING (true)$p$; END $mig$;",
      ],
      // A derived name counts, on purpose: this is how a statement reaches the
      // table without spelling it. The cost is that an unrelated object NAMED
      // after the two (public.erasure_registry_audit) is asked to join the list
      // as well. That errs toward a re-apply, which the round trip then proves
      // harmless or refuses; the other error is silent.
      ["a derived name", "ALTER INDEX public.erasure_registry_pkey SET (fillfactor = 90);"],
    ];
    const talks: Array<[string, string]> = [
      ["a line comment", "-- erase_my_data stays locked until the fence exists (0190)\nCREATE TABLE public.notes (id uuid);"],
      ["a comment that trails code on its line", "CREATE TABLE public.notes (id uuid); -- erasure_registry: not registered yet"],
      ["a block comment", "/* see public.erase_my_data(text)\n   and public.erasure_registry */\nCREATE TABLE public.notes (id uuid);"],
      ["a comment inside a DO body", "DO $mig$\nBEGIN\n  -- ALTER TABLE public.erasure_registry ADD COLUMN g bigint;\n  PERFORM 1;\nEND $mig$;"],
      ["a log line", "DO $mig$ BEGIN RAISE NOTICE 'erase_my_data is untouched by this migration'; END $mig$;"],
      ["a log line that quotes DDL", "DO $mig$ BEGIN RAISE NOTICE $m$ALTER TABLE public.erasure_registry ADD COLUMN g bigint$m$; END $mig$;"],
      ["another object's COMMENT", "COMMENT ON TABLE public.notes IS 'not in erasure_registry yet';"],
      ["another object's COMMENT, dollar-quoted", "COMMENT ON TABLE public.notes IS $c$erase_my_data does not reach this$c$;"],
      // A READ of the lock, the way 0190 verifies itself. It hangs nothing on the
      // function, so nothing of it is lost to the DROP, and a file that only
      // checks has no reason to be applied twice.
      [
        "a privilege check",
        "DO $chk$ BEGIN IF pg_catalog.has_function_privilege('authenticated', 'public.erase_my_data(text)', 'EXECUTE') THEN RAISE EXCEPTION 'open'; END IF; END $chk$;",
      ],
    ];
    expect(leans.filter(([, sql]) => !leansOnErasureObjects(sql)).map(([what]) => what)).toEqual([]);
    expect(talks.filter(([, sql]) => leansOnErasureObjects(sql)).map(([what]) => what)).toEqual([]);

    // The edge of what a reading of the text can decide, written down rather
    // than left to be found. SQL assembled at RUN time out of string literals is
    // invisible here: the same literal is a log line in one file and a statement
    // in the next, and blanking literals is what keeps the list above quiet. That
    // half belongs to the workflow's round trip, which compares the catalog, and
    // the catalog does not care how a statement was spelled. MEASURED 2026-09-21,
    // scratch PostgreSQL 18.3 + the pinned CLI: a 0191 that adds the column
    // through EXECUTE '...' passes this file and turns the round trip red.
    const assembledAtRunTime =
      "DO $mig$ BEGIN EXECUTE 'ALTER TABLE public.erasure_registry ADD COLUMN deletion_generation bigint NOT NULL DEFAULT 0'; END $mig$;";
    expect(leansOnErasureObjects(assembledAtRunTime)).toBe(false);
  });

  test("...and CI replays rollback + re-push on a real database, behind a control that can see the hole", () => {
    // Reading the rollback's text cannot show what the NEXT push does; only a push
    // can. So supabase-dry-run.yml runs the shipped file against a clone of the
    // pushed scratch database and pushes again with the pinned CLI. Pinned here so
    // the step cannot quietly disappear, be pointed at a copy of the file, or lose
    // the half that keeps it honest.
    //
    // That half is the control. It rebuilds the pre-fix end state (0190's ledger
    // row left behind) and REQUIRES erase_my_data to come back open. On a database
    // with no function default-privilege floor it comes back locked whatever the
    // rollback does, and "locked after the round trip" would then be green for a
    // reason no file caused, which is exactly how 0189 shipped its lock claim.
    //
    // `#` comment lines only. The floor test above also strips lines that open
    // with `--`, as SQL comments. Measured while writing this test: over a shell
    // step that removes the CLI's own flags, because `--include-all \` sits alone
    // on its line, and the assertion below went red with the flag in plain sight.
    // This step carries no SQL comment, so nothing is lost by leaving `--` alone.
    const workflow = readFileSync(join(ROOT, ".github", "workflows", "supabase-dry-run.yml"), "utf8")
      .replace(/^\s*#.*$/gm, "");
    const pushAt = workflow.indexOf("- name: Apply staged migrations (0147+) through Supabase CLI");
    const tripAt = workflow.indexOf("- name: Exercise the 0189 rollback round trip");
    expect(pushAt).toBeGreaterThanOrEqual(0);
    expect(tripAt).toBeGreaterThan(pushAt);
    const nextAt = workflow.indexOf("\n      - name:", tripAt + 1);
    const step = workflow.slice(tripAt, nextAt === -1 ? undefined : nextAt);

    // The SHIPPED file, by path, fed to psql the way an operator would.
    expect(step).toContain('down="db/migrations/rollback/0189_down.sql"');
    expect(step).toMatch(/psql [^\r\n]*-f "\$down"/);
    // Pushed again by the pinned CLI with this job's own flags, not re-applied by hand.
    expect(step).toMatch(/supabase db push[\s\S]{0,240}--include-all/);

    // The control comes first, and failing to OPEN is a failure.
    const vacuousAt = step.indexOf("VACUOUS");
    const fixedAt = step.indexOf("clone rollback_probe_fixed");
    expect(vacuousAt).toBeGreaterThanOrEqual(0);
    expect(fixedAt).toBeGreaterThan(vacuousAt);
    expect(step).toMatch(/if \[\[ "\$control_open" != "t" \]\]; then\s+fail "VACUOUS/);

    // After the re-push: all three client roles are read, and the state 0189 and
    // 0190 own is compared with what it was before the rollback.
    expect(step).toMatch(
      /for role in public anon authenticated; do\s+held="\$\(can_execute rollback_probe_fixed "\$role"\)"/,
    );
    expect(step).toMatch(/if \[\[ "\$before" != "\$after" \]\]; then\s+fail /);
    expect(step).toMatch(/if \(\( failed \)\); then\s+exit 1/);

    // r50 artifact gate, B-NEW-01, the database half. "The state" used to be six
    // facts (ledger hash, function ACL, body, COMMENT, registry rows, table ACL
    // and RLS), and the step's header claimed it would catch the next migration
    // that leans on the two objects. MEASURED 2026-09-21 00:28 KST, one statement
    // at a time in a rolled-back transaction: it did not move for 12 kinds of 22
    // (a constraint, an index, a policy, a trigger, a rule, a statistics object,
    // a table or column COMMENT, a column grant, FORCE RLS, a column default, a
    // dropped NOT NULL). So it now reads the catalog of both objects...
    for (const source of [
      "p.proowner",
      "c.relowner",
      "pg_catalog.pg_attribute",
      "pg_catalog.pg_attrdef",
      "pg_catalog.pg_constraint",
      "pg_catalog.pg_index",
      "pg_catalog.pg_policy",
      "pg_catalog.pg_trigger",
      "pg_catalog.pg_depend",
    ]) {
      expect(step).toContain(source);
    }
    // ...and, same idea as the control, it has to SHOW that it can see a kind
    // before its silence about that kind means anything. Each probe applies one
    // statement a later migration could run, reads the SAME query the comparison
    // reads, inside a transaction that is rolled back, BEFORE the rollback under
    // test. A fingerprint that does not move is BLIND, and BLIND is a failure.
    //
    // The first probe is the gate's statement under a reserved name. MEASURED
    // 2026-09-21 00:39 KST: spelled verbatim (deletion_generation) it collided
    // with a 0191 that really adds that column and was correctly listed, and the
    // one run that had to be green was red with "column already exists". A probe
    // must not be something a real migration would do.
    const beforeAt = step.indexOf('before="$(fingerprint rollback_probe_fixed)"');
    const firstProbeAt = step.indexOf('tells_apart "a column"');
    const rollbackUnderTestAt = step.indexOf("roll_back rollback_probe_fixed");
    expect(beforeAt).toBeGreaterThanOrEqual(0);
    expect(firstProbeAt).toBeGreaterThan(beforeAt);
    expect(rollbackUnderTestAt).toBeGreaterThan(firstProbeAt);
    const probes = step.slice(firstProbeAt, rollbackUnderTestAt);
    expect(probes).toContain(
      '"ALTER TABLE public.erasure_registry ADD COLUMN rollback_probe bigint NOT NULL DEFAULT 0"',
    );
    expect(probes).not.toMatch(/\bdeletion_generation\b/);
    // authenticated is who S3-C / S3-D will open the RPC to. A probe that grants
    // what is already granted moves nothing and reads as BLIND.
    expect(probes).not.toMatch(/\bTO authenticated\b/);

    // One query, read by the comparison and by every probe.
    expect(step).toMatch(/fingerprint\(\) \{[^\r\n]*\s+sql "\$1" "\$owned_state"/);
    expect(step).toMatch(/-c 'BEGIN' -c "\$1" -c "\$owned_state" -c 'ROLLBACK'/);
    expect(step).toMatch(/if ! moved="\$\(probed "\$2"\)"; then/);
    expect(step).toMatch(/elif \[\[ "\$moved" == "\$before" \]\]; then\s+fail "BLIND to /);

    // MEASURED 2026-09-21 00:48 KST, and the reason there are two kinds of probe:
    // with the whole policy part cut out of the query, a probe that CREATES a
    // policy still passed. A new object moves its own part and the pg_depend net,
    // so the net alone kept it green while nothing read a USING clause any more.
    // What only the named part can do is tell two DEFINITIONS of one object apart.
    // (A new column is seen twice as well: by its line and by the row hash.)
    expect(step).toMatch(/if ! one="\$\(probed "\$2"\)" \|\| ! other="\$\(probed "\$3"\)"; then/);
    expect(step).toMatch(
      /elif \[\[ "\$one" == "\$before" \|\| "\$one" == "\$other" \]\]; then\s+fail "BLIND to the definition of /,
    );
    for (const kind of ["a column", "a constraint", "an index", "a policy", "a trigger"]) {
      expect(probes).toContain(`tells_apart "${kind}" `);
    }
    // The rest of what the gate named, by name. (The step probes more; these are
    // the ones whose absence would re-open the finding.)
    for (const kind of [
      "the table's owner",
      "the table's comment",
      "the function's owner",
      "the function's settings",
    ]) {
      expect(probes).toContain(`sees "${kind}" "`);
    }
    // A probe that leaked would make every later probe "see" the leak instead of
    // its own statement, so the list is checked against the baseline once more.
    expect(step).toMatch(
      /if \[\[ "\$\(fingerprint rollback_probe_fixed\)" != "\$before" \]\]; then\s+fail "the sight probes left something behind/,
    );
  });
});
