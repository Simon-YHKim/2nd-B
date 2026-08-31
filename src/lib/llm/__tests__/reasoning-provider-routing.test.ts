// Locks in the EXPO_PUBLIC_REASONING_PROVIDER routing (claude-proxy edge backend).
//
// The seam is the LAST rung of resolveVendorForPurpose (#1395, 2026-08-26): it
// is consulted only when the purpose axis resolved "gemini" AND the call is on
// the reasoning (pro) tier. Until T1 stage A (2026-08-31) an unset
// EXPO_PUBLIC_LLM_VENDOR at Phase 1 resolved "gemini", so the seam was reachable
// with no other env set. Unset is openai now, so every test below that MEANS to
// reach the seam pins EXPO_PUBLIC_LLM_VENDOR=gemini explicitly.
//
// Invariants:
//   1. provider=claude routes the reasoning (pro) call to claude-proxy even when
//      EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION is OFF — Claude has no client-side path
//      (no key on device), so it MUST go server-side.
//   2. provider=gemini (explicit) with the edge flag ON still routes to
//      gemini-proxy — the one-variable rollback property.
//   3. With nothing set, the advisor call lands on openai-proxy (the retired
//      default) and the seam is never consulted.
// C1 stays intact: the routing only swaps the edge-function NAME; no Anthropic
// SDK is imported anywhere in the client (enforced separately by
// check:llm-boundary).

const mockInvoke = jest.fn();
const mockClassifySafety = jest.fn();
// `mock`-prefixed so the jest.mock factory may reference it (hoist-safe).
const mockEnv = { edge: false };

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
    matchedBatches: [],
    rows: [],
    schemaContext: "",
    assembledPrompt: "SYSTEM: advisor\n=== USER MESSAGE ===\nlong walk",
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: mockEnv.edge,
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_API_KEY: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
  }),
}));

import { callAdvisor } from "../boundary";

const GREEN = {
  zone: "green" as const,
  triggers: [] as string[],
  confidence: 0.4,
  cssrsLevel: null,
  source: "lexicon-fallback" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};

function invokedFunctionName(): string {
  return mockInvoke.mock.calls[0]![0] as string;
}

async function runAdvisorOnce(): Promise<void> {
  mockClassifySafety.mockResolvedValueOnce(GREEN); // input
  mockInvoke.mockResolvedValueOnce({ data: { text: "ok", audited: true }, error: null });
  mockClassifySafety.mockResolvedValueOnce(GREEN); // output
  await callAdvisor({ userId: "u1", locale: "en", userMessage: "Today I went for a long walk." });
}

describe("reasoning provider routing (EXPO_PUBLIC_REASONING_PROVIDER)", () => {
  const prev = process.env.EXPO_PUBLIC_REASONING_PROVIDER;
  const prevVendor = process.env.EXPO_PUBLIC_LLM_VENDOR;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockClassifySafety.mockReset();
  });

  // The axis pin is per-test: restore it so a pinned test never leaks
  // "gemini" into the unset-default cases below.
  afterEach(() => {
    if (prevVendor === undefined) delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    else process.env.EXPO_PUBLIC_LLM_VENDOR = prevVendor;
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_REASONING_PROVIDER;
    else process.env.EXPO_PUBLIC_REASONING_PROVIDER = prev;
  });

  test("provider=claude with the axis pinned to gemini routes to claude-proxy even with the edge flag OFF", async () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "claude";
    // explicit: unset is openai since T1 stage A, and the seam is reached only
    // when the axis says gemini.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    mockEnv.edge = false;
    await runAdvisorOnce();
    expect(invokedFunctionName()).toBe("claude-proxy");
  });

  test("provider=gemini (explicit) with the axis pinned to gemini and the edge flag ON routes to gemini-proxy (rollback)", async () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "gemini";
    // explicit: unset is openai since T1 stage A.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    mockEnv.edge = true;
    await runAdvisorOnce();
    expect(invokedFunctionName()).toBe("gemini-proxy");
  });

  test("nothing set routes to openai-proxy even with the edge flag OFF (T1 stage A retired default)", async () => {
    delete process.env.EXPO_PUBLIC_REASONING_PROVIDER;
    delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    // Edge flag OFF on purpose: a non-gemini vendor must still go server-side,
    // so the retired default can never fall into the direct @google/genai branch.
    mockEnv.edge = false;
    await runAdvisorOnce();
    expect(invokedFunctionName()).toBe("openai-proxy");
  });

  test("provider=claude alone is a no-op while the axis resolves the retired default (seam gated on gemini)", async () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "claude";
    delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    mockEnv.edge = false;
    await runAdvisorOnce();
    expect(invokedFunctionName()).toBe("openai-proxy");
  });

  // Fold invariants (2026-08-26): the seam became the LAST rung of
  // resolveVendorForPurpose. These two pin the rung's position in the ladder.

  test("the purpose axis wins: EXPO_PUBLIC_LLM_VENDOR beats the seam", async () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "claude";
    process.env.EXPO_PUBLIC_LLM_VENDOR = "openai";
    try {
      mockEnv.edge = false;
      await runAdvisorOnce();
      expect(invokedFunctionName()).toBe("openai-proxy");
    } finally {
      delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    }
  });

  test("an image-bearing call never consults the seam (multimodal pin wins)", () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "claude";
    // Import here so the env var is set before resolution runs.
    const { resolveVendorForPurpose } = jest.requireActual<
      typeof import("../routing")
    >("../routing");
    expect(resolveVendorForPurpose("capture_ocr", true, { reasoningTier: true })).not.toBe(
      "claude",
    );
  });
});
