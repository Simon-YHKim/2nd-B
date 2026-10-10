import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as classifier from "../../safety/classifier";
function edge(file: string, deps: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../../../..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", code)(exports, (name: string) => {
    if (!(name in deps)) throw new Error(name); return deps[name];
  });
  return exports;
}
const axis = edge("supabase/functions/_shared/axis-key-name.ts", {});
const crisisContext = edge("src/lib/safety/crisis-context.ts", {});
const common = edge("supabase/functions/_shared/llm-proxy-common.ts", {
  "./axis-key-name.ts": axis,
  "../../../src/lib/safety/crisis-context.ts": crisisContext,
});
const consent = edge("supabase/functions/_shared/llm-consent.ts", {});
const inputSafety = edge("supabase/functions/_shared/llm-input-safety.ts", {
  "../../../src/lib/safety/classifier.ts": classifier,
});
const create = edge("supabase/functions/dashboard-generate/provider.ts", {
  "../_shared/llm-proxy-common.ts": common, "../_shared/llm-consent.ts": consent,
  "../_shared/llm-input-safety.ts": inputSafety,
}).createBoardProvider as (deps: ReturnType<typeof fixture>["deps"]) => (input: typeof request) => Promise<unknown>;
const request = { userId: "owner", runId: "run1", purpose: "daily_note", prompt: "Routine: Read", system: "JSON", consentToken: "a".repeat(64), payload: { title: "Read" } };
function fixture() {
  const deps = {
    model: "claude-sonnet-5", apiKey: "fixture-key",
    rpc: jest.fn(async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error?: unknown }> => ({ data:
      name === "effective_llm_consent_snapshot_v2" ? { allowed: true, token: request.consentToken }
        : name === "reserve_llm_proxy_capacity" ? { accepted: true, reservation_id: args?.p_reservation_id }
        : name === "effective_subscription_tier" ? "free" : true })),
    fetch: jest.fn().mockImplementation(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"line":"Read"}' }], stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 6 } }))),
  };
  return { deps, run: () => create(deps)(request) };
}
beforeAll(() => { Object.assign(globalThis, { Deno: { env: { get: () => "100" } } }); });
afterAll(() => { Reflect.deleteProperty(globalThis, "Deno"); });
test("uses shared spend and capacity gates and persists the existing audit schema", async () => {
  const f = fixture(); expect(await f.run()).toEqual({ line: "Read" });
  expect(f.deps.rpc).toHaveBeenCalledWith("bump_gemini_spend", expect.objectContaining({ p_user_id: "owner" }));
  expect(f.deps.rpc).toHaveBeenCalledWith("reserve_llm_proxy_capacity", expect.objectContaining({ p_provider: "claude" }));
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_audit_result", expect.objectContaining({ p_run_id: "run1", p_output_hash: expect.any(String), p_total_tokens: 10 }));
  expect(JSON.stringify(f.deps.rpc.mock.calls.filter(([name]) => name.startsWith("dashboard_generation_audit")))).not.toContain("Routine: Read");
});
test("missing model and stale consent cannot reach the provider", async () => {
  const f = fixture(); f.deps.model = ""; await expect(f.run()).rejects.toThrow("unavailable");
  f.deps.model = "claude-sonnet-5"; f.deps.rpc.mockResolvedValue({ data: { allowed: true, token: "b".repeat(64) } });
  await expect(f.run()).rejects.toThrow("unavailable"); expect(f.deps.fetch).not.toHaveBeenCalled();
});
test("spend or capacity outage fails closed", async () => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!;
  f.deps.rpc.mockImplementation(async (name, args) => name === "bump_gemini_spend" ? { data: null, error: {} } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable"); expect(f.deps.fetch).not.toHaveBeenCalled();
  f.deps.rpc.mockImplementation(async (name, args) => name === "reserve_llm_proxy_capacity" ? { data: false } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable"); expect(f.deps.fetch).not.toHaveBeenCalled();
  expect(f.deps.rpc).toHaveBeenCalledWith("refund_gemini_spend", expect.anything());
});
test("ambiguous dispatch is audited, settled and never refunded or retried", async () => {
  const f = fixture(); f.deps.fetch.mockRejectedValue(new Error("private upstream details"));
  await expect(f.run()).rejects.toThrow("dashboard_generation_unavailable");
  expect(f.deps.fetch).toHaveBeenCalledTimes(1); expect(f.deps.rpc.mock.calls.filter(([name]) => name === "dashboard_generation_audit_result")).toHaveLength(1);
  expect(f.deps.rpc.mock.calls.map(([name]) => name)).toContain("settle_llm_proxy_capacity");
  expect(f.deps.rpc.mock.calls.map(([name]) => name)).not.toContain("refund_gemini_spend");
});
test.each(["refusal", "max_tokens"])("%s response is never returned", async (stop_reason) => {
  const f = fixture(); f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: '{}' }], stop_reason })));
  await expect(f.run()).rejects.toThrow("unavailable");
});
test("audit failure withholds generated text", async () => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!;
  f.deps.rpc.mockImplementation(async (name, args) => name === "dashboard_generation_audit_result" ? { data: false } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable");
});

test("a single JSON code block is decoded and still checked by the board validator", async () => {
  const f = fixture();
  f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({
    content: [{ type: "text", text: '```json\n{"order":["r1"],"items":[]}\n```' }],
    stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 6 },
  })));
  expect(await f.run()).toEqual({ order: ["r1"], items: [] });
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_audit_result", expect.objectContaining({ p_total_tokens: 10 }));
});

