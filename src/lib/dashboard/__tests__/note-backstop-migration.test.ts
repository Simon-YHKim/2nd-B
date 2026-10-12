import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../../../..", path), "utf8").replace(/\r\n/g, "\n");
const baseline = read("db/migrations/0247_dashboard_last_note.sql");
const promoted = read("db/migrations/0248_dashboard_note_backstop.sql");
const rollback = read("db/migrations/rollback/0248_down.sql");
function request(sql: string): string {
  const found = sql.match(/CREATE OR REPLACE FUNCTION public\.dashboard_generation_request\(.*?END \$\$;/s);
  if (!found) throw new Error("Missing request definition");
  return found[0];
}
// One-based 0247 request lines. No changes outside the quota predicate/comment.
const edit = {
  "line": 106,
  "before": [
    "  -- The fixed UTC-day backstop remains unchanged, including its early-day limit.",
    "  IF (SELECT count(*) FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose",
    "      AND ((CASE WHEN v_purpose='daily_note' THEN",
    "        ((g.created_at AT TIME ZONE s.timezone) - interval '6 hours')::date=slot_day",
    "        ELSE (g.created_at AT TIME ZONE s.timezone)::date=wall::date END) OR",
    "        (g.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN"
  ],
  "after": [
    "  -- Daily notes have separate local (3) and UTC (4) attempt ceilings.",
    "  IF (CASE WHEN v_purpose='daily_note' THEN",
    "    (SELECT count(*) FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose",
    "      AND ((g.created_at AT TIME ZONE s.timezone) - interval '6 hours')::date=slot_day) >= 3",
    "    OR (SELECT count(*) FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose",
    "      AND (g.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date) >= 4",
    "  ELSE",
    "    (SELECT count(*) FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose",
    "      AND ((g.created_at AT TIME ZONE s.timezone)::date=wall::date OR",
    "        (g.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)) >= 48",
    "  END) THEN"
  ]
} as const;

test("0248 equals 0247 with only separate daily_note local 3 / UTC 4 ceilings", () => {
  const lines = request(baseline).split("\n");
  expect(lines.slice(edit.line - 1, edit.line - 1 + edit.before.length)).toEqual(edit.before);
  lines.splice(edit.line - 1, edit.before.length, ...edit.after);
  expect(request(promoted).split("\n")).toEqual(lines);
});

test("0248 preserves the exact RPC signature, security settings, ACL and rollback", () => {
  expect(request(promoted).split("\n").slice(0, 2)).toEqual(request(baseline).split("\n").slice(0, 2));
  const acl = (sql: string) => sql.slice(sql.indexOf("REVOKE ALL ON FUNCTION"));
  expect(acl(promoted)).toBe(acl(baseline));
  expect(acl(rollback)).toBe(acl(baseline));
  expect(request(rollback)).toBe(request(baseline));
  for (const sql of [promoted, rollback]) {
    expect([...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]))
      .toEqual(["dashboard_generation_request"]);
    expect(sql).not.toMatch(/CREATE TABLE|ADD COLUMN|CREATE TRIGGER|DROP |ALTER TABLE|UPDATE public\.|DELETE FROM/);
  }
});

test("0248 wrapper runs both numbered regressions before the existing concurrency runner", () => {
  const wrapper = read("db/tests/dashboard_note_backstop_bootstrap.sql");
  expect(wrapper.match(/^\\ir .+$/gm)).toEqual([
    "\\ir dashboard_generation_bootstrap.sql",
    "\\ir ../migrations/0248_dashboard_note_backstop.sql",
    "\\ir dashboard_note_backstop_regression.sql",
  ]);
  const runner = read("scripts/test-dashboard-sql.mjs");
  expect(runner).toContain("'../db/tests/dashboard_note_backstop_bootstrap.sql'");
  expect(runner).toContain("readFileSync(baselineFixture, 'utf8')");
  expect(runner).toContain(".replace('\\\\ir dashboard_generation_bootstrap.sql', () => baselineSql)");
  const workflow = read(".github/workflows/supabase-dry-run.yml");
  expect(workflow).toContain('"db/migrations/**"');
  expect(workflow).toContain('"db/tests/**"');
  expect(workflow).toContain("node scripts/test-dashboard-sql.mjs 5432 dashboard_test_ci");
});
