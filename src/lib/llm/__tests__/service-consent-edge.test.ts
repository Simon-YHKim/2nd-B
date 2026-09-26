import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const userId = "11111111-1111-4111-8111-111111111111";
const changeToken = "c".repeat(64);
const requiredAcks = { service: true, llmProcessing: true, overseasTransfer: true, sensitiveData: true, safetyNotice: true };
const status = {
  contract_revision: "service-v1", consent_version: "2026-09-07", policy_version: "2026-09-26", terms_version: "2026-08-16",
  state: "uncovered", change_token: changeToken, can_grant: true,
};
const compiled = new Map<string, string>();

function host(mode: string | null = "collect", oldRequired = false) {
  let handler!: (req: Request) => Promise<Response>;
  let rpcResult: { data?: unknown; error?: unknown } | undefined;
  let throws = false;
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    if (throws) throw new Error("private database token/body");
    if (rpcResult) return rpcResult;
    if (name === "llm_service_consent_status") return { data: status };
    if (name === "write_llm_service_consent") return { data: { ...status, state: args.p_action === "grant" ? "granted" : "revoked", created: true } };
    throw new Error(`Unexpected local RPC ${name}`);
  });
  const createClient = jest.fn(() => ({ rpc }));
  const fetch = jest.fn(() => { throw new Error("Management must never call a model or fetch"); });
  const env = (name: string) => name === "LLM_CONSENT_MODE" ? mode ?? undefined
    : name === "LLM_REQUIRE_VERIFIED_CONSENT" ? String(oldRequired)
      : name === "SUPABASE_URL" ? "https://fixture.invalid" : name === "SUPABASE_SERVICE_ROLE_KEY" ? "fixture-service-key" : undefined;
  const modules = new Map<string, Record<string, unknown>>();
  function load(file: string): Record<string, unknown> {
    if (modules.has(file)) return modules.get(file)!;
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText);
    const exports: Record<string, unknown> = {};
    modules.set(file, exports);
    new Function("exports", "require", "Deno", "fetch", compiled.get(file)!)(exports, (name: string) => {
      if (name === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
      if (name === "jsr:@supabase/supabase-js@2") return { createClient };
      if (!name.startsWith(".")) throw new Error(`Unexpected external module ${name}`);
      return load(resolve(dirname(file), name));
    }, { env: { get: env }, serve: (fn: typeof handler) => { handler = fn; } }, fetch);
    return exports;
  }
  load(resolve(process.cwd(), "supabase/functions/service-consent/index.ts"));
  const jwt = (role: string, sub: string) => `Bearer fixture.${Buffer.from(JSON.stringify({ role, sub })).toString("base64url")}.fixture`;
  return {
    rpc, createClient, fetch,
    run: (body: unknown = { action: "status" }, authorization: string | null = jwt("authenticated", userId), method = "POST") => {
      const headers = new Headers({ "content-type": "application/json", origin: "http://localhost:8081" });
      if (authorization !== null) headers.set("authorization", authorization);
      return handler(new Request("https://fixture.invalid/service-consent", { method, headers, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }));
    },
    jwt,
    result: (data: unknown) => { rpcResult = { data }; },
    error: (code: string, message: string) => { rpcResult = { error: { code, message, details: "private body/token" } }; },
    throwRpc: () => { throws = true; },
  };
}

const grant = { action: "grant", contractRevision: "service-v1", expectedChangeToken: changeToken, requiredAcks, locale: "ko" };
const revoke = { ...grant, action: "revoke", requiredAcks: {} };

