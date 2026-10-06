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
  const trigger = M0218.slice(
    M0218.indexOf("CREATE OR REPLACE FUNCTION public.records_move_app_system_tags()"),
    M0218.indexOf("$move$;"),
  );

  test("the TTFV pair", () => {
    for (const tag of [...firstLightSystemTags("affirm"), ...firstLightSystemTags("soft")]) {
      expect(trigger).toContain(`'${tag}'`);
    }
  });

  test("the recall interview set, both entry-ui locales", () => {
    for (const tag of [...recallInterviewSystemTags("ko"), ...recallInterviewSystemTags("en")]) {
      expect(trigger).toContain(`'${tag}'`);
    }
  });

  test("it is a plain trigger, not SECURITY DEFINER, on INSERT and UPDATE OF tags", () => {
    expect(trigger).not.toMatch(/security\s+definer/i);
    expect(trigger).toContain("SET search_path = ''");
    expect(M0218).toMatch(
      /CREATE TRIGGER records_move_app_system_tags\s+BEFORE INSERT OR UPDATE OF tags ON public\.records\s+FOR EACH ROW/,
    );
  });

  test("domain: is never a system tag (it stays in tags)", () => {
    expect(trigger).toContain("NOT LIKE 'domain:%'");
  });
});

describe("migration hygiene", () => {
  test("no top-level transaction wrapper (the Supabase CLI wraps the file)", () => {
    for (const sql of [M0218, DOWN]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    }
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
