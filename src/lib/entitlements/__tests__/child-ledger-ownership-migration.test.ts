// Structural guard for db/migrations/0080_child_ledger_parent_ownership.sql -
// the parent-ownership EXISTS checks that stop a user from writing a child ledger
// row against another user's parent (wave-3 data-integrity fix).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0080_child_ledger_parent_ownership.sql"),
  "utf8",
);

describe("0080_child_ledger_parent_ownership.sql - structure", () => {
  test("ops_routine_logs WITH CHECK verifies routine ownership", () => {
    expect(sql).toMatch(/CREATE POLICY ops_routine_logs_owner_all/);
    expect(sql).toMatch(/FROM public\.ops_routines r\s+WHERE r\.id = routine_id AND r\.user_id = auth\.uid\(\)/);
  });

  test("ops_routine_logs also verifies source_sample_id ownership when present", () => {
    expect(sql).toMatch(/source_sample_id IS NULL/);
    expect(sql).toMatch(/FROM public\.health_samples s\s+WHERE s\.id = source_sample_id AND s\.user_id = auth\.uid\(\)/);
  });

  test("srs_reviews WITH CHECK verifies card ownership", () => {
    expect(sql).toMatch(/CREATE POLICY srs_reviews_owner_all/);
    expect(sql).toMatch(/FROM public\.srs_cards c\s+WHERE c\.id = card_id AND c\.user_id = auth\.uid\(\)/);
  });

  test("both policies still require the row's own user_id = auth.uid()", () => {
    expect(sql.match(/user_id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