describe("service consent management Edge", () => {
  it("pins gateway JWT verification for the claim-only helper", () => {
    expect(readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8")).toMatch(/\[functions\.service-consent\]\s*(?:#[^\n]*\n)*verify_jwt\s*=\s*true/);
  });
  it.each(["collect", "enforce"])("returns an allowlisted status in %s without provider work", async (mode) => {
    const fixture = host(mode); const response = await fixture.run();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode, ...status });
    expect(fixture.rpc).toHaveBeenCalledWith("llm_service_consent_status", { p_user_id: userId });
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each([null, "off", "typo", ""])("never advertises management or writes while mode is %s", async (mode) => {
    const fixture = host(mode);
    for (const body of [{ action: "status" }, grant, revoke]) expect((await fixture.run(body)).status).toBe(503);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("keeps the old true flag strict even when collect/off is requested", async () => {
    for (const mode of [null, "off", "collect"]) {
      const fixture = host(mode, true);
      expect(await (await fixture.run()).json()).toEqual({ mode: "enforce", ...status });
    }
  });
  it("rejects missing, anonymous and malformed claims before touching the database", async () => {
    const fixture = host();
    for (const auth of [null, "Bearer malformed", fixture.jwt("anon", userId), fixture.jwt("authenticated", "")]) {
      expect((await fixture.run({ action: "status" }, auth)).status).toBe(401);
    }
    expect(fixture.createClient).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("handles CORS and unsupported methods without writes", async () => {
    const fixture = host();
    const preflight = await fixture.run(undefined, null, "OPTIONS");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
    expect((await fixture.run(undefined, null, "GET")).status).toBe(405);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it.each([grant, revoke])("uses one atomic server writer for $action, with JWT owner and CAS", async (body) => {
    const fixture = host(); const response = await fixture.run(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "collect", ...status, state: body.action === "grant" ? "granted" : "revoked", created: true });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith("write_llm_service_consent", {
      p_user_id: userId, p_contract_revision: "service-v1", p_expected_change_token: changeToken,
      p_action: body.action, p_required_acks: body.requiredAcks, p_locale: "ko",
    });
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each([
    {}, [], "not JSON", { action: "delete" }, { action: "status", userId: "other-owner" }, { ...grant, user_id: "other-owner" },
    { ...grant, policy_version: "forged" }, { ...grant, contractRevision: "email-v4" }, { ...grant, expectedChangeToken: "bad" },
    { ...grant, locale: "xx" }, { ...grant, requiredAcks: { ...requiredAcks, llmProcessing: false } },
    { ...grant, requiredAcks: { ...requiredAcks, extra: true } }, { ...grant, requiredAcks: {} },
    { ...revoke, requiredAcks }, { ...revoke, consentVersion: "forged" },
  ])("rejects unknown/forged or incomplete input before a write: %j", async (body) => {
    const fixture = host(); expect((await fixture.run(body)).status).toBe(400);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("bounds even an undeclared chunked request body before RPC", async () => {
    const fixture = host();
    expect((await fixture.run(JSON.stringify({ ...grant, padding: "x".repeat(4096) }))).status).toBe(413);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["40001", "llm_service_consent_changed", 409, "service_consent_changed"],
    ["22023", "llm_service_consent_contract_changed", 409, "service_consent_contract_changed"],
    ["22023", "private unknown input", 400, "invalid_request"],
    ["42501", "private ineligible reason", 403, "service_consent_ineligible"],
    ["P0001", "private database error", 503, "service_consent_unavailable"],
  ])("maps %s safely and never retries a rejected CAS", async (code, message, expectedStatus, expectedError) => {
    const fixture = host(); fixture.error(code as string, message as string);
    const response = await fixture.run(grant);
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ error: expectedError });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], { ...status, state: "anything" }, { ...status, change_token: "bad" }, { ...status, email: "private@example.invalid" }, { ...status, can_grant: "true" }])("rejects response drift without reflecting database contents", async (value) => {
    const fixture = host(); fixture.result(value);
    const response = await fixture.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "service_consent_unavailable" });
  });
  it("survives thrown errors and a non-atomic writer result without success", async () => {
    const fixture = host(); fixture.throwRpc();
    expect(await (await fixture.run(grant)).json()).toEqual({ error: "service_consent_unavailable" });
    const missingCreated = host(); missingCreated.result({ ...status, state: "granted" });
    expect((await missingCreated.run(grant)).status).toBe(503);
  });
});
