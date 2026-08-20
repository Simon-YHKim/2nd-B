// 0138's guard, after the revision that a production dry run forced.
//
// The first draft revoked users.judge_mode from anon/authenticated and dropped
// both triggers. The console session dry-ran it (BEGIN ... ROLLBACK) and
// measured the revoke doing nothing: anon and authenticated hold TABLE-level
// privileges on public.users, attacl on the column is NULL, and a column-level
// REVOKE cannot cut a table-level GRANT. Applying it would have made
//
//   update users set judge_mode = true where id = auth.uid()
//
// succeed, and judge_mode = true is the top paid tier via
// effective_subscription_tier(). So the migration now REPLACES the derivation
// with a pure guard rather than dropping the trigger.
//
// C6 in check-constraints.ts already asserts the derivation is gone and the
// trigger seat is filled. What this file pins is the part C6 cannot see: the
// three branches, and specifically that the no-JWT path is allowed through.
// That branch has no user-visible symptom when it is wrong - the nightly job
// just starts failing - which is exactly why it needs a test.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const SQL = readFileSync(join(process.cwd(), "db/migrations/0138_retire_judge_auto_flag.sql"), "utf8")
  .split(CR)
  .join("");

const BODY = (() => {
  const start = SQL.indexOf("CREATE OR REPLACE FUNCTION public.enforce_judge_mode()");
  const end = SQL.indexOf("DROP TRIGGER IF EXISTS trg_users_enforce_judge");
  if (start < 0 || end < 0) throw new Error("enforce_judge_mode 정의를 못 찾았다");
  return SQL.slice(start, end);
})();

describe("the derivation is gone", () => {
  test("no email is read anywhere in the executable SQL", () => {
    const exec = SQL.replace(/^\s*--.*$/gm, "");
    expect(exec).not.toMatch(/NEW\.email/);
    expect(exec).not.toMatch(/xprize\.org|devpost\.com|hacker\.fund/);
  });

  test("the INSERT-side derivation is dropped outright", () => {
    // An INSERT has no OLD row to compare against, so there is nothing there
    // for a guard to do; the column default plus the sweep cover it.
    expect(SQL).toContain("DROP FUNCTION IF EXISTS public.auto_judge_mode()");
    expect(SQL).toContain("DROP TRIGGER IF EXISTS trg_users_auto_judge        ON public.users;");
  });
});

describe("the guard is still in the trigger seat", () => {
  test("it is re-created, not dropped", () => {
    expect(SQL).not.toContain("DROP FUNCTION IF EXISTS public.enforce_judge_mode()");
    expect(SQL).toContain("CREATE TRIGGER trg_users_enforce_judge");
    expect(SQL).toMatch(/BEFORE UPDATE ON public\.users/);
  });

  test("search_path is pinned", () => {
    expect(BODY).toMatch(/SET search_path = ''/);
  });
});

describe("the three branches", () => {
  test("an untouched column short-circuits before anything else", () => {
    // Most updates to this table do not touch judge_mode, so the guard should
    // cost one comparison on the common path.
    const early = BODY.indexOf("IS NOT DISTINCT FROM OLD.judge_mode");
    const claims = BODY.indexOf("request.jwt.claims");
    expect(early).toBeGreaterThan(-1);
    expect(early).toBeLessThan(claims);
  });

  test("service_role passes", () => {
    expect(BODY).toMatch(/v_role = 'service_role'[\s\S]{0,80}RETURN NEW/);
  });

  test("a missing role claim passes, and that is deliberate", () => {
    // pg_cron, psql, migrations and definer functions running without a JWT.
    // Blocking them is the 42501 trap the spend_credits guard hit on
    // 2026-08-20: a guard written for clients also fired for the nightly job.
    // Section 3 of this same migration runs on that path.
    expect(BODY).toMatch(/v_role IS NULL[\s\S]{0,80}RETURN NEW/);
  });

  test("a client write is reverted, not raised", () => {
    // Raising would fail an unrelated profile update that merely round-trips
    // the whole row, turning a privilege guard into a broken settings screen.
    expect(BODY).toContain("NEW.judge_mode := OLD.judge_mode;");
    expect(BODY).not.toMatch(/RAISE\s+EXCEPTION/);
  });
});

describe("0112's trap is avoided", () => {
  test("both the singular GUC and the claims JSON are read", () => {
    // request.jwt.claim.role (singular) is no longer set by the platform. A
    // guard reading only that sees NULL for everyone and either blocks nothing
    // or blocks everything. Reading only the JSON would miss any path that
    // still sets the GUC. Both, in the same COALESCE billing_request_role uses.
    expect(BODY).toContain("request.jwt.claim.role");
    expect(BODY).toContain("request.jwt.claims");
  });

  test("it does not call billing_request_role()", () => {
    // That helper is REVOKEd from anon. A trigger any role can fire must not
    // depend on a function some roles cannot execute.
    expect(BODY).not.toContain("billing_request_role");
  });
});

describe("the column revokes are labelled as inert", () => {
  test("they are still present", () => {
    // Correct in intent, and load-bearing the moment RBAC revokes the table
    // grant and re-grants per column.
    expect(SQL).toContain("REVOKE INSERT (judge_mode) ON public.users FROM anon, authenticated;");
    expect(SQL).toContain("REVOKE UPDATE (judge_mode) ON public.users FROM anon, authenticated;");
  });

  test("the file says plainly that they block nothing today", () => {
    // The failure mode this guards is a reader deleting the trigger because
    // "the column is revoked". The measurement has to travel with the code.
    expect(SQL).toMatch(/DO NOT CURRENTLY BLOCK ANYTHING/);
    expect(SQL).toMatch(/table-level/i);
  });

  test("grants sit at the end of the file", () => {
    // check:definer-grants Rule A scans without stripping comments and matches
    // across statement boundaries, so a GRANT followed by prose containing a
    // bare "to" and a later "public." is a false positive.
    const lastRevoke = SQL.lastIndexOf("REVOKE UPDATE (judge_mode)");
    const tail = SQL.slice(lastRevoke);
    expect(tail.trim().split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"))).toEqual([
      "REVOKE UPDATE (judge_mode) ON public.users FROM anon, authenticated;",
      "COMMIT;",
    ]);
  });
});
