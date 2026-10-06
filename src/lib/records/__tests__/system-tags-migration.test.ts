// 0218 records.system_tags - the static half of the migration contract.
//
// The behavior half (which rows move, which stay, the rollback round trip) runs
// against a real database in db/tests/records_system_tags_regression.sql. This
// file pins what text can pin:
//   - the two Polaris evidence functions 0218 re-defines are 0195's bodies with
//     exactly one condition changed (tags -> system_tags), and the rollback puts
//     0195's bodies back unchanged. A hand-edited copy of a money path (credits,
//     weekly allowance) must not drift silently.
//   - every marker the client writes (records/system-tags.ts) is one the SQL rule
//     knows, so a pre-0218 layout written by the client's fallback is moved.
//   - the trigger is a plain (invoker) trigger on INSERT and on UPDATE OF tags.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { firstLightSystemTags, recallInterviewSystemTags } from "../system-tags";

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const M0195 = read("db/migrations/0195_polaris_generation_allowance.sql");
const M0218 = read("db/migrations/0218_records_system_tags.sql");
const DOWN = read("db/migrations/rollback/0218_down.sql");

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

describe("0218's split rule knows every marker the client writes", () => {
  const between = (from: string, to: string) => {
    const start = M0218.indexOf(from);
    const end = M0218.indexOf(to, start);
    if (start < 0 || end < 0) throw new Error(`${from} .. ${to} not found`);
    return M0218.slice(start, end);
  };
  const split = between("CREATE OR REPLACE FUNCTION public.records_app_system_tags_split(", "$split$;");
  const trigger = between("CREATE OR REPLACE FUNCTION public.records_move_app_system_tags()", "$move$;");

  test("the TTFV pair", () => {
    for (const tag of [...firstLightSystemTags("affirm"), ...firstLightSystemTags("soft")]) {
      expect(split).toContain(`'${tag}'`);
    }
  });

  test("the recall interview set, both entry-ui locales", () => {
    for (const tag of [...recallInterviewSystemTags("ko"), ...recallInterviewSystemTags("en")]) {
      expect(split).toContain(`'${tag}'`);
    }
  });

  test("the split is one pure function the trigger, the backfill and the rollback all call", () => {
    expect(split).toMatch(/LANGUAGE plpgsql\s+IMMUTABLE/);
    expect(split).not.toMatch(/security\s+definer/i);
    expect(split).not.toMatch(/\bpublic\.records\b/);
    expect(trigger).toContain(
      "public.records_app_system_tags_split(NEW.kind::text, NEW.body, NEW.tags, NEW.created_at)",
    );
    expect(between("DO $backfill$", "$backfill$;")).toContain("public.records_app_system_tags_split(");
    expect(DOWN).toContain("LATERAL public.records_app_system_tags_split(");
  });

  // Gate CD-01 / CDA-01 (2026-10-06): a row that already has system_tags, or an
  // UPDATE that changes tags, is never split again by string shape. The behavior
  // runs in db/tests/records_system_tags_regression.sql; this pins the guard text.
  test("only an INSERT or the backfill touch of a row without system_tags is split", () => {
    expect(trigger).toContain("IF cardinality(NEW.system_tags) > 0 THEN");
    expect(trigger).toMatch(
      /TG_OP = 'UPDATE' AND \(\s+cardinality\(COALESCE\(OLD\.system_tags, ARRAY\[\]::text\[\]\)\) > 0\s+OR NEW\.tags IS DISTINCT FROM OLD\.tags/,
    );
    expect(trigger).toContain("IF NOT COALESCE(v_marker = ANY (NEW.system_tags), false) THEN");
  });

  test("the split runs for the roles that write records, not for anon", () => {
    expect(M0218).toContain(
      "REVOKE ALL ON FUNCTION public.records_app_system_tags_split(text, text, text[], timestamptz) FROM PUBLIC, anon;",
    );
    expect(M0218).toContain(
      "GRANT EXECUTE ON FUNCTION public.records_app_system_tags_split(text, text, text[], timestamptz) TO authenticated, service_role;",
    );
  });

  // Gate CD-02: the database, not only the client, keeps NULL, multi-dimensional
  // and domain: values out of system_tags.
  test("system_tags has a shape constraint", () => {
    expect(M0218).toContain("ADD CONSTRAINT records_system_tags_shape CHECK (");
    expect(M0218).toContain("WHEN array_position(system_tags, NULL) IS NOT NULL THEN false");
    expect(M0218).toContain("WHEN array_ndims(system_tags) <> 1 OR array_lower(system_tags, 1) <> 1 THEN false");
  });

  // Gate CD-05: FORCE RLS would hide every row from a role that cannot bypass it.
  test("the backfill refuses a role that cannot bypass row-level security and counts what is left", () => {
    const backfill = between("DO $backfill$", "$backfill$;");
    expect(backfill).toContain("(rolsuper OR rolbypassrls)");
    expect(backfill).toContain("set_config('row_security', 'off', true)");
    expect(backfill).toContain("still carry the app''s markers in tags");
  });

  test("it is a plain trigger, not SECURITY DEFINER, on INSERT and UPDATE OF tags", () => {
    expect(trigger).not.toMatch(/security\s+definer/i);
    expect(trigger).toContain("SET search_path = ''");
    expect(split).toContain("SET search_path = ''");
    expect(M0218).toMatch(
      /CREATE TRIGGER records_move_app_system_tags\s+BEFORE INSERT OR UPDATE OF tags ON public\.records\s+FOR EACH ROW/,
    );
  });

  test("domain: is never a system tag (it stays in tags)", () => {
    expect(split).toContain("NOT LIKE 'domain:%'");
  });
});

describe("migration hygiene", () => {
  test("no top-level transaction wrapper (the Supabase CLI wraps the file)", () => {
    for (const sql of [M0218, DOWN]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    }
  });

  // Gate CDA-03: a row whose system_tags a re-apply would not derive again (an
  // edited TTFV body) stops the rollback before anything changes.
  test("the rollback checks the round trip before it touches anything", () => {
    const guard = DOWN.indexOf("DO $roundtrip_guard$");
    const dropTrigger = DOWN.indexOf("DROP TRIGGER IF EXISTS records_move_app_system_tags");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(dropTrigger);
    expect(DOWN).toContain("app.rollback_0218_accept_unrecoverable");
  });

  test("the rollback drops the trigger before moving markers back, and the column last", () => {
    const dropTrigger = DOWN.indexOf("DROP TRIGGER IF EXISTS records_move_app_system_tags");
    const moveBack = DOWN.indexOf("UPDATE public.records AS r");
    const dropColumn = DOWN.indexOf("DROP COLUMN IF EXISTS system_tags");
    expect(dropTrigger).toBeGreaterThan(-1);
    expect(moveBack).toBeGreaterThan(dropTrigger);
    expect(dropColumn).toBeGreaterThan(moveBack);
  });
});
