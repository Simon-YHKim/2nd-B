// Structure guard for db/migrations/0065_peer_retention.sql (F-ret, P6) —
// same idiom as retention-ttl-purge.test.ts (0063): pin scope, invariants,
// service_role lockdown, and OFF-by-default so a future edit can't silently
// widen the purge or auto-enable it.

import fs from "node:fs";
import path from "node:path";

const SQL = fs.readFileSync(
  path.resolve(__dirname, "../../../../db/migrations/0065_peer_retention.sql"),
  "utf8",
);

describe("0065 peer retention purge (F-ret)", () => {
  test("defines exactly the two peer purge functions", () => {
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION purge_expired_peer_invitations\(retention_days int DEFAULT 90\)/);
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION purge_stale_peer_observations\(retention_days int DEFAULT 730\)/);
    expect(SQL.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
  });

  test("invitations: expired flip is visible state, accepted rows are preserved", () => {
    expect(SQL).toMatch(/SET status = 'expired'/);
    expect(SQL).toMatch(/status IN \('expired', 'declined', 'withdrawn'\)/);
    // The delete filter must never include accepted (consent provenance anchor).
    expect(SQL).not.toMatch(/IN \([^)]*'accepted'[^)]*\)\s*\n?\s*AND created_at/);
  });

  test("consent ledger is never touched", () => {
    expect(SQL).not.toMatch(/DELETE FROM informant_consents/);
    expect(SQL).not.toMatch(/UPDATE informant_consents/);
  });

  test("guards reject a null/zero window", () => {
    expect(SQL.match(/retention_days IS NULL OR retention_days < 1/g)?.length).toBe(2);
  });

  test("service_role-only lockdown on both functions (anon+authenticated revoked)", () => {
    for (const fn of ["purge_expired_peer_invitations", "purge_stale_peer_observations"]) {
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${fn}(int) FROM PUBLIC;`);
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${fn}(int) FROM anon;`);
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${fn}(int) FROM authenticated;`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION ${fn}(int) TO service_role;`);
    }
  });

  test("OFF by default: pg_cron appears only inside the commented activation block", () => {
    const uncommented = SQL.split("\n").filter((line) => !line.trimStart().startsWith("--"));
    expect(uncommented.join("\n")).not.toMatch(/pg_cron|cron\.schedule/);
  });

  test("SECURITY DEFINER with pinned search_path on both", () => {
    // Count only executable lines (the header comment mentions the term too).
    const uncommented = SQL.split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(uncommented.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(uncommented.match(/SET search_path = public/g)).toHaveLength(2);
  });
});
