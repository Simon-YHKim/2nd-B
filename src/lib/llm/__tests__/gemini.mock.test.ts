// C9 + C3 invariants in mock mode. Mirrors gemini.test.ts but flips
// EXPO_PUBLIC_LLM_MODE to "mock" so callGemini takes the templated-response
// branch. Same safety contract applies: red zone short-circuits, every call
// is audited, audit failure does not throw.

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

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: undefined,
    SENTRY_DSN: undefined,
    EXPO_PUBLIC_POSTHOG_KEY: undefined,
    EXPO_PUBLIC_POSTHOG_HOST: undefined,
  }),
}));

import { callGemini } from "../gemini";
import { insertAiAuditLog } from "../../supabase/audit";

const insertMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;

describe("callGemini (mock mode)", () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
    insertMock.mockClear();
  });

  test("C9: red zone still short-circuits without producing a mock response", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "I want to die",
    });
    expect(r.safety.zone).toBe("red");
    expect(r.text).not.toMatch(/^\[MOCK\]/);
    expect(r.text).toMatch(/988/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test("C3: green-zone mock call records audit with modelUsed prefixed mock:", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "ko",
      purpose: "audit_qa",
      user: "어떤 시기를 돌아보고 있어요.",
    });
    // Mock mode is tracked via modelUsed ("mock:...") below, not via a user-visible [MOCK] token.
    expect(r.text).not.toContain("[MOCK]");
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    const arg = insertMock.mock.calls[0]![0]!;
    expect(arg.modelUsed).toBe("mock:gemini-2.5-flash");
    expect(arg.safetyZone).toBe("green");
    expect(arg.userId).toBe("u1");
  });

  test("C3: mock audit failure does not throw", async () => {
    insertMock.mockRejectedValueOnce(new Error("db down"));
    await expect(
      callGemini({
        userId: "u1",
        locale: "en",
        purpose: "journal_reflect",
        user: "A normal day.",
      }),
    ).resolves.toBeDefined();
  });
});
