// Structural guard for db/migrations/0137_credit_read_scope.sql.
//
// 0134 granted two SECURITY DEFINER readers to `authenticated` while both take
// the user id as a PARAMETER and neither checks ownership. PostgREST publishes
// every granted function at /rest/v1/rpc/<name>, so that combination is a
// cross-user read. It was verified against production on 2026-08-20, signed in
// as the shared QA account: credit_available and credit_ad_earned_this_month
// both answered HTTP 200 for a user id that was not the caller, where a guarded
// function answers 403 42501.
//
// It leaked nothing at the time only because credit_ledger was empty. The class
// of bug is what matters: a definer function that names its subject in an
// argument is one forgotten IF away from being an IDOR, forever.
//
// So the fix is shape, not vigilance - the client-facing reader has NO argument
// and resolves auth.uid() itself. These tests pin that shape, because the easy
// regression is somebody "fixing" a future client by re-granting the
// parameterised function instead of using the self-scoped one.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "db", "migrations");
const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8").replace(/\r\n/g, "\n");

const sql = read("0137_credit_read_scope.sql");
const down = readFileSync(join(MIGRATIONS, "rollback", "0137_down.sql"), "utf8").replace(/\r\n/g, "\n");

/** Executable text: comments stripped, whitespace collapsed. */
const executable = (text: string) =>
  text.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();

const PARAMETERISED = [
  ["credit_available", "uuid, timestamptz"],
  ["credit_ad_earned_this_month", "uuid, timestamptz"],
] as const;

describe("0137 - the parameterised readers are internal again", () => {
  test.each(PARAMETERISED)("%s is revoked from anon AND authenticated", (fn, args) => {
    const sig = `public\\.${fn}\\(${args.replace(/,\s*/g, ",\\s*")}\\)`;
    expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon, authenticated`));
    // Revoking from PUBLIC alone is the classic insufficient fix: Supabase
    // auto-grants anon and authenticated at creation time.
    expect(sql).toMatch(new RegExp(`REVOKE ALL\\s+ON FUNCTION ${sig} FROM PUBLIC`));
  });

  test.each(PARAMETERISED)("%s is never re-granted to a client role", (fn, args) => {
    const sig = `public\\.${fn}\\(${args.replace(/,\s*/g, ",\\s*")}\\)`;
    expect(sql).not.toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${sig} TO authenticated`));
    expect(sql).not.toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${sig} TO anon`));
    expect(sql).toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${sig} TO service_role`));
  });

  test.each(PARAMETERISED)("%s keeps a COMMENT saying why it must stay internal", (fn) => {
    // The apply path strips line comments from prosrc, so a reader of the LIVE
    // function would otherwise see nothing. Same argument 0124 made.
    expect(sql).toMatch(new RegExp(`COMMENT ON FUNCTION public\\.${fn}\\(uuid, timestamptz\\) IS`));
  });

  test("they are NOT dropped: internal callers still need them", () => {
    // usage_counters_mirror_credits and the pg_cron expiry chain call these as
    // the owner. Dropping them would break the nightly mirror.
    expect(sql).not.toMatch(/DROP FUNCTION[^\n]*credit_available/);
    expect(sql).not.toMatch(/DROP FUNCTION[^\n]*credit_ad_earned_this_month/);
  });

  test("no in-body auth guard was added to them, and the file says why", () => {
    // A guard would fire under pg_cron, where there is no JWT at all, and break
    // expiry. The revoke is the fix precisely because it has no such coupling.
    expect(sql).toContain("pg_cron");
    expect(sql).toContain("auth.uid() IS NULL here");
  });
});

describe("0137 - the client-facing reader cannot be pointed at anyone else", () => {
  test("credit_summary_self takes no arguments at all", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.credit_summary_self\(\)/);
    // The whole point: no parameter, so no parameter to tamper with.
    expect(sql).not.toMatch(/credit_summary_self\(\s*p_/);
  });

  test("it resolves the subject from auth.uid() and refuses an anonymous caller", () => {
    const body = executable(sql);
    expect(body).toContain("v_uid uuid := auth.uid();");
    expect(body).toMatch(/IF v_uid IS NULL THEN RAISE EXCEPTION 'sign-in required' USING ERRCODE = '42501';/);
  });

  test("every read inside it is keyed on that uid, never on an argument", () => {
    const body = executable(sql);
    expect(body).toContain("WHERE b.user_id = v_uid");
    expect(body).toContain("public.credit_available(v_uid)");
    expect(body).toContain("public.credit_ad_earned_this_month(v_uid)");
  });

  test("it is SECURITY DEFINER with a locked search_path, and revokes anon", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.credit_summary_self\(\)[\s\S]*?SECURITY DEFINER\s*\nSET search_path = ''/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.credit_summary_self\(\) FROM anon/);
    expect(sql).toContain("GRANT  EXECUTE ON FUNCTION public.credit_summary_self() TO authenticated;");
  });

  test("available comes from the ledger, not from the credit_balance cache", () => {
    // 0134 is explicit that credit_balance is a mutex and a tripwire, not truth.
    const body = executable(sql);
    expect(body).toContain("'available', public.credit_available(v_uid)");
    expect(body).not.toMatch(/'available',\s*v_bal\.balance_available/);
  });
});

describe("0137 - the revoke cannot break a deployed client", () => {
  test("nothing outside tests calls the parameterised readers", () => {
    // If this ever fails, the caller must move to credit_summary_self() rather
    // than the grant coming back.
    const roots = ["src", "supabase", "scripts"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry);
        if (entry === "node_modules" || entry === "__tests__") continue;
        if (/\.(ts|tsx)$/.test(entry)) {
          const text = readFileSync(full, "utf8");
          if (/rpc\(\s*['"]credit_(available|ad_earned_this_month)['"]/.test(text)) hits.push(full);
          continue;
        }
        if (!entry.includes(".")) walk(full);
      }
    };
    for (const r of roots) walk(join(ROOT, r));
    expect(hits).toEqual([]);
  });
});

describe("0137 - the rollback is honest about what it re-opens", () => {
  test("it says the cross-user read comes back, in those words", () => {
    expect(down).toMatch(/RE-OPENS A CROSS-USER READ/);
    expect(down).toContain("credit_summary_self()");
  });

  test("it restores exactly the two grants and drops the self reader", () => {
    expect(down).toMatch(/GRANT EXECUTE ON FUNCTION public\.credit_available\(uuid, timestamptz\) TO authenticated;/);
    expect(down).toMatch(/GRANT EXECUTE ON FUNCTION public\.credit_ad_earned_this_month\(uuid, timestamptz\) TO authenticated;/);
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.credit_summary_self\(\);/);
  });

  test("it lives outside the apply glob", () => {
    expect(readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))).not.toContain("0137_down.sql");
  });
});

describe("0137 - it is the highest migration and does not collide", () => {
  test("no other file claims 0137", () => {
    const claimed = readdirSync(MIGRATIONS).filter((f) => /^0137_/.test(f));
    expect(claimed).toEqual(["0137_credit_read_scope.sql"]);
  });
});
