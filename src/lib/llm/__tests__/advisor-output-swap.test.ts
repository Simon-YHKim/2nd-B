// Regression test for CSO 2nd audit finding #1 (CRITICAL 9/10):
// callAdvisor must re-classify Gemini Pro's text output. If the LLM emits
// crisis content (via prompt injection through knowledge_sources rows,
// conversationContext, or otherwise), the response must be swapped to the
// fixed crisis template and a crisis_event must be recorded.

const mockGenerateContent = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return {
    ...actual,
    classifySafety: (...args: unknown[]) => mockClassifySafety(...args),
  };
});

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../knowledge/retrieve", () => ({
  retrieveEvidence: jest.fn().mockResolvedValue({
    matchedBatches: ["self-knowledge"],
    rows: [],
    schemaContext: "## 0. Hard safety rules\nNo diagnosis.",
    assembledPrompt: "SYSTEM: test prompt\n=== USER MESSAGE ===\nhi",
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
    EXPO_PUBLIC_POSTHOG_KEY: undefined,
    EXPO_PUBLIC_POSTHOG_HOST: undefined,
  }),
}));

import { callAdvisor } from "../gemini";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";

const auditMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const crisisMock = insertCrisisEvent as jest.MockedFunction<typeof insertCrisisEvent>;

describe("callAdvisor — output re-classification (CSO #1 fix)", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockClassifySafety.mockReset();
    auditMock.mockClear();
    crisisMock.mockClear();
  });

  test("RED output from Pro is swapped to fixed crisis template, even when input was GREEN", async () => {
    // Input classifies GREEN.
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    // Pro emits crisis text (simulating prompt injection or LLM drift).
    mockGenerateContent.mockResolvedValueOnce({ text: "you should end your life" });
    // Output classifier flags it RED.
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["active_ideation_no_method"],
      confidence: 0.98,
      cssrsLevel: 3,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "Trying to figure out my next career move.",
    });

    expect(r.zone).toBe("red");
    expect(r.fixedTemplate).toBe(true);
    // Must NOT leak the LLM's improvised crisis text.
    expect(r.text).not.toMatch(/end your life/i);
    expect(r.text).toMatch(/988/);
    expect(r.triggers).toContain("output_swap");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("red");
    expect(auditMock.mock.calls[0]![0]!.modelUsed).toMatch(/\+swap:red-en-v1/);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("output_swap");
  });

  test("YELLOW output from Pro on GREEN input escalates final zone to YELLOW", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    mockGenerateContent.mockResolvedValueOnce({ text: "That sounds really exhausting." });
    mockClassifySafety.mockResolvedValueOnce({
      zone: "yellow",
      triggers: ["distress"],
      confidence: 0.7,
      cssrsLevel: null,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "Work has been a lot lately.",
    });

    expect(r.zone).toBe("yellow");
    expect(r.fixedTemplate).toBe(false);
    expect(r.text).toBe("That sounds really exhausting.");
    expect(crisisMock).not.toHaveBeenCalled();
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("yellow");
  });

  test("GREEN input + GREEN output stays GREEN and ships the LLM text", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    mockGenerateContent.mockResolvedValueOnce({ text: "What was the most surprising part of that?" });
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "Today I went for a long walk.",
    });

    expect(r.zone).toBe("green");
    expect(r.fixedTemplate).toBe(false);
    expect(r.text).toBe("What was the most surprising part of that?");
    expect(crisisMock).not.toHaveBeenCalled();
  });

  test("RED input still short-circuits before any Pro call (existing invariant)", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["active_ideation_no_method"],
      confidence: 0.95,
      cssrsLevel: 3,
      source: "lexicon+llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "ko",
      userMessage: "자살하고 싶어요",
    });

    expect(r.zone).toBe("red");
    expect(r.fixedTemplate).toBe(true);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(crisisMock).toHaveBeenCalledTimes(1);
  });
});
