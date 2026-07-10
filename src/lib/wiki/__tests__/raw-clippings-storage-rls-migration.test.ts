// Structural guard for db/migrations/0074_raw_clippings_storage_rls.sql - the
// raw-clippings bucket + owner-scoped Storage RLS that used to live only as a
// manual Supabase Dashboard step (audit W14). Mirrors the 0070 migration guard.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0074_raw_clippings_storage_rls.sql"),
  "utf8",
);

describe("0074_raw_clippings_storage_rls.sql - structure", () => {
  test("creates the raw-clippings bucket and forces it private", () => {
    expect(sql).toMatch(/insert into storage\.buckets/i);
    expect(sql).toMatch(/'raw-clippings'/);
    // idempotent + repairs a bucket left public
    expect(sql).toMatch(/on conflict \(id\) do update set public = false/i);
  });

  test("scopes access to the owner via the first path segment", () => {
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  });

  test("defines an owner-scoped policy for every operation on storage.objects", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(sql).toMatch(new RegExp(`create policy "raw_clippings_owner_${op}" on storage\\.objects`, "i"));
      expect(sql).toMatch(new RegExp(`for ${op} to authenticated`, "i"));
    }
    // every policy is fenced to this bucket
    expect((sql.match(/bucket_id = 'raw-clippings'/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  test("is re-runnable (drops each policy before recreating)", () => {
    expect((sql.match(/drop policy if exists/gi) || []).length).toBe(4);
  });
});
