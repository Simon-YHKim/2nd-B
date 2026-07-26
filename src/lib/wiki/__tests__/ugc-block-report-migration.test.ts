// Static structural assertions for db/migrations/0097_ugc_block_report.sql —
// the Play UGC report/block layer over the community clipper format list.
//
// The point of pinning this one is that the whole feature is a security
// boundary: if the clipper_templates read policy loses a clause, or the tally
// table becomes client-writable, the UI keeps looking exactly the same while
// the moderation stops being real. Same cheap guard as
// clipper-templates-migration.test.ts (0027).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMUNITY_REPORT_HIDE_THRESHOLD, REPORT_REASONS } from "../moderation";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0097_ugc_block_report.sql"),
  "utf8",
);

describe("0097_ugc_block_report.sql — tables", () => {
  test("creates the three tables idempotently", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS template_blocks/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS content_reports/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clipper_template_moderation/);
  });

  test("report reasons are exactly the closed list the client offers", () => {
    const check = sql.match(/CHECK \(reason IN \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const listed = (check![1].match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ""));
    expect(listed.sort()).toEqual([...REPORT_REASONS].sort());
  });

  test("there is no free-text column anywhere in the migration", () => {
    // 0064 decision #6: free text from one user about another is itself a
    // moderation surface (and third-party PII under PIPA).
    expect(sql).not.toMatch(/\b(note|comment|details|description|body)\s+text\b/i);
  });

  test("one report per reporter, one block per pair", () => {
    expect(sql).toMatch(/content_reports_one_per_reporter\s+UNIQUE\s*\(template_id,\s*reporter_id\)/);
    expect(sql).toMatch(/template_blocks_pair_unique\s+UNIQUE\s*\(blocker_id,\s*blocked_owner_id\)/);
  });

  test("a user cannot block themselves", () => {
    expect(sql).toMatch(/template_blocks_not_self\s+CHECK\s*\(blocker_id\s*<>\s*blocked_owner_id\)/);
  });

  test("every FK cascades so account deletion stays clean", () => {
    expect(sql).toMatch(/blocker_id\s+uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/blocked_owner_id\s+uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/template_id\s+uuid NOT NULL REFERENCES clipper_templates\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/reporter_id\s+uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  });

  test("the FK columns the unique constraints do not lead with are indexed (0083)", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS template_blocks_blocked_owner_idx/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS content_reports_reporter_idx/);
  });
});

describe("0097_ugc_block_report.sql — auto-hide", () => {
  test("the SQL threshold and the TS constant cannot drift apart", () => {
    const m = sql.match(/IF v_count >= (\d+) THEN/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(COMMUNITY_REPORT_HIDE_THRESHOLD);
  });

  test("the tally is written by a definer function with a pinned search_path", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.bump_clipper_template_reports\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/,
    );
  });

  test("the definer function is not callable by anon (house rule 0039)", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.bump_clipper_template_reports\(\) FROM anon;/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.bump_clipper_template_reports\(\) FROM PUBLIC;/,
    );
  });

  test("nothing grants EXECUTE on it back to anon or public", () => {
    expect(sql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?\bTO\s+[^;]*\b(anon|public)\b/i);
  });

  test("the trigger fires on every new report", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_content_reports_bump_count[\s\S]*?AFTER INSERT ON content_reports[\s\S]*?EXECUTE FUNCTION public\.bump_clipper_template_reports\(\)/,
    );
  });
});

describe("0097_ugc_block_report.sql — grants and RLS", () => {
  test("clients cannot write the report tally", () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.clipper_template_moderation FROM anon, authenticated;/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.clipper_template_moderation TO authenticated;/);
    expect(sql).not.toMatch(
      /GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*ON TABLE public\.clipper_template_moderation TO authenticated;/,
    );
  });

  test("reports are append-only for clients, so a reporter cannot unhide content", () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.content_reports FROM anon, authenticated;/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON TABLE public\.content_reports TO authenticated;/);
    expect(sql).not.toMatch(/CREATE POLICY content_reports_\w*(update|delete)/i);
  });

  test("anon holds nothing on any of the three tables", () => {
    for (const table of ["template_blocks", "content_reports", "clipper_template_moderation"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated;`));
      expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON TABLE public\\.${table} TO [^;]*\\banon\\b`));
    }
  });

  test("RLS is enabled on all three tables", () => {
    expect(sql).toMatch(/ALTER TABLE template_blocks\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE content_reports\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE clipper_template_moderation\s+ENABLE ROW LEVEL SECURITY/);
  });

  test("block rows are strictly self-scoped on read, insert and delete", () => {
    expect(sql).toMatch(
      /CREATE POLICY template_blocks_owner_select[\s\S]*?USING \(blocker_id = \(select auth\.uid\(\)\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY template_blocks_owner_insert[\s\S]*?WITH CHECK \(blocker_id = \(select auth\.uid\(\)\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY template_blocks_owner_delete[\s\S]*?USING \(blocker_id = \(select auth\.uid\(\)\)\)/,
    );
  });

  test("a report can only be filed as, and read by, its own reporter", () => {
    expect(sql).toMatch(
      /CREATE POLICY content_reports_reporter_select[\s\S]*?USING \(reporter_id = \(select auth\.uid\(\)\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY content_reports_reporter_insert[\s\S]*?WITH CHECK \(reporter_id = \(select auth\.uid\(\)\)\)/,
    );
  });
});

describe("0097_ugc_block_report.sql — the clipper_templates read gate", () => {
  const policy = sql.slice(sql.indexOf("CREATE POLICY clipper_templates_read"));

  test("0027's read policy is replaced, not edited in place", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS clipper_templates_read ON clipper_templates;/);
    expect(sql).toMatch(/CREATE POLICY clipper_templates_read ON clipper_templates/);
  });

  test("an author can always still see their own format, reported or not", () => {
    expect(policy).toMatch(/owner_id = \(select auth\.uid\(\)\)/);
  });

  test("blocked authors, self-reported formats, and hidden formats are all excluded", () => {
    expect(policy).toMatch(/NOT EXISTS \([\s\S]*?public\.template_blocks b[\s\S]*?b\.blocker_id = \(select auth\.uid\(\)\)/);
    expect(policy).toMatch(/NOT EXISTS \([\s\S]*?public\.content_reports r[\s\S]*?r\.reporter_id = \(select auth\.uid\(\)\)/);
    expect(policy).toMatch(
      /NOT EXISTS \([\s\S]*?public\.clipper_template_moderation m[\s\S]*?m\.hidden_at IS NOT NULL/,
    );
  });

  test("only shared rows are ever community-visible", () => {
    expect(policy).toMatch(/is_shared = true/);
  });

  test("the recreated policy uses the initplan-safe form (0061)", () => {
    // Bare auth.uid() in a policy predicate is re-evaluated per row and gets
    // re-flagged by the Supabase advisor.
    expect(policy).not.toMatch(/(?<!select )auth\.uid\(\)/);
  });
});
