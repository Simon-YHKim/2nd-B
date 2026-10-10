import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import * as zod from "zod";
import { classifyInputAnyLocale } from "../../safety/classifier";
import { CRISIS_EVAL } from "../../safety/crisis-eval-corpus";
import { CRISIS_TERMS } from "../../safety/lexicon";
import { BENIGN_CRISIS_CONTEXTS, RISK_OR_UNRESOLVED_CRISIS_CONTEXTS } from "../../safety/__tests__/crisis-context.fixtures";

// Run the real handler, provider and classifier graph, with only I/O replaced.
// Resolve extensionless app imports through the deployed Deno import map.
const root = resolve(__dirname, "../../../..");
const map = JSON.parse(readFileSync(resolve(root, "supabase/functions/import_map.json"), "utf8")).imports as Record<string, string>;
const modules = new Map<string, Record<string, unknown>>();
function edge(file: string): Record<string, unknown> {
  if (modules.has(file)) return modules.get(file)!;
  const exports = {};
  modules.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", code)(exports, (specifier: string) => {
    if (specifier === "zod") return zod;
    const target = resolve(dirname(file), specifier);
    if (target.endsWith(".ts")) return edge(target);
    const entry = Object.entries(map).find(([key]) => resolve(root, "supabase/functions", key) === target);
    if (!entry) throw new Error(`Missing Deno import mapping: ${specifier}`);
    return edge(resolve(root, "supabase/functions", entry[1]));
  });
  return exports;
}
const provider = edge(resolve(root, "supabase/functions/dashboard-generate/provider.ts"));
const handler = edge(resolve(root, "supabase/functions/dashboard-generate/handler.ts"));
const common = edge(resolve(root, "supabase/functions/_shared/llm-proxy-common.ts"));
const hasCrisisTerm = common.hasCrisisTerm as (text: string) => boolean;
const hasRedZoneInput = edge(resolve(root, "supabase/functions/_shared/llm-input-safety.ts")).hasRedZoneInput as (value: unknown) => boolean;
type Action = "open" | "summary" | "triage" | "hourly";
const actions: Action[] = ["open", "summary", "triage", "hourly"];
const consentToken = "a".repeat(64);
function fixture(action: Action, text: string, locale = "en", source?: Record<string, unknown>) {
  const purpose = action === "triage" ? "inbox_triage" : action === "summary" ? "day_summary" : "daily_note";
  const payload = source ?? (action === "triage"
    ? { inboxCandidates: [{ id: "i1", source: "app", sender: null, title: text }] }
    : { reminders: [{ id: "r1", kind: "routine", title: text, at: null, state: "open" }] });
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>): Promise<{ data: unknown; error?: unknown }> => {
    if (name === "dashboard_generation_due") return { data: ["owner"] };
    if (name === "dashboard_generation_request") return { data: {
      kind: "claimed", id: "run1", purpose, slot: "morning", locale, consent_token: consentToken, source: payload,
    } };
    if (name === "effective_llm_consent_snapshot_v2") return { data: { allowed: true, token: consentToken } };
    if (name === "effective_subscription_tier") return { data: "free" };
    if (name === "reserve_llm_proxy_capacity") return { data: { accepted: true, reservation_id: args.p_reservation_id } };
    return { data: true };
  });
  const fetch = jest.fn(async () => new Response(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify({ slot: "morning", line: "Read today.",
      basis_refs: [{ kind: "routine", id: "r1" }], reminder_suggestions: [] }) }], stop_reason: "end_turn",
  })));
  const createProvider = provider.createBoardProvider as (deps: unknown) => (input: unknown) => Promise<unknown>;
  const generate = createProvider({ model: "claude-sonnet-5", apiKey: "fixture-key", rpc, fetch });
  const createHandler = handler.createDashboardHandler as (deps: unknown) => (req: Request) => Promise<Response>;
  const send = () => createHandler({ enabled: true, authenticate: async () => "owner", isScheduler: async () => true, rpc, generate })(
    new Request("https://fixture.invalid/dashboard", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, locale }) }),
  );
  return { rpc, fetch, generate, send };
}
beforeAll(() => { Object.assign(globalThis, { Deno: { env: { get: () => "100" } } }); });
afterAll(() => { Reflect.deleteProperty(globalThis, "Deno"); });

