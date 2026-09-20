// Static structural assertions for db/migrations/0189_erasure_registry.sql.
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
} from "../../../../scripts/generate-erasure-registry";

const ROOT = resolve(__dirname, "../../../..");
const MIGRATIONS = join(ROOT, "db", "migrations");
const FILE = "0189_erasure_registry.sql";

const raw = readFileSync(join(MIGRATIONS, FILE), "utf8");
/** Comments must not be able to satisfy an assertion about behaviour. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

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

  test("the RPC ships LOCKED: EXECUTE revoked, and granted to nobody", () => {
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.erase_my_data\(text\) FROM PUBLIC, anon;/,
    );
    // ...and no grant back. Not to `authenticated` either. This line used to assert
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
    expect(code).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.erase_my_data/i);
    // Rule A of check:definer-grants, asserted here too so a local edit fails fast.
    expect(code).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*\bTO\b[^;]*\banon\b/i);
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
});
