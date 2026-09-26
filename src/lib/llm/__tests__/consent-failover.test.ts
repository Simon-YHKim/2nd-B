const mockInvoke = jest.fn();
const mockAudit = jest.fn();
const mockFailoverVendor = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));
jest.mock("../audit-write-outbox", () => ({
  enqueueAuditWrite: (...args: unknown[]) => mockAudit(...args),
}));
jest.mock("../routing", () => ({
  ...jest.requireActual("../routing"),
  resolveVendorForPurpose: () => "openai",
  failoverVendor: () => mockFailoverVendor(),
}));
jest.mock("../safety", () => ({
  ...jest.requireActual("../safety"),
  classifySafety: jest.fn().mockResolvedValue({
    zone: "green", triggers: [], confidence: 0.4, cssrsLevel: null,
    source: "lexicon-fallback", routingTemplateVersion: "rcv1-2026-05-25",
  }),
}));
jest.mock("../../persona/load-domain-levels", () => ({
  loadDomainLevels: jest.fn().mockResolvedValue({ domainLevels: {}, northStarBrightness: 0.2 }),
}));
jest.mock("../../knowledge/retrieve", () => ({
  retrieveEvidence: jest.fn().mockResolvedValue({
    matchedBatches: [], rows: [], schemaContext: "", assembledPrompt: "SYSTEM: reflection",
  }),
}));
jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key",
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

import { callAdvisor, callLlm } from "../boundary";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";

const originalFetch = globalThis.fetch;
const mockFetch = jest.fn();
const message = "Today I planned my week and it felt productive.";
const session: AuthenticatedAccountSessionLease = {
  userId: "account-a", epoch: 1, accessToken: "fixture-captured-token",
  signal: new AbortController().signal,
  assertCurrent: jest.fn(), abort: jest.fn(), release: jest.fn(),
};
const cases = [
  { name: "callLlm", captured: false, run: () => callLlm({ userId: "account-a", locale: "en", purpose: "interview_probe", user: message }) },
  { name: "callLlm with captured session", captured: true, run: () => callLlm({ userId: "account-a", locale: "en", purpose: "interview_probe", user: message, session }) },
  { name: "callAdvisor", captured: false, run: () => callAdvisor({ userId: "account-a", locale: "en", userMessage: message }) },
];

function rejected(status: number, body: unknown) {
  const context = new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const error = Object.assign(new Error("proxy_request_failed"), { context });
  mockInvoke.mockResolvedValueOnce({ data: null, error });
  mockFetch.mockResolvedValueOnce(context);
  return context;
}

function success(audited = true) {
  const data = { text: "A useful reflection.", modelUsed: "fixture-model", audited };
  mockInvoke.mockResolvedValueOnce({ data, error: null });
  mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status: 200 }));
}

describe.each(cases)("$name consent failure boundary", ({ captured, run }) => {
  let warn: jest.SpyInstance;
  const calls = () => captured ? mockFetch.mock.calls.map(([url]) => String(url).split("/").pop()) : mockInvoke.mock.calls.map(([name]) => name);

  beforeEach(() => {
    mockInvoke.mockReset();
    mockFetch.mockReset();
    mockAudit.mockReset().mockResolvedValue(undefined);
    mockFailoverVendor.mockReset().mockReturnValue("claude");
    globalThis.fetch = mockFetch as typeof fetch;
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    warn.mockRestore();
  });

  test.each([
    [403, "consent_required"],
    [503, "consent_check_unavailable"],
  ])("HTTP %s %s cannot reach another provider", async (status, code) => {
    const context = rejected(status as number, { error: code, private_detail: "private fixture content" });
    success(); // Would succeed if the boundary accidentally retries.
    const error = await run().then(() => null, (failure: unknown) => failure);
    expect(error).toMatchObject({ name: "LlmConsentError", code, message: code });
    expect(error).not.toHaveProperty("context");
    expect(String(error)).not.toContain("private fixture content");
    expect(calls()).toEqual(["openai-proxy"]);
    expect(mockAudit).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(context.bodyUsed).toBe(false);
  });

  test.each([
    [403, { error: "tier_required" }],
    [503, { error: "upstream_unavailable" }],
    [500, { error: "provider_error" }],
    [403, { error: { code: "consent_required" } }],
  ])("unrelated HTTP %s failures retain one failover", async (status, body) => {
    rejected(status, body);
    success();
    await expect(run()).resolves.toMatchObject({ text: "A useful reflection." });
    expect(calls()).toEqual(["openai-proxy", "claude-proxy"]);
    expect(mockAudit).not.toHaveBeenCalled(); // Server audited; never duplicate.
  });

  test("unreadable denial body preserves the existing transport fallback", async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { context: new Response("unreadable", { status: 403 }) } });
    mockFetch.mockResolvedValueOnce(new Response("unreadable", { status: 403 }));
    success(false);
    await expect(run()).resolves.toMatchObject({ text: "A useful reflection." });
    expect(calls()).toEqual(["openai-proxy", "claude-proxy"]);
    expect(mockAudit).toHaveBeenCalledTimes(1); // Existing client audit fallback.
  });

  test("a consent rejection on the retry remains typed and produces no success audit", async () => {
    rejected(503, { error: "upstream_unavailable" });
    rejected(403, { error: "consent_required" });
    await expect(run()).rejects.toMatchObject({ name: "LlmConsentError", code: "consent_required" });
    expect(calls()).toEqual(["openai-proxy", "claude-proxy"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("consent remains typed when failover is disabled", async () => {
    mockFailoverVendor.mockReturnValue("none");
    rejected(503, { error: "consent_check_unavailable" });
    await expect(run()).rejects.toMatchObject({ name: "LlmConsentError", code: "consent_check_unavailable" });
    expect(calls()).toEqual(["openai-proxy"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
