// 0218 records.system_tags - the static half of the migration contract.
//
// Design docs/design/system-tags-261006.md, option A ("schema only + QA hand
// move", adopted 2026-10-06 22:33). The behavior half (nothing moves by shape,
// the column shape, Polaris evidence, the hand move, the rollback) runs against a
// real database in db/tests/records_system_tags_regression.sql. This file pins
// what text can pin:
//   - the two Polaris evidence functions 0218 re-defines are 0195's bodies with
//     exactly one condition changed (tags -> system_tags), and the rollback puts
//     0195's bodies back unchanged. A hand-edited copy of a money path (credits,
//     weekly allowance) must not drift silently.
//   - 0218 has no trigger, no shape-judging function and no data rewrite (P2, P3).
//   - the hand move and the survey know exactly the markers the client writes.
//   - the rollback is standalone-only and locks before it reads (P5).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { firstLightSystemTags, recallInterviewSystemTags } from "../system-tags";

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const M0195 = read("db/migrations/0195_polaris_generation_allowance.sql");
const M0218 = read("db/migrations/0218_records_system_tags.sql");
const DOWN = read("db/migrations/rollback/0218_down.sql");
const HAND_MOVE = read("db/ops/0218_system_tags_hand_move.sql");
const SURVEY = read("db/ops/0218_system_tags_survey.sql");
const REGRESSION = read("db/tests/records_system_tags_regression.sql");
const WORKFLOW = read(".github/workflows/supabase-dry-run.yml");

/** SQL with `--` comments removed (no string literal in these files holds `--`). */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

function fn(sql: string, header: string, name: string): string {
  const start = sql.indexOf(`${header} public.${name}(`);
  if (start < 0) throw new Error(`${name} not found after "${header}"`);
  const end = sql.indexOf("END $$;", start);
  if (end < 0) throw new Error(`${name} has no END $$;`);
  return sql.slice(start + header.length, end + "END $$;".length);
}

const RESERVE = "reserve_polaris_generation";
const SNAPSHOT = "polaris_evidence_snapshot";

describe("0218 re-defines Polaris evidence with one condition changed", () => {
  test("reserve_polaris_generation = 0195 with tags -> system_tags in the evidence query", () => {
    const original = fn(M0195, "CREATE FUNCTION", RESERVE);
    const forward = fn(M0218, "CREATE OR REPLACE FUNCTION", RESERVE);
    expect(original).toContain("AND tags @> ARRAY['interview']::text[]");
    expect(forward).toBe(
      original.replace("AND tags @> ARRAY['interview']::text[]", "AND system_tags @> ARRAY['interview']::text[]"),
    );
    expect(forward).not.toBe(original);
  });

  test("polaris_evidence_snapshot = 0195 with r.tags -> r.system_tags in the record fence", () => {
    const original = fn(M0195, "CREATE FUNCTION", SNAPSHOT);
    const forward = fn(M0218, "CREATE OR REPLACE FUNCTION", SNAPSHOT);
    expect(forward).toBe(
      original.replace("AND r.tags @> ARRAY['interview']::text[]", "AND r.system_tags @> ARRAY['interview']::text[]"),
    );
    expect(forward).not.toBe(original);
  });

  test("the rollback restores both 0195 bodies byte for byte", () => {
    expect(fn(DOWN, "CREATE OR REPLACE FUNCTION", RESERVE)).toBe(fn(M0195, "CREATE FUNCTION", RESERVE));
    expect(fn(DOWN, "CREATE OR REPLACE FUNCTION", SNAPSHOT)).toBe(fn(M0195, "CREATE FUNCTION", SNAPSHOT));
  });

  test("0195's grants are restated in both directions", () => {
    for (const sql of [M0218, DOWN]) {
      expect(sql).toContain("REVOKE ALL ON FUNCTION public.reserve_polaris_generation(uuid,text) FROM PUBLIC, anon;");
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reserve_polaris_generation(uuid,text) TO authenticated;");
      expect(sql).toContain(
        "REVOKE ALL ON FUNCTION public.polaris_evidence_snapshot(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;",
      );
    }
  });
});

