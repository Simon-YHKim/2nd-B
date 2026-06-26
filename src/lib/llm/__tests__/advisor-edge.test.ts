// Regression test for the 2026-06-03 re-audit (HIGH + C3 MED): callAdvisor's
// LIVE EDGE path was previously uncovered, so CI stayed green while it was
// broken in prod. This locks in the fix:
//   1. The genuine journal entry is sent as `user` (the channel the proxy
//      crisis-scans) and the RAG-assembled prompt as `system` (trusted, not
//      scanned — it legitimately quotes crisis-detection reference text). This
//      fixes the prior false 422 AND keeps the server-side crisis gate effective
//      (a bypassed client cannot smuggle crisis content through an unscanned
//      channel — the gate scans exactly what is forwarded as the user turn).
//   2. callAdvisor honors the proxy's `audited` flag and skips its own
//      ai_audit_log insert when the proxy already wrote one (C3 1:1 parity with
//      callGemini), and falls back to the client insert when it did not.

const mockInvoke = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return { ...actual, classifySafety: (...args: unknown[]) => mockClassifySafety(...args) };
});

jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../supabase/crisis-events", () => ({ insertCrisisEvent: jest.fn().mockResolvedValue(undefined) }));

// loadDomainLevels is called by callAdvisor to bias evidence toward dim
// domains. Stub it so this suite stays hermetic (no Supabase round-trip).
jest.mock("../../persona/load-domain-levels", () => ({
  loadDomainLevels: jest.fn().mockResolvedValue({ domainLevels: {}, northStarBrightness: 0.2 }),
}));

jest.mock("../../knowledge/retrieve", () => ({
  retrieveEvidence: jest.fn().mockResolvedValue({
    matchedBatches: ["crisis-detection"],
    rows: [],
    schemaContext: "",
    // The assembled prompt legitimately quotes crisis-detection reference
    // material (e.g. the Columbia-Suicide Severity Rating Scale). Pre-fix, the
    // proxy's blunt hasCrisisTerm matched "suicide" here and 422'd every call.
    assembledPrompt:
      "SYSTEM: advisor\nReference: The Columbia-Suicide Severity Rating Scale\n=== USER MESSAGE ===\nlong walk",
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_API_KEY: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
  }),
}));

import { callAdvisor } from "../gemini";
import { insertAiAuditLog } from "../../supabase/audit";

const auditMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const GREEN = {
  zone: "green" as const,
  triggers: [] as string[],
  confidence: 0.4,
  cssrsLevel: null,
  source: "lexicon-fallback" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};

function invokeBody(): Record<string, unknown> {
  return (mockInvoke.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
}

describe("callAdvisor — live edge path (2026-06-03 re-audit fix)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockClassifySafety.mockReset();
    auditMock.mockClear();
  });

  test("sends the genuine entry as userMessage (crisis-laden RAG stays in `user`) and skips client audit when proxy audited", async () => {
    mockClassifySafety.mockResolvedValueOnce(GREEN); // input
    mockInvoke.mockResolvedValueOnce({ data: { text: "What stood out on that walk?", audited: true }, error: null });
    mockClassifySafety.mockResolvedValueOnce(GREEN); // output

    const r = await callAdvisor({ userId: "u1", locale: "en", userMessage: "Today I went for a long walk." });

    expect(r.text).toBe("What stood out on that walk?");
    const body = invokeBody();
    // The genuine entry rides in `user` — the channel the proxy crisis-scans.
    expect(body.user).toBe("Today I went for a long walk.");
    // ...while the curated RAG prompt (with crisis-reference text) rides in the
    // un-scanned `system` channel.
    expect(String(body.system)).toMatch(/Columbia-Suicide/);
    // The advisor label puts the call behind the proxy's server-side
    // entitlement gate (brain tier) — the canUsePremium mirror (#312).
    expect(body.purpose).toBe("advisor");
    // proxy audited:true => no client double-write (C3 1:1)
    expect(auditMock).not.toHaveBeenCalled();
  });

  test("falls back to the client audit insert when the proxy did NOT audit", async () => {
    mockClassifySafety.mockResolvedValueOnce(GREEN);
    mockInvoke.mockResolvedValueOnce({ data: { text: "ok", audited: false }, error: null });
    mockClassifySafety.mockResolvedValueOnce(GREEN);

    await callAdvisor({ userId: "u1", locale: "en", userMessage: "hello" });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});