test.each(['Prose {"line":"Read"}', '```json\n{"line":"Read"}\n``` trailing', '{broken']) (
  "invalid output keeps usage and a content-free failure reason: %s", async (text) => {
    const f = fixture();
    f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text }],
      stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 6 } })));
    await expect(f.run()).rejects.toThrow("unavailable");
    expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_audit_result", expect.objectContaining({ p_total_tokens: 10, p_outcome: "invalid_json" }));
    expect(JSON.stringify(f.deps.rpc.mock.calls.filter(([name]) => name.startsWith("dashboard_generation_audit")))).not.toContain(text);
  },
);

test("an upstream error records its status without returning or logging its body", async () => {
  const f = fixture(); f.deps.fetch.mockResolvedValue(new Response('private provider details', { status: 429 }));
  await expect(f.run()).rejects.toThrow("unavailable");
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_audit_result", expect.objectContaining({ p_outcome: "http_429" }));
  expect(JSON.stringify(f.deps.rpc.mock.calls.filter(([name]) => name.startsWith("dashboard_generation_audit")))).not.toContain('private provider details');
});
test("a rejected unsafe output records the red classification in the audit", async () => {
  const f = fixture();
  f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ line: "kill myself" }) }], stop_reason: "end_turn" })));
  await expect(f.run()).rejects.toThrow("unavailable");
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_audit_result", expect.objectContaining({ p_safety_zone: "red" }));
});
test("changed age, source or deletion state at dispatch cannot make a paid call", async () => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!;
  f.deps.rpc.mockImplementation(async (name, args) => name === "dashboard_generation_audit_attempt" ? { data: false } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable"); expect(f.deps.fetch).not.toHaveBeenCalled();
  expect(f.deps.rpc).toHaveBeenCalledWith("release_llm_proxy_capacity", expect.anything());
});
test("post-dispatch consent change withholds and marks the one audit", async () => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!; let checks = 0;
  f.deps.rpc.mockImplementation(async (name, args) => name === "effective_llm_consent_snapshot_v2" && ++checks === 3 ? { data: { allowed: false, token: null } } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable");
  expect(f.deps.rpc.mock.calls.filter(([name]) => name === "dashboard_generation_audit_result")).toHaveLength(1);
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_audit_result", expect.objectContaining({ p_outcome: "consent_withheld" }));
});

test.each(['daily_note', 'day_summary', 'inbox_triage'])("%s sends its explicit cheapest effort and audits that exact request", async (purpose) => {
  const f = fixture();
  await create(f.deps)({ ...request, purpose });
  const body = JSON.parse(f.deps.fetch.mock.calls[0][1].body);
  expect(body.output_config).toEqual({ effort: 'low' });
  expect(body.thinking).toEqual({ type: 'adaptive' });
  expect(f.deps.rpc).toHaveBeenCalledWith('dashboard_generation_audit_attempt', expect.objectContaining({
    p_effort: body.output_config.effort, p_model: body.model, p_run_id: request.runId, p_crisis: false,
  }));
  const index = f.deps.rpc.mock.calls.findIndex(([name]) => name === 'dashboard_generation_audit_attempt');
  expect(f.deps.rpc.mock.invocationCallOrder[index]).toBeLessThan(f.deps.fetch.mock.invocationCallOrder[0]);
});

test.each(['unknown', 'toString'])("unseated %s has no implicit effort or paid call", async (purpose) => {
  const f = fixture(); await expect(create(f.deps)({ ...request, purpose })).rejects.toThrow('unavailable');
  expect(f.deps.fetch).not.toHaveBeenCalled();
});

test('an unreviewed model cannot silently ignore effort', async () => {
  const f = fixture(); f.deps.model = 'claude-sonnet-4-5';
  await expect(f.run()).rejects.toThrow('unavailable'); expect(f.deps.fetch).not.toHaveBeenCalled();
});

test('crisis early exit persists an attempt without spend or dispatch', async () => {
  const f = fixture();
  await expect(create(f.deps)({ ...request, prompt: 'kill myself' })).rejects.toThrow('unavailable');
  expect(f.deps.rpc).toHaveBeenCalledWith('dashboard_generation_audit_attempt', expect.objectContaining({ p_crisis: true }));
  expect(f.deps.rpc).not.toHaveBeenCalledWith('bump_gemini_spend', expect.anything());
  expect(f.deps.fetch).not.toHaveBeenCalled();
});

test.each(['error', 'throw', 'denied'])('attempt %s prevents fetch and releases unused capacity', async (failure) => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!;
  f.deps.rpc.mockImplementation(async (name, args) => {
    if (name !== 'dashboard_generation_audit_attempt') return original(name, args);
    if (failure === 'throw') throw new Error('offline');
    return failure === 'error' ? { data: null, error: {} } : { data: false };
  });
  await expect(f.run()).rejects.toThrow('unavailable'); expect(f.deps.fetch).not.toHaveBeenCalled();
  expect(f.deps.rpc).toHaveBeenCalledWith('release_llm_proxy_capacity', expect.anything());
});

test('post-provider interruption retains the already persisted attempt', async () => {
  const f = fixture();
  const interrupted = edge('supabase/functions/dashboard-generate/provider.ts', {
    '../_shared/llm-consent.ts': consent,
    '../_shared/llm-input-safety.ts': inputSafety,
    '../_shared/llm-proxy-common.ts': { ...common, transitionLlmProxyCapacity: async () => { throw new Error('interrupted'); } },
  }).createBoardProvider as typeof create;
  await expect(interrupted(f.deps)(request)).rejects.toThrow('interrupted');
  expect(f.deps.fetch).toHaveBeenCalledTimes(1);
  expect(f.deps.rpc).toHaveBeenCalledWith('dashboard_generation_audit_attempt', expect.objectContaining({ p_crisis: false }));
});
