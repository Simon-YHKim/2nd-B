// C9 assertion: classifyInput runs before any LLM network call, and
// red-zone input short-circuits without invoking the SDK.
// C3 assertion: normal flows enqueue and flush insertAiAuditLog.
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
jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

// callGemini now re-classifies output via classifySafety (round-4 H1). This suite
// tests audit + multimodal wiring, not the classifier, so stub it to a no-op
// green — otherwise it would make a second (Flash) generateContent call + its own
// audit on the Vertex client. The swap behavior is covered by gemini-output-swap.test.ts.
jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return {
    ...actual,
    classifySafety: jest.fn().mockResolvedValue({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    }),
  };
});

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
import {
  flushAuditWriteOutbox,
  getAuditWriteOutboxForTests,
  resetAuditWriteOutboxForTests,
} from "../audit-write-outbox";
import { insertAiAuditLog } from "../../supabase/audit";

const insertMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;

describe("callGemini", () => {
  beforeEach(async () => {
    await resetAuditWriteOutboxForTests();
    mockGenerateContent.mockClear();
    insertMock.mockClear();
    insertMock.mockResolvedValue(undefined);
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
    expect(await getAuditWriteOutboxForTests()).toHaveLength(1);
    await flushAuditWriteOutbox("u1");
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
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

  test("multimodal: image is attached as an inlineData part on the direct/Vertex path", async () => {
    await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "capture_ocr",
      user: "Transcribe the text in this image.",
      image: { mimeType: "image/png", data: "QkFTRTY0SU1BR0U=" },
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArg = mockGenerateContent.mock.calls[0]![0] as {
      contents: { role: string; parts: Record<string, unknown>[] }[];
    };
    const userMsg = callArg.contents[callArg.contents.length - 1]!;
    const hasImagePart = userMsg.parts.some(
      (p) =>
        (p.inlineData as { mimeType?: string; data?: string } | undefined)?.data === "QkFTRTY0SU1BR0U=" &&
        (p.inlineData as { mimeType?: string } | undefined)?.mimeType === "image/png",
    );
    expect(hasImagePart).toBe(true);
  });

  test("abort signal is passed to the direct Gemini request config", async () => {
    const controller = new AbortController();
    await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "Today I wrote a note.",
      signal: controller.signal,
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArg = mockGenerateContent.mock.calls[0]![0] as {
      config?: { abortSignal?: AbortSignal };
    };
    expect(callArg.config?.abortSignal).toBe(controller.signal);
  });

  test("pre-aborted calls do not reach Gemini or audit", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      callGemini({
        userId: "u1",
        locale: "en",
        purpose: "journal_reflect",
        user: "A normal note.",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("C9: minor flag routes KO crisis to youth 1388 + 109 (adult gets 109)", async () => {
    const minorR = await callGemini({
      userId: "u1",
      locale: "ko",
      purpose: "journal_reflect",
      user: "자살하고 싶다",
      minor: true,
    });
    expect(minorR.safety.zone).toBe("red");
    expect(minorR.text).toMatch(/1388/);
    expect(minorR.text).toMatch(/109/);
    expect(mockGenerateContent).not.toHaveBeenCalled();

    const adultR = await callGemini({
      userId: "u1",
      locale: "ko",
      purpose: "journal_reflect",
      user: "자살하고 싶다",
    });
    expect(adultR.text).toMatch(/109/);
    expect(adultR.text).not.toMatch(/1393/);
  });
});
