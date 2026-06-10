// C9 fallback regression tests (2026-06-10 audit follow-up).
//
// The gemini-proxy Edge Function is the second, server-authoritative crisis
// gate: it rejects red-zone `user` input with HTTP 422
// { error: "safety_red_zone" } BEFORE any Gemini call. When the client
// lexicon missed the phrasing (proxy-only hit), callGemini/callAdvisor used
// to rethrow the raw FunctionsHttpError — the caller showed a generic
// failure modal to a user in crisis instead of hotline routing.
//
// These tests pin the fallback: a proxy 422 crisis rejection must produce
// the same RED result shape as a client-side catch (hotline text, audit row,
// crisis_events row tagged proxy_input_red), while genuinely different
// errors keep throwing.

const mockInvoke = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

// Mock ONLY classifySafety (Advisor input/output classifier). classifyInput
// (the lexicon C9 gate) stays real — these tests use benign input text so the
// client gate passes and the proxy is the one that catches.
jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return { ...actual, classifySafety: (...args: unknown[]) => mockClassifySafety(...args) };
});

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

// Retrieval is not under test here (advisor-edge.test.ts covers prompt
// assembly) — stub it so callAdvisor reaches the proxy invoke.
jest.mock("../../knowledge/retrieve", () => ({
  retrieveEvidence: jest.fn().mockResolvedValue({
    matchedBatches: [],
    rows: [],
    schemaContext: "",
    assembledPrompt: "SYSTEM: test prompt",
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
    EXPO_PUBLIC_POSTHOG_KEY: undefined,
    EXPO_PUBLIC_POSTHOG_HOST: undefined,
  }),
}));

import { callAdvisor, callGemini } from "../gemini";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";

const auditMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const crisisMock = insertCrisisEvent as jest.MockedFunction<typeof insertCrisisEvent>;

const GREEN = {
  zone: "green" as const,
  triggers: [] as string[],
  confidence: 0.4,
  cssrsLevel: null,
  source: "llm" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};

// FunctionsHttpError shape: supabase-js attaches the rejected Response as
// error.context. A plain object with status + json() mirrors what the SDK
// hands the caller (and what a mocked invoke returns in the other suites).
function proxy422(body: unknown): { context: { status: number; json: () => Promise<unknown> } } {
  return { context: { status: 422, json: async () => body } };
}

const BENIGN_EN = "Today I planned my week and it felt productive.";

describe("callGemini — proxy 422 crisis fallback (C9 follow-up)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockClassifySafety.mockReset();
    auditMock.mockClear();
    crisisMock.mockClear();
  });

  test("proxy-only crisis hit routes to the hotline instead of throwing", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: proxy422({ error: "safety_red_zone", reason: "crisis_term_detected" }),
    });

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "interview_probe",
      user: BENIGN_EN,
    });

    expect(r.safety.zone).toBe("red");
    expect(r.text).toMatch(/988/);
    expect(r.safety.crisisRouting?.number).toBe("988");
    // C3: the proxy does NOT audit its 422 rejection, so the client row is
    // the only record — it must exist and be marked crisis-routed.
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]!.modelUsed).toBe("none-crisis-routed");
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("red");
    // Restricted ledger: tagged as the server-gate catch, not input_red.
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("proxy_input_red");
  });

  test("KO minor routing surfaces the youth line first (1388 then 109)", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: proxy422({ error: "safety_red_zone", reason: "crisis_term_detected" }),
    });

    const r = await callGemini({
      userId: "u1",
      locale: "ko",
      minor: true,
      purpose: "interview_probe",
      user: "오늘 하루를 정리해 봤어요.",
    });

    expect(r.safety.zone).toBe("red");
    expect(r.text).toMatch(/1388 또는 109/);
    expect(r.safety.crisisRouting?.hotline).toBe("KR_1388");
  });

  test("a non-422 proxy error still throws", async () => {
    const boom = { context: { status: 500, json: async () => ({ error: "upstream" }) } };
    mockInvoke.mockResolvedValueOnce({ data: null, error: boom });

    await expect(
      callGemini({ userId: "u1", locale: "en", purpose: "interview_probe", user: BENIGN_EN }),
    ).rejects.toBe(boom);
    expect(crisisMock).not.toHaveBeenCalled();
  });

  test("a 422 with a DIFFERENT readable marker still throws (future non-crisis 422)", async () => {
    const other = proxy422({ error: "schema_invalid" });
    mockInvoke.mockResolvedValueOnce({ data: null, error: other });

    await expect(
      callGemini({ userId: "u1", locale: "en", purpose: "interview_probe", user: BENIGN_EN }),
    ).rejects.toBe(other);
    expect(crisisMock).not.toHaveBeenCalled();
  });

  test("a 422 with an unreadable body routes conservatively (crisis)", async () => {
    const unreadable = {
      context: {
        status: 422,
        json: async () => {
          throw new Error("body already consumed");
        },
      },
    };
    mockInvoke.mockResolvedValueOnce({ data: null, error: unreadable });

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "interview_probe",
      user: BENIGN_EN,
    });

    expect(r.safety.zone).toBe("red");
    expect(crisisMock).toHaveBeenCalledTimes(1);
  });
});

describe("callAdvisor — proxy 422 crisis fallback (C9 follow-up)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockClassifySafety.mockReset();
    auditMock.mockClear();
    crisisMock.mockClear();
  });

  test("proxy-only crisis hit returns the fixed template, never the raw error", async () => {
    mockClassifySafety.mockResolvedValueOnce(GREEN); // client input gate passes
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: proxy422({ error: "safety_red_zone", reason: "crisis_term_detected" }),
    });

    const r = await callAdvisor({ userId: "u1", locale: "en", userMessage: BENIGN_EN });

    expect(r.zone).toBe("red");
    expect(r.fixedTemplate).toBe(true);
    expect(r.text).toMatch(/988/);
    expect(r.triggers).toContain("proxy_input_red");
    expect(r.cssrsLevel).toBeNull();
    // Client bookkeeping is the only record (proxy never audited the 422).
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]!.modelUsed).toMatch(/^none-crisis-routed-proxy:/);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("proxy_input_red");
  });

  test("a non-422 proxy error still throws", async () => {
    mockClassifySafety.mockResolvedValueOnce(GREEN);
    const boom = { context: { status: 503, json: async () => ({ error: "unavailable" }) } };
    mockInvoke.mockResolvedValueOnce({ data: null, error: boom });

    await expect(
      callAdvisor({ userId: "u1", locale: "en", userMessage: BENIGN_EN }),
    ).rejects.toBe(boom);
    expect(crisisMock).not.toHaveBeenCalled();
  });
});
