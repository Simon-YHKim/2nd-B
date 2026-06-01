// C9 assertion: classifyInput runs before any LLM network call, and
// red-zone input short-circuits without invoking the SDK.
// C3 assertion: insertAiAuditLog is called for normal flows.
// We mock both @google/genai and the audit helper.

import type { GeminiResult } from "../types";

const mockGenerateContent = jest.fn().mockResolvedValue({ text: "OK reflection" });

jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    })),
  };
});

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_USE_VERTEX: true,
    GOOGLE_CLOUD_PROJECT: "test-project",
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

describe("callGemini", () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
    insertMock.mockClear();
  });

  test("C9: red-zone input short-circuits and does NOT call Gemini SDK", async () => {
    const r: GeminiResult<string> = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "I want to die",
    });
    expect(r.safety.zone).toBe("red");
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(r.text).toMatch(/988/);
  });

  test("C3: normal flow inserts audit log with vertexBackend=true", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "Today I went for a walk.",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const arg = insertMock.mock.calls[0]![0]!;
    expect(arg.userId).toBe("u1");
    expect(arg.vertexBackend).toBe(true);
    expect(arg.safetyZone).toBe("green");
    expect(r.text).toBe("OK reflection");
  });

  test("C3: audit failure does not throw to caller", async () => {
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

  test("C3 + C9: red zone is also audited (crisis event recorded for judges)", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "ko",
      purpose: "journal_reflect",
      user: "자살하고 싶다",
    });
    expect(r.safety.zone).toBe("red");
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    const arg = insertMock.mock.calls[0]![0]!;
    expect(arg.safetyZone).toBe("red");
    expect(arg.modelUsed).toBe("none-crisis-routed");
    expect(arg.userId).toBe("u1");
  });

  test("C9: minor flag routes KO crisis to youth line 1388 (adult stays 1393)", async () => {
    const minorR = await callGemini({
      userId: "u1",
      locale: "ko",
      purpose: "journal_reflect",
      user: "자살하고 싶다",
      minor: true,
    });
    expect(minorR.safety.zone).toBe("red");
    expect(minorR.text).toMatch(/1388/);
    expect(mockGenerateContent).not.toHaveBeenCalled();

    const adultR = await callGemini({
      userId: "u1",
      locale: "ko",
      purpose: "journal_reflect",
      user: "자살하고 싶다",
    });
    expect(adultR.text).toMatch(/1393/);
  });
});
