import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const draft = "UNNUMBERED_account_deletion_receipt_arbitration.sql";

function runtimeFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__" || /\.(?:test|spec)\.[cm]?tsx?$/.test(entry.name)) return [];
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? runtimeFiles(file) : /\.[cm]?tsx?$/.test(file) ? [file] : [];
  });
}

describe("T04 receipt arbitration remains a server draft", () => {
  test("the new contract is exercised on a full-schema clone in CI", () => {
    const workflow = read(".github/workflows/supabase-dry-run.yml");
    const lane = workflow.slice(workflow.indexOf("- name: Exercise dormant receipt admission arbitration"),
      workflow.indexOf("- name: Exercise dormant interview content authority"));
    expect(lane).toContain("CREATE DATABASE t04_arbitration_test_ci TEMPLATE postgres");
    expect(lane).toContain("node scripts/test-deletion-receipt-arbitration.mjs 5432 t04_arbitration_test_ci");
    expect(lane).not.toContain("--fixture");
    expect(read("scripts/__tests__/supabase-security-drafts.test.ts")).toContain(draft);
    expect(readdirSync(join(process.cwd(), "db/migrations")).some(name => name.includes("receipt_arbitration"))).toBe(false);
  });

  test("SQL cannot start execution or change existing 0192/0225 functions", () => {
    const sql = read(`db/migration-drafts/${draft}`);
    expect(sql).not.toMatch(/(?:DELETE FROM|TRUNCATE|INSERT INTO|UPDATE|ALTER)\s+(?:public|auth|storage)\./i);
    expect(sql).not.toMatch(/(?:CREATE OR REPLACE|DROP|ALTER) FUNCTION public\./);
    expect(sql).not.toMatch(/\b(?:cron\.schedule|net\.http|http_post)\b/);
    expect(sql).toContain("ON deletion_receipt_private.accepted_requests");
    expect(sql).toContain("ON public.account_deletion_tombstones");
  });

  test("neither app nor Edge calls the dormant receipt contract", () => {
    const connected = [...runtimeFiles("src"), ...runtimeFiles("supabase/functions")].filter(file =>
      /\b(?:begin_account_deletion_receipt|lookup_account_deletion_receipt|deletion_receipt_private)\b/.test(read(file)));
    expect(connected).toEqual([]);
    expect(read("src/lib/records/delete-bulk.ts")).toMatch(/invoke\("delete-account",\s*\{\s*body: \{\}/);
    // Known epoch+1 limitation belongs to (e), not this admission-only change.
    expect(read("src/lib/account/deletion-completion.ts").match(/change\.epoch === epoch \+ 1/g)).toHaveLength(2);
  });
});
