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
  readRunTimeSql,
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

// A lexical prompt: stripForDdlScan removes comments and masks inert strings,
// while preserving executable bodies. A visible name prompts a review; it does
// not establish a dependency or a need to replay the migration. Derived names
// and read-only statements can match, and indirect changes can remain unseen.
const LEANED_ON = /erase_my_data|erasure_registry/i;

// What a reading of the text can say, and what it has to hand to a person.
//
// `leans` means "this reader SAW the file name one of the two objects", and that
// is all it means. It is not the set of files that depend on them, from either
// side, and three rounds of gates are the record of reading it as more:
//   r52, B-NEW-01     not seen was read as not there: run-time SQL was blanked
//                     with every other literal, so a file leaned in three
//                     spellings and read as silent.
//   r52, B-R52-N01    ...and from the other end: the rollback's list had to hold
//                     NOTHING this reader had not found, so the author who listed
//                     such a file (the round trip had just told them to) failed.
//   r55, B-R55-N02    a statement needs neither name to change what hangs off the
//                     two objects. GRANT USAGE ON SEQUENCE public.some_seq is
//                     plain SQL, reads as silence here, and always will.
// So run-time SQL is restored wherever it is a constant (readRunTimeSql) and read
// like the rest; where it is NOT a constant the statement is carried in
// `cannotRead`; and what comes out of this reader is a list of files for a PERSON
// to account for (promptsFor, below), not a verdict on the rollback's list.
type Reading = { leans: boolean; cannotRead: string[] };
const readMigrationSql = (sql: string, depth = 0): Reading => {
  let leans = LEANED_ON.test(stripForDdlScan(sql));
  const cannotRead: string[] = [];
  for (const piece of readRunTimeSql(sql)) {
    if (!piece.restored) cannotRead.push(piece.excerpt);
    // Run-time SQL can assemble run-time SQL. Three levels is more than any real
    // migration nests; past that it is handed to a person like any other unread.
    else if (depth === 3) cannotRead.push("run-time SQL nested four levels deep");
    else {
      const inner = readMigrationSql(piece.sql, depth + 1);
      leans = leans || inner.leans;
      cannotRead.push(...inner.cannotRead);
    }
  }
  return { leans, cannotRead };
};
const leansOnErasureObjects = (sql: string): boolean => readMigrationSql(sql).leans;

// Only a file that runs AFTER the two objects exist can hang anything on them. One
// that sorts before 0189 can at most name them inside a function body that runs
// later, and re-applying that file would put nothing back. It is also what keeps
// `cannotRead` answerable: 0015, 0083 and 0102 run SQL no reader can restore, and
// none of them could have touched a table that did not exist yet.
const numberOf = (file: string): number => Number(/^([0-9]+)_/.exec(file)?.[1]);
const fromTheObjectsOn = (migrations: readonly Migration[]): Migration[] =>
  migrations.filter((m) => numberOf(m.file) >= numberOf(FILE));
const rollbackSetFor = (migrations: readonly Migration[]): string[] =>
  fromTheObjectsOn(migrations).filter((m) => leansOnErasureObjects(m.sql)).map((m) => ledgerName(m.file));

const DOWN_FILE = join(MIGRATIONS, "rollback", "0189_down.sql");

