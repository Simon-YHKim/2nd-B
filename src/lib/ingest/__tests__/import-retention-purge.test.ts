// Structural guard for db/migrations/0056_import_retention_purge.sql.
// The SQL itself is exercised against real Postgres by supabase-dry-run CI; this
// test pins the safety-critical invariants so a future edit can't silently widen
// the purge scope or expose it to clients.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0056_import_retention_purge.sql"),
  "utf8",
);

describe("0056_import_retention_purge.sql — structure", () => {
  test("defines the purge function: SECURITY DEFINER, pinned search_path, 365d default", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION purge_unreflected_import_data/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/retention_days int DEFAULT 365/);
  });

  test("validates the retention window (>= 1 day)", () => {
    expect(sql).toMatch(/retention_days must be >= 1/);
  });

  test("ages out the ingest_log drop ledger", () => {
    expect(sql).toMatch(/DELETE FROM ingest_log WHERE dropped_at < cutoff/);
  });

  test("only purges UNREFLECTED sources — never wiki-referenced or dedup-anchor rows", () => {
    expect(sql).toMatch(/DELETE FROM sources s/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM wiki_pages/);
    expect(sql).toMatch(/dedup_of\s+= s\.id/);
    expect(sql).toMatch(/survivor_id = s\.id/);
  });

  test("service_role only — revokes anon + authenticated explicitly (function-grants rule)", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION purge_unreflected_import_data\(int\) FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION purge_unreflected_import_data\(int\) FROM authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION purge_unreflected_import_data\(int\) TO service_role/);
  });

  // NOTE: this asserts the 0056 FILE ships the function OFF (no cron here). The
  // schedule is turned ON by db/migrations/0067_retention_activation.sql
  // (Simon-ratified 2026-07-03). Prod audit 2026-07-26 confirmed all 6 purge jobs
  // ACTIVE on pg_cron (nightly 04:00 UTC). So "ships OFF" is scoped to this file,
  // not "purge never runs" -- do not read it as the latter.
  test("ships OFF in THIS file — activation lives in 0067 (verified active in prod)", () => {
    expect(sql).not.toMatch(/^\s*SELECT cron\.schedule/m);
    expect(sql).not.toMatch(/^\s*CREATE EXTENSION IF NOT EXISTS pg_cron/m);
  });
});
