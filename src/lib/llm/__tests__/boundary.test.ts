// C9 assertion: classifyInput runs before any LLM network call, and
// red-zone input short-circuits without invoking the SDK.
// C3 assertion: normal flows enqueue and flush insertAiAuditLog.
// We mock both @google/genai and the audit helper.
//
// This suite exercises the DIRECT @google/genai (Vertex) branch of callLlm. That
// branch is taken only when the resolved vendor is "gemini" and
// EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION is off. Since T1 stage A (2026-08-31) an
// UNSET vendor switch resolves to openai (routing.ts RETIRED_DEFAULT), which
// would send every call here to the edge path instead, so the three switches
// that govern these purposes are pinned to "gemini" explicitly below:
//   EXPO_PUBLIC_BACKBONE_VENDOR    - reasoning_connect is not a Phase-2 seat
//   EXPO_PUBLIC_REASONING_PROVIDER - reasoning_connect is pro tier (last rung)
//   EXPO_PUBLIC_MULTIMODAL_VENDOR  - capture_ocr carries an image
// The pin is itself the one-variable rollback property: explicit "gemini" still
// reaches the Gemini client. What each test asserts about the branch is unchanged.

import type { LlmResult } from "../types";

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

// callLlm now re-classifies output via classifySafety (round-4 H1). This suite
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
  }),
}));

import { callLlm } from "../boundary";
import {
  flushAuditWriteOutbox,
  getAuditWriteOutboxForTests,
  resetAuditWriteOutboxForTests,
} from "../audit-write-outbox";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";

const insertMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const crisisMock = insertCrisisEvent as jest.MockedFunction<typeof insertCrisisEvent>;

// The vendor switches this suite depends on, with their pre-test values so the
// pin never leaks into another suite in the same worker.
const PINNED_SWITCHES = [
  "EXPO_PUBLIC_BACKBONE_VENDOR",
  "EXPO_PUBLIC_REASONING_PROVIDER",
  "EXPO_PUBLIC_MULTIMODAL_VENDOR",
] as const;
const savedSwitches: Partial<Record<(typeof PINNED_SWITCHES)[number], string | undefined>> = {};

