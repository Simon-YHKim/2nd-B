// D-26 Phase 2 — LIVE edge-path wiring for purpose-keyed vendor routing.
//
// vendor-routing.test.ts covers the pure routing module; this suite pins the
// gemini.ts wiring itself (the part verify-green says nothing about):
//   - a Phase 2 seat call actually reaches supabase.functions.invoke with
//     "openai-proxy" and carries the D-26 effort in the body,
//   - the D-26 outage failover retries ONCE via gemini-proxy on a non-crisis
//     vendor error, and the audit row records the backend that actually
//     served (reasoningProvider:"gemini", proxy-reported model id),
//   - a vendor-proxy crisis 422 still routes to the hotline (never retried),
//   - Phase 1 stays byte-identical (gemini-proxy, no effort on flash),
//   - the OCR pin holds on the edge path in Phase 2.

const mockInvoke = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

// classifySafety (semantic output re-scan) is mocked GREEN; classifyInput
// (the lexicon C9 gate) stays real — inputs here are benign.
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

import { callGemini, embedTexts } from "../gemini";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";
import { resetAuditWriteOutboxForTests } from "../audit-write-outbox";
import type { AuditMeta } from "../types";

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

const BENIGN = "Numbers say self 60, others 72 — read the gap for me.";

function okPayload(modelUsed: string) {
  return { data: { text: "A gentle gap note.", modelUsed, audited: true }, error: null };
}

describe("D-26 vendor routing — live edge-path wiring", () => {
  beforeEach(async () => {
    await resetAuditWriteOutboxForTests();
    mockInvoke.mockReset();
    mockClassifySafety.mockReset();
    mockClassifySafety.mockResolvedValue(GREEN);
    auditMock.mockClear();
    crisisMock.mockClear();
    process.env.EXPO_PUBLIC_LLM_PHASE = "2";
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_LLM_PHASE;
  });

  test("Phase 2 seat call reaches openai-proxy with the D-26 effort", async () => {
    mockInvoke.mockResolvedValueOnce(okPayload("gpt-5.4"));

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "gap_synthesize",
      user: BENIGN,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0]!;
    expect(fn).toBe("openai-proxy");
    expect(opts.body.purpose).toBe("gap_synthesize");
    expect(opts.body.effort).toBe("low");
    const audit = r.audit as AuditMeta;
    expect(audit.reasoningProvider).toBe("openai");
    // C3 honesty: the row carries the proxy-reported vendor model, never the
    // client-side Gemini id.
    expect(audit.modelUsed).toBe("gpt-5.4");
    expect(audit.effort).toBe("low");
  });

  test("EXPO_PUBLIC_LLM_VENDOR=claude routes a seat through claude-proxy", async () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    try {
      mockInvoke.mockResolvedValueOnce(okPayload("claude-sonnet-5"));
      const r = await callGemini({ userId: "u1", locale: "en", purpose: "gap_synthesize", user: BENIGN });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke.mock.calls[0]![0]).toBe("claude-proxy");
      const audit = r.audit as AuditMeta;
      expect(audit.reasoningProvider).toBe("claude");
      expect(audit.modelUsed).toBe("claude-sonnet-5");
    } finally {
      delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    }
  });

  test("vendor outage fails over ONCE to gemini-proxy and audits the real backend", async () => {
    const boom = { context: { status: 500, json: async () => ({ error: "upstream" }) } };
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: boom })
      .mockResolvedValueOnce(okPayload("gemini-2.5-flash"));

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "gap_synthesize",
      user: BENIGN,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke.mock.calls[0]![0]).toBe("openai-proxy");
    expect(mockInvoke.mock.calls[1]![0]).toBe("gemini-proxy");
    // Same body on the retry (the Phase 1 route serves the same contract).
    expect(mockInvoke.mock.calls[1]![1].body).toEqual(mockInvoke.mock.calls[0]![1].body);
    const audit = r.audit as AuditMeta;
    expect(audit.reasoningProvider).toBe("gemini");
    expect(audit.modelUsed).toBe("gemini-2.5-flash");
  });

  test("an openai-proxy crisis 422 routes to the hotline and is NEVER retried", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: {
          status: 422,
          json: async () => ({ error: "safety_red_zone", reason: "crisis_term_detected" }),
        },
      },
    });

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "gap_synthesize",
      user: BENIGN,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1); // no failover on a crisis gate
    expect(r.safety.zone).toBe("red");
    expect(r.text).toMatch(/988/);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("proxy_input_red");
  });

  test("Phase 1 stays byte-identical: gemini-proxy, no effort on a flash purpose", async () => {
    delete process.env.EXPO_PUBLIC_LLM_PHASE;
    mockInvoke.mockResolvedValueOnce(okPayload("gemini-2.5-flash"));

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "gap_synthesize",
      user: BENIGN,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0]!;
    expect(fn).toBe("gemini-proxy");
    expect(opts.body.effort).toBeUndefined();
    const audit = r.audit as AuditMeta;
    expect(audit.effort).toBeUndefined();
    expect(audit.reasoningProvider).toBeUndefined();
  });

  test("embedTexts routes via gemini-proxy op:embed on the edge build (one batched call)", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { vectors: [[0.1, 0.2], [0.3, 0.4]], modelUsed: "gemini-embedding-2", audited: true },
      error: null,
    });

    const r = await embedTexts({ userId: "u1", texts: ["alpha", "beta"], locale: "en" });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0]!;
    expect(fn).toBe("gemini-proxy");
    expect(opts.body).toEqual({ op: "embed", texts: ["alpha", "beta"], purpose: "embed_index" });
    expect(r.vectors).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(r.audit.modelUsed).toBe("gemini-embedding-2");
  });

  test("owner pin: capture_ocr goes to gemini-proxy even in Phase 2", async () => {
    mockInvoke.mockResolvedValueOnce(okPayload("gemini-2.5-flash"));

    await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "capture_ocr",
      user: "Transcribe this image.",
      image: { mimeType: "image/png", data: "aGk=" },
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]![0]).toBe("gemini-proxy");
    expect(mockInvoke.mock.calls[0]![1].body.effort).toBeUndefined();
  });
});
