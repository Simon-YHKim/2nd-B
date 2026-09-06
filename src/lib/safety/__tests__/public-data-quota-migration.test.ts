import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(ROOT, "db", "migrations", "0171_public_data_quota.sql");
const EDGE = readFileSync(
  join(ROOT, "supabase", "functions", "public-data-proxy", "index.ts"),
  "utf8",
);
const DRY_RUN = readFileSync(join(ROOT, ".github", "workflows", "supabase-dry-run.yml"), "utf8");
const SQL = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : "";
const code = SQL.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("final 0171 public-data quota migration", () => {
  test("defines the exact boolean RPC contract with a locked definer context", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(code).toMatch(
      /CREATE OR REPLACE FUNCTION public\.consume_public_data_quota\(\s*p_user_id uuid,\s*p_provider text,\s*p_day date,\s*p_cap int\s*\)\s*RETURNS boolean/i,
    );
    expect(code).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
  });

  test("keeps both ledgers private behind forced RLS and a service-role-only RPC", () => {
    for (const table of ["public_data_quota_daily", "public_data_provider_quota_daily"]) {
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`, "i"));
      expect(code).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role`,
          "i",
        ),
      );
    }
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.consume_public_data_quota\(uuid, text, date, int(?:eger)?\)\s+FROM PUBLIC, anon, authenticated/i,
    );
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_public_data_quota\(uuid, text, date, int(?:eger)?\)\s+TO service_role/i,
    );
    expect(code).not.toMatch(/GRANT [^;]* ON TABLE public\.public_data_(?:provider_)?quota_daily/i);
  });

  test("rejects cross-user calls unless the request JWT is explicitly service_role", () => {
    expect(code).toMatch(/current_setting\('request\.jwt\.claims', true\)/i);
    expect(code).toMatch(/v_request_role IS DISTINCT FROM 'service_role'/i);
    expect(code).toMatch(/auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id/i);
    expect(code).toMatch(/ERRCODE = '42501'/i);
  });

  test("validates provider, UTC day, and caller cap against server ceilings", () => {
    expect(code).toMatch(/p_provider NOT IN \('exim_fx', 'mfds_food'\)/i);
    expect(code).toMatch(/p_day <> \(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/i);
    expect(code).toMatch(/p_cap < 1 OR p_cap > v_user_cap_ceiling/i);
    expect(code).toMatch(/WHEN 'exim_fx' THEN 20\b/i);
    expect(code).toMatch(/WHEN 'mfds_food' THEN 50\b/i);
  });

  test("pins provider-global ceilings server-side, including EXIM safety headroom", () => {
    expect(code).toMatch(/WHEN 'exim_fx' THEN 900\b/i);
    expect(code).toMatch(/WHEN 'mfds_food' THEN 900\b/i);
    expect(code).toMatch(/v_global_calls >= v_global_cap/i);
    expect(code).not.toMatch(/v_global_calls >= p_cap/i);
  });

  test("serializes on the provider/day row before checking and updating the user row", () => {
    const providerInsert = code.search(/INSERT INTO public\.public_data_provider_quota_daily/i);
    const providerLock = code.search(
      /FROM public\.public_data_provider_quota_daily[\s\S]*?FOR UPDATE/i,
    );
    const userInsert = code.search(/INSERT INTO public\.public_data_quota_daily/i);
    const userLock = code.search(/FROM public\.public_data_quota_daily[\s\S]*?FOR UPDATE/i);
    const providerUpdate = code.search(/UPDATE public\.public_data_provider_quota_daily/i);
    const userUpdate = code.search(/UPDATE public\.public_data_quota_daily/i);

    expect(providerInsert).toBeGreaterThan(-1);
    expect(providerLock).toBeGreaterThan(providerInsert);
    expect(userInsert).toBeGreaterThan(providerLock);
    expect(userLock).toBeGreaterThan(userInsert);
    expect(providerUpdate).toBeGreaterThan(userLock);
    expect(userUpdate).toBeGreaterThan(providerUpdate);
    expect(code).toMatch(/IF v_global_calls >= v_global_cap THEN\s*RETURN false/i);
    expect(code).toMatch(/IF v_user_calls >= p_cap THEN\s*RETURN false/i);
  });

  test("is replay-safe and preserves the edge fail-closed order", () => {
    expect(code.match(/CREATE TABLE IF NOT EXISTS/gi)).toHaveLength(2);
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.consume_public_data_quota/i);

    const quotaAt = EDGE.search(/rpc\(["']consume_public_data_quota["']/);
    const fetchAt = EDGE.indexOf("await fetch(");
    expect(quotaAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(EDGE).toMatch(/quotaError[\s\S]*?quota_check_unavailable[\s\S]*?503/);
    expect(EDGE).toMatch(/quotaAllowed !== true[\s\S]*?proxy_quota_exceeded[\s\S]*?429/);
    expect(EDGE).toMatch(/exim_fx:\s*20/);
    expect(EDGE).toMatch(/mfds_food:\s*50/);
  });

  test("runs the executable SQL regression in the migration dry-run workflow", () => {
    expect(DRY_RUN).toMatch(/- "db\/tests\/\*\*"/);
    expect(DRY_RUN).toMatch(
      /psql -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/public_data_quota_regression\.sql/,
    );
  });
});
