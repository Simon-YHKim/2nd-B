import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (name: string) => readFileSync(resolve(__dirname, "../..", name), "utf8").replace(/\r\n/g, "\n");
const sql = read("db/migration-drafts/UNNUMBERED_unconfirmed_signup_cleanup.sql");

describe("T07 unconfirmed signup cleanup deployment contract", () => {
  test("stays an unnumbered draft with a real confirmation issuance preflight", () => {
    expect(sql).toContain("INACTIVE DRAFT");
    expect(sql).toContain("attname = 'confirmation_sent_at'");
    expect(sql).toContain("attname = 'recovery_sent_at'");
    expect(sql).toContain("no created_at fallback");
    expect(sql).not.toMatch(/CREATE TABLE/i);
  });

  test("uses every registry classification without copying an owned-table list", () => {
    expect(sql).toContain("SELECT table_name, owner_column FROM public.erasure_registry ORDER BY table_name");
    expect(sql).toContain("public.%I owned WHERE owned.%I = a.id");
    expect(sql).not.toMatch(/WHERE class\s*=/);
    expect(sql).not.toMatch(/DELETE FROM public\./i);
  });

  test("conditionally registers one hourly postgres-owned cron using the existing pattern", () => {
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).toContain("to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL");
    expect(sql).toContain("EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id");
    expect(sql).toContain("'purge-unconfirmed-signups', '37 * * * *'");
    expect(sql).toContain("SELECT * FROM public.purge_unconfirmed_signups(100);");
    expect(sql).toContain("IF current_user <> 'postgres'");
  });

  test("locks parent and identities, then rechecks the full deletion predicate", () => {
    expect(sql).toContain("FOR UPDATE OF a SKIP LOCKED");
    expect(sql).toContain("FROM auth.identities WHERE user_id = v_id FOR UPDATE NOWAIT");
    expect(sql).toContain("DELETE FROM auth.users a WHERE a.id = $2 AND ' || v_filter");
    expect(sql).toContain("pg_try_advisory_xact_lock(261024, 7)");
  });

  test("inherits the server age gate's session date without changing C10 routines", () => {
    const down = read("db/migration-drafts/rollback/UNNUMBERED_unconfirmed_signup_cleanup_down.sql");
    for (const script of [sql, down]) {
      expect(script).not.toMatch(/(?:SET|RESET)\s+timezone\b/i);
      expect(script).not.toMatch(/(?:ALTER|CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+FUNCTION\s+public\.(?:enforce_user_age_tier|complete_verified_email_signup|complete_profile_signup_consent)\s*\(/i);
    }
    expect(sql).toContain("v_today date := current_date;");
  });

  test("scrubs both Auth copies at insert/update and when installed", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF identity_data ON auth.identities");
    expect(sql).toContain("UPDATE auth.users\nSET raw_user_meta_data");
    expect(sql).toContain("UPDATE auth.identities\nSET identity_data");
  });

  test("defers the policy sentence in all three published copies until the separate publication PR", () => {
    const sentence = "가입을 시작했으나 이메일 확인을 마치지 않은 경우, 입력한 이메일·생년월일 등은 확인 코드가 만료된 날부터 1일 안에 파기합니다.";
    for (const name of ["docs/legal/privacy-policy.md", "src/lib/legal/legal-documents.ts", "public/legal/privacy.html"]) {
      expect(read(name)).not.toContain(sentence);
    }
    const runbook = read("db/migration-drafts/T07-unconfirmed-signup-cleanup.md");
    expect(runbook).toContain(sentence);
    for (const gate of ["do not merge before NNNN applied", "PRIVACY_POLICY_VERSION", "제12조", "첫 실행"]) {
      expect(runbook).toContain(gate);
    }
    expect(sql).toContain("do not merge before NNNN applied");
    expect(sql).toContain("Before numbering, the coordinator must confirm production Auth OTP");
    expect(read("supabase/config.toml")).toMatch(/^otp_expiry = 600$/m);
  });

  test("hourly scheduling with a 22-hour cutoff fits both elapsed and KST calendar deadlines", () => {
    const hours = Number(sql.match(/v_cutoff[^;]*- interval '(\d+) hours'/)?.[1]);
    const cron = sql.match(/USING 'purge-unconfirmed-signups', '([^']+)'/)?.[1].split(" ");
    expect(hours).toBe(22);
    expect(cron).toEqual(["37", "*", "*", "*", "*"]);
    // Every expiry minute over two KST days, including midnight on either day.
    const start = Date.parse("2026-10-24T00:00:00+09:00");
    const minute = 60_000, hour = 60 * minute, day = 24 * hour;
    for (let offset = 0; offset < 2 * day; offset += minute) {
      const expiry = start + offset;
      const eligible = expiry + hours * hour;
      const run = Math.ceil((eligible - Number(cron![0]) * minute) / hour) * hour + Number(cron![0]) * minute;
      expect(run - expiry).toBeGreaterThanOrEqual(22 * hour);
      expect(run - expiry).toBeLessThan(23 * hour);
      const nextDayEnd = Math.floor((expiry + 9 * hour) / day) * day + 2 * day - 9 * hour;
      expect(run).toBeLessThan(nextDayEnd);
    }
  });

  test("reports aggregate counts and warns about row failures without exposing row data", () => {
    expect(sql).toContain("RETURNS TABLE(deleted integer, skipped integer, failed integer)");
    expect(sql).toContain("RAISE LOG 'T07 cleanup: deleted=% skipped=% failed=%', deleted, skipped, failed;");
    expect(sql).toContain("IF failed > 0 THEN\n    RAISE WARNING");
    expect(sql).not.toMatch(/RAISE (?:LOG|WARNING)[^;]*(?:SQLERRM|v_id|email|v_birth)/);
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
