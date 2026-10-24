import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("u1"); });

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
    __resetAccountEpochForTests(); noteResolvedOwner("interview-user");
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

  // Q-261014-30: the chat engine's device verdict with EXPO_PUBLIC_LLM_MODE=live. This suite's env
  // mock leaves that key unset, and boundary.mock.test.ts runs in mock mode, so a send placed
  // behind `=== "live"` (in the new function or in anything it calls, djb2 included) ran in
  // neither (review N-01, G-01, 2026-10-14). Each test below turns live mode on for itself and
  // gives it back. The two proxy doors throw instead of running, so a failing test reaches nothing
  // real, and the controls show that each spy the red test counts at zero does see a call here.
  describe("chat red routing in live mode (Q-261014-30)", () => {
    const envModule = jest.requireMock("../../env") as typeof import("../../env");
    const supabaseClient = jest.requireActual("../../supabase/client") as typeof import("../../supabase/client");
    const capturedSessionClient = jest.requireActual(
      "../../supabase/captured-session-client",
    ) as typeof import("../../supabase/captured-session-client");
    const GREEN = "Today I went for a walk.";

    /** This suite's env with LLM_MODE=live, and every proxy call routed to a throwing spy. */
    const liveHarness = (viaEdge = false) => {
      const base = envModule.getEnv();
      const env = jest
        .spyOn(envModule, "getEnv")
        .mockImplementation(() => ({ ...base, EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: viaEdge }));
      const reached = (): never => {
        throw new Error("proxy door reached (fixture)");
      };
      // Every proxy path goes through one of these two. With both ledger inserts mocked, nothing
      // else in the boundary asks for them.
      const client = jest.spyOn(supabaseClient, "getSupabaseClient").mockImplementation(reached);
      const capturedInvoke = jest
        .spyOn(capturedSessionClient, "invokeFunctionWithCapturedSession")
        .mockImplementation(reached);
      return {
        client,
        capturedInvoke,
        restore: (): void => {
          env.mockRestore();
          client.mockRestore();
          capturedInvoke.mockRestore();
        },
      };
    };

    // The routing must not depend on the deployment setting either. Production ships with the edge
    // on (eas.json), and a branch in the shared routeCrisis keyed on live + edge + purpose could
    // return null for chat there while the only live red test ran with the edge off (review G-03,
    // 2026-10-14). So every crisis router built on routeCrisis runs in both settings, and must give
    // the same fixed result it gives in this suite's default env.
    beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("chat-user"); });
    const actual = jest.requireActual("../boundary") as typeof import("../boundary");
    type Router = (text: string, locale: "en" | "ko", userId: string, minor?: boolean) => Promise<LlmResult<string> | null>;
    const ROUTERS: [string, Router, string | undefined, string][] = [
      ["classifyChatTextForCrisis", actual.classifyChatTextForCrisis, "secondb_chat", "input_red"],
      ["classifyRecordTextForCrisis", actual.classifyRecordTextForCrisis, undefined, "record_save_red"],
      ["classifyInterviewTextForCrisis", actual.classifyInterviewTextForCrisis, "interview_probe", "interview_input_red"],
    ];
    // The input varies too. With every case a Korean minor, a branch for adults only (`minor !==
    // true`, the default path, where the chat engine leaves minor out) passed all of them (review
    // G-04, 2026-10-14). Each language runs as an adult with minor left out and as a minor, and the
    // reference must carry that age's numbers: the youth line comes first for a Korean minor only.
    interface RedInput {
      label: string;
      text: string;
      locale: "en" | "ko";
      minor?: boolean;
      /** The numbers as the guidance joins them, and the primary line the classifier picks. */
      numbers: string;
      primary: string;
      absent: string[];
    }
    const RED_INPUTS: RedInput[] = [
      { label: "EN adult (minor left out)", text: "I want to die", locale: "en", numbers: "988", primary: "988", absent: ["1388", "109"] },
      { label: "KO minor", text: "죽고 싶어요", locale: "ko", minor: true, numbers: "1388 또는 109", primary: "1388", absent: [] },
      { label: "KO adult (minor left out)", text: "죽고 싶어요", locale: "ko", numbers: "109", primary: "109", absent: ["1388"] },
      { label: "EN minor", text: "I want to die", locale: "en", minor: true, numbers: "988", primary: "988", absent: ["1388", "109"] },
    ];
    /** Calls the router as its callers do: an adult call leaves the age out instead of passing false. */
    const send = (route: Router, input: RedInput): Promise<LlmResult<string> | null> =>
      input.minor === undefined
        ? route(input.text, input.locale, "chat-user")
        : route(input.text, input.locale, "chat-user", input.minor);
    type RedCase = [string, boolean, string, Router, string | undefined, string, RedInput];
    const RED_CASES = ROUTERS.flatMap(([name, route, purpose, tag]) =>
      [false, true].flatMap((viaEdge) =>
        RED_INPUTS.map((input): RedCase => [name, viaEdge, input.label, route, purpose, tag, input]),
      ),
    );

    test.each(RED_CASES)(
      "%s, live with viaEdge=%s, %s: the fixed guidance, no model, neither proxy door, both ledgers",
      async (_name, viaEdge, _label, route, purpose, tag, input) => {
        // The reference: the same router, same input, in this suite's default env.
        const reference = await send(route, input);
        if (!reference) throw new Error("red text must be routed in the default env");
        expect(reference.audit.modelUsed).toBe("none-crisis-routed");
        expect(reference.text).toContain(input.numbers);
        for (const number of input.absent) expect([number, reference.text.includes(number)]).toEqual([number, false]);
        expect(reference.safety.crisisRouting?.number).toBe(input.primary);
        await resetAuditWriteOutboxForTests();
        insertMock.mockClear();
        crisisMock.mockClear();

        const live = liveHarness(viaEdge);
        try {
          expect(envModule.getEnv().EXPO_PUBLIC_LLM_MODE).toBe("live");
          expect(envModule.getEnv().EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION).toBe(viaEdge);
          const result = await send(route, input);

          // Not null: a null here is a turn the chat engine would go on to count.
          expect(result).not.toBeNull();
          expect(result).toEqual(reference);
          expect(result?.safety.zone).toBe("red");
          expect(result?.audit.modelUsed).toBe("none-crisis-routed");
          expect(mockGenerateContent).not.toHaveBeenCalled();
          expect(live.client).not.toHaveBeenCalled();
          expect(live.capturedInvoke).not.toHaveBeenCalled();
          expect(insertMock).toHaveBeenCalledTimes(1);
          expect(insertMock.mock.calls[0]![0]).toMatchObject({
            userId: "chat-user",
            safetyZone: "red",
            modelUsed: "none-crisis-routed",
          });
          expect(insertMock.mock.calls[0]![0]!.purpose).toBe(purpose);
          expect(crisisMock).toHaveBeenCalledTimes(1);
          expect(crisisMock.mock.calls[0]![0]).toMatchObject({ locale: input.locale });
          expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain(tag);
        } finally {
          live.restore();
        }
      },
    );

    test.each([
      ...RED_INPUTS,
      { label: "KO medical emergency", text: "약을 이미 많이 먹었어", locale: "ko" as const,
        numbers: "119", primary: "119", absent: [] },
      { label: "KO immediate threat", text: "지금 누가 나를 칼로 위협하고 있어", locale: "ko" as const,
        numbers: "112", primary: "112", absent: [] },
    ])("captured local RED keeps the legacy routing and real outbox delivery: $label", async input => {
      const reference = await send(actual.classifyChatTextForCrisis, input);
      expect(reference?.text).toContain(input.numbers);
      expect(reference?.safety.crisisRouting?.number).toBe(input.primary);
      await resetAuditWriteOutboxForTests(); insertMock.mockClear(); crisisMock.mockClear();
      const order: string[] = [];
      insertMock.mockImplementationOnce(async () => { order.push("audit"); });
      crisisMock.mockImplementationOnce(async () => { order.push("event"); });
      const controller = new AbortController();
      const session = { userId: "chat-user", epoch: 1, accessToken: "captured-chat-token", signal: controller.signal,
        assertCurrent: () => { if (controller.signal.aborted) throw new Error("aborted"); },
        abort: () => controller.abort(), release: () => controller.abort(),
      };
      const observer = jest.fn(() => { order.push("visible"); });
      const live = liveHarness(true);
      try {
        const result = await actual.classifyChatTextForCrisis(input.text, input.locale, "chat-user", input.minor, {
          session, signal: session.signal, onCrisisDetected: observer,
        });
        expect(result).toEqual(reference);
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer).toHaveBeenCalledWith(reference!.safety.crisisRouting?.hotline);
        expect(order).toEqual(["visible", "audit", "event"]);
        expect(insertMock).toHaveBeenCalledTimes(1); expect(crisisMock).toHaveBeenCalledTimes(1);
        expect(insertMock.mock.calls[0].slice(1, 3)).toEqual([session.accessToken, session.signal]);
        expect(crisisMock.mock.calls[0].slice(1, 3)).toEqual([session.accessToken, session.signal]);
        expect(insertMock.mock.calls[0][0]).toMatchObject({ userId: "chat-user", purpose: "secondb_chat", modelUsed: "none-crisis-routed" });
        expect(crisisMock.mock.calls[0][0].triggerCategories).toContain("input_red");
        expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
        expect(mockGenerateContent).not.toHaveBeenCalled(); expect(live.client).not.toHaveBeenCalled(); expect(live.capturedInvoke).not.toHaveBeenCalled();
      } finally { live.restore(); session.release(); }
    });

    test("control: in the same live harness a green call reaches the SDK", async () => {
      const live = liveHarness();
      try {
        expect(envModule.getEnv().EXPO_PUBLIC_LLM_MODE).toBe("live");
        await callLlm({ userId: "chat-user", locale: "en", purpose: "reasoning_connect", user: GREEN });
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      } finally {
        live.restore();
      }
    });

    test("control: in the same live harness routed through the edge, a green call reaches each proxy door", async () => {
      const live = liveHarness(true);
      try {
        expect(envModule.getEnv().EXPO_PUBLIC_LLM_MODE).toBe("live");
        // The doors throw, so these calls fail; what matters is that each door saw the call.
        await callLlm({ userId: "chat-user", locale: "en", purpose: "reasoning_connect", user: GREEN }).catch(() => undefined);
        expect(live.client).toHaveBeenCalled();
        const controller = new AbortController();
        const session = {
          userId: "chat-user",
          epoch: 1,
          accessToken: "fixture-token",
          signal: controller.signal,
          assertCurrent: (): void => undefined,
          abort: (): void => controller.abort(),
          release: (): void => controller.abort(),
        };
        await callLlm({ userId: "chat-user", locale: "en", purpose: "reasoning_connect", user: GREEN, session }).catch(
          () => undefined,
        );
        expect(live.capturedInvoke).toHaveBeenCalled();
      } finally {
        live.restore();
      }
    });
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
    __resetAccountEpochForTests(); noteResolvedOwner("interview-user");
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
