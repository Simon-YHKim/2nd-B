// Static structural assertions for db/migrations/0113_notices.sql — the
// in-app notice system.
//
// Worth pinning because the failure modes here are silent. If notices loses its
// "published_at <= now()" clause, a notice queued for next Tuesday goes out
// today. If user_notice_reads loses its WITH CHECK, one account can mark
// notices read for another. If anon keeps a grant, the shipped public anon key
// reads the announcement backlog of an app nobody has signed into. In every one
// of those cases the UI looks completely normal.
//
// Same cheap guard as ugc-block-report-migration.test.ts (0097).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REMOTE_NOTICE_KINDS } from "../types";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0113_notices.sql"),
  "utf8",
);

// The migration explains its own security choices in prose, so "this pattern
// must not appear" assertions have to look at executable SQL only - otherwise a
// comment saying "no SECURITY DEFINER here" fails the test that checks there is
// no SECURITY DEFINER here.
const statements = sql.replace(/--[^\n]*/g, "");

describe("0113_notices.sql — shape", () => {
  test("creates both tables idempotently", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS notices/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_notice_reads/);
  });

  test("the enum is guarded, since CREATE TYPE has no IF NOT EXISTS", () => {
    expect(sql).toMatch(/CREATE TYPE notice_kind AS ENUM/);
    expect(sql).toMatch(/EXCEPTION\s*\n\s*WHEN duplicate_object THEN NULL/);
  });

  test("the SQL enum and the TS constant cannot drift apart", () => {
    const match = sql.match(/CREATE TYPE notice_kind AS ENUM \(([^)]*)\)/);
    expect(match).not.toBeNull();
    const listed = (match![1].match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ""));
    expect(listed).toEqual([...REMOTE_NOTICE_KINDS]);
  });

  test("kind is the enum, not free text - it drives whether a popup may interrupt", () => {
    expect(sql).toMatch(/kind\s+notice_kind NOT NULL/);
  });

  test("both languages are mandatory and non-blank (C7)", () => {
    for (const column of ["title_ko", "title_en", "body_ko", "body_en"]) {
      expect(sql).toMatch(new RegExp(`${column}\\s+text NOT NULL CHECK \\(length\\(btrim\\(${column}\\)\\) > 0\\)`));
    }
  });

  test("min_app_version is nullable but shape-checked", () => {
    // Nullable = "show to every build". A typo like "v1.2.0" must be rejected at
    // write time, because the client gate fails OPEN on an unparseable value and
    // would silently show the notice to builds it was meant to exclude.
    expect(sql).toMatch(/min_app_version\s+text CHECK \(min_app_version ~ '\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$'\)/);
    expect(sql).not.toMatch(/min_app_version\s+text NOT NULL/);
  });

  test("published_at exists and defaults to now so an insert is publishable as-is", () => {
    expect(sql).toMatch(/published_at\s+timestamptz NOT NULL DEFAULT now\(\)/);
  });

  test("one read row per user per notice", () => {
    expect(sql).toMatch(/user_notice_reads_pair_unique\s+UNIQUE\s*\(user_id,\s*notice_id\)/);
  });

  test("every FK cascades so account or notice deletion stays clean", () => {
    expect(sql).toMatch(/user_id\s+uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/notice_id\s+uuid NOT NULL REFERENCES notices\(id\) ON DELETE CASCADE/);
  });

  test("the FK column the unique constraint does not lead with is indexed (0083 / 0105)", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS user_notice_reads_notice_idx\s*\n?\s*ON user_notice_reads \(notice_id\)/);
  });
});

describe("0113_notices.sql — grants", () => {
  test("anon is stripped explicitly on both tables (house rule: REVOKE FROM PUBLIC is not enough)", () => {
    // Supabase default privileges auto-GRANT to anon on every new table and the
    // app ships a public anon key, so this is the line that keeps an
    // unauthenticated request from reading the notice backlog.
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.notices FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.user_notice_reads FROM anon, authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\banon\b/);
  });

  test("notices is read-only for clients", () => {
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.notices TO authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ON TABLE public\.notices TO authenticated/);
  });

  test("a read is append-only for clients: no UPDATE, no DELETE", () => {
    // Without this the client would need an UPDATE grant for an upsert, and a
    // user could rewrite or remove their own read history.
    expect(sql).toMatch(/GRANT SELECT, INSERT ON TABLE public\.user_notice_reads TO authenticated/);
    expect(sql).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE)[^;]*ON TABLE public\.user_notice_reads TO authenticated/,
    );
  });

  test("service_role keeps full DML on both tables so the runbook INSERT works", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.notices TO service_role/);
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.user_notice_reads TO service_role/,
    );
  });
});

describe("0113_notices.sql — row-level security", () => {
  test("RLS is enabled on both tables", () => {
    expect(sql).toMatch(/ALTER TABLE notices ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE user_notice_reads ENABLE ROW LEVEL SECURITY/);
  });

  test("only published notices are readable, and only by signed-in users", () => {
    expect(sql).toMatch(
      /CREATE POLICY notices_published_select ON notices\s*\n\s*FOR SELECT TO authenticated\s*\n\s*USING \(published_at <= now\(\)\)/,
    );
  });

  test("no policy lets a client write notices", () => {
    // With RLS on and no write policy, writes from authenticated are rejected
    // regardless of grants. service_role bypasses RLS entirely.
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON notices\s*\n\s*FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  test("read rows are strictly self-scoped on select and insert", () => {
    expect(sql).toMatch(
      /CREATE POLICY user_notice_reads_self_select ON user_notice_reads\s*\n\s*FOR SELECT TO authenticated\s*\n\s*USING \(user_id = \(select auth\.uid\(\)\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY user_notice_reads_self_insert ON user_notice_reads\s*\n\s*FOR INSERT TO authenticated\s*\n\s*WITH CHECK \(user_id = \(select auth\.uid\(\)\)\)/,
    );
  });

  test("a user cannot record a read on somebody else's behalf", () => {
    // The INSERT policy's WITH CHECK is the only thing standing between a
    // caller and an arbitrary user_id, since the column is client-supplied.
    const insertPolicy = sql.match(
      /CREATE POLICY user_notice_reads_self_insert ON user_notice_reads[\s\S]*?;/,
    );
    expect(insertPolicy).not.toBeNull();
    expect(insertPolicy![0]).toMatch(/WITH CHECK/);
  });

  test("no policy lets a user delete or edit a read row", () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON user_notice_reads\s*\n\s*FOR (UPDATE|DELETE|ALL)/);
  });

  test("policies use the initplan-safe form (0061 / 0102)", () => {
    // Bare auth.uid() in a policy re-evaluates per row. Every policy added
    // after 0102 has to use the subquery form.
    const bare = statements.match(/(?<!\(select )auth\.uid\(\)/g) ?? [];
    expect(bare).toHaveLength(0);
  });
});

describe("0113_notices.sql — no elevated surface", () => {
  test("the migration introduces no SECURITY DEFINER function", () => {
    // Nothing here needs elevated rights: a user writes their own read row
    // directly under RLS. If that ever changes, check:definer-grants requires a
    // REVOKE ... FROM anon in the same file.
    expect(statements).not.toMatch(/SECURITY DEFINER/);
  });
});