const redTexts = [...new Set([
  ...Object.values(CRISIS_TERMS).flat(),
  ...CRISIS_EVAL.RED_EXPLICIT.map(({ text }) => text),
  ...RISK_OR_UNRESOLVED_CRISIS_CONTEXTS,
])];
describe.each(actions)("%s server-initiated input gate", (action) => {
  test.each(redTexts)("app red is one crisis attempt, zero model calls: %s", async (text) => {
    expect(classifyInputAnyLocale(text, "en").zone).toBe("red");
    const f = fixture(action, text);
    const response = await f.send();
    expect(f.fetch).not.toHaveBeenCalled();
    const attempts = f.rpc.mock.calls.filter(([name]) => name === "dashboard_generation_audit_attempt");
    expect(attempts).toEqual([["dashboard_generation_audit_attempt", expect.objectContaining({ p_crisis: true })]]);
    expect(f.rpc).not.toHaveBeenCalledWith("bump_gemini_spend", expect.anything());
    expect(f.rpc).not.toHaveBeenCalledWith("reserve_llm_proxy_capacity", expect.anything());
    expect(f.rpc).toHaveBeenLastCalledWith("dashboard_generation_finish", expect.objectContaining({ p_output: null }));
    expect(await response.json()).toEqual(action === "hourly" ? { kind: "batch", processed: 1, nextCursor: null } : { kind: "unavailable" });
  });
  test.each(["I want\nto die.", "죽고\t싶어요."])("raw text is classified before JSON escaping: %s", async (text) => {
    expect(classifyInputAnyLocale(text, "en").zone).toBe("red");
    expect(hasCrisisTerm(JSON.stringify({ title: text }))).toBe(false);
    const f = fixture(action, text);
    await f.send();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.filter(([name]) => name === "dashboard_generation_audit_attempt")).toEqual([
      ["dashboard_generation_audit_attempt", expect.objectContaining({ p_crisis: true })],
    ]);
  });
  test.each([...CRISIS_EVAL.GREEN, ...CRISIS_EVAL.YELLOW])("non-red control reaches the model once: $text", async ({ text }) => {
    expect(classifyInputAnyLocale(text, "en").zone).not.toBe("red");
    const f = fixture(action, text);
    await f.send();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls.filter(([name]) => name === "dashboard_generation_audit_attempt")).toEqual([
      ["dashboard_generation_audit_attempt", expect.objectContaining({ p_crisis: false })],
    ]);
  });
});

test.each(["en", "ko", "es", "pt", "id"])("UI locale %s cannot disable the existing EN/KO red gate", async (locale) => {
  const f = fixture("open", "I want\nto die.", locale);
  await f.send();
  expect(f.fetch).not.toHaveBeenCalled();
});

const rawRed = "I want\nto die.";
test.each([
  ["schedule title", "open", { schedule: [{ id: "s1", title: rawRed, at: "2026-10-10T12:00:00Z" }] }],
  ["reminder title", "summary", { reminders: [{ id: "r1", kind: "reminder", title: rawRed, at: null, state: "open" }] }],
  ["dday title", "open", { reminders: [{ id: "r1", kind: "dday", title: rawRed, at: null, state: "open" }] }],
  ["weather condition", "open", { weather: { condition: rawRed, temp_c: 20, at: "2026-10-10T12:00:00Z", air_quality: null } }],
  ["weather air quality", "summary", { weather: { condition: "clear", temp_c: 20, at: "2026-10-10T12:00:00Z", air_quality: rawRed } }],
  ["inbox sender", "triage", { inboxCandidates: [{ id: "i1", source: "app", sender: rawRed, title: "Read" }] }],
  ["inbox title", "triage", { inboxCandidates: [{ id: "i1", source: "app", sender: null, title: rawRed }] }],
] as const)("scans every selected source field: %s", async (_name, action, source) => {
  const f = fixture(action, "Read", "en", source);
  await f.send();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledWith("dashboard_generation_audit_attempt", expect.objectContaining({ p_crisis: true }));
});

