import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
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
const common = edge("supabase/functions/_shared/llm-proxy-common.ts", { "./axis-key-name.ts": axis });
const consent = edge("supabase/functions/_shared/llm-consent.ts", {});
const create = edge("supabase/functions/dashboard-generate/provider.ts", {
  "../_shared/llm-proxy-common.ts": common, "../_shared/llm-consent.ts": consent,
}).createBoardProvider as (deps: ReturnType<typeof fixture>["deps"]) => (input: typeof request) => Promise<unknown>;
const request = { userId: "owner", runId: "run1", purpose: "daily_note", prompt: "Routine: Read", system: "JSON", consentToken: "a".repeat(64) };
function fixture() {
  const deps = {
    model: "claude-sonnet-test", apiKey: "fixture-key",
    rpc: jest.fn(async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error?: unknown }> => ({ data:
      name === "effective_llm_consent_snapshot_v2" ? { allowed: true, token: request.consentToken }
        : name === "reserve_llm_proxy_capacity" ? { accepted: true, reservation_id: args?.p_reservation_id }
        : name === "effective_subscription_tier" ? "free" : true })),
    fetch: jest.fn().mockImplementation(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"line":"Read"}' }], stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 6 } }))),
    audit: jest.fn().mockResolvedValue(true),
  };
  return { deps, run: () => create(deps)(request) };
}
beforeAll(() => { Object.assign(globalThis, { Deno: { env: { get: () => "100" } } }); });
afterAll(() => { Reflect.deleteProperty(globalThis, "Deno"); });
test("uses shared spend and capacity gates and persists the existing audit schema", async () => {
  const f = fixture(); expect(await f.run()).toEqual({ line: "Read" });
  expect(f.deps.rpc).toHaveBeenCalledWith("bump_gemini_spend", expect.objectContaining({ p_user_id: "owner" }));
  expect(f.deps.rpc).toHaveBeenCalledWith("reserve_llm_proxy_capacity", expect.objectContaining({ p_provider: "claude" }));
  expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({ purpose: "daily_note", output_hash: expect.any(String), reasoning_vendor: "claude", vertex_backend: false, total_tokens: 10 }));
  expect(JSON.stringify(f.deps.audit.mock.calls)).not.toContain("Routine: Read");
});
test("missing model and stale consent cannot reach the provider", async () => {
  const f = fixture(); f.deps.model = ""; await expect(f.run()).rejects.toThrow("unavailable");
  f.deps.model = "claude-sonnet-test"; f.deps.rpc.mockResolvedValue({ data: { allowed: true, token: "b".repeat(64) } });
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
  expect(f.deps.fetch).toHaveBeenCalledTimes(1); expect(f.deps.audit).toHaveBeenCalledTimes(1);
  expect(f.deps.rpc.mock.calls.map(([name]) => name)).toContain("settle_llm_proxy_capacity");
  expect(f.deps.rpc.mock.calls.map(([name]) => name)).not.toContain("refund_gemini_spend");
});
test.each(["refusal", "max_tokens"])("%s response is never returned", async (stop_reason) => {
  const f = fixture(); f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: '{}' }], stop_reason })));
  await expect(f.run()).rejects.toThrow("unavailable");
});
test("audit failure withholds generated text", async () => {
  const f = fixture(); f.deps.audit.mockResolvedValue(false); await expect(f.run()).rejects.toThrow("unavailable");
});
test("a rejected unsafe output records the red classification in the audit", async () => {
  const f = fixture();
  f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ line: "kill myself" }) }], stop_reason: "end_turn" })));
  await expect(f.run()).rejects.toThrow("unavailable");
  expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({ safety_zone: "red" }));
});
test("changed age, source or deletion state at dispatch cannot make a paid call", async () => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!;
  f.deps.rpc.mockImplementation(async (name, args) => name === "dashboard_generation_dispatch" ? { data: false } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable"); expect(f.deps.fetch).not.toHaveBeenCalled();
  expect(f.deps.rpc).toHaveBeenCalledWith("release_llm_proxy_capacity", expect.anything());
});
test("post-dispatch consent change withholds and marks the one audit", async () => {
  const f = fixture(); const original = f.deps.rpc.getMockImplementation()!; let checks = 0;
  f.deps.rpc.mockImplementation(async (name, args) => name === "effective_llm_consent_snapshot_v2" && ++checks === 3 ? { data: { allowed: false, token: null } } : original(name, args));
  await expect(f.run()).rejects.toThrow("unavailable");
  expect(f.deps.audit).toHaveBeenCalledTimes(1);
  expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({ model_used: "claude-sonnet-test+consent_withheld" }));
});
