import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (name: string) => readFileSync(resolve(__dirname, "../..", name), "utf8").replace(/\r\n/g, "\n");
const sql = read("db/migration-drafts/UNNUMBERED_unconfirmed_signup_cleanup.sql");

describe("T07 unconfirmed signup cleanup deployment contract", () => {
  test("stays an unnumbered draft with a real confirmation issuance preflight", () => {
    expect(sql).toContain("INACTIVE DRAFT");
    expect(sql).toContain("attname = 'confirmation_sent_at'");
    expect(sql).toContain("no created_at fallback");
    expect(sql).not.toMatch(/CREATE TABLE/i);
  });

  test("uses every registry classification without copying an owned-table list", () => {
    expect(sql).toContain("SELECT table_name, owner_column FROM public.erasure_registry ORDER BY table_name");
    expect(sql).toContain("public.%I owned WHERE owned.%I = a.id");
    expect(sql).not.toMatch(/WHERE class\s*=/);
    expect(sql).not.toMatch(/DELETE FROM public\./i);
  });

  test("conditionally registers one daily postgres-owned cron using the existing pattern", () => {
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).toContain("to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL");
    expect(sql).toContain("EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id");
    expect(sql).toContain("'purge-unconfirmed-signups', '37 14 * * *'");
    expect(sql).toContain("SELECT * FROM public.purge_unconfirmed_signups(100);");
    expect(sql).toContain("IF current_user <> 'postgres'");
  });

  test("locks parent and identities, then rechecks the full deletion predicate", () => {
    expect(sql).toContain("FOR UPDATE OF a SKIP LOCKED");
    expect(sql).toContain("FROM auth.identities WHERE user_id = v_id FOR UPDATE NOWAIT");
    expect(sql).toContain("DELETE FROM auth.users a WHERE a.id = $2 AND ' || v_filter");
    expect(sql).toContain("pg_try_advisory_xact_lock(261024, 7)");
    expect(sql).toContain("SET timezone = 'UTC'");
  });

  test("scrubs both Auth copies at insert/update and when installed", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF identity_data ON auth.identities");
    expect(sql).toContain("UPDATE auth.users\nSET raw_user_meta_data");
    expect(sql).toContain("UPDATE auth.identities\nSET identity_data");
  });

  test("keeps the prescribed Korean policy sentence and mirrors without changing versions", () => {
    const sentence = "가입을 시작했으나 이메일 확인을 마치지 않은 경우, 입력한 이메일·생년월일 등은 확인 코드가 만료된 날부터 1일 안에 파기합니다.";
    for (const name of ["docs/legal/privacy-policy.md", "src/lib/legal/legal-documents.ts", "public/legal/privacy.html"]) {
      expect(read(name)).toContain(sentence);
    }
    expect(read("docs/legal/privacy-policy.md")).toContain("_시행일: 2026-10-07 · 최종 개정: 2026-10-07_");
  });

  test("runs executable SQL and semantic mutations in the no-cron CI lane", () => {
    const ci = read(".github/workflows/supabase-dry-run.yml");
    expect(ci).toContain("python3 scripts/test-unconfirmed-signup-cleanup.py 5432 t07_cleanup_test_ci");
    const runner = read("scripts/test-unconfirmed-signup-cleanup.py");
    expect(runner).toContain('"P0707: T07_ASSERT:"');
    expect(runner).toContain("pg_blocking_pids(f.pid)");
    expect(runner).not.toMatch(/import dotenv|DROP DATABASE/i);
  });
});
