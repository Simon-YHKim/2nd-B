import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../../../..", path), "utf8").replace(/\r\n/g, "\n");
const sql = read("db/migrations/0249_dashboard_reservation_recovery.sql");
function definition(text: string, name: string) {
  const found = text.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!found) throw new Error(`Missing ${name}`);
  return found[0];
}
const request = definition(sql, "dashboard_generation_request");
const v2 = definition(sql, "dashboard_generation_request_v2");

test("0249 v1 preserves the entire 0248 read contract except its shared attempt counter", () => {
  const baseline = definition(read("db/migrations/0248_dashboard_note_backstop.sql"), "dashboard_generation_request");
  const start = baseline.indexOf("  -- Count attempts,");
  const end = baseline.indexOf("    IF previous_note IS NOT NULL", start);
  expect(request).toBe(baseline.slice(0, start) +
    "  -- Legacy and v2 reservations share the same 0248 allowance.\n" +
    "  IF public.dashboard_generation_attempt_count(p_user_id,v_purpose,s.timezone) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN\n" + baseline.slice(end));
});

test("v2 has the identical last-note selection, FOR SHARE and current-row shape check", () => {
  const prefix = (s: string) => s.slice(s.indexOf("DECLARE"), s.indexOf(s === v2
    ? "    -- The guard owns" : "    IF previous_note IS NOT NULL"))
    .replace("AND g.request_key=key FOR UPDATE;", "AND g.request_key=key;").trim();
  expect(prefix(v2)).toBe(prefix(request));
  expect(v2.match(/IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;/g)).toHaveLength(3);
  expect(v2).toContain("r.lease_token IS NOT NULL AND r.dispatched_at IS NULL");
});

test("0249 extends deployed objects without recreating retention or changing routine triggers", () => {
  expect(sql).not.toMatch(/CREATE TABLE|CREATE TRIGGER|DROP TRIGGER|CREATE FUNCTION public\.dashboard_generation_retention_ready/);
  expect(sql.match(/ADD COLUMN/g)).toHaveLength(3);
  expect(sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.dashboard_generation_\w+_v2\(/g)).toHaveLength(6);
  expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.dashboard_generation_audit_result(");
  expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.dashboard_generation_guard(");
  expect(read("db/migrations/rollback/0249_down.sql")).not.toMatch(/DROP |DELETE FROM|UPDATE public\./);
});

test.each([
  ["dashboard_generation_dispatch", "0245_dashboard_retention_heartbeat.sql"],
  ["dashboard_generation_finish", "0236_dashboard_generation.sql"],
  ["dashboard_generation_audit_attempt", "0244_dashboard_generation_audit_and_withdrawal.sql"],
])("%s preserves deployed v1 behavior with only a v2 lease fence", (name, file) => {
  const normalize = (value: string) => value.replace(/^CREATE OR REPLACE FUNCTION/, "CREATE FUNCTION")
    .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  expect(normalize(definition(sql, name).replace("r.lease_token IS NOT NULL OR ", "")))
    .toBe(normalize(definition(read(`db/migrations/${file}`), name)));
});

test("begin checks eligibility and matching consent before either row changes; only block discards eligibility", () => {
  const begin = definition(sql, "dashboard_generation_begin_classification_v2");
  expect(begin).toContain("c := public.dashboard_generation_eligibility(p_user_id);\n  IF c IS NULL THEN RETURN false; END IF;");
  expect(begin).toContain("r.consent_token IS DISTINCT FROM c->>'token'");
  expect(begin.indexOf("IF c IS NULL")).toBeLessThan(begin.indexOf("UPDATE public.ai_audit_log"));
  const discards = [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)[\s\S]*?\$\$;/g)]
    .filter(([body]) => /PERFORM public\.dashboard_generation_(?:guard|eligibility)\(/.test(body)).map(([, name]) => name);
  expect(discards).toEqual(["dashboard_generation_block_v2"]);
});

test("the local runner applies 0249 and replays the numbered read/quota suites", () => {
  const runner = read("scripts/test-dashboard-sql.mjs");
  expect(runner).toContain("\\\\ir ../migrations/0249_dashboard_reservation_recovery.sql");
  expect(runner).toContain("recoveryReplaySql(dirname(fixture))");
  const replay = read("scripts/test-dashboard-recovery-replay.mjs");
  expect(replay).toContain("read('dashboard_last_note_regression.sql')");
  expect(replay).toContain("read('dashboard_note_backstop_regression.sql')");
  expect(replay).toContain("0249: replay 0248 v2");
});
