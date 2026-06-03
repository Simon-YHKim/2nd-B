// Regression test for re-audit finding A5 + round-4 H1:
// callGemini (the non-advisor entry used by the interview probe, wiki/inbox
// phase1, import echo, and persona summary) must re-classify the model's TEXT
// output with the SEMANTIC union classifier (classifySafety = lexicon + Gemini
// Flash), reaching parity with callAdvisor. If the model emits crisis content —
// even semantically red with NO literal crisis term (round-4 H1) — callGemini
// must swap it for the fixed crisis template and log a crisis_event, never
// render the raw text. (A5's first cut gated the swap on the lexicon-only
// classifyInput, which a paraphrase slips past.)

const mockGenerateContent = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

// Mock ONLY classifySafety (the output classifier). classifyInput (the input
// C9 gate) lives in ../safety/classifier and stays real.
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
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: false,
    // Vertex direct path: exempt from the round-4 H4 direct-egress guard (Vertex
    // bills GCP, not the Gemini-API free-tier counter the spend cap protects). The
    // output-swap path is egress-agnostic, so this still exercises real generation.
    EXPO_PUBLIC_USE_VERTEX: true,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
    EXPO_PUBLIC_POSTHOG_KEY: undefined,
    EXPO_PUBLIC_POSTHOG_HOST: undefined,
  }),
}));

import { callGemini } from "../gemini";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";

const auditMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const crisisMock = insertCrisisEvent as jest.MockedFunction<typeof insertCrisisEvent>;

const RED = {
  zone: "red" as const,
  triggers: ["active_ideation_no_method"],
  confidence: 0.97,
  cssrsLevel: 3 as const,
  source: "llm" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};
const GREEN = {
  zone: "green" as const,
  triggers: [] as string[],
  confidence: 0.4,
  cssrsLevel: null,
  source: "llm" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};

describe("callGemini — semantic output re-classification (A5 + round-4 H1)", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockClassifySafety.mockReset();
    auditMock.mockClear();
    crisisMock.mockClear();
  });

  test("SEMANTICALLY-red model output with NO literal crisis term is still swapped", async () => {
    // Output reads benign to the lexicon (no CRISIS_TERM) — the exact H1 gap.
    mockGenerateContent.mockResolvedValueOnce({ text: "Maybe it would be easier for everyone if you just slipped away quietly." });
    // The semantic classifier (mocked) flags it red. This is the only
    // classifySafety call callGemini makes (output only).
    mockClassifySafety.mockResolvedValueOnce(RED);

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "interview_probe",
      user: "Today I planned my week and it felt productive.",
    });

    // Must NOT leak the model's improvised crisis text.
    expect(r.text).not.toMatch(/slipped away/i);
    expect(r.text).toMatch(/988/);
    expect(r.safety.zone).toBe("red");
    expect(mockClassifySafety).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("red");
    expect(auditMock.mock.calls[0]![0]!.modelUsed).toMatch(/\+swap:/);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("output_swap");
    expect(crisisMock.mock.calls[0]![0]!.cssrsLevel).toBe(3);
  });

  test("GREEN semantic output on GREEN input ships verbatim and logs no crisis_event", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "Noted — saved your weekly plan." });
    mockClassifySafety.mockResolvedValueOnce(GREEN);

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "import_ingest",
      user: "Today I planned my week and it felt productive.",
    });

    expect(r.text).toBe("Noted — saved your weekly plan.");
    expect(r.safety.zone).toBe("green");
    expect(crisisMock).not.toHaveBeenCalled();
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("green");
  });

  test("RED input still short-circuits before any model call (C9 invariant)", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "import_ingest",
      user: "I want to end my life tonight",
    });

    expect(r.safety.zone).toBe("red");
    expect(r.text).toMatch(/988/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // Output classifier is never reached when input short-circuits.
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });
});