test("unselected source fields stay out of the prompt and do not add a new gate", async () => {
  const f = fixture("open", "Read", "en", {
    reminders: [{ id: "r1", kind: "routine", title: "Read", at: null, state: "open" }],
    recordExcerpts: [{ id: "private", text: rawRed }], privateText: rawRed,
  });
  await f.send();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});

test.each([...BENIGN_CRISIS_CONTEXTS, ...Object.values(CRISIS_EVAL).flat().map(({ text }) => text)])(
  "server helper preserves the app red decision on raw and nested inputs: %s", (text) => {
    const expected = classifyInputAnyLocale(text, "en").zone === "red";
    expect(hasRedZoneInput(text)).toBe(expected);
    expect(hasRedZoneInput({ records: [{ text, other: null }], count: 1 })).toBe(expected);
  },
);

test("a benign first field cannot hide a later red field", async () => {
  const f = fixture("open", "Read", "en", { reminders: [
    { id: "r1", kind: "routine", title: "Read", at: null, state: "open" },
    { id: "r2", kind: "routine", title: rawRed, at: null, state: "open" },
  ] });
  await f.send();
  expect(f.fetch).not.toHaveBeenCalled();
});

test.each(["error", "denied", "throw"])("crisis audit %s cannot fall through to a model or leave the run open", async (failure) => {
  const f = fixture("open", rawRed);
  const original = f.rpc.getMockImplementation()!;
  f.rpc.mockImplementation(async (name, args) => {
    if (name !== "dashboard_generation_audit_attempt") return original(name, args);
    if (failure === "throw") throw new Error("private audit details");
    return failure === "error" ? { data: null, error: {} } : { data: false };
  });
  expect(await (await f.send()).json()).toEqual({ kind: "unavailable" });
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.rpc.mock.calls.filter(([name]) => name === "dashboard_generation_audit_attempt")).toHaveLength(1);
  expect(f.rpc).toHaveBeenLastCalledWith("dashboard_generation_finish", expect.objectContaining({ p_output: null }));
});

test.each([undefined, null, [], "raw"])("missing or malformed projected payload fails closed: %s", async (payload) => {
  const f = fixture("open", "Read");
  await expect(f.generate({ userId: "owner", runId: "run1", purpose: "daily_note", prompt: "Read", system: "JSON", consentToken, payload })).rejects.toThrow("unavailable");
  expect(f.fetch).not.toHaveBeenCalled();
});

test.each(["prompt", "system", "payload"])("the provider also gates %s at its own entry", async (field) => {
  const f = fixture("open", "Read");
  await expect(f.generate({ userId: "owner", runId: "run1", purpose: "daily_note", prompt: "Read", system: "JSON", consentToken,
    payload: { recordExcerpts: [{ text: "Read" }] }, [field]: field === "payload" ? { recordExcerpts: [{ text: rawRed }] } : rawRed,
  })).rejects.toThrow("unavailable");
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledTimes(1);
  expect(f.rpc).toHaveBeenCalledWith("dashboard_generation_audit_attempt", expect.objectContaining({ p_crisis: true }));
});

test("the existing prompt and response backstops remain in addition to classification", () => {
  const source = readFileSync(resolve(root, "supabase/functions/dashboard-generate/provider.ts"), "utf8");
  expect(source).toContain("|| hasCrisisTerm(input.prompt)");
  expect(source).toContain("responseText.length <= 32_768 && !hasCrisisTerm(responseText)");
  expect(source).toContain("p_safety_zone: hasCrisisTerm(responseText) ? 'red' : 'green'");
});
