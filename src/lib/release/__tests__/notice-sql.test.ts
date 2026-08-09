// The generated INSERT.
//
// This statement is pasted into a production SQL editor by a human at release
// time, so the failure mode being guarded is "it runs and does something
// slightly different from what it reads like": a truncated body, a doubled
// notice, or a column name that drifted away from the migration.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildNoticeInsert, buildNoticePrecheck, NOTICE_INSERT_COLUMNS } from "../notice-sql";

const MIGRATION = join(__dirname, "..", "..", "..", "..", "db", "migrations", "0113_notices.sql");

function input(overrides: Partial<Parameters<typeof buildNoticeInsert>[0]> = {}) {
  return {
    version: "1.5.0",
    titleKo: "새 기능 안내",
    titleEn: "What is new",
    bodyKo: "- 첫 번째 항목",
    bodyEn: "- The first item",
    ...overrides,
  };
}

describe("buildNoticeInsert", () => {
  test("writes kind major and puts the announced version in min_app_version", () => {
    const sql = buildNoticeInsert(input());
    expect(sql).toContain("insert into notices (kind, title_ko, title_en, body_ko, body_en, min_app_version)");
    expect(sql).toContain("select 'major',");
    expect(sql).toContain("'1.5.0'");
  });

  test("is idempotent - running it twice publishes one notice", () => {
    // There is no unique constraint to lean on, and a duplicate major notice
    // re-interrupts everybody who already dismissed the first copy.
    const sql = buildNoticeInsert(input());
    expect(sql).toContain("where not exists (");
    expect(sql).toContain("where kind = 'major' and min_app_version = '1.5.0'");
  });

  test("a withdrawn notice does not block republishing", () => {
    // 0114 withdrawal is how a bad announcement comes down. If the withdrawn
    // copy still satisfied the guard, the corrected notice could never be
    // published except by DELETE, which also destroys the read statistics.
    expect(buildNoticeInsert(input())).toContain("and withdrawn_at is null");
  });

  test("omits published_at so the table default applies", () => {
    // The notice goes out when the human runs the statement, which is the only
    // moment anyone can confirm the release is actually live.
    expect(buildNoticeInsert(input())).not.toContain("published_at");
  });

  test("dollar quoting survives an apostrophe without escaping", () => {
    const sql = buildNoticeInsert(input({ bodyEn: "- Here's what changed" }));
    expect(sql).toContain("$b_en$- Here's what changed$b_en$");
  });

  test("picks a different tag when the body contains the default one", () => {
    // Otherwise the quote would terminate early and the rest of the body would
    // be parsed as SQL.
    const sql = buildNoticeInsert(input({ bodyEn: "- literally $b_en$ inside" }));
    expect(sql).toContain("$b_en1$- literally $b_en$ inside$b_en1$");
  });

  test("rejects a version the migration CHECK would reject", () => {
    expect(() => buildNoticeInsert(input({ version: "v1.5.0" }))).toThrow(/major\.minor\.patch/);
    expect(() => buildNoticeInsert(input({ version: "1.5" }))).toThrow(/major\.minor\.patch/);
  });

  test("rejects an empty title or body", () => {
    expect(() => buildNoticeInsert(input({ bodyKo: "   " }))).toThrow(/body_ko/);
    expect(() => buildNoticeInsert(input({ titleEn: "" }))).toThrow(/title_en/);
  });
});

describe("buildNoticePrecheck", () => {
  test("reads and changes nothing", () => {
    const sql = buildNoticePrecheck("1.5.0");
    expect(sql.startsWith("select ")).toBe(true);
    expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter)\b/i);
  });

  test("validates its own version rather than trusting the caller", () => {
    // It interpolates into a literal and it is exported, so it cannot rely on
    // buildNoticeInsert having run first.
    expect(() => buildNoticePrecheck("1.5")).toThrow(/major\.minor\.patch/);
    expect(() => buildNoticePrecheck("1.5.0'; drop table notices; --")).toThrow(
      /major\.minor\.patch/,
    );
  });
});

describe("the columns are pinned to db/migrations/0113_notices.sql", () => {
  const migration = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");

  test("the guard is reading the real migration", () => {
    // If this file ever moves or is renamed, the assertions below would pass
    // vacuously against an empty string.
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS notices");
  });

  test("every column the insert writes exists in the table", () => {
    for (const column of NOTICE_INSERT_COLUMNS) {
      expect(migration).toContain(`  ${column} `);
    }
  });

  test("'major' is a value of the notice_kind enum", () => {
    expect(migration).toContain("CREATE TYPE notice_kind AS ENUM ('major', 'minor')");
  });

  test("withdrawn_at is a real column, so the guard and the precheck can use it", () => {
    const withdrawal = readFileSync(
      join(__dirname, "..", "..", "..", "..", "db", "migrations", "0114_notice_withdrawal.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(withdrawal).toContain("ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz");
    // NULL means live, which is why the guard tests `is null` rather than a flag.
    expect(withdrawal).toContain("withdrawn_at IS NULL");
  });

  test("the version shape the builder enforces is the one the CHECK enforces", () => {
    expect(migration).toContain("min_app_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'");
  });
});
