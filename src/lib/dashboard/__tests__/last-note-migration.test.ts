import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../../../..", path), "utf8").replace(/\r\n/g, "\n");
const baseline = read("db/migrations/0245_dashboard_retention_heartbeat.sql");
const promoted = read("db/migrations/0247_dashboard_last_note.sql");
const rollback = read("db/migrations/rollback/0247_down.sql");
function request(sql: string): string {
  const found = sql.match(/CREATE OR REPLACE FUNCTION public\.dashboard_generation_request\(.*?END \$\$;/s);
  if (!found) throw new Error("Missing request definition");
  return found[0];
}
const body = request(promoted);
// One-based 0245 request lines. Every inserted/changed line is explicit;
// even whitespace or an unrelated predicate change must fail this contract.
const allowedEdits = [
  {
    "line": 4,
    "before": [
      "  wall timestamp; slot text; slot_day date; v_purpose text; key text; source jsonb; v_source_hash text; expiry timestamptz;"
    ],
    "after": [
      "  wall timestamp; slot text; slot_day date; v_purpose text; key text; source jsonb; v_source_hash text; expiry timestamptz; previous_note jsonb;"
    ]
  },
  {
    "line": 36,
    "before": [],
    "after": [
      "  -- Only the read action may use a previous note. Its current consent and every",
      "  -- evidence reference must survive; completed routines remain valid evidence.",
      "  IF p_action='open' THEN",
      "    SELECT jsonb_build_object('kind','ready','purpose','daily_note','slot',g.output->>'slot',",
      "      'value',g.output,'source',source,'generatedAt',g.created_at,'previous',true)",
      "    INTO previous_note FROM public.dashboard_generation_runs g",
      "    WHERE g.user_id=p_user_id AND g.purpose='daily_note' AND g.status='ready'",
      "      AND g.output IS NOT NULL AND g.expires_at>now() AND g.consent_token=c->>'token'",
      "      AND jsonb_array_length(CASE WHEN jsonb_typeof(g.output->'basis_refs')='array'",
      "        THEN g.output->'basis_refs' ELSE '[]'::jsonb END)>0",
      "      AND jsonb_typeof(g.output->'reminder_suggestions')='array'",
      "      AND NOT EXISTS (",
      "        SELECT 1 FROM (",
      "          SELECT value AS ref FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.output->'basis_refs')='array'",
      "            THEN g.output->'basis_refs' ELSE '[]'::jsonb END)",
      "          UNION ALL",
      "          SELECT value->'source_ref' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.output->'reminder_suggestions')='array'",
      "            THEN g.output->'reminder_suggestions' ELSE '[]'::jsonb END)",
      "        ) evidence WHERE NOT EXISTS (",
      "          SELECT 1 FROM jsonb_array_elements(source->'reminders') candidate",
      "          WHERE candidate->>'id'=evidence.ref->>'id'",
      "            AND CASE WHEN candidate->>'kind'='routine' THEN 'routine' ELSE 'reminder' END=evidence.ref->>'kind'",
      "        )",
      "      )",
      "    ORDER BY g.created_at DESC LIMIT 1 FOR SHARE OF g;",
      "  END IF;"
    ]
  },
  {
    "line": 44,
    "before": [
      "    IF FOUND THEN RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source); END IF;"
    ],
    "after": [
      "    IF FOUND THEN RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false); END IF;"
    ]
  },
  {
    "line": 49,
    "before": [
      "      RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source);"
    ],
    "after": [
      "      RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false);"
    ]
  },
  {
    "line": 51,
    "before": [],
    "after": [
      "    IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;"
    ]
  },
  {
    "line": 57,
    "before": [
      "  -- Current local day plus a fixed UTC-day backstop prevents timezone reset abuse",
      "  -- without blocking tomorrow's 06:00 because yesterday's tick was a little late."
    ],
    "after": [
      "  -- Daily notes count the 06:00 service day; other purposes keep the calendar day.",
      "  -- The fixed UTC-day backstop remains unchanged, including its early-day limit."
    ]
  },
  {
    "line": 60,
    "before": [
      "      AND ((g.created_at AT TIME ZONE s.timezone)::date=wall::date OR"
    ],
    "after": [
      "      AND ((CASE WHEN v_purpose='daily_note' THEN",
      "        ((g.created_at AT TIME ZONE s.timezone) - interval '6 hours')::date=slot_day",
      "        ELSE (g.created_at AT TIME ZONE s.timezone)::date=wall::date END) OR"
    ]
  },
  {
    "line": 62,
    "before": [],
    "after": [
      "    IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;"
    ]
  }
] as const;

test("0247 request differs from 0245 only by hardened A03 and the service-day quota", () => {
  const lines = request(baseline).split("\n");
  for (const edit of [...allowedEdits].reverse()) {
    expect(lines.slice(edit.line - 1, edit.line - 1 + edit.before.length)).toEqual(edit.before);
    lines.splice(edit.line - 1, edit.before.length, ...edit.after);
  }
  expect(body.split("\n")).toEqual(lines);
});

test.each([
  ["consent", "AND g.output IS NOT NULL AND g.expires_at>now() AND g.consent_token=c->>'token'"],
  ["evidence", "WHERE candidate->>'id'=evidence.ref->>'id'"],
  ["open only", "IF p_action='open' THEN"],
  ["retention heartbeat", "IF NOT public.dashboard_generation_retention_ready() THEN RETURN jsonb_build_object('kind','denied'); END IF;"],
  ["service day", "((g.created_at AT TIME ZONE s.timezone) - interval '6 hours')::date=slot_day"],
  ["expiry", "AND g.output IS NOT NULL AND g.expires_at>now()"],
])("0247 previous note keeps %s", (_label, required) => {
  expect(body).toContain(required);
});

test("0247 preserves 0245 RPC signature, security configuration and literal ACL block", () => {
  expect(body.split("\n").slice(0, 2)).toEqual(request(baseline).split("\n").slice(0, 2));
  const acl = (sql: string) => sql.slice(sql.indexOf("REVOKE ALL ON FUNCTION"));
  expect(acl(promoted)).toBe(acl(baseline));
  expect(acl(rollback)).toBe(acl(baseline));
  expect([...promoted.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]))
    .toEqual(["dashboard_generation_request"]);
  expect(promoted).not.toMatch(/CREATE TABLE|ADD COLUMN|_v2\(|UPDATE public\.|DELETE FROM/);
});

const routineTrigger = `CREATE TRIGGER dashboard_routine_changed
AFTER UPDATE OF title,active,recurrence,weekday ON public.ops_routines
FOR EACH ROW WHEN (OLD.title IS DISTINCT FROM NEW.title
  OR OLD.active IS DISTINCT FROM NEW.active
  OR OLD.recurrence IS DISTINCT FROM NEW.recurrence
  OR OLD.weekday IS DISTINCT FROM NEW.weekday)
EXECUTE FUNCTION public.invalidate_dashboard_generation();`;

test("0247 invalidates only actual routine content edits through the unchanged 0236 function", () => {
  expect(promoted.match(/CREATE TRIGGER[\s\S]*?;/g)).toEqual([routineTrigger]);
  expect(promoted).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.invalidate_dashboard_generation\(/);
});

test("0247 normalizes both array inputs and locks the selected run", () => {
  expect(body.match(/CASE WHEN jsonb_typeof\(g.output->'basis_refs'\)='array'\s+THEN g.output->'basis_refs' ELSE '\[\]'::jsonb END/g)).toHaveLength(2);
  expect(body).toMatch(/jsonb_array_elements\(CASE WHEN jsonb_typeof\(g.output->'reminder_suggestions'\)='array'\s+THEN g.output->'reminder_suggestions' ELSE '\[\]'::jsonb END\)/);
  expect(body).toContain("AND jsonb_typeof(g.output->'reminder_suggestions')='array'");
  expect(body).toContain("ORDER BY g.created_at DESC LIMIT 1 FOR SHARE OF g;");
});

test("0247 rollback restores the exact 0245 request and drops only its own trigger", () => {
  expect(request(rollback)).toBe(request(baseline));
  expect(rollback.match(/DROP [^;]+;/g)).toEqual(["DROP TRIGGER IF EXISTS dashboard_routine_changed ON public.ops_routines;"]);
  expect(rollback).not.toMatch(/DELETE FROM|UPDATE public\./);
});

test("0244 nullable usage contract is kept because the provider sends unknown tokens", () => {
  const provider = read("supabase/functions/dashboard-generate/provider.ts");
  expect(provider).toContain("let tokens: number | null = null");
  expect(provider).toContain("p_total_tokens: tokens");
  expect(promoted).not.toMatch(/(?:FUNCTION public\.dashboard_generation_audit_result|p_total_tokens IS NULL)/);
});

test("SQL bootstrap leaves 0247 installed for the existing concurrency runner", () => {
  const bootstrap = read("db/tests/dashboard_generation_bootstrap.sql");
  const install = bootstrap.indexOf("\\ir ../migrations/0247_dashboard_last_note.sql");
  expect(install).toBeGreaterThan(bootstrap.indexOf("\\ir ../migrations/0245_dashboard_retention_heartbeat.sql"));
  expect(bootstrap.slice(install)).toBe("\\ir ../migrations/0247_dashboard_last_note.sql\n\\ir dashboard_last_note_regression.sql\n");
  expect(bootstrap).not.toContain("UNNUMBERED_dashboard_last_note");
});
