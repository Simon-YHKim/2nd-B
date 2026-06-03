// Regression test for re-audit round-3 finding A5:
// callGemini (the non-advisor entry used by the interview probe, wiki/inbox
// phase1, import echo, and persona summary) must re-classify the model's TEXT
// output. If the model emits crisis content — via injected wiki/clip context, a
// jailbreak, or multi-turn drift — callGemini must swap it for the fixed crisis
// template (never render the raw red text) and record a crisis_event, exactly
// like callAdvisor already does. Before the fix it only logged the zone and
// returned the red text verbatim.

const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

// NOTE: ../safety is intentionally NOT mocked — we exercise the real
// classifyInput lexicon so the output zone is decided by genuine content.

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: false,
    EXPO_PUBLIC_USE_VERTEX: false,
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

describe("callGemini — output re-classification (re-audit A5 fix)", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    auditMock.mockClear();
    crisisMock.mockClear();
  });

  test("RED model output is swapped to the crisis template even when input was GREEN", async () => {
    // Green input passes the C9 input gate; the model then emits crisis text.
    // (First-person ideation the real lexicon classifier flags red — unlike the
    // advisor test, this exercises the genuine classifyInput, not a mock.)
    mockGenerateContent.mockResolvedValueOnce({ text: "I am going to end my life tonight" });

    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "import_ingest",
      user: "Today I planned my week and it felt productive.",
    });

    // Must NOT leak the model's improvised crisis text.
    expect(r.text).not.toMatch(/end my life/i);
    expect(r.text).toMatch(/988/);
    expect(r.safety.zone).toBe("red");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("red");
    expect(auditMock.mock.calls[0]![0]!.modelUsed).toMatch(/\+swap:/);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("output_swap");
  });

  test("GREEN model output on GREEN input ships verbatim and logs no crisis_event", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "Noted — saved your weekly plan." });

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
  });
});
