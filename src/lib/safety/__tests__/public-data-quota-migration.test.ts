import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../..");
const sql = readFileSync(resolve(root, "db/migrations/0171_public_data_quota.sql"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const edge = readFileSync(resolve(root, "supabase/functions/public-data-proxy/index.ts"), "utf8");

describe("0171 public-data quota boundary", () => {
  test("defines the exact boolean RPC in a locked definer context", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.consume_public_data_quota\(\s*p_user_id uuid,\s*p_provider text,\s*p_day date,\s*p_cap int\s*\)\s*RETURNS boolean/i,
    );
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/i);
  });

  test("keeps both ledgers private behind forced RLS", () => {
    for (const table of ["public_data_quota_daily", "public_data_provider_quota_daily"]) {
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role`,
          "i",
        ),
      );
    }
  });

  test("exposes only the RPC to service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.consume_public_data_quota\(uuid, text, date, int\)\s+FROM PUBLIC, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_public_data_quota\(uuid, text, date, int\)\s+TO service_role/i,
    );
    expect(sql).not.toMatch(/GRANT [^;]* ON TABLE public\.public_data_(?:provider_)?quota_daily/i);
  });

  test("rejects cross-user non-service calls and attacker-owned dimensions", () => {
    expect(sql).toMatch(/v_request_role IS DISTINCT FROM 'service_role'/i);
    expect(sql).toMatch(/auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id/i);
    expect(sql).toMatch(/p_provider NOT IN \('exim_fx', 'mfds_food'\)/i);
    expect(sql).toMatch(/p_day <> \(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/i);
    expect(sql).toMatch(/p_cap < 1 OR p_cap > v_user_cap_ceiling/i);
  });

  test("pins user and provider-global caps server-side", () => {
    expect(sql).toMatch(/WHEN 'exim_fx' THEN 20\b/i);
    expect(sql).toMatch(/WHEN 'mfds_food' THEN 50\b/i);
    expect(sql).toMatch(/WHEN 'exim_fx' THEN 900\b/i);
    expect(sql).toMatch(/WHEN 'mfds_food' THEN 900\b/i);
    expect(sql).not.toMatch(/v_global_calls >= p_cap/i);
  });

  test("locks provider/day before user/day and updates both atomically", () => {
    const providerInsert = sql.search(/INSERT INTO public\.public_data_provider_quota_daily/i);
    const providerLock = sql.search(
      /FROM public\.public_data_provider_quota_daily[\s\S]*?FOR UPDATE/i,
    );
    const userInsert = sql.search(/INSERT INTO public\.public_data_quota_daily/i);
    const userLock = sql.search(/FROM public\.public_data_quota_daily[\s\S]*?FOR UPDATE/i);
    const providerUpdate = sql.search(/UPDATE public\.public_data_provider_quota_daily/i);
    const userUpdate = sql.search(/UPDATE public\.public_data_quota_daily/i);
    expect(providerLock).toBeGreaterThan(providerInsert);
    expect(userInsert).toBeGreaterThan(providerLock);
    expect(userLock).toBeGreaterThan(userInsert);
    expect(providerUpdate).toBeGreaterThan(userLock);
    expect(userUpdate).toBeGreaterThan(providerUpdate);
  });

  test("the Edge path fails closed on quota before any upstream request", () => {
    const quotaAt = edge.indexOf('"consume_public_data_quota"');
    const fetchAt = edge.indexOf("await fetch(");
    expect(quotaAt).toBeGreaterThan(0);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(edge).toMatch(/quotaError[\s\S]*quota_check_unavailable/);
    expect(edge).toMatch(/quotaAllowed !== true[\s\S]*proxy_quota_exceeded/);
  });
});
