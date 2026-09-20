// Static structural assertions for db/migrations/0189_erasure_registry.sql.
//
// Behaviour is exercised against a real database by the supabase-dry-run
// workflow, which applies 0147+ through the Supabase CLI. These assertions are
// the cheap half: they pin the properties whose absence would be invisible
// until it mattered, in the shape the repo already uses for migration tests
// (read the SQL text, assert on it).
//
// The security-relevant ones are the first three. A SECURITY DEFINER function
// bypasses RLS, so `auth.uid()` is not a convenience here - it is the ONLY
// thing that keeps `erase_my_data` from deleting somebody else's rows.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  extractRegistrySql,
  loadRegistry,
  renderRegistrySql,
} from "../../../../scripts/generate-erasure-registry";

const ROOT = resolve(__dirname, "../../../..");
const MIGRATIONS = join(ROOT, "db", "migrations");
const FILE = "0189_erasure_registry.sql";

const raw = readFileSync(join(MIGRATIONS, FILE), "utf8");
/** Comments must not be able to satisfy an assertion about behaviour. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

describe(`${FILE} -- structure`, () => {
  test("the migration number is not reused", () => {
    const clashes = readdirSync(MIGRATIONS).filter((f) => /^0189_/.test(f));
    expect(clashes).toEqual([FILE]);
  });

  test("no top-level transaction wrapper (the Supabase CLI opens its own)", () => {
    // Same expression supabase-dry-run.yml:178 rejects on. A nested BEGIN here
    // fails the whole staged-apply job rather than this file alone.
    const transaction = /^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/gim;
    expect(raw.match(transaction)).toBeNull();
  });

  test("erase_my_data is SECURITY DEFINER with a pinned search_path", () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.erase_my_data\(\s*p_scope text/);
    expect(code).toMatch(/SECURITY DEFINER/);
    expect(code).toMatch(/SET search_path = ''/);
  });

  test("a caller with no auth.uid() is refused before anything is deleted", () => {
    // The NULL check must sit ahead of the delete loop, not merely exist.
    const guardAt = code.search(/IF v_uid IS NULL THEN[\s\S]{0,200}RAISE EXCEPTION/);
    const deleteAt = code.search(/DELETE FROM public\.%I/);
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(deleteAt);
    expect(code).toMatch(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/);
  });

  test("every delete is owner-scoped and identifier-quoted", () => {
    // %I quotes the identifier; $1/USING binds the uuid. A %s or a concatenated
    // literal here would turn a registry row into arbitrary SQL.
    expect(code).toMatch(
      /pg_catalog\.format\(\s*'DELETE FROM public\.%I WHERE %I = \$1',[\s\S]{0,120}?\)\s*USING v_uid/,
    );
    expect(code).not.toMatch(/DELETE FROM public\.%s/);
  });

  test("only the content scope is accepted (account deletion stays elsewhere)", () => {
    expect(code).toMatch(/p_scope IS DISTINCT FROM 'content'[\s\S]{0,160}RAISE EXCEPTION/);
  });

  test("the receipt separates 'deleted n rows' from 'was never a target'", () => {
    expect(code).toMatch(/'deleted',\s*v_counts/);
    expect(code).toMatch(/'kept',\s*v_kept/);
    expect(code).toMatch(/GET DIAGNOSTICS v_deleted = ROW_COUNT/);
    // The kept list must carry the reason, or it is not a receipt.
    expect(code).toMatch(/'reason',\s*r\.reason/);
    expect(code).toMatch(/WHERE r\.class <> 'client_erasable'/);
  });

  test("anon EXECUTE is revoked in this same file (Supabase auto-grants it)", () => {
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.erase_my_data\(text\) FROM PUBLIC, anon;/,
    );
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.erase_my_data\(text\) TO authenticated;/);
    // Rule A of check:definer-grants, asserted here too so a local edit fails fast.
    expect(code).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*\bTO\b[^;]*\banon\b/i);
  });

  test("the registry table is unreachable from the client", () => {
    expect(code).toMatch(/ALTER TABLE public\.erasure_registry ENABLE ROW LEVEL SECURITY;/);
    expect(code).toMatch(/REVOKE ALL ON public\.erasure_registry FROM anon, authenticated;/);
    // RLS on with zero policies is the deny-all; a policy here would be a bug.
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.erasure_registry/i);
  });

  test("the order column exists for erasable rows and only for them", () => {
    expect(code).toMatch(/class = 'client_erasable' AND delete_order IS NOT NULL/);
    expect(code).toMatch(/class <> 'client_erasable' AND delete_order IS NULL/);
    expect(code).toMatch(/ORDER BY r\.delete_order, r\.table_name/);
  });

  test("apply-time check: the registry may not name a column the catalog lacks", () => {
    expect(code).toMatch(/pg_catalog\.pg_attribute/);
    expect(code).toMatch(/RAISE EXCEPTION 'erasure_registry names columns that do not exist/);
  });

  test("the seed block is a render of db/erasure-registry.json, not a second copy", () => {
    const embedded = extractRegistrySql(raw);
    expect(embedded).not.toBeNull();
    expect(embedded?.replace(/\r\n/g, "\n")).toBe(renderRegistrySql(loadRegistry(ROOT)));
  });

  test("a rollback twin exists and is outside the apply glob", () => {
    const down = readFileSync(join(MIGRATIONS, "rollback", "0189_down.sql"), "utf8");
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.erase_my_data\(text\);/);
    expect(down).toMatch(/DROP TABLE IF EXISTS public\.erasure_registry;/);
    // `db/migrations/*.sql` is non-recursive, so the twin is never applied.
    expect(readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))).not.toContain("0189_down.sql");
  });
});
