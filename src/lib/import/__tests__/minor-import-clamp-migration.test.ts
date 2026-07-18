// Structural lockstep for 0094 (P0④ 잔여 — minor import clamp): the client-only
// minorLocked gate gets a DB backstop. These assertions pin the properties that
// make the clamp trustworthy; if the migration is edited they must be updated
// together, consciously.

import { readFileSync } from "node:fs";
import path from "node:path";

const sql = readFileSync(
  path.resolve(__dirname, "../../../../db/migrations/0094_minor_import_clamp.sql"),
  "utf8",
);

describe("0094 minor import clamp (server backstop)", () => {
  test("trigger guards relation_people on INSERT and UPDATE", () => {
    expect(sql).toContain("CREATE TRIGGER relation_people_minor_import_clamp");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON relation_people");
  });

  test("keys off the unforgeable users.minor_tier row, not client input", () => {
    expect(sql).toContain("FROM users u");
    expect(sql).toMatch(/minor_tier IS DISTINCT FROM 'adult'/);
  });

  test("targets ONLY import-derived rows — manual entries stay allowed", () => {
    expect(sql).toContain("t LIKE 'imported:%'");
  });

  test("rejects with the named error the client warn-path can identify", () => {
    expect(sql).toContain("minor_import_locked");
    expect(sql).toContain("ERRCODE = 'P0001'");
  });

  test("stays least-privilege: no SECURITY DEFINER needed for an own-row read", () => {
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
  });
});
