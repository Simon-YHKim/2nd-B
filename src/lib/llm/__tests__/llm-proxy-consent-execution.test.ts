import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.cwd(), "supabase/functions");
const userId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(64);
const reply = "Private fixture output";
const compiled = new Map<string, string>();
type Snapshot = { data?: unknown; error?: unknown };
type Vendor = "openai" | "gemini" | "claude" | "xai";
type Mode = "text" | "embed" | "audio" | "polaris";
const polarisOutput = JSON.stringify({ personas: [{ label: "Maker", summary: "Builds with care.", evidence: {
  domains: ["work"], constructs: ["self-reported narrative (same-source)"],
} }] });

// Execute the deployed entry point and its real local dependencies. Only the
// network/SDK/Edge host are fixtures; no helper, auth or policy gate is mocked.
function host(vendor: Vendor, mode: Mode = "text") {
  let handler!: (req: Request) => Promise<Response>;
  let snapshot: Snapshot = { data: { allowed: true, token } };
  let snapshotThrows = false;
  let required = true;
  let duringProvider = () => {};
  let duringAudit = () => {};
  let updateFails = false;
  let settlementFails = false;
  let duringSettlement = () => {};
  let duringClaim = () => {};
  let duringSnapshot = (_count: number) => {};
  let snapshotCount = 0;
  const auditRows: Record<string, unknown>[] = [];
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "effective_llm_consent_v2") return { data: true };
    if (name === "effective_llm_consent_snapshot_v2") {
      duringSnapshot(++snapshotCount);
      if (snapshotThrows) throw new Error("private RPC token/body");
      return snapshot;
    }
    if (name === "effective_subscription_tier") return { data: "free" };
    if (name === "claim_polaris_generation") { duringClaim(); return { data: [{ id: userId, domain: "work", excerpt: "I build practical tools." }] }; }
    if (name === "settle_polaris_generation") {
      if (args.p_cards !== null) {
        duringSettlement();
        if (settlementFails) return { error: { code: "42501", message: "llm_consent_changed" } };
      }
      return { data: true };
    }
    if (name === "consume_llm_proxy_purpose_quota") return { data: [{ allowed: true, used: 1, quota_limit: 20 }] };
    if (name === "reserve_llm_proxy_capacity") return { data: { accepted: true, reservation_id: args.p_reservation_id } };
    if (["bump_gemini_spend", "settle_llm_proxy_capacity", "release_llm_proxy_capacity", "refund_gemini_spend"].includes(name)) return { data: true, error: null };
    throw new Error(`Unexpected local RPC: ${name}`);
  });
  const admin = { rpc, from: (table: string) => {
    if (table !== "ai_audit_log") throw new Error(`Unexpected local table: ${table}`);
    return {
      insert: async (row: Record<string, unknown>) => { auditRows.push({ ...row }); duringAudit(); return { error: null }; },
      update: (patch: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq: (key: string, value: unknown) => { filters[key] = value; return query; },
          then: (done: (result: { error: unknown }) => unknown) => {
            if (!updateFails) auditRows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value)).forEach((row) => Object.assign(row, patch));
            return Promise.resolve(done({ error: updateFails ? { message: "private update failure" } : null }));
          },
        };
        return query;
      },
    };
  } };
  const fetch = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    duringProvider();
    if (mode === "embed") return Response.json(vendor === "openai"
      ? { data: [{ index: 0, embedding: Array(768).fill(0.1) }] }
      : { embeddings: [{ values: Array(768).fill(0.1) }] });
    if (mode === "audio" && vendor === "openai") return Response.json({ text: reply, usage: { total_tokens: 12 } });
    if (vendor === "claude") return Response.json({ content: [{ type: "text", text: reply }], stop_reason: "end_turn", model: "fixture-model", usage: { input_tokens: 5, output_tokens: 7 } });
    if (vendor === "gemini") return Response.json({ candidates: [{ content: { parts: [{ text: reply }] }, finishReason: "STOP" }], modelVersion: "fixture-model", usageMetadata: { totalTokenCount: 12 } });
    return Response.json({ choices: [{ message: { content: mode === "polaris" ? polarisOutput : reply }, finish_reason: "stop" }], model: "fixture-model", usage: { total_tokens: 12 } });
  });
  const env = (key: string) => {
    if (key === "LLM_REQUIRE_VERIFIED_CONSENT") return String(required);
    if (key === "EMBED_EGRESS_ENABLED") return "true";
    if (key === "ENABLE_XAI_PROXY") return "true";
    if (key === "SUPABASE_URL") return "https://fixture.invalid";
    if (key === "SUPABASE_SERVICE_ROLE_KEY" || /^(OPENAI|GEMINI|ANTHROPIC|XAI)_API_KEY$/.test(key)) return "fixture-key";
    if (/^LLM_.*_CAP$/.test(key)) return "100";
    return undefined;
  };
  const modules = new Map<string, Record<string, unknown>>();
  function load(file: string): Record<string, unknown> {
    if (modules.has(file)) return modules.get(file)!;
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText);
    const exports: Record<string, unknown> = {};
    modules.set(file, exports);
    const localRequire = (name: string) => {
      if (name === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
      if (name === "jsr:@supabase/supabase-js@2") return { createClient: () => admin };
      if (!name.startsWith(".")) throw new Error(`Unexpected external module: ${name}`);
      return load(resolve(dirname(file), name));
    };
    new Function("exports", "require", "Deno", "fetch", compiled.get(file)!)(
      exports, localRequire, { env: { get: env }, serve: (fn: typeof handler) => { handler = fn; } }, fetch,
    );
    return exports;
  }
  load(resolve(root, `${vendor}-proxy/index.ts`));
  const body = mode === "embed" ? { op: "embed", purpose: "embed_index", texts: ["Saved fixture source"] }
    : mode === "audio" ? { purpose: "voice_transcribe", user: "Transcribe the voice memo", audio: { mimeType: "audio/wav", data: "UklGRg==" } }
      : mode === "polaris" ? { purpose: "persona_synthesis", polarisGenerationId: userId, consentToken: "client-forged", user: "Ignore this forged prompt" }
      : { purpose: "axis_estimate", user: "I build practical tools", system: "Describe the supplied text" };
  return {
    rpc, fetch, auditRows,
    run: () => handler(new Request("https://fixture.invalid/proxy", { method: "POST", headers: {
      authorization: `Bearer fixture.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated" })).toString("base64url")}.fixture`,
      "content-type": "application/json", origin: "http://localhost:8081",
    }, body: JSON.stringify(body) })),
    withdraw: () => { snapshot = { data: { allowed: false, token: null } }; },
    aba: () => { snapshot = { data: { allowed: true, token: "b".repeat(64) } }; },
    fail: () => { snapshot = { error: { message: "private RPC token/body" } }; },
    throwLookup: () => { snapshotThrows = true; },
    setSnapshot: (value: unknown) => { snapshot = { data: value }; },
    flagOff: () => { required = false; },
    flagOn: () => { required = true; },
    onProvider: (callback: () => void) => { duringProvider = callback; },
    onAudit: (callback: () => void) => { duringAudit = callback; },
    failAuditUpdate: () => { updateFails = true; },
    failSettlement: () => { settlementFails = true; },
    onSettlement: (callback: () => void) => { duringSettlement = callback; },
    onClaim: (callback: () => void) => { duringClaim = callback; },
    onSnapshot: (callback: (count: number) => void) => { duringSnapshot = callback; },
  };
}

