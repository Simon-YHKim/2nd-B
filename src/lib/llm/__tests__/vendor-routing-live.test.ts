// D-26 Phase 2 — LIVE edge-path wiring for purpose-keyed vendor routing.
//
// vendor-routing.test.ts covers the pure routing module; this suite pins the
// boundary.ts wiring itself (the part verify-green says nothing about):
//   - a Phase 2 seat call actually reaches supabase.functions.invoke with
//     "openai-proxy" and carries the D-26 effort in the body,
//   - the D-26 outage failover is OFF while EXPO_PUBLIC_FAILOVER_VENDOR is
//     unset (T1 stage A, 2026-08-31: failoverVendor() → "none"), so the
//     primary's own error surfaces; pointed at gemini it still retries ONCE
//     via gemini-proxy and the audit row records the backend that actually
//     served (reasoningProvider:"gemini", proxy-reported model id),
//   - a vendor-proxy crisis 422 still routes to the hotline and is never
//     retried, even with a failover target available,
//   - Phase 1 is no longer gemini: every unset switch lands on openai
//     (RETIRED_DEFAULT), so a PHASE-unset seat call goes to openai-proxy with
//     its D-26 effort. Explicit EXPO_PUBLIC_LLM_VENDOR=gemini is the
//     one-variable rollback and must still land on gemini-proxy,
//   - embeddings and the multimodal pin follow their own switches the same
//     way: unset → openai-proxy, explicit "gemini" → gemini-proxy.

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
  }),
}));

import { callLlm, embedTexts } from "../boundary";
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