/** The names the rollback's DELETE actually receives (c_names), comments gone. */
const rollbackLedgerNames = (): string[] => {
  const down = stripSqlComments(readFileSync(DOWN_FILE, "utf8"));
  const declared = /c_names\s+constant\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/.exec(down);
  if (!declared) throw new Error("rollback/0189_down.sql no longer declares c_names");
  // Trailing comments go first, so a name that survives only in a remark beside
  // the array cannot stand in for one the DELETE actually receives.
  return [...declared[1].replace(/--.*$/gm, "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

// THE REMARK BESIDE AN ENTRY IS NOT READ HERE ANY MORE. c_names is written one
// entry to a line with `-- <file number>: <what it hangs on the two objects>`
// beside it, and until r55 this file parsed that remark and failed an entry whose
// number was wrong or whose sentence was under ten characters. It was the price
// of admission that replaced the upper bound B-R52-N01 removed, and r55's two
// gates showed what it bought: a migration that touches neither object, listed as
//     'r55_gate_counter'  -- 0191: xxxxxxxxxx
// passed here AND passed the round trip, was re-applied by the push that follows
// a rollback, and took a counter in another table from 1 to 2 under an identical
// fingerprint (B-R55-N01; artifact gate, finding 2). Worse, this file did not
// miss that case. It PINNED it: a test built exactly such an entry and expected
// no objection. A sentence is documentation, for whoever runs the rollback by
// hand and wonders why a row they never heard of is going. It is not evidence,
// and a test that grades it says otherwise.
//
// What admits an entry now is the database: supabase-dry-run.yml, "Exercise the
// 0189 rollback round trip", the "need" half. It puts each deleted row back, one
// at a time, pushes again, and is red for a row nothing needed gone.

// What a person may say INSTEAD of listing a file they were asked about: I looked,
// and its ledger row may stay through a rollback. File name -> why, the why being
// for the next reader and graded by nobody. Two kinds of file end up here:
//   - one that runs SQL no reader can restore, and touches neither object;
//   - one that NAMES them and still hangs nothing there that re-applying the
//     listed files does not already bring back: a DO block that only reads the
//     registry, a table called erasure_registry_audit, the first of two CREATE OR
//     REPLACE of erase_my_data once the second exists.
// The second kind is new, and it has to exist. "Names them, so it must be listed"
// was binding, and the "need" half refuses exactly those entries. Bound on this
// side and refused on that one is a red with no way out, which is B-R52-N01 again.
//
// Wrong about a file? Then something it hung on the two objects is lost to the
// rollback, and the round trip is red about it IF owned_state reads that thing.
// Where it does not, nobody is: the workflow's header lists what is not collected.
const LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY: Readonly<Record<string, string>> = {};

// An early PROMPT, not a verdict on the list. It asks that a person has accounted
// for each file this reader can point at, in `npm run verify`, before anything is
// pushed and with no database. It proves neither answer. A function of its three
// inputs, so that it can be shown to speak up on inputs that are not on disk
// today. Every key is a message, and every value has to be empty.
const promptsFor = (
  migrations: readonly Migration[],
  names: readonly string[],
  mayStay: Readonly<Record<string, string>>,
) => {
  const later = fromTheObjectsOn(migrations);
  const read = new Map(later.map((m) => [m.file, readMigrationSql(m.sql)]));
  const answersTo = (name: string): Migration[] => later.filter((m) => ledgerName(m.file) === name);
  const accountedFor = (m: Migration): boolean => names.includes(ledgerName(m.file)) || m.file in mayStay;
  const entryFor = (m: Migration): string =>
    `'${ledgerName(m.file)}',  -- ${m.file.slice(0, 4)}: <what it hangs on them>`;
  return {
    namesEitherObjectAndNobodyHasSaidWhatARollbackDoesToIt: later
      .filter((m) => read.get(m.file)?.leans && !accountedFor(m))
      .map(
        (m) =>
          `${m.file}: if it hangs anything on either object, add to c_names ->  ${entryFor(m)}  ; if it does not ` +
          "(it only reads them, a later file re-does all of it, the name is a look-alike), name the file in " +
          "LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY. CI's round trip judges the answer, as far as it can see.",
      ),
    // Not read is not the same as not there.
    runsSqlNoReaderCanRestoreAndNobodyHasSaidWhetherItTouchesThem: later
      .filter((m) => {
        const r = read.get(m.file);
        return r && !r.leans && r.cannotRead.length > 0 && !accountedFor(m);
      })
      .map(
        (m) =>
          `${m.file}: cannot restore ->  ${read.get(m.file)?.cannotRead[0]}  <- if it touches either object, add to c_names ->  ` +
          `${entryFor(m)}  ; if it does not, name the file in LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY`,
      ),
    // About the NAMES the DELETE receives, never about remarks. A name no file
    // answers to deletes nothing, so whoever typed it believes a row is going that
    // is not; a file from before 0189 cannot have hung anything on a table that
    // did not exist.
    listedButNoMigrationFrom0189OnAnswersToThatName: names.filter((n) => answersTo(n).length === 0),
    listedTwice: names.filter((n, i) => names.indexOf(n) !== i),
    // The second list is for files this reader asked about, and for one answer each.
    saidItsRowMayStayAboutAFileNobodyAskedAboutOrThatIsListedToo: Object.keys(mayStay).filter((file) => {
      const r = read.get(file);
      return !r || (!r.leans && r.cannotRead.length === 0) || names.includes(ledgerName(file));
    }),
  };
};
const NOTHING_TO_SAY = {
  namesEitherObjectAndNobodyHasSaidWhatARollbackDoesToIt: [],
  runsSqlNoReaderCanRestoreAndNobodyHasSaidWhetherItTouchesThem: [],
  listedButNoMigrationFrom0189OnAnswersToThatName: [],
  listedTwice: [],
  saidItsRowMayStayAboutAFileNobodyAskedAboutOrThatIsListedToo: [],
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

  test("...and the NEXT migration that names either object cannot go unaccounted for", () => {
    // r50 artifact gate, B-NEW-01. The test above knew two names and the rollback
    // knows two names, so a third migration was nobody's job to notice. The
    // gate's counter-example: a later 0191 runs
    //   ALTER TABLE public.erasure_registry ADD COLUMN deletion_generation ...
    // and is not added to c_names. The rollback drops the table and the column
    // with it, 0191's ledger row stays, the next push skips 0191, and the fence
    // is gone under a ledger that reads as complete. It is the 0190 hole again,
    // one migration later.
    //
    // So the list is no longer compared with two names typed here. The migrations
    // on disk are read: every file from 0189 on whose EXECUTED SQL names either
    // object (leansOnErasureObjects, at the top) has to be ACCOUNTED FOR. It is in
    // c_names, or a person has said its ledger row may stay. The author of the next
    // such migration meets this in `npm run verify`, with no database, before
    // anything is pushed.
    //
    // What to do when it goes red: the failure prints both answers, and for the
    // likelier one the line to add to c_names in rollback/0189_down.sql, in the
    // same PR. Listed means RE-APPLIED WHOLE after a rollback. The workflow's round
    // trip then shows that the two objects come back, and that the entry was
    // needed. It does not show that running the rest of that file twice is
    // harmless: that is for the review of the PR that lists it.
    const names = rollbackLedgerNames();
    const onDisk = migrationsOnDisk();
    const required = rollbackSetFor(onDisk);

    // Not vacuous: the reading finds the two files that are known to lean. A
    // discriminator that blanked everything would otherwise agree with an empty
    // list.
    expect(required).toEqual(expect.arrayContaining([FILE, LOCK_FILE].map(ledgerName)));
    // The keys are the message.
    expect(promptsFor(onDisk, names, LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY)).toEqual(NOTHING_TO_SAY);

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

  test("...a prompt, not a verdict: it asks about what it can point at, takes either answer, grades neither", () => {
    // Three rounds on this rule, and what each one took away from this half.
    //
    //   r52, B-R52-N01 (false red). The workflow's round trip ends its failure with
    //   "fix the rollback's list in the same PR". The author of a 0191 that reaches
    //   the table through EXECUTE format(...) did exactly that, and THIS file failed
    //   them: it required c_names to hold nothing its own reader had not found.
    //   Gone: the upper bound.
    //
    //   r52, B-NEW-01 (false green). The same statement, unreadable here, setting
    //   something the fingerprint did not collect: silence on both sides. So what
    //   the reader cannot restore became a question put to a person.
    //
    //   r55, B-R55-N01 / artifact finding 2 (false green). What replaced the upper
    //   bound was a remark beside each entry, held to a file number and ten
    //   characters. An unrelated migration with 'xxxxxxxxxx' beside it passed here
    //   and in the round trip, and ran twice. Gone: every reading of a remark, here
    //   and in the second list. Whether an entry BELONGS is asked of the database
    //   (the workflow's "need" half, pinned in the last test of this file).
    //
    // What is left is small on purpose, and all of it is shown on inputs that are
    // not on disk, so it speaks up on every run and not only the day it was written.
    const onDisk = migrationsOnDisk();
    const names = rollbackLedgerNames();
    // Every verdict below is read as what the made-up input ADDED to the verdict on
    // today's tree, not as the whole of it. MEASURED 2026-09-21 02:17 KST, first
    // version: with a real 0191 on disk and left out of the list, this test went
    // red as well as the one above, repeating its message under another name; and
    // the day a real migration is put on LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY, a
    // version that judged against an empty map would have failed the author who
    // did it right. r52 learned that about controls once already. What is wrong
    // with the tree is the test above's to say, once.
    type Verdict = ReturnType<typeof promptsFor>;
    const today = promptsFor(onDisk, names, LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY);
    const verdict = (extra: Migration[], listed: readonly string[], mayStay: Record<string, string> = {}): Verdict => {
      const v = promptsFor([...onDisk, ...extra], listed, { ...LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY, ...mayStay });
      for (const key of Object.keys(v) as Array<keyof Verdict>) v[key] = v[key].filter((item) => !today[key].includes(item));
      return v;
    };

    // The artifact gate's statement, verbatim, under a name no real migration takes.
    // THE PINNED MUTATION: left out of the list, something has to be red, and this
    // half now is (the round trip's `sees "a column's statistics target"` is the
    // other half, against a real catalog).
    const statistics: Migration = {
      file: "9997_rollback_rule_statistics.sql",
      sql: [
        "DO $m$",
        "BEGIN",
        "  EXECUTE format(",
        "    'ALTER TABLE public.%I ALTER COLUMN table_name SET STATISTICS 1000',",
        "    'erasure_registry'",
        "  );",
        "END $m$;",
        "",
      ].join("\n"),
    };
    expect(verdict([statistics], names)).toEqual({
      ...NOTHING_TO_SAY,
      namesEitherObjectAndNobodyHasSaidWhatARollbackDoesToIt: [
        "9997_rollback_rule_statistics.sql: if it hangs anything on either object, add to c_names ->  " +
          "'rollback_rule_statistics',  -- 9997: <what it hangs on them>  ; if it does not (it only reads them, a later " +
          "file re-does all of it, the name is a look-alike), name the file in LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY. " +
          "CI's round trip judges the answer, as far as it can see.",
      ],
    });
    // ...and listed the way that message says, nothing is. This is the line that
    // was red for the author who did it right.
    expect(verdict([statistics], [...names, "rollback_rule_statistics"])).toEqual(NOTHING_TO_SAY);

    // What no reader can restore: the table's name arrives in a variable. Silence
    // here was the static half of B-NEW-01.
    const unread: Migration = {
      file: "9996_rollback_rule_unread.sql",
      sql: [
        "DO $m$",
        "DECLARE r record;",
        "BEGIN",
        "  FOR r IN SELECT c.relname FROM pg_catalog.pg_class AS c WHERE c.relrowsecurity LOOP",
        "    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);",
        "  END LOOP;",
        "END $m$;",
        "",
      ].join("\n"),
    };
    expect(verdict([unread], names)).toEqual({
      ...NOTHING_TO_SAY,
      runsSqlNoReaderCanRestoreAndNobodyHasSaidWhetherItTouchesThem: [
        "9996_rollback_rule_unread.sql: cannot restore ->  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname)" +
          "  <- if it touches either object, add to c_names ->  'rollback_rule_unread',  -- 9996: <what it hangs on them>" +
          "  ; if it does not, name the file in LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY",
      ],
    });
    // Either answer settles it HERE. Listed: B-R52-N01 exactly, a dependency only
    // the database could find. Which answer is RIGHT is the round trip's to say.
    expect(verdict([unread], [...names, "rollback_rule_unread"])).toEqual(NOTHING_TO_SAY);
    const mayStay = { "9996_rollback_rule_unread.sql": "loops over storage buckets only; no table in public is touched" };
    expect(verdict([unread], names, mayStay)).toEqual(NOTHING_TO_SAY);
    // Both answers at once is no answer.
    expect(
      verdict([unread], [...names, "rollback_rule_unread"], mayStay).saidItsRowMayStayAboutAFileNobodyAskedAboutOrThatIsListedToo,
    ).toEqual(["9996_rollback_rule_unread.sql"]);

    // r55 bizlogic gate, B-R55-N03, verbatim: a DO body that goes on in a second
    // literal after a line break, which the server runs as ONE body. The reader
    // used to restore 'BEGIN', call the body read, and ask nobody about the rest,
    // so this file was silent about a statement that sets the statistics target.
    // A half-read body is now an unread one, and an unread one is a question.
    const continuedBody: Migration = {
      file: "9993_rollback_rule_continued_body.sql",
      sql: "DO 'BEGIN'\n' EXECUTE format(''ALTER TABLE public.%I ALTER COLUMN table_name SET STATISTICS 1000'', ''erasure_registry''); END';\n",
    };
    expect(verdict([continuedBody], names)).toEqual({
      ...NOTHING_TO_SAY,
      runsSqlNoReaderCanRestoreAndNobodyHasSaidWhetherItTouchesThem: [
        "9993_rollback_rule_continued_body.sql: cannot restore ->  DO 'BEGIN' ' EXECUTE format(''ALTER TABLE public.%I ALTER COLUMN " +
          "table_name SET STATISTICS 1000'', ''erasure_registry'')" +
          "  <- if it touches either object, add to c_names ->  'rollback_rule_continued_body',  -- 9993: <what it hangs on them>" +
          "  ; if it does not, name the file in LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY",
      ],
    });

    // A file that NAMES the two objects may be answered for instead of listed.
    // Until r55 it could not: "names them" was binding. The "need" half would have
    // made that a trap, because it refuses an entry whose row could have stayed,
    // and this one could: it reads the registry and hangs nothing on it.
    const onlyReads: Migration = {
      file: "9992_rollback_rule_only_reads.sql",
      sql: "DO $m$ BEGIN PERFORM 1 FROM public.erasure_registry LIMIT 1; END $m$;\n",
    };
    expect(verdict([onlyReads], names).namesEitherObjectAndNobodyHasSaidWhatARollbackDoesToIt).toHaveLength(1);
    expect(verdict([onlyReads], names, { "9992_rollback_rule_only_reads.sql": "a sanity read; nothing is hung on the table" })).toEqual(
      NOTHING_TO_SAY,
    );

    // About the NAMES the DELETE receives. No remark is read, so none is made up here.
    const spokeUp = (listed: readonly string[], extra: Migration[] = []) =>
      Object.entries(verdict(extra, listed)).filter(([, items]) => items.length > 0).map(([key]) => key);
    // No migration answers to it: a name that deletes nothing.
    expect(spokeUp([...names, "no_such_migration"])).toEqual(["listedButNoMigrationFrom0189OnAnswersToThatName"]);
    // One does, and it ran before either object existed (0188, a real file).
    expect(spokeUp([...names, "raw_clippings_deleted_account_fence"])).toEqual([
      "listedButNoMigrationFrom0189OnAnswersToThatName",
    ]);
    expect(spokeUp([...names, names[0]])).toEqual(["listedTwice"]);

    // WHAT IS NOT ASSERTED HERE, on purpose. This test used to build a migration
    // that touches neither object, list it with a sentence beside it, and EXPECT no
    // objection (r55 artifact gate, finding 2: "the check does not miss this case,
    // it is pinned to miss it"). This half has no opinion on such an entry and no
    // way to form one. The entry is refused where it can be: by the "need" half of
    // the round trip, against a real database.

    // The second list takes one answer per file, about a file that was asked about.
    const saidItMayStay = (file: string, extra: Migration[]) =>
      verdict(extra, names, { [file]: "" }).saidItsRowMayStayAboutAFileNobodyAskedAboutOrThatIsListedToo;
    const untouched: Migration = { file: "9995_rollback_rule_unrelated.sql", sql: "CREATE TABLE public.notes (id uuid PRIMARY KEY);\n" };
    expect(saidItMayStay("9995_rollback_rule_unrelated.sql", [untouched])).toEqual(["9995_rollback_rule_unrelated.sql"]);
    expect(saidItMayStay("9994_not_on_disk.sql", [])).toEqual(["9994_not_on_disk.sql"]);
    expect(saidItMayStay("9996_rollback_rule_unread.sql", [unread])).toEqual([]);
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
      // after the two (public.erasure_registry_audit) also raises a prompt.
      // A reviewer must account for it; the DB compares only collected state
      // and cannot prove that re-applying a migration is harmless.
      ["a derived name", "ALTER INDEX public.erasure_registry_pkey SET (fillfactor = 90);"],
      // SQL assembled at RUN time, wherever it is a constant. These read as
      // silence until r52: every literal was blanked, and after EXECUTE a literal
      // is the statement. The first three are the spellings the gates ran.
      [
        "run-time SQL in one literal",
        "DO $mig$ BEGIN EXECUTE 'ALTER TABLE public.erasure_registry ADD COLUMN deletion_generation bigint NOT NULL DEFAULT 0'; END $mig$;",
      ],
      [
        "run-time SQL, literals joined",
        "DO $mig$ BEGIN EXECUTE 'ALTER TABLE public.' || 'erasure_' || 'registry ADD COLUMN deletion_generation bigint'; END $mig$;",
      ],
      [
        "run-time SQL through format(), the name an argument",
        "DO $mig$\nBEGIN\n  EXECUTE format(\n    'ALTER TABLE public.%I ADD COLUMN deletion_generation bigint NOT NULL DEFAULT 0',\n    'erasure_registry'\n  );\nEND $mig$;",
      ],
      [
        "...the name itself in two arguments",
        "DO $mig$ BEGIN EXECUTE pg_catalog.format('ALTER TABLE public.%I%s FORCE ROW LEVEL SECURITY', 'erasure_', 'registry'); END $mig$;",
      ],
      [
        "...arguments taken by position",
        "DO $mig$ BEGIN EXECUTE format('GRANT EXECUTE ON FUNCTION public.%2$s(%1$s) TO anon', 'text', 'erase_my_data'); END $mig$;",
      ],
      [
        "...an argument that is itself joined",
        "DO $mig$ BEGIN EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', ('public.' || 'erasure_registry')); END $mig$;",
      ],
      ["a DO body in quotes instead of dollars", "DO 'BEGIN ALTER TABLE public.erasure_registry FORCE ROW LEVEL SECURITY; END';"],
      [
        "run-time SQL that assembles run-time SQL",
        "DO $mig$ BEGIN EXECUTE 'DO $x$ BEGIN EXECUTE ''ALTER TABLE public.erasure_registry FORCE ROW LEVEL SECURITY''; END $x$'; END $mig$;",
      ],
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
      // Restoring run-time SQL must not bring the prose back with it. What is
      // restored is read again by the same discriminator, so a literal INSIDE the
      // statement is still a literal, and a format() that is never executed is
      // still an argument.
      ["run-time SQL about another table", "DO $mig$ BEGIN EXECUTE format('ALTER TABLE public.%I ADD COLUMN g bigint', 'notes'); END $mig$;"],
      [
        "run-time SQL whose own literal mentions them",
        "DO $mig$ BEGIN EXECUTE 'COMMENT ON TABLE public.notes IS ''not in erasure_registry yet'''; END $mig$;",
      ],
      [
        "...or takes the mention as a quoted argument",
        "DO $mig$ BEGIN EXECUTE format('COMMENT ON TABLE public.notes IS %L', 'erase_my_data does not reach this'); END $mig$;",
      ],
      ["a format() that is logged, not executed", "DO $mig$ BEGIN RAISE NOTICE '%', format('ALTER TABLE public.%I', 'erasure_registry'); END $mig$;"],
    ];
    expect(leans.filter(([, sql]) => !leansOnErasureObjects(sql)).map(([what]) => what)).toEqual([]);
    expect(talks.filter(([, sql]) => leansOnErasureObjects(sql)).map(([what]) => what)).toEqual([]);
    // None of the above is left unread: a file is asked about (see the test before
    // this one) only for a statement that really could not be restored.
    expect([...leans, ...talks].filter(([, sql]) => readMigrationSql(sql).cannotRead.length > 0).map(([what]) => what)).toEqual([]);

    // The edge of what a reading of the text can decide, written down rather than
    // left to be found. It used to sit one step further in: until r52 this block
    // asserted that EXECUTE '...' was INVISIBLE here and left it to the workflow's
    // round trip. Both gates answered that the same day. A limit handed to the
    // other half is a hole wherever the other half has a limit too (B-NEW-01), and
    // it made this file reject the author who listed such a migration (B-R52-N01).
    //
    // So the edge is no longer a silence. What cannot be restored to a constant is
    // REPORTED, and the test before this one turns that into a question for a
    // person. All or nothing: one operand that is not a constant and the whole
    // statement is unread, however much of it was legible.
    const unread: Array<[string, string]> = [
      ["a variable", "DO $mig$ DECLARE stmt text := 'x'; BEGIN EXECUTE stmt; END $mig$;"],
      ["a literal joined to a variable", "DO $mig$ BEGIN EXECUTE 'ALTER TABLE public.' || v_table || ' FORCE ROW LEVEL SECURITY'; END $mig$;"],
      ["format() over a record field", "DO $mig$ BEGIN EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname); END $mig$;"],
      ["format() over another call", "DO $mig$ BEGIN EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', quote_ident('erasure_registry')); END $mig$;"],
      ["a width in format()", "DO $mig$ BEGIN EXECUTE format('SELECT %-10s', 'x'); END $mig$;"],
      ["too few arguments", "DO $mig$ BEGIN EXECUTE format('ALTER TABLE public.%I OWNER TO %I', 'notes'); END $mig$;"],
      ["a cast", "DO $mig$ BEGIN EXECUTE 'SELECT 1'::text; END $mig$;"],
      ["an escape string", "DO $mig$ BEGIN EXECUTE E'SELECT 1'; END $mig$;"],
      ["a prepared statement", "PREPARE p AS SELECT 1; EXECUTE p;"],
      // A string constant may go on in a second literal after a line break, and the
      // server runs the two as one. "All or nothing" was true of EXECUTE and not of
      // a quoted DO / AS body, which was restored up to its first closing quote and
      // reported as read (r55 bizlogic gate, B-R55-N03). All three are unread now.
      ["a DO body continued in a second literal", "DO 'BEGIN'\n' PERFORM 1; END';"],
      ["a function body continued in a second literal", "CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'SELECT'\n' 1';"],
      ["a payload continued in a second literal", "DO $mig$ BEGIN EXECUTE 'SELECT'\n' 1'; END $mig$;"],
    ];
    expect(unread.filter(([, sql]) => readMigrationSql(sql).cannotRead.length !== 1).map(([what]) => what)).toEqual([]);
    // ...and the word EXECUTE is not always dynamic SQL. Asking a person about a
    // GRANT would be the cry of wolf this rule cannot afford.
    const notRunTimeSql: Array<[string, string]> = [
      ["the privilege", "GRANT EXECUTE ON FUNCTION public.touch() TO authenticated; REVOKE EXECUTE ON FUNCTION public.touch() FROM PUBLIC;"],
      ["default privileges", "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;"],
      ["a trigger's clause", "CREATE TRIGGER t BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch();"],
      ["the word in a literal", "DO $chk$ BEGIN IF pg_catalog.has_function_privilege('anon', 'public.touch()', 'EXECUTE') THEN RAISE EXCEPTION 'open'; END IF; END $chk$;"],
      ["the word in a comment", "DO $mig$\nBEGIN\n  -- built via EXECUTE so the policy name can vary\n  PERFORM 1;\nEND $mig$;"],
    ];
    expect(notRunTimeSql.filter(([, sql]) => readRunTimeSql(sql).length > 0).map(([what]) => what)).toEqual([]);
    // What follows a restored statement is part of reading it right.
    const restoredWhole: Array<[string, string, string]> = [
      ["USING", "DO $mig$ BEGIN EXECUTE 'SELECT cron.unschedule($1)' USING 'job'; END $mig$;", "SELECT cron.unschedule($1)"],
      ["INTO", "DO $mig$ DECLARE n int; BEGIN EXECUTE 'SELECT 1' INTO n; END $mig$;", "SELECT 1"],
      ["a loop", "DO $mig$ DECLARE r record; BEGIN FOR r IN EXECUTE 'SELECT 1 AS n' LOOP NULL; END LOOP; END $mig$;", "SELECT 1 AS n"],
      ["a quote inside the literal", "DO $mig$ BEGIN EXECUTE 'SELECT ''a'''; END $mig$;", "SELECT 'a'"],
      ["%% and %L", "DO $mig$ BEGIN EXECUTE format('SELECT %L LIKE ''a%%''', 'it''s'); END $mig$;", "SELECT 'it''s' LIKE 'a%'"],
      [
        "%I quotes a reserved identifier",
        "DO $mig$ BEGIN EXECUTE format('ALTER TABLE public.%I RENAME TO note', 'user'); END $mig$;",
        'ALTER TABLE public."user" RENAME TO note',
      ],
      [
        "%I keeps an ordinary fragment bare when %s continues its identifier",
        "DO $mig$ BEGIN EXECUTE format('ALTER TABLE public.%I%s FORCE ROW LEVEL SECURITY', 'erasure_', 'registry'); END $mig$;",
        "ALTER TABLE public.erasure_registry FORCE ROW LEVEL SECURITY",
      ],
      // ...and a quoted body that IS whole stays read: what follows it is the rest of
      // its own statement. Refusing these would be the cry of wolf again.
      ["a quoted DO body, then its language", "DO 'BEGIN PERFORM 1; END' LANGUAGE plpgsql;", "BEGIN PERFORM 1; END"],
      ["a quoted function body, then its options", "CREATE FUNCTION public.f() RETURNS int AS 'SELECT 1' LANGUAGE sql IMMUTABLE;", "SELECT 1"],
    ];
    expect(
      restoredWhole
        .filter(([, sql, want]) => JSON.stringify(readRunTimeSql(sql)) !== JSON.stringify([{ restored: true, sql: want }]))
        .map(([what]) => what),
    ).toEqual([]);
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
    const fixedAt = step.indexOf('clone "$fixed_db"');
    expect(vacuousAt).toBeGreaterThanOrEqual(0);
    expect(fixedAt).toBeGreaterThan(vacuousAt);
    expect(step).toMatch(/if \[\[ "\$control_open" != "t" \]\]; then\s+fail "VACUOUS/);

    // After the re-push: all three client roles are read, and the state 0189 and
    // 0190 own is compared with what it was before the rollback.
    expect(step).toMatch(
      /for role in public anon authenticated; do\s+held="\$\(can_execute "\$fixed_db" "\$role"\)"/,
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
    const beforeAt = step.indexOf('before="$(fingerprint "$fixed_db")"');
    const firstProbeAt = step.indexOf('tells_apart "a column"');
    const rollbackUnderTestAt = step.indexOf('roll_back "$fixed_db"');
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
    // r52 artifact gate, B-NEW-01, the database half. The column line named eight
    // of pg_attribute's columns; a statistics target, a storage mode, a compression
    // method and the per-column options are four it did not, so SET STATISTICS
    // moved the catalog and not the fingerprint. REPRODUCED 2026-09-21 01:59 KST on
    // the pre-fix step, scratch PostgreSQL 18.3 + the pinned CLI: a 0191 that sets
    // it through EXECUTE format(...), left out of the list, passed this file 24/24
    // AND the round trip (rc=0). Four more names would be a list with a fifth
    // missing, so the row is read whole and what is taken OUT is named. A list of
    // what to skip goes stale as a red diff that prints the key; a list of what to
    // read goes stale in silence, which is what happened.
    // One key to a line, so the diff names the property that moved.
    expect(step).toContain(
      "CROSS JOIN LATERAL pg_catalog.jsonb_each_text(pg_catalog.to_jsonb(a) - ARRAY['attrelid', 'attnum', 'attacl']) AS kv",
    );
    expect(step).toContain("'column ' || a.attname || ' .' || kv.key || '=' || COALESCE(kv.value, '(null)')");
    expect(step).toMatch(/jsonb_each_text\(pg_catalog\.to_jsonb\(c\) - ARRAY\[[^\]]*'relfilenode'[^\]]*'reltuples'[^\]]*'relacl'\]\) AS kv/);
    expect(step).toMatch(/jsonb_each_text\(pg_catalog\.to_jsonb\(i\) - ARRAY\[[^\]]*'indexrelid'[^\]]*\]\) AS kv/);
    // Nothing a later migration can SET may be among the keys taken out. These
    // are the ones the gate named, and the flags the probes below flip.
    const takenOut = [...step.matchAll(/to_jsonb\([a-z]+\) - ARRAY\[([^\]]*)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/'([a-z_]+)'/g)].map((key) => key[1]),
    );
    expect(takenOut.length).toBeGreaterThan(0);
    for (const settable of [
      "attstattarget", "attstorage", "attcompression", "attoptions", "attislocal", "attinhcount", "attnotnull",
      "reloptions", "relpersistence", "relreplident", "relrowsecurity", "relforcerowsecurity", "relam", "reltablespace",
      "indisclustered", "indisreplident", "indisvalid",
    ]) {
      expect(takenOut).not.toContain(settable);
    }
    // The four, each shown to move the fingerprint, the gate's own statement first.
    for (const kind of [
      "a column's statistics target",
      "a column's storage mode",
      "a column's compression method",
      "a column's options",
    ]) {
      expect(probes).toContain(`sees "${kind}" "`);
    }
    expect(probes).toContain(
      'sees "a column\'s statistics target" "ALTER TABLE public.erasure_registry ALTER COLUMN table_name SET STATISTICS ',
    );
    // ...and the objects that used to be seen only as ARRIVALS, by the pg_depend
    // net: a rule or a statistics object re-defined under the same name did not
    // move anything. Their definitions are read now, and so is a comment on
    // whatever hangs off the table (a policy's, a trigger's).
    // Also read: the sequence behind an identity or serial column. It hangs off the
    // table INTERNALLY, the one kind of dependency the net leaves out, so nothing
    // of it was visible (MEASURED 2026-09-21 02:29 KST, pre-fix query: SET INCREMENT
    // BY 7, fingerprint identical). The generation counter that S3-C / S3-D will
    // add is the column this is about.
    //
    // This comment used to go on to say its PARAMETERS were now read, and the pin
    // below it was one probe, SET INCREMENT BY 7. r55's two gates took "the sequence
    // is read" apart from opposite ends, each on PostgreSQL 18.3 with this query
    // verbatim: RESTART WITH 42 and RESTART WITH 73 gave one fingerprint (where a
    // sequence stands is in its own relation, not in pg_sequence, and pg_sequences
    // shows NULL until the first nextval), and a plain GRANT USAGE ON SEQUENCE was
    // lost to the round trip under an identical fingerprint (its ACL is in
    // pg_class). A sequence keeps what it is in three places. All three are read
    // now, and each has the probe that only it can pass.
    //
    // The whole JOIN, not the catalog's name. MEASURED 2026-09-21 02:33 KST: with
    // only the name pinned, a part re-pointed at `pg_catalog.pg_sequences_gone`
    // still satisfied toContain("pg_catalog.pg_sequence"), because one string was
    // the front of the other.
    for (const source of [
      "JOIN pg_catalog.pg_rewrite AS r ON r.ev_class = reg.oid",
      "JOIN pg_catalog.pg_statistic_ext AS s ON s.stxrelid = reg.oid",
      "JOIN pg_catalog.pg_description AS described",
      // 1. the parameters
      "JOIN pg_catalog.pg_sequence AS s ON s.seqrelid = sc.oid",
      // 3. where it stands, read from the relation itself, by a quoted name
      "pg_catalog.format('SELECT last_value, is_called FROM %I.%I', sc.nspname, sc.relname)",
      "CROSS JOIN (VALUES ('last_value'), ('is_called')) AS slot(key)",
    ]) {
      expect(step).toContain(source);
    }
    // 2. the relation's own catalog row: owner and ACL (sorted) on one line, the rest
    // of the row a key to a line. The table's line has the same ACL expression, so
    // the pin starts at the word that makes it the SEQUENCE's.
    for (const acl of ["p.proacl", "a.attacl", "c.relacl"]) {
      expect(step).toContain(`CASE WHEN ${acl} IS NULL THEN '(default)'`);
      expect(step).toContain(`WHEN pg_catalog.cardinality(${acl}) = 0 THEN '(empty)'`);
    }
    expect(step.split("CASE WHEN c.relacl IS NULL THEN '(default)'").length - 1).toBe(2);
    expect(step).toMatch(/' relation \.' \|\| kv\.key[^\r\n]*\s+FROM owned_seq AS sc\s+JOIN pg_catalog\.pg_class AS c ON c\.oid = sc\.oid/);
    // A slot that could not be read must not read as EQUAL to another that could
    // not: it prints "(unread)", both definitions then match, and that is BLIND.
    expect(step).toContain("'(unread)')");
    for (const kind of [
      "a rule",
      "a statistics object",
      "a trigger that is switched off",
      "the index the table is clustered on",
      "an index column's statistics target",
      "the parameters of the sequence behind a column",
      "where the sequence behind a column stands",
      "a grant on the sequence behind a column",
      "a comment on something that hangs off the table",
    ]) {
      expect(probes).toContain(`tells_apart "${kind}" `);
    }
    // THE PINNED MUTATIONS for the two r55 families, as the gates ran them. One
    // probe, two restarts: only the relation's own row tells them apart. One probe,
    // with and without the grant: only the sequence's ACL does. (Reserved names and
    // a grant to anon, like every other probe: see the first probe's note.)
    expect(probes).toMatch(
      /tells_apart "where the sequence behind a column stands" \\\s+"[^"\r\n]* RESTART WITH 42" \\\s+"[^"\r\n]* RESTART WITH 73"/,
    );
    expect(probes).toMatch(
      /tells_apart "a grant on the sequence behind a column" \\\s+"[^"\r\n]*\(SEQUENCE NAME public\.rollback_probe_seq\)" \\\s+"[^"\r\n]*; GRANT USAGE ON SEQUENCE public\.rollback_probe_seq TO anon"/,
    );

    // The red that sends the author to c_names still shows how an entry is written,
    // and now says what the remark beside it is: documentation. Nothing reads it.
    expect(step).toMatch(/if \[\[ "\$before" != "\$after" \]\]; then\s+fail "[^"\r\n]*'its_ledger_name',  -- NNNN: [^"\r\n]*It is documentation and nothing reads it as evidence/);

    // r55, the other finding (B-R55-N01; artifact gate, finding 2): what ADMITS an
    // entry. It was a remark, read by this file. It is now the "need" half: for
    // every row the shipped rollback actually deleted from the ledger (taken from
    // the ledger before and after, never from the file's text), put that one row
    // back, push again, and be red if everything still comes back.
    const needAt = step.indexOf("needs() {");
    const comparedAt = step.indexOf('if [[ "$before" != "$after" ]]; then');
    expect(comparedAt).toBeGreaterThan(rollbackUnderTestAt);
    expect(needAt).toBeGreaterThan(comparedAt);
    expect(step).toMatch(/ledger_before_rollback="\$\(ledger_names "\$fixed_db"\)"\s+roll_back "\$fixed_db"/);
    expect(step).toMatch(
      /for name in \$ledger_before_rollback; do\s+if \[\[ "\$ledger_after_rollback" != \*" \$name "\* \]\]; then\s+deleted_by_the_rollback\+="\$name "/,
    );
    const need = step.slice(needAt);
    expect(need).toMatch(/clone "\$case_db"\s+sql "\$case_db" "CREATE TABLE supabase_migrations\.rollback_probe_kept AS/);
    expect(need).toMatch(/WHERE name = '\$1'"\s+roll_back "\$case_db"\s+sql "\$case_db" "INSERT INTO supabase_migrations\.schema_migrations/);
    // A failed push is evidence only when it is the exact causal 0190/42883
    // failure. Infrastructure and unrelated SQL failures are inconclusive and
    // red; the causal case must become green after removing that retained row.
    expect(need).toMatch(/if push_again "\$case_db" >"\$push_log" 2>&1; then\s+push_rc=0\s+else\s+push_rc=\$\?/);
    expect(need).toContain('grep -Fq "Applying migration 0190_lock_erase_my_data_authenticated.sql" "$push_log"');
    expect(need).toContain('grep -Fq "function public.erase_my_data(text) does not exist" "$push_log"');
    expect(need).toContain('grep -Fq "SQLSTATE 42883" "$push_log"');
    expect(need).toMatch(/fail "INCONCLUSIVE necessity check:/);
    expect(need).toMatch(/DELETE FROM supabase_migrations\.schema_migrations\s+WHERE name = '\$1'/);
    expect(need).toMatch(/if ! push_again "\$case_db"; then\s+fail "CAUSALITY recovery failed:/);
    expect(need).toMatch(/if \[\[ "\$state" != "\$before" \]\]; then\s+fail "CAUSALITY recovery mismatch:/);
    // The same query as the comparison, and only when both objects are there to read.
    expect(need).toMatch(/state="\$\(fingerprint "\$case_db"\)"/);
    expect(need).toMatch(/if \[\[ "\$state" == "\$before" \]\]; then\s+fail "UNNEEDED in c_names: /);
    expect(need).toMatch(/for name in \$deleted_by_the_rollback; do\s+needs "\$name"\s+done/);
    // Asking nothing is not a pass.
    expect(need).toMatch(/if \[\[ -z "\$deleted_by_the_rollback" \]\]; then\s+fail /);
    // Every run gets collision-checked names and drops only databases this run
    // recorded as created. A local database with an old probe name is never
    // pre-emptively destroyed.
    expect(step).toContain('run_token="${GITHUB_RUN_ID:-local}_${GITHUB_RUN_ATTEMPT:-0}_$$_${RANDOM}"');
    expect(step).toContain('control_db="rollback_control_${run_token}"');
    expect(step).toContain('fixed_db="rollback_fixed_${run_token}"');
    expect(step).toContain('need_db="rollback_need_${run_token}"');
    expect(step).not.toContain("DROP DATABASE IF EXISTS");
    expect(step).toContain('created_clones+=("$1")');
    expect(step).toMatch(/SELECT pg_catalog\.count\(\*\) FROM pg_catalog\.pg_database WHERE datname = '\$1'/);
    expect(need).toMatch(/for clone_db in "\$\{created_clones\[@\]\}"; do\s+sql "\$source_db" "DROP DATABASE \$clone_db"\s+done/);
    // What this step does not collect is written in the workflow, not implied. Read
    // from the file as it is: every other pin in this test reads it with its
    // comments gone, and these two are comments.
    const asWritten = readFileSync(join(ROOT, ".github", "workflows", "supabase-dry-run.yml"), "utf8");
    expect(asWritten).toContain("# NOT COLLECTED.");
    expect(asWritten).toContain("# ON FAILURE THE RUN-UNIQUE CLONES ARE LEFT WHERE THEY ARE, on purpose.");

    // A probe that leaked would make every later probe "see" the leak instead of
    // its own statement, so the list is checked against the baseline once more.
    expect(step).toMatch(
      /if \[\[ "\$\(fingerprint "\$fixed_db"\)" != "\$before" \]\]; then\s+fail "the sight probes left something behind/,
    );
  });
});