describe("0218 is schema only (design P2, P3)", () => {
  const forward = code(M0218);

  test("adds the column and its shape constraint", () => {
    expect(forward).toContain("ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT ARRAY[]::text[];");
    expect(forward).toContain("ADD CONSTRAINT records_system_tags_shape CHECK (");
    expect(forward).toContain("WHEN array_position(system_tags, NULL) IS NOT NULL THEN false");
    expect(forward).toContain("WHEN array_ndims(system_tags) <> 1 OR array_lower(system_tags, 1) <> 1 THEN false");
    expect(forward).toContain("WHEN cardinality(system_tags) > 16 THEN false");
    expect(forward).toContain("WHEN lower(array_to_string(system_tags, ',')) ~ '(^|,)domain:' THEN false");
  });

  test("has no trigger, no shape-judging function and no row rewrite", () => {
    // The postcondition names the first draft's objects only to refuse them.
    const statements = forward.slice(0, forward.indexOf("DO $verify$"));
    expect(statements.length).toBeGreaterThan(1000);
    expect(statements).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
    expect(statements).not.toMatch(/RETURNS\s+trigger/i);
    expect(statements).not.toContain("records_app_system_tags_split");
    expect(statements).not.toContain("records_move_app_system_tags");
    expect(forward).not.toMatch(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\.records\b/i);
    // The only functions it creates are the two Polaris ones.
    expect(forward.match(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)/gi)?.map((m) => m.split(".").pop())).toEqual([
      RESERVE,
      SNAPSHOT,
    ]);
  });

  test("its postcondition refuses a marker-moving trigger and an old Polaris body", () => {
    expect(M0218).toContain("a trigger or split function moves markers between tags and system_tags");
    expect(M0218).toContain("Polaris evidence still reads interview from tags");
  });
});

describe("the rollback is standalone and lock-first (design P5)", () => {
  const down = code(DOWN);

  test("its first statement locks records, so outside one transaction it stops at once", () => {
    expect(down.trim().startsWith("LOCK TABLE public.records IN SHARE ROW EXCLUSIVE MODE;")).toBe(true);
    expect(WORKFLOW).toContain('grep -q "LOCK TABLE can only be used in transaction blocks"');
  });

  test("refuses a role that cannot bypass row-level security, moves markers, then drops the column", () => {
    const role = down.indexOf("(rolsuper OR rolbypassrls)");
    const rowSecurity = down.indexOf("set_config('row_security', 'off', true)");
    const move = down.indexOf("UPDATE public.records AS r");
    const counted = down.indexOf("IF v_moved <> v_marked THEN");
    const restore = down.indexOf(`CREATE OR REPLACE FUNCTION public.${RESERVE}(`);
    const dropColumn = down.indexOf("DROP COLUMN IF EXISTS system_tags");
    expect(role).toBeGreaterThan(-1);
    expect([role, rowSecurity, move, counted, restore, dropColumn]).toEqual(
      [...[role, rowSecurity, move, counted, restore, dropColumn]].sort((a, b) => a - b),
    );
  });

  test("no round-trip judging of rows (the #2094 guard is gone)", () => {
    expect(down).not.toContain("records_app_system_tags_split");
    expect(down).not.toContain("rollback_0218_accept_unrecoverable");
  });
});