describe("callLlm", () => {
  beforeAll(() => {
    // explicit: unset is openai since T1 stage A (2026-08-31). These tests are
    // about the direct Gemini branch, so name the vendor instead of relying on
    // a default that no longer points there.
    for (const key of PINNED_SWITCHES) {
      savedSwitches[key] = process.env[key];
      process.env[key] = "gemini";
    }
  });

  afterAll(() => {
    for (const key of PINNED_SWITCHES) {
      const prev = savedSwitches[key];
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });

  beforeEach(async () => {
    await resetAuditWriteOutboxForTests();
    mockGenerateContent.mockClear();
    insertMock.mockClear();
    insertMock.mockResolvedValue(undefined);
    crisisMock.mockClear();
    crisisMock.mockResolvedValue(undefined);
  });

  test("C9: red-zone input short-circuits and does NOT call Gemini SDK", async () => {
    const r: LlmResult<string> = await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "reasoning_connect",
      user: "I want to die",
    });
    expect(r.safety.zone).toBe("red");
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(r.text).toMatch(/988/);
  });

  test("C3: normal flow inserts audit log with vertexBackend=true", async () => {
    const r = await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "reasoning_connect",
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
      callLlm({
        userId: "u1",
        locale: "en",
        purpose: "reasoning_connect",
        user: "A normal day.",
      }),
    ).resolves.toBeDefined();
    expect(await getAuditWriteOutboxForTests()).toHaveLength(1);
    await flushAuditWriteOutbox("u1");
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
  });

  test("C3 + C9: red zone is also audited (crisis event recorded for judges)", async () => {
    const r = await callLlm({
      userId: "u1",
      locale: "ko",
      purpose: "reasoning_connect",
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

  test("interview red routing records honest source/purpose in both ledgers without Gemini", async () => {
    const api = jest.requireActual("../boundary") as {
      classifyInterviewTextForCrisis?: (
        text: string,
        locale: "en" | "ko",
        userId: string,
        minor?: boolean,
      ) => Promise<LlmResult<string> | null>;
    };
    expect(api.classifyInterviewTextForCrisis).toBeDefined();
    if (!api.classifyInterviewTextForCrisis) return;

    const result = await api.classifyInterviewTextForCrisis(
      "죽고 싶어요. 모르겠어요",
      "ko",
      "interview-user",
      true,
    );

    expect(result?.safety.zone).toBe("red");
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0]![0]).toMatchObject({
      userId: "interview-user",
      purpose: "interview_probe",
      safetyZone: "red",
      modelUsed: "none-crisis-routed",
    });
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("interview_input_red");
  });

  test.each([
    ["ko", "모르겠어요"],
    ["en", "I'm not sure"],
  ] as const)("interview exact CTA %s stays green with zero model/audit/event writes", async (locale, text) => {
    const { classifyInterviewTextForCrisis } = jest.requireActual("../boundary") as typeof import("../boundary");

    await expect(classifyInterviewTextForCrisis(text, locale, "interview-user")).resolves.toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(crisisMock).not.toHaveBeenCalled();
  });

  test("deferred interview ledgers never delay visible UI and concurrent starts route exactly once", async () => {
    const events: string[] = [];
    let releaseAudit!: () => void;
    const deferredAudit = new Promise<void>((resolve) => {
      releaseAudit = resolve;
    });
    insertMock.mockImplementationOnce(async () => {
      events.push("audit");
      await deferredAudit;
    });
    crisisMock.mockImplementationOnce(async () => {
      events.push("crisis-event");
    });

    const api = jest.requireActual("../boundary") as {
      startInterviewCrisisRouting?: (
        guard: { current: boolean },
        input: { text: string; locale: "en" | "ko"; userId: string; minor?: boolean },
        onVisible: () => void,
        onSettled: () => void,
      ) => { started: boolean; done: Promise<LlmResult<string> | null> };
    };
    expect(api.startInterviewCrisisRouting).toBeDefined();
    if (!api.startInterviewCrisisRouting) {
      releaseAudit();
      return;
    }

    const guard = { current: false };
    const input = {
      text: "죽고 싶어요. 모르겠어요",
      locale: "ko" as const,
      userId: "interview-user",
      minor: true,
    };
    const first = api.startInterviewCrisisRouting(
      guard,
      input,
      () => events.push("visible"),
      () => events.push("settled"),
    );
    const duplicate = api.startInterviewCrisisRouting(
      guard,
      input,
      () => events.push("duplicate-visible"),
      () => events.push("duplicate-settled"),
    );

    expect(first.started).toBe(true);
    expect(duplicate.started).toBe(false);
    expect(guard.current).toBe(true);
    expect(events[0]).toBe("visible");
    expect(events).not.toContain("duplicate-visible");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(crisisMock).not.toHaveBeenCalled();
    expect(events.slice(0, 2)).toEqual(["visible", "audit"]);

    releaseAudit();
    await first.done;
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["visible", "audit", "crisis-event", "settled"]);
    expect(guard.current).toBe(false);
  });

  test("multimodal: image is attached as an inlineData part on the direct/Vertex path", async () => {
    await callLlm({
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
    await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "reasoning_connect",
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
      callLlm({
        userId: "u1",
        locale: "en",
        purpose: "reasoning_connect",
        user: "A normal note.",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("C9: minor flag routes KO crisis to youth 1388 + 109 (adult gets 109)", async () => {
    const minorR = await callLlm({
      userId: "u1",
      locale: "ko",
      purpose: "reasoning_connect",
      user: "자살하고 싶다",
      minor: true,
    });
    expect(minorR.safety.zone).toBe("red");
    expect(minorR.text).toMatch(/1388/);
    expect(minorR.text).toMatch(/109/);
    expect(mockGenerateContent).not.toHaveBeenCalled();

    const adultR = await callLlm({
      userId: "u1",
      locale: "ko",
      purpose: "reasoning_connect",
      user: "자살하고 싶다",
    });
    expect(adultR.text).toMatch(/109/);
    expect(adultR.text).not.toMatch(/1393/);
  });
});
