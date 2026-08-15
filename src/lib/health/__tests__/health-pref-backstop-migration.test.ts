// H9 structural guard for db/migrations/0128_health_pref_backstop.sql.
//
// 0100 closed the direct-PostgREST hole for minors and left it open for adults:
// health_samples RLS is owner-only, so an adult with health_import = false — the
// default, i.e. every adult who never opted in — could write 민감정보 rows straight
// past the client gate. 0128 makes the database enforce the opt-in the privacy
// policy already promises.
//
// The SQL runs against real Postgres in the supabase-dry-run CI; this pins the
// invariants so a later edit cannot quietly weaken either half of the lock.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raw = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0128_health_pref_backstop.sql"),
  "utf8",
);
// Assert against executable SQL only: the header legitimately mentions
// "SECURITY DEFINER" (to say it is not one), which would trip the check below.
const sql = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("0128_health_pref_backstop.sql — structure", () => {
  test("keeps the minor lock 0100 established", () => {
    expect(sql).toMatch(/u\.minor_tier/);
    expect(sql).toMatch(/IS DISTINCT FROM 'adult'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'minor_health_locked/);
  });

  test("adds the adult opt-in check that was missing", () => {
    expect(sql).toMatch(/privacy_prefs ->> 'health_import'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'health_consent_required/);
  });

  test("fails closed on a missing pref, a NULL pref, and a missing profile", () => {
    // COALESCE(..., false): absent key or SQL NULL both read as not-opted-in.
    // Reading a NULL as "allowed" is the classic way a sensitive-data gate
    // becomes decorative.
    expect(sql).toMatch(/COALESCE\(\(u\.privacy_prefs ->> 'health_import'\)::boolean, false\)/);
    expect(sql).toMatch(/IF NOT FOUND THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'health_locked: no profile found/);
  });

  test("stays on the same trigger, so there is one backstop and not two", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION reject_minor_health_rows/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS health_samples_minor_backstop ON health_samples/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON health_samples/);
    expect(sql).toMatch(/EXECUTE FUNCTION reject_minor_health_rows\(\)/);
  });

  test("invoker-rights with a pinned search_path, and no grant to anon", () => {
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    // New functions auto-grant EXECUTE to anon; REVOKE FROM public alone does not
    // take it back, so both revokes have to be here.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION reject_minor_health_rows\(\) FROM public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION reject_minor_health_rows\(\) FROM anon/);
  });
});
