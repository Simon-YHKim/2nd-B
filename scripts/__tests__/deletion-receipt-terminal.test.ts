import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const observer = "supabase/functions/delete-account/receipt-observation.ts";
function runtimeFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__" || /\.(test|spec)\.[cm]?tsx?$/.test(entry.name)) return [];
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? runtimeFiles(file) : /\.[cm]?tsx?$/.test(file) ? [file] : [];
  });
}
const connected = (source: string) => /\b(?:observeReceiptCompletion|receipt-observation|transition_request|purge_terminal_requests)\b/.test(source);

describe("T04 terminal and O observation stay dormant", () => {
  test("no app/Edge runtime caller, scheduler or destructive observer I/O", () => {
    expect([...runtimeFiles("src"), ...runtimeFiles("supabase/functions")]
      .filter(file => file !== observer && connected(read(file)))).toEqual([]);
    expect(read(observer)).not.toMatch(/\b(?:fetch|createClient|Deno\.serve|setInterval|setTimeout)\s*\(/);
    expect(read(observer)).not.toMatch(/\b(?:deleteUser|remove|rpc)\s*\(/);
    expect(connected('import { observeReceiptCompletion as observe } from "./receipt-observation"')).toBe(true);
    expect(connected('client.rpc("transition_request")')).toBe(true);
    expect(read("src/lib/records/delete-bulk.ts")).toMatch(/invoke\("delete-account",\s*\{\s*body: \{\}/);
  });
  test("CI exercises the terminal draft on its own full-schema clone", () => {
    const workflow = read(".github/workflows/supabase-dry-run.yml");
    const lane = workflow.slice(workflow.indexOf("- name: Exercise dormant receipt terminal observation"),
      workflow.indexOf("- name: Exercise dormant interview content authority"));
    expect(lane).toContain("CREATE DATABASE t04_arbitration_test_terminal_ci TEMPLATE postgres");
    expect(lane).toContain("node scripts/test-deletion-receipt-terminal.mjs 5432 t04_arbitration_test_terminal_ci");
    expect(lane).not.toContain("--fixture");
    expect(readdirSync(join(process.cwd(), "db/migrations")).some(file => /receipt_(terminal|arbitration)/.test(file))).toBe(false);
  });
  test("private fields have explicit erasure/export classification, independent of public inventory", () => {
    const policy = JSON.parse(read("db/migration-drafts/account-deletion-receipt-data-policy.json"));
    const base = read("db/migration-drafts/UNNUMBERED_account_deletion_receipt_contract.sql");
    const up = read("db/migration-drafts/UNNUMBERED_account_deletion_receipt_terminal.sql");
    const baseFields = [...base.slice(base.indexOf("CREATE TABLE"), base.indexOf("-- Deliberately no Auth"))
      .matchAll(/^  (\w+) (?:uuid|text|bytea|timestamptz)\b/gm)].map(match => match[1]);
    const newFields = [...up.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map(match => match[1]);
    expect(Object.keys(policy.columns).sort()).toEqual([...baseFields, ...newFields].sort());
    expect(policy.table).toBe("deletion_receipt_private.accepted_requests");
    expect(policy.erasure.class).toBe("retained");
    expect(policy.export.class).toBe("EXCLUDED");
    for (const [column, entry] of Object.entries(policy.columns)) {
      expect(entry).toMatchObject({ erasure: "terminal-retention", reason: expect.any(String) });
      if (/hash|owner|session|request|execution|operation|key_version/.test(column)) {
        expect(entry).toMatchObject({ export: "EXCLUDED" });
      }
    }
    expect(up).not.toMatch(/(?:DELETE FROM|TRUNCATE|INSERT INTO|UPDATE|ALTER TABLE)\s+(?:public|auth|storage)\./i);
    expect(up).not.toMatch(/\b(?:cron\.schedule|net\.http|http_post)\b/);
    expect(read("scripts/test-deletion-receipt-terminal.mjs")).toContain("information_schema.columns");
  });
});