describe("the hand move and the survey know exactly what the client writes", () => {
  const sqlArray = (sql: string, name: string) => {
    const match = sql.match(new RegExp(`${name}\\s+CONSTANT text\\[\\] := ARRAY\\[([^\\]]*)\\]`));
    if (!match) throw new Error(`${name} not found`);
    return match[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  };
  const ttfv = [...new Set([...firstLightSystemTags("affirm"), ...firstLightSystemTags("soft")])];
  const interview = [...new Set([...recallInterviewSystemTags("ko"), ...recallInterviewSystemTags("en")])];

  test("hand move: TTFV and interview sets match the writers (entry-ui included, Q3)", () => {
    expect(sqlArray(HAND_MOVE, "c_ttfv")).toEqual(ttfv);
    expect(sqlArray(HAND_MOVE, "c_interview")).toEqual(interview);
    expect(interview).toContain("entry-ui:ko");
  });

  // Gate ST-02 (2026-10-07): a subset of the marker words is not a writer's set.
  // A lone `first_light:soft` the user typed, affirm and soft together, or both
  // entry-ui values passed `markers <@ c_ttfv OR markers <@ c_interview` and the
  // move took a user tag out of `tags`. The list now has to equal one set a
  // writer actually wrote, in its order.
  test("hand move: a list line must equal one writer's exact set, in order", () => {
    expect(sqlArray(HAND_MOVE, "c_ttfv_affirm")).toEqual(firstLightSystemTags("affirm"));
    expect(sqlArray(HAND_MOVE, "c_ttfv_soft")).toEqual(firstLightSystemTags("soft"));
    expect(sqlArray(HAND_MOVE, "c_interview_ko")).toEqual(recallInterviewSystemTags("ko"));
    expect(sqlArray(HAND_MOVE, "c_interview_en")).toEqual(recallInterviewSystemTags("en"));
    // The interview before #1941 (2026-09-30) wrote the same set without entry-ui.
    expect(sqlArray(HAND_MOVE, "c_interview_old")).toEqual(
      recallInterviewSystemTags("ko").filter((tag) => !tag.startsWith("entry-ui:")),
    );
    const body = code(HAND_MOVE);
    for (const name of ["c_ttfv_affirm", "c_ttfv_soft", "c_interview_old", "c_interview_ko", "c_interview_en"]) {
      expect(body).toContain(`l.markers = ${name}`);
    }
    expect(body).not.toMatch(/l\.markers\s*<@\s*c_(ttfv|interview)\b/);
  });

  test("survey: the same marker list, per record kind, in each of its queries", () => {
    const lists = [...SURVEY.matchAll(/WITH markers\(kind, marker\) AS \(\s*VALUES([\s\S]*?)\n\)/g)].map((m) =>
      [...m[1].matchAll(/\('(note|audit_response)', '([^']+)'\)/g)].map((pair) => `${pair[1]}:${pair[2]}`),
    );
    const expected = [...ttfv.map((t) => `note:${t}`), ...interview.map((t) => `audit_response:${t}`)];
    expect(lists).toHaveLength(2);
    for (const list of lists) expect(list).toEqual(expected);
  });

  test("hand move: one DO block, no row ids in the file, bypass role and FORCE RLS handled", () => {
    const body = code(HAND_MOVE).trim();
    expect(body.startsWith("DO $hand_move$")).toBe(true);
    expect(body.endsWith("$hand_move$;")).toBe(true);
    expect(body.match(/\$hand_move\$/g)).toHaveLength(2);
    expect(HAND_MOVE).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(body).toContain("(rolsuper OR rolbypassrls)");
    expect(body).toContain("set_config('row_security', 'off', true)");
    expect(body).toContain("pg_temp.ops_0218_hand_move");
    // A row whose tags or system_tags moved since the survey is skipped, never
    // rewritten. Both columns are compared, so a cleanup line (gate ST-03) acts
    // only on a split row whose two columns are exactly what the owner confirmed.
    expect(body).toContain("IF v_row.tags IS DISTINCT FROM v_item.expected_tags");
    expect(body).toContain("OR v_row.system_tags IS DISTINCT FROM v_item.expected_system_tags THEN");
    expect(body).toContain("OR (l.mode = 'move' AND cardinality(l.expected_system_tags) <> 0)");
    expect(body).toContain("OR (l.mode = 'cleanup' AND l.expected_system_tags IS DISTINCT FROM l.markers)");
    expect(body).toContain("FOR UPDATE;");
  });

  test("survey: read only and never names the column directly (runs before and after 0218)", () => {
    const body = code(SURVEY);
    expect(body.trim().startsWith("SET TRANSACTION READ ONLY;")).toBe(true);
    expect(body).toContain("SET LOCAL row_security = off;");
    expect(body).not.toMatch(/\b(UPDATE|INSERT|DELETE|CREATE|ALTER|DROP)\b/i);
    expect(body).not.toMatch(/\br\.system_tags\b/);
    expect(body).toContain("to_jsonb(r) -> 'system_tags'");
  });
});

describe("CI lane and migration hygiene", () => {
  test("the dry-run workflow runs the regression, the survey and the autocommit refusal", () => {
    const step = WORKFLOW.slice(
      WORKFLOW.indexOf("- name: Exercise records.system_tags, its hand move and its rollback (0218)"),
      WORKFLOW.indexOf("- name: Dry-run Paddle refund consequence draft"),
    );
    expect(step).toContain("-f db/tests/records_system_tags_regression.sql");
    expect(step).toContain("--single-transaction -f db/ops/0218_system_tags_survey.sql");
    expect(step).toContain("-f db/migrations/rollback/0218_down.sql");
    expect(WORKFLOW).toContain('      - "db/ops/**"');
    expect(REGRESSION).toMatch(/^BEGIN;[\s\S]*ROLLBACK;/m);
    expect(REGRESSION).toContain("\\i db/ops/0218_system_tags_hand_move.sql");
    expect(REGRESSION).toContain("\\i db/migrations/rollback/0218_down.sql");
  });

  test("no top-level transaction wrapper in the migration, the rollback or the ops files", () => {
    for (const sql of [M0218, DOWN, HAND_MOVE, SURVEY]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    }
  });
});