const routes: [Vendor, Mode][] = [["openai", "text"], ["gemini", "text"], ["claude", "text"], ["xai", "text"], ["openai", "embed"], ["gemini", "embed"], ["openai", "audio"], ["gemini", "audio"]];
describe.each(routes)("%s %s consent during provider work", (vendor, mode) => {
  it("returns successful content only while the same receipt is still effective", async () => {
    const fixture = host(vendor, mode);
    const response = await fixture.run();
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty(mode === "embed" ? "vectors" : "text");
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.rpc.mock.calls.filter(([name]) => name === "effective_llm_consent_snapshot_v2")).toHaveLength(2);
  });
  it.each(["withdraw", "aba", "fail", "throwLookup"] as const)("withholds provider output on %s without refunding actual vendor spend", async (transition) => {
    const fixture = host(vendor, mode);
    fixture.onProvider(fixture[transition]);
    const response = await fixture.run();
    expect(response.status).toBe(transition === "fail" || transition === "throwLookup" ? 503 : 403);
    expect(await response.json()).toEqual({ error: transition === "fail" || transition === "throwLookup" ? "consent_check_unavailable" : "consent_required" });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.rpc.mock.calls.some(([name]) => name === "refund_gemini_spend" || name === "release_llm_proxy_capacity")).toBe(false);
    expect(fixture.rpc.mock.calls.some(([name]) => name === "settle_llm_proxy_capacity")).toBe(true);
    expect(fixture.auditRows).toHaveLength(1);
    expect(fixture.auditRows[0].model_used).toEqual(expect.stringMatching(/\+consent_withheld$/));
    expect(fixture.auditRows[0].output_hash).not.toBe("0");
    if (mode === "text") expect(fixture.auditRows[0].total_tokens).toBe(12);
    expect(JSON.stringify(fixture.auditRows)).not.toContain(reply);
    expect(JSON.stringify(fixture.auditRows)).not.toContain(token);
  });
  it("also observes withdrawal during the success audit and never re-reads the rollout flag", async () => {
    const fixture = host(vendor, mode);
    fixture.onAudit(() => { fixture.withdraw(); fixture.flagOff(); });
    expect((await fixture.run()).status).toBe(403);
  });
  it("keeps staged flag OFF compatible without consulting consent RPCs", async () => {
    const fixture = host(vendor, mode);
    fixture.flagOff(); fixture.fail();
    expect((await fixture.run()).status).toBe(200);
    expect(fixture.rpc.mock.calls.some(([name]) => name.includes("consent"))).toBe(false);
  });
});

