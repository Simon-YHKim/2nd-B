// Static structural assertions for db/migrations/0027_clipper_templates.sql.
// Same cheap regression guard as migration.test.ts (0022): if a critical
// constraint, index, or RLS policy is dropped from the shared-templates
// migration, this fails before the schema drifts in CI.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0027_clipper_templates.sql"),
  "utf8",
);

describe("0027_clipper_templates.sql — structure", () => {
  test("creates the clipper_templates table", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clipper_templates/);
  });

  test("base_kind is restricted to the 8 canonical clipper kinds", () => {
    const check = sql.match(/base_kind[\s\S]*?CHECK \(base_kind IN \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    for (const k of ["inbox", "article", "video", "paper", "reddit", "code", "ai_tool", "self_knowledge"]) {
      expect(check![1]).toContain(`'${k}'`);
    }
  });

  test("owner_id FK cascades when a user is deleted", () => {
    expect(sql).toMatch(/owner_id\s+uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  });

  test("enforces (owner_id, slug) uniqueness", () => {
    expect(sql).toMatch(/clipper_templates_owner_slug_unique\s+UNIQUE\s*\(owner_id,\s*slug\)/);
  });

  test("target_category CHECK is the three wiki buckets plus empty", () => {
    expect(sql).toMatch(/target_category[\s\S]*?CHECK \(target_category IN \('concepts', 'entities', 'projects', ''\)\)/);
  });

  test("updated_at trigger reuses the shared set_updated_at function", () => {
    expect(sql).toMatch(
      /trg_clipper_templates_updated_at[\s\S]*?BEFORE UPDATE ON clipper_templates[\s\S]*?EXECUTE FUNCTION set_updated_at\(\)/,
    );
  });

  test("RLS is enabled", () => {
    expect(sql).toMatch(/ALTER TABLE clipper_templates\s+ENABLE ROW LEVEL SECURITY/);
  });

  test("read policy allows own rows OR shared rows", () => {
    expect(sql).toMatch(
      /CREATE POLICY clipper_templates_read[\s\S]*?USING \(owner_id = auth\.uid\(\) OR is_shared = true\)/,
    );
  });

  test("write policies are strictly owner-scoped (insert / update / delete)", () => {
    expect(sql).toMatch(/CREATE POLICY clipper_templates_insert[\s\S]*?WITH CHECK \(owner_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(
      /CREATE POLICY clipper_templates_update[\s\S]*?USING \(owner_id = auth\.uid\(\)\)[\s\S]*?WITH CHECK \(owner_id = auth\.uid\(\)\)/,
    );
    expect(sql).toMatch(/CREATE POLICY clipper_templates_delete[\s\S]*?USING \(owner_id = auth\.uid\(\)\)/);
  });

  test("partial index backs community (shared) browsing", () => {
    expect(sql).toMatch(/clipper_templates_shared_idx ON clipper_templates \(is_shared\) WHERE is_shared/);
  });
});