// Every routing switch this suite touches. All are UNSET in the jest env (the
// pre-T1 "unset → gemini" cases passed on that assumption); each test that
// pins one does so explicitly and afterEach clears them all.
const SWITCHES = [
  "EXPO_PUBLIC_LLM_PHASE",
  "EXPO_PUBLIC_LLM_VENDOR",
  "EXPO_PUBLIC_FAILOVER_VENDOR",
  "EXPO_PUBLIC_EMBED_VENDOR",
  "EXPO_PUBLIC_MULTIMODAL_VENDOR",
] as const;

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
    for (const key of SWITCHES) delete process.env[key];
  });

  test("Phase 2 seat call reaches openai-proxy with the D-26 effort", async () => {
    mockInvoke.mockResolvedValueOnce(okPayload("gpt-5.4"));

    const r = await callLlm({
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
    mockInvoke.mockResolvedValueOnce(okPayload("claude-sonnet-5"));
    const r = await callLlm({ userId: "u1", locale: "en", purpose: "gap_synthesize", user: BENIGN });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]![0]).toBe("claude-proxy");
    const audit = r.audit as AuditMeta;
    expect(audit.reasoningProvider).toBe("claude");
    expect(audit.modelUsed).toBe("claude-sonnet-5");
  });

  test("failover unset → none: a vendor outage is NOT retried and the primary's own error surfaces", async () => {
    // T1 stage A: failoverVendor() resolves "none" when unset. The retry used
    // to land on gemini-proxy; with that key retiring it would be a guaranteed
    // second failure that also replaced the real error, so unset means off.
    const boom = { context: { status: 500, json: async () => ({ error: "upstream" }) } };
    mockInvoke.mockResolvedValueOnce({ data: null, error: boom });

    await expect(
      callLlm({
        userId: "u1",
        locale: "en",
        purpose: "gap_synthesize",
        user: BENIGN,
      }),
    ).rejects.toBe(boom);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]![0]).toBe("openai-proxy");
    // A 500 is an outage, not a crisis gate: no hotline, no crisis row.
    expect(crisisMock).not.toHaveBeenCalled();
  });

  test("EXPO_PUBLIC_FAILOVER_VENDOR=gemini: outage fails over ONCE to gemini-proxy and audits the real backend", async () => {
    // explicit: unset is none since T1 stage A. This is the rollback property
    // for the failover switch — "gemini" by name still reaches gemini-proxy.
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    const boom = { context: { status: 500, json: async () => ({ error: "upstream" }) } };
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: boom })
      .mockResolvedValueOnce(okPayload("gemini-2.5-flash"));

    const r = await callLlm({
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

  test("an openai-proxy crisis 422 routes to the hotline and is NEVER retried, even with a failover target", async () => {
    // explicit: unset is none since T1 stage A. With no failover target the
    // retry branch is never reached at all, so pin one — the property here is
    // that a crisis gate is not retried even when a retry is available.
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: {
          status: 422,
          json: async () => ({ error: "safety_red_zone", reason: "crisis_term_detected" }),
        },
      },
    });

    const r = await callLlm({
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

  test("Phase 1 (PHASE unset, seat switch unset) lands on openai-proxy with the D-26 effort", async () => {
    // T1 stage A: the Phase-1 rule resolves RETIRED_DEFAULT (openai) for the
    // seats, not gemini. A build missing EXPO_PUBLIC_LLM_VENDOR no longer
    // routes a seat to the retiring proxy.
    delete process.env.EXPO_PUBLIC_LLM_PHASE;
    mockInvoke.mockResolvedValueOnce(okPayload("gpt-5.4"));

    const r = await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "gap_synthesize",
      user: BENIGN,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0]!;
    expect(fn).toBe("openai-proxy");
    expect(opts.body.effort).toBe("low");
    const audit = r.audit as AuditMeta;
    expect(audit.effort).toBe("low");
    expect(audit.reasoningProvider).toBe("openai");
    expect(audit.modelUsed).toBe("gpt-5.4");
  });

  test("rollback: EXPO_PUBLIC_LLM_VENDOR=gemini keeps the Phase 1 posture — gemini-proxy, no effort on a flash purpose", async () => {
    // explicit: unset is openai since T1 stage A. gap_synthesize is a flash
    // tier seat, so on Gemini it carries no effort and no reasoning vendor.
    delete process.env.EXPO_PUBLIC_LLM_PHASE;
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    mockInvoke.mockResolvedValueOnce(okPayload("gemini-2.5-flash"));

    const r = await callLlm({
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

  test("embedTexts (EMBED_VENDOR unset) routes via openai-proxy op:embed on the edge build (one batched call)", async () => {
    // T1 stage A: embedVendor() resolves openai when unset (measured before the
    // flip: no gemini-made vector exists for this default to disagree with).
    mockInvoke.mockResolvedValueOnce({
      data: { vectors: [[0.1, 0.2], [0.3, 0.4]], modelUsed: "text-embedding-3-large", audited: true },
      error: null,
    });

    const r = await embedTexts({ userId: "u1", texts: ["alpha", "beta"], locale: "en" });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0]!;
    expect(fn).toBe("openai-proxy");
    expect(opts.body).toEqual({ op: "embed", texts: ["alpha", "beta"], purpose: "embed_index" });
    expect(r.vectors).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(r.audit.modelUsed).toBe("text-embedding-3-large");
  });

  test("rollback: EXPO_PUBLIC_EMBED_VENDOR=gemini routes embedTexts via gemini-proxy op:embed", async () => {
    // explicit: unset is openai since T1 stage A.
    process.env.EXPO_PUBLIC_EMBED_VENDOR = "gemini";
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

  test("multimodal switch unset: capture_ocr goes to openai-proxy even in Phase 2", async () => {
    // T1 stage A: multimodalVendor() resolves openai when unset. The image
    // still rides in the body; the multimodal switch beats the seat map.
    mockInvoke.mockResolvedValueOnce(okPayload("gpt-5.4"));

    const r = await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "capture_ocr",
      user: "Transcribe this image.",
      image: { mimeType: "image/png", data: "aGk=" },
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0]!;
    expect(fn).toBe("openai-proxy");
    expect(opts.body.image).toEqual({ mimeType: "image/png", data: "aGk=" });
    // On a non-Gemini seat the client always sends an effort. capture_ocr has
    // no PHASE2_EFFORT row, so this is boundary.ts's DEFAULT_EFFORT; the
    // proxy's per-purpose ceiling is the enforcement, this is only the ask.
    expect(opts.body.effort).toBe("high");
    expect((r.audit as AuditMeta).reasoningProvider).toBe("openai");
  });

  test("rollback: EXPO_PUBLIC_MULTIMODAL_VENDOR=gemini pins capture_ocr to gemini-proxy with no effort, even in Phase 2", async () => {
    // explicit: unset is openai since T1 stage A.
    process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR = "gemini";
    mockInvoke.mockResolvedValueOnce(okPayload("gemini-2.5-flash"));

    await callLlm({
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
