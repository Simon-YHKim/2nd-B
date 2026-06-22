// Locks in the EXPO_PUBLIC_REASONING_PROVIDER routing (claude-proxy edge backend).
// Two invariants:
//   1. provider=claude routes the reasoning (pro) call to claude-proxy even when
//      EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION is OFF — Claude has no client-side path
//      (no key on device), so it MUST go server-side.
//   2. provider=gemini (default) with the edge flag ON still routes to
//      gemini-proxy (no regression).
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

import { callAdvisor } from "../gemini";

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

  beforeEach(() => {
    mockInvoke.mockReset();
    mockClassifySafety.mockReset();
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_REASONING_PROVIDER;
    else process.env.EXPO_PUBLIC_REASONING_PROVIDER = prev;
  });

  test("provider=claude routes to claude-proxy even with the edge flag OFF", async () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "claude";
    mockEnv.edge = false;
    await runAdvisorOnce();
    expect(invokedFunctionName()).toBe("claude-proxy");
  });

  test("provider=gemini (default) with the edge flag ON routes to gemini-proxy", async () => {
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "gemini";
    mockEnv.edge = true;
    await runAdvisorOnce();
    expect(invokedFunctionName()).toBe("gemini-proxy");
  });
});