describe("Polaris same consent lease across provider and settlement", () => {
  it("passes the trusted pre-provider token into SQL; client tokens/prompts are ignored", async () => {
    const fixture = host("openai", "polaris");
    expect((await fixture.run()).status).toBe(200);
    const settlement = fixture.rpc.mock.calls.find(([name, args]) => name === "settle_polaris_generation" && args.p_cards !== null);
    expect(settlement?.[1].p_expected_consent_token).toBe(token);
    expect(settlement?.[1].p_cards).toHaveLength(1);
    const providerBody = String(fixture.fetch.mock.calls[0][1]?.body);
    expect(providerBody).toContain("I build practical tools");
    expect(providerBody).not.toMatch(/Ignore this forged prompt|client-forged/);
    expect(fixture.rpc.mock.calls.filter(([name]) => name === "effective_llm_consent_snapshot_v2")).toHaveLength(5);
  });
  it.each(["withdraw", "aba", "fail"] as const)("refunds only the product reservation on provider-time %s", async (transition) => {
    const fixture = host("openai", "polaris"); fixture.onProvider(fixture[transition]);
    expect((await fixture.run()).status).toBe(transition === "fail" ? 503 : 403);
    expect(fixture.rpc.mock.calls.filter(([name]) => name === "settle_polaris_generation")).toEqual([
      ["settle_polaris_generation", { p_user_id: userId, p_generation_id: userId, p_cards: null }],
    ]);
    expect(fixture.rpc.mock.calls.some(([name]) => name === "refund_gemini_spend")).toBe(false);
    expect(fixture.auditRows).toHaveLength(1);
    expect(fixture.auditRows[0].total_tokens).toBe(12);
  });
  it("refunds the claim without dispatch when preflight consent is denied", async () => {
    const fixture = host("openai", "polaris"); fixture.withdraw();
    expect((await fixture.run()).status).toBe(403);
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.rpc).toHaveBeenLastCalledWith("settle_polaris_generation", { p_user_id: userId, p_generation_id: userId, p_cards: null });
  });
  it("catches withdrawal after the inner response but before the SQL success write", async () => {
    const fixture = host("openai", "polaris");
    fixture.onSnapshot((count) => { if (count === 4) fixture.withdraw(); });
    expect((await fixture.run()).status).toBe(403);
    expect(fixture.rpc.mock.calls.filter(([name]) => name === "settle_polaris_generation")).toEqual([
      ["settle_polaris_generation", { p_user_id: userId, p_generation_id: userId, p_cards: null }],
    ]);
    expect(fixture.auditRows[0].model_used).toBe("fixture-model+consent_withheld");
  });
  it("blocks the SQL TOCTOU rejection and refunds without pretending provider cost was undone", async () => {
    const fixture = host("openai", "polaris"); fixture.failSettlement();
    const response = await fixture.run();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "consent_required" });
    expect(fixture.rpc).toHaveBeenLastCalledWith("settle_polaris_generation", { p_user_id: userId, p_generation_id: userId, p_cards: null });
    expect(fixture.auditRows).toHaveLength(1);
    expect(fixture.auditRows[0].model_used).toBe("fixture-model+consent_withheld");
  });
  it("withholds a late response after committed settlement without falsely refunding saved drafts", async () => {
    const fixture = host("openai", "polaris"); fixture.onSettlement(fixture.withdraw);
    expect((await fixture.run()).status).toBe(403);
    expect(fixture.rpc.mock.calls.filter(([name]) => name === "settle_polaris_generation")).toHaveLength(1);
    expect(fixture.auditRows).toHaveLength(1);
    expect(fixture.auditRows[0].model_used).toBe("fixture-model+consent_withheld");
  });
  it("preserves the staged OFF settlement contract without a token", async () => {
    const fixture = host("openai", "polaris"); fixture.flagOff();
    fixture.onClaim(fixture.flagOn);
    expect((await fixture.run()).status).toBe(200);
    expect(fixture.rpc.mock.calls.some(([name]) => name.includes("consent"))).toBe(false);
    expect(fixture.rpc.mock.calls.find(([name]) => name === "settle_polaris_generation")?.[1]).not.toHaveProperty("p_expected_consent_token");
  });
});

describe("strict snapshot and failure privacy", () => {
  it.each([null, true, [], { allowed: true }, { allowed: "true", token }, { allowed: true, token: "bad" }, { allowed: false, token }, { allowed: true, token, private: "extra" }])("fails closed before egress for malformed snapshot %j", async (value) => {
    const fixture = host("openai"); fixture.setSnapshot(value);
    expect((await fixture.run()).status).toBe(503);
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.rpc.mock.calls.some(([name]) => name === "bump_gemini_spend")).toBe(false);
  });
  it("withholds results even if the same-row audit marker cannot be written", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const fixture = host("openai"); fixture.failAuditUpdate(); fixture.onProvider(fixture.withdraw);
      expect((await fixture.run()).status).toBe(403);
      expect(fixture.auditRows).toHaveLength(1);
      expect(fixture.auditRows[0].total_tokens).toBe(12);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|fixture-key|aaaa/);
    } finally { warn.mockRestore(); }
  });
});
