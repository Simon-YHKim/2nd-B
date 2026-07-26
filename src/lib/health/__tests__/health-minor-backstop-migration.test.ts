// F5 structural guard for db/migrations/0099_health_minor_backstop.sql. The SQL is
// exercised against real Postgres by the supabase-dry-run CI; this pins the
// safety-critical invariants so a future edit can't weaken the minor health lock.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const raw = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0099_health_minor_backstop.sql"),
  "utf8",
);
// Assert against executable SQL, not comments -- the header legitimately MENTIONS
// "SECURITY DEFINER" (to say it is NOT one) and "imported:%" (0094's posture), which
// would otherwise trip the negative assertions below.
const sql = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("0099_health_minor_backstop.sql — structure", () => {
  test("adds a BEFORE INSERT OR UPDATE trigger on health_samples", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION reject_minor_health_rows/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON health_samples/);
    expect(sql).toMatch(/EXECUTE FUNCTION reject_minor_health_rows\(\)/);
  });

  test("rejects ANY non-adult writer (full lock, keyed off server-derived minor_tier)", () => {
    expect(sql).toMatch(/FROM users u/);
    expect(sql).toMatch(/u\.minor_tier IS DISTINCT FROM 'adult'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'minor_health_locked/);
    // Full lock: no 'imported:%' tag carve-out (that is 0094's comms posture, not this).
    expect(sql).not.toMatch(/imported:/);
  });

  test("invoker-rights with a pinned search_path (not SECURITY DEFINER)", () => {
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
  });

  test("idempotent (drops the trigger before recreating)", () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS health_samples_minor_backstop ON health_samples/);
  });
});
