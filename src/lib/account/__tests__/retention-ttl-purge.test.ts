// Structural guard for db/migrations/0063_retention_ttl_purge.sql (E: bounded
// retention for ai_audit_log, consent ip/ua metadata, and star_tier_history).
// The SQL runs against real Postgres in supabase-dry-run CI; this test pins the
// safety-critical invariants so a future edit can't silently widen the purge
// scope, delete kept data, or expose the functions to clients.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0063_retention_ttl_purge.sql"),
  "utf8",
);

describe("0063_retention_ttl_purge.sql — structure", () => {
  test("all three functions: SECURITY DEFINER + pinned search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION purge_ai_audit_log/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION purge_consent_request_metadata/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION purge_star_tier_history/);
    expect(sql.match(/LANGUAGE plpgsql/g) ?? []).toHaveLength(3); // one body per function
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql.match(/SET search_path = public/g) ?? []).toHaveLength(3);
  });

  test("each function validates the retention window (>= 1 day)", () => {
    expect(sql.match(/retention_days must be >= 1/g) ?? []).toHaveLength(3);
  });

  test("provisional defaults are parameterized (365 audit/consent, 730 tier)", () => {
    expect(sql).toMatch(/purge_ai_audit_log\(retention_days int DEFAULT 365\)/);
    expect(sql).toMatch(/purge_consent_request_metadata\(retention_days int DEFAULT 365\)/);
    expect(sql).toMatch(/purge_star_tier_history\(retention_days int DEFAULT 730\)/);
  });

  test("ai_audit_log is hard-deleted past the window", () => {
    expect(sql).toMatch(/DELETE FROM ai_audit_log WHERE created_at < cutoff/);
  });

  test("consent metadata is SCRUBBED (ip/ua nulled) on both ledgers — consent rows are NOT deleted", () => {
    expect(sql).toMatch(/UPDATE consent_records\s+SET ip_hash = NULL, ua_hash = NULL/);
    expect(sql).toMatch(/UPDATE consent_changes\s+SET ip_hash = NULL, ua_hash = NULL/);
    expect(sql).not.toMatch(/DELETE FROM consent_records/);
    expect(sql).not.toMatch(/DELETE FROM consent_changes/);
  });

  test("star_tier_history purge PRESERVES the latest row per (user, star)", () => {
    // Only superseded rows (a newer observation exists for the same user+star)
    // may be deleted, so the current standing survives.
    expect(sql).toMatch(/DELETE FROM star_tier_history h/);
    expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM star_tier_history n/);
    expect(sql).toMatch(/n\.recorded_at > h\.recorded_at/);
  });

  test("service_role only — revokes anon + authenticated explicitly for each (function-grants rule)", () => {
    for (const fn of ["purge_ai_audit_log", "purge_consent_request_metadata", "purge_star_tier_history"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\(int\\) FROM anon`));
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\(int\\) FROM authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\(int\\) TO service_role`));
    }
  });

  test("ships OFF — no active pg_cron schedule (activation is commented only)", () => {
    expect(sql).not.toMatch(/^\s*SELECT cron\.schedule/m);
    expect(sql).not.toMatch(/^\s*CREATE EXTENSION IF NOT EXISTS pg_cron/m);
  });
});
