// Static structural assertions for db/migrations/0114_notice_withdrawal.sql —
// retracting a published notice without overwriting published_at.
//
// The entire feature is one clause in one policy predicate. If `withdrawn_at IS
// NULL` is ever dropped while the column stays, every retracted notice comes
// back for every user at once and nothing else in the app would notice: the
// client does not know the column exists. So the clause is pinned here, along
// with the two decisions that are easy to "fix" into a regression - that the
// column is nullable, and that the client must never select it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(join(ROOT, "db", "migrations", "0114_notice_withdrawal.sql"), "utf8");

describe("0114_notice_withdrawal.sql — the column", () => {
  test("is added idempotently, so the migration is re-appliable", () => {
    expect(sql).toMatch(/ALTER TABLE public\.notices\s+ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz/);
  });

  test("is nullable: every existing notice stays live after the migration", () => {
    // A NOT NULL column would need a default, and any non-null default would
    // retract the entire archive on apply.
    expect(sql).not.toMatch(/withdrawn_at\s+timestamptz[^;]*NOT NULL/i);
    expect(sql).not.toMatch(/withdrawn_at\s+timestamptz[^;]*DEFAULT/i);
  });

  test("carries a COMMENT, so the meaning of NULL survives without the runbook", () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.notices\.withdrawn_at IS/);
  });
});

describe("0114_notice_withdrawal.sql — the read policy", () => {
  const policy = sql.slice(sql.indexOf("CREATE POLICY notices_published_select"));

  test("0113's policy is replaced, not edited in place", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS notices_published_select ON notices;/);
    expect(sql).toMatch(/CREATE POLICY notices_published_select ON notices/);
  });

  test("a withdrawn notice is not readable", () => {
    expect(policy).toMatch(/withdrawn_at IS NULL/);
  });

  test("the publish gate from 0113 survives the rewrite", () => {
    // Recreating a policy is where a clause goes missing. Scheduling and
    // retraction are independent rules and BOTH have to hold.
    expect(policy).toMatch(/published_at <= now\(\)/);
    expect(policy).toMatch(/published_at <= now\(\)\s+AND\s+withdrawn_at IS NULL/);
  });

  test("it is still SELECT-only and still authenticated-only", () => {
    expect(policy).toMatch(/FOR SELECT TO authenticated/);
    expect(sql).not.toMatch(/TO\s+anon/);
  });

  test("no bare auth.uid() sneaks in (0061 / 0102 initplan rule)", () => {
    expect(sql).not.toMatch(/(?<!select )auth\.uid\(\)/);
  });
});

describe("0114_notice_withdrawal.sql — it does not weaken 0113", () => {
  test("no write policy is introduced for clients", () => {
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?FOR\s+(INSERT|UPDATE|DELETE)/i);
  });

  test("no new grant is handed out", () => {
    expect(sql).not.toMatch(/^\s*GRANT\b/im);
  });

  test("published_at is not repurposed as the retraction flag", () => {
    // The whole point: retraction stops meaning "shove the date into the future".
    expect(sql).not.toMatch(/interval '100 years'/);
    expect(sql).not.toMatch(/UPDATE public\.notices\s+SET published_at/i);
  });

  test("no SECURITY DEFINER surface is added", () => {
    expect(sql).not.toMatch(/SECURITY DEFINER/);
  });
});

describe("withdrawal stays a server-side rule", () => {
  test("the client never selects withdrawn_at", () => {
    // Load-bearing. fetchNotices() names its columns explicitly and fails soft
    // by returning [], so a build that asks for withdrawn_at against an
    // environment where 0114 has not been applied gets 42703 and shows an EMPTY
    // notice list rather than a missing column. Keeping the column out of the
    // client is what lets already-shipped binaries honour a withdrawal with no
    // app release, which is the reason the notices feature exists at all.
    const remote = readFileSync(join(ROOT, "src", "lib", "notices", "remote.ts"), "utf8");
    expect(remote).not.toMatch(/withdrawn_at/);
  });

  test("no notices module needs to know about the column", () => {
    for (const file of ["types.ts", "select.ts", "center.ts", "adapt.ts"]) {
      const source = readFileSync(join(ROOT, "src", "lib", "notices", file), "utf8");
      expect(source).not.toMatch(/withdrawnAt|withdrawn_at/);
    }
  });
});

describe("the runbook matches the schema", () => {
  const doc = readFileSync(join(ROOT, "docs", "OPERATIONS-NOTICES.md"), "utf8");

  test("it no longer teaches the 100-year published_at hack", () => {
    expect(doc).not.toMatch(/interval '100 years'/);
  });

  test("it documents withdrawing and restoring", () => {
    expect(doc).toMatch(/withdrawn_at\s*=\s*now\(\)/);
    expect(doc).toMatch(/withdrawn_at\s*=\s*null/i);
  });

  test("the scheduled-notice query excludes withdrawn rows", () => {
    // Telling both apart is the reason the column exists; a queue listing that
    // still mixes them in would hand the operator back the original problem.
    expect(doc).toMatch(/published_at\s*>\s*now\(\)[\s\S]{0,80}withdrawn_at is null/i);
  });
});
