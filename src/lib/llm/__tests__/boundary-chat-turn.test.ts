import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("owner-a"); });

import fs from "node:fs";
import path from "node:path";

const mockInvoke = jest.fn();
const mockCapturedInvoke = jest.fn();
const mockRpc = jest.fn();
const mockAudit = jest.fn();
const mockCrisis = jest.fn();
const mockSemantic = jest.fn();
const mockEvents: string[] = [];

jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke }, rpc: mockRpc }),
}));
jest.mock("../../supabase/captured-session-client", () => ({
  invokeFunctionWithCapturedSession: (...args: unknown[]) => mockCapturedInvoke(...args),
}));
jest.mock("../audit-write-outbox", () => ({
  enqueueAuditWrite: (entry: { kind: string }, session: unknown) =>
    entry.kind === "crisis_event" ? mockCrisis(entry, session) : mockAudit(entry, session),
}));
jest.mock("../../env", () => ({
  getEnv: () => {
    mockEvents.push("env");
    return { EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true, EXPO_PUBLIC_USE_VERTEX: false };
  },
}));
jest.mock("../../safety/classifier", () => {
  const actual = jest.requireActual("../../safety/classifier");
  return {
    ...actual,
    classifyInputAnyLocale: (...args: unknown[]) => {
      mockEvents.push("input");
      return actual.classifyInputAnyLocale(...args);
    },
    classifyInput: (...args: unknown[]) => {
      mockEvents.push("output");
      return actual.classifyInput(...args);
    },
  };
});
jest.mock("../safety", () => ({
  ...jest.requireActual("../safety"),
  classifySafety: (...args: unknown[]) => mockSemantic(...args),
}));

import { callLlm, LlmChatTurnError, LlmConsentError, selectChatTurnRoute } from "../boundary";
import { bumpChatUsageForTurn, bumpChatUsageIfUnderCap } from "../../chat/usage";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { MODELS, type PromptInput, type TurnAdmission } from "../types";

const INPUT: PromptInput = { userId: "owner-a", locale: "en", purpose: "secondb_chat", user: "Help me plan my week." };
const TURN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIRST: TurnAdmission = {
  mode: "enforce", allowed: true, kind: "first", attempt: 1,
  quotaCharged: true, bindingEligible: true, reaskAvailable: true,
};
const SECOND: TurnAdmission = { ...FIRST, kind: "reask", attempt: 2, quotaCharged: false, reaskAvailable: false };
const REJECTED: TurnAdmission = {
  mode: "enforce", allowed: false, kind: "rejected", attempt: null,
  quotaCharged: false, bindingEligible: false, reaskAvailable: false,
};
const UNKNOWN: TurnAdmission = {
  mode: "enforce", allowed: null, kind: null, attempt: null,
  quotaCharged: null, bindingEligible: null, reaskAvailable: null,
};
const LEGACY: TurnAdmission = { ...UNKNOWN, mode: "legacy", allowed: true, quotaCharged: true };
const ENV_KEYS = ["EXPO_PUBLIC_CHAT_VENDOR", "EXPO_PUBLIC_FAILOVER_VENDOR", "EXPO_PUBLIC_MULTIMODAL_VENDOR",
  "EXPO_PUBLIC_REASONING_PROVIDER", "EXPO_PUBLIC_OBFUSCATION_SAFETY"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function proxyFailure(status: number, body: unknown) {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    context: new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  });
}

function reservationInput(extra: Partial<PromptInput> = {}): PromptInput {
  return { ...INPUT, chatTurnId: TURN_ID, chatAttemptIntent: "reask", ...extra };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockEvents.length = 0;
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "openai";
  process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "none";
  mockInvoke.mockImplementation(async () => {
    mockEvents.push("proxy");
    return { data: { text: "Start with one small task.", audited: false }, error: null };
  });
  mockCapturedInvoke.mockImplementation((...args: unknown[]) => mockInvoke(...args));
  mockSemantic.mockImplementation(async () => {
    mockEvents.push("semantic");
    return { zone: "green", triggers: [], confidence: 0.1, cssrsLevel: null, source: "lexicon-fallback" };
  });
  mockAudit.mockImplementation(async () => { mockEvents.push("audit"); });
  mockCrisis.mockResolvedValue(undefined);
  jest.spyOn(Date, "now").mockReturnValue(1_000);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("T03: pre-bump vendor selection and dormant reservation dispatch", () => {
  test.each(["first", "reask"] as const)("integrates real usage receipt and %s intent with the pinned proxy", async intent => {
    const route = selectChatTurnRoute();
    expect(route).toEqual({ vendor: "openai", reservationSupported: true });
    expect(Object.isFrozen(route)).toBe(true);
    mockRpc.mockImplementationOnce(async () => {
      mockEvents.push("bump");
      process.env.EXPO_PUBLIC_CHAT_VENDOR = "gemini";
      return { data: { count: 5, turnId: TURN_ID }, error: null, status: 200 };
    });
    const receipt = await bumpChatUsageForTurn(INPUT.userId, 5, "2026-10-21");
    await callLlm({ ...INPUT, chatTurnRoute: route, chatTurnId: receipt.turnId!, chatAttemptIntent: intent });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("bump_chat_usage_for_turn", { p_user_id: INPUT.userId, p_day: "2026-10-21" });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("openai-proxy", expect.objectContaining({ body: expect.objectContaining({
      chatTurnId: TURN_ID, chatAttemptIntent: intent,
    }) }));
    expect(mockEvents.indexOf("bump")).toBeLessThan(mockEvents.indexOf("proxy"));
    expect(mockEvents.indexOf("input")).toBeLessThan(mockEvents.indexOf("proxy"));
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  test.each(["gemini", "xai", "claude"] as const)("%s selects legacy bump and sends zero reservation fields", async vendor => {
    process.env.EXPO_PUBLIC_CHAT_VENDOR = vendor;
    const route = selectChatTurnRoute();
    expect(route).toEqual({ vendor, reservationSupported: false });
    mockRpc.mockResolvedValueOnce({ data: 3, error: null, status: 200 });
    if (route.reservationSupported) await bumpChatUsageForTurn(INPUT.userId, 5, "2026-10-21");
    else await bumpChatUsageIfUnderCap(INPUT.userId, 5, "2026-10-21");
    process.env.EXPO_PUBLIC_CHAT_VENDOR = "openai";
    await callLlm(reservationInput({ chatTurnRoute: route }));
    expect(mockRpc.mock.calls[0][0]).toBe("bump_chat_usage_if_under_cap");
    expect(mockInvoke.mock.calls[0][0]).toBe(`${vendor}-proxy`);
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty("chatTurnId");
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty("chatAttemptIntent");
  });

  test("selection includes the image and pro-tier routing seams", () => {
    process.env.EXPO_PUBLIC_CHAT_VENDOR = "xai";
    process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR = "gemini";
    expect(selectChatTurnRoute({ image: { mimeType: "image/png", data: "test" } })).toEqual({ vendor: "gemini", reservationSupported: false });
    process.env.EXPO_PUBLIC_CHAT_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "openai";
    expect(selectChatTurnRoute({ model: "pro" })).toEqual({ vendor: "openai", reservationSupported: true });
  });

  test.each([{ chatTurnId: TURN_ID, chatAttemptIntent: "first" as const }, { chatTurnId: TURN_ID },
    { chatAttemptIntent: "reask" as const }])("reservation failures never fail over: %j", async extra => {
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    const error = new Error("network unavailable");
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    await expect(callLlm({ ...INPUT, ...extra })).rejects.toBe(error);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test("explicit reask without a turn ID reaches the server as reask and cannot fail over", async () => {
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    const error = proxyFailure(409, { error: "reask_ineligible", turnAdmission: REJECTED });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    await expect(callLlm({ ...INPUT, chatAttemptIntent: "reask" })).rejects.toMatchObject({ code: "reask_ineligible" });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].body.chatAttemptIntent).toBe("reask");
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty("chatTurnId");
  });

  test("omitted intent stays omitted for the server's first default", async () => {
    await callLlm({ ...INPUT, chatTurnId: TURN_ID });
    expect(mockInvoke.mock.calls[0][1].body.chatTurnId).toBe(TURN_ID);
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty("chatAttemptIntent");
  });

  test("another purpose ignores all chat options", async () => {
    const result = await callLlm(reservationInput({ purpose: "source_ingest", chatTurnRoute: { vendor: "xai", reservationSupported: false } }));
    expect(mockInvoke.mock.calls[0][0]).toBe("openai-proxy");
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty("chatTurnId");
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty("chatAttemptIntent");
    expect(result).not.toHaveProperty("turnAdmission");
  });

  test("A1-P reservation consumers are dormant transitively across all production src", () => {
    const sources = new Map<string, string>();
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "__tests__") continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
          const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
          sources.set(relative, fs.readFileSync(file, "utf8"));
        }
      }
    };
    visit(path.join(process.cwd(), "src"));
    const consumers = [...sources].filter(([file, source]) =>
      !["src/lib/llm/boundary.ts", "src/lib/llm/types.ts"].includes(file)
      && /\b(selectChatTurnRoute|chatTurnRoute|chatAttemptIntent|chatTurnId|chatTurn|classifyLiveChatTextForCrisis)\b/.test(source))
      .map(([file]) => file);
    expect(consumers).toEqual(["src/lib/chat/conversation-turn.ts"]);
    // B1: the existing live chat screen is the only production runtime entry.
    // Type-only helpers do not activate it; aliases or other helpers stay off.
    for (const [file, source] of sources) {
      if (file === "src/lib/chat/conversation-turn.ts") continue;
      const runtime = source.replace(/import type\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "");
      expect({ file, callsLiveEntry: /conversation-turn|\b(createLiveChatTurn|sendLiveChatMessage)\b/.test(runtime) })
        .toEqual({ file, callsLiveEntry: file === "src/app/secondb.tsx" });
    }
  });
});

describe("T13: authoritative admission across successful and failed responses", () => {
  test("first intent preserves the server's unbound admission", async () => {
    const admission: TurnAdmission = { ...FIRST, kind: "unbound", attempt: null, bindingEligible: false, reaskAvailable: false };
    mockInvoke.mockResolvedValueOnce({ data: { text: "One small task.", audited: true, turnAdmission: admission }, error: null });
    const result = await callLlm(reservationInput({ chatAttemptIntent: "first" }));
    expect(result.turnAdmission).toEqual(admission);
    expect(result).not.toHaveProperty("turnBound");
    expect(mockInvoke.mock.calls[0][1].body.chatAttemptIntent).toBe("first");
  });

  test.each([FIRST, SECOND, LEGACY, { ...FIRST, kind: "unbound" as const, attempt: null, bindingEligible: false, reaskAvailable: false }])(
    "success preserves every field, including kind=$kind", async admission => {
      mockInvoke.mockResolvedValueOnce({ data: { text: "One small task.", audited: true, turnAdmission: admission, turnBound: false }, error: null });
      const result = await callLlm(reservationInput());
      expect(result.turnAdmission).toEqual(admission);
      expect(result.turnBound).toBe(false);
      expect(mockAudit).not.toHaveBeenCalled();
    });

  test.each([
    [409, "reask_ineligible", REJECTED, "reask"],
    [409, "first_already_registered", REJECTED, "first"],
    [429, "purpose_limit_exceeded", { ...REJECTED, reaskAvailable: null }, "reask"],
    [503, "chat_admission_unavailable", UNKNOWN, "reask"],
  ] as const)("HTTP %s %s is a distinct typed rejection", async (status, code, admission, intent) => {
    const error = proxyFailure(status, { error: code, turnAdmission: admission });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    const failure = await callLlm(reservationInput({ chatAttemptIntent: intent })).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(LlmChatTurnError);
    expect(failure).toMatchObject({ code, turnAdmission: admission, cause: error });
    expect(error.context.bodyUsed).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].body.chatAttemptIntent).toBe(intent);
    expect(mockSemantic).not.toHaveBeenCalled();
  });

  test.each([
    [429, "spend_cap_exceeded", FIRST], [503, "capacity_unavailable", SECOND],
    [500, "api_key_missing", FIRST], [502, "provider_failed", LEGACY],
  ] as const)("post-admission %s %s preserves the committed result", async (status, code, admission) => {
    const body = { error: code, turnAdmission: admission };
    const error = proxyFailure(status, body);
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    const failure = await callLlm(reservationInput()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(LlmChatTurnError);
    expect(failure).toMatchObject({ code: null, turnAdmission: admission, cause: error });
    expect(await error.context.json()).toEqual(body);
  });

  test("consent errors retain their existing class and server admission", async () => {
    const error = proxyFailure(503, { error: "consent_check_unavailable", turnAdmission: FIRST });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    const failure = await callLlm(reservationInput()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(LlmConsentError);
    expect(failure).toMatchObject({ code: "consent_check_unavailable", turnAdmission: FIRST });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test("a mismatched HTTP status cannot fabricate a terminal rejection code", async () => {
    const error = proxyFailure(500, { error: "reask_ineligible", turnAdmission: UNKNOWN });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    await expect(callLlm(reservationInput())).rejects.toMatchObject({ code: null, turnAdmission: UNKNOWN });
  });

  test.each(["purpose_limit_exceeded", "chat_admission_unavailable"])(
    "HTTP 500 cannot promote %s to an admission rejection", async code => {
      const error = proxyFailure(500, { error: code, turnAdmission: UNKNOWN });
      mockInvoke.mockResolvedValueOnce({ data: null, error });
      await expect(callLlm(reservationInput())).rejects.toMatchObject({ code: null, turnAdmission: UNKNOWN, cause: error });
    });

  test("malformed failure admission grants no facts while preserving a valid rejection code", async () => {
    const error = proxyFailure(409, { error: "first_already_registered", turnAdmission: { ...FIRST, allowed: "true" } });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    const failure = await callLlm(reservationInput({ chatAttemptIntent: "first" })).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(LlmChatTurnError);
    expect(failure).toMatchObject({ code: "first_already_registered", turnAdmission: undefined, cause: error });
    expect(error.context.bodyUsed).toBe(false);
  });

  test.each(["One small task.", "I want to end my life tonight"])(
    "omitted turnBound stays absent through the output boundary: %s", async text => {
      mockInvoke.mockResolvedValueOnce({ data: { text, audited: true, turnAdmission: FIRST }, error: null });
      const result = await callLlm(reservationInput());
      expect(result.turnAdmission).toEqual(FIRST);
      expect(result).not.toHaveProperty("turnBound");
    });

  test("an output swap preserves a true turnBound", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { text: "I want to end my life tonight", audited: true,
      turnAdmission: SECOND, turnBound: true }, error: null });
    const result = await callLlm(reservationInput());
    expect(result.safety.zone).toBe("red");
    expect(result.turnAdmission).toEqual(SECOND);
    expect(result.turnBound).toBe(true);
  });

  test.each([undefined, null, {}, { ...FIRST, reaskAvailable: undefined }, { ...FIRST, allowed: "true" },
    { ...FIRST, kind: "invented" }, { ...FIRST, attempt: 3 }, { ...FIRST, mode: "paused" },
    { ...FIRST, quotaCharged: undefined }, { ...FIRST, bindingEligible: 1 }, []])(
    "malformed success admission grants no facts: %j", async admission => {
      mockInvoke.mockResolvedValueOnce({ data: { text: "A task.", turnAdmission: admission }, error: null });
      expect(await callLlm(reservationInput())).not.toHaveProperty("turnAdmission");
    });

  test("unknown admission keeps all nulls on a failed request", async () => {
    const error = proxyFailure(503, { error: "chat_admission_unavailable", turnAdmission: UNKNOWN });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    await expect(callLlm(reservationInput())).rejects.toMatchObject({ turnAdmission: UNKNOWN });
  });

  test("unreadable failure metadata preserves the original error without retry", async () => {
    const error = Object.assign(new Error("unreadable"), { context: new Response("not json", { status: 503 }) });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    await expect(callLlm(reservationInput())).rejects.toBe(error);
    expect(error.context.bodyUsed).toBe(false);
  });
});

describe("C1/C3/C9 and byte-compatible calls without reservation options", () => {
  test("R4 shared crisisObserver retains main's one-shot source contract", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/llm/boundary.ts"), "utf8").replace(/\r\n/g, "\n");
    const observer = source.slice(source.indexOf("function crisisObserver("), source.indexOf("\n// Web Crypto"));
    expect(observer).toBe(`function crisisObserver(observer: CrisisObserver | undefined, fence: () => void): CrisisObserver | undefined {
  if (!observer) return undefined;
  let notified = false;
  return (hotline) => {
    fence();
    if (notified) return;
    notified = true;
    try { observer(hotline); } catch { /* The audited result still follows. */ }
  };
}
`);
  });

  test("consent errors without admission keep their original own properties", () => {
    expect(Object.keys(new LlmConsentError("consent_required"))).toEqual(["code", "name"]);
  });
  test("no options retain the request bytes, result keys and execution order", async () => {
    const result = await callLlm(INPUT);
    expect(JSON.stringify(mockInvoke.mock.calls[0][1].body)).toBe(JSON.stringify({
      system: null, user: INPUT.user, model: MODELS.flash, purpose: "secondb_chat", effort: "low",
    }));
    expect(Object.keys(result)).toEqual(["text", "safety", "audit"]);
    expect(JSON.stringify(result)).toBe(JSON.stringify({
      text: "Start with one small task.", safety: { zone: "green", matched: [], categories: [] },
      audit: { promptHash: "c1cd964c", outputHash: "a7bc704b", modelUsed: MODELS.flash,
        vertexBackend: false, safetyZone: "green", latencyMs: 0, purpose: "secondb_chat", effort: "low", reasoningProvider: "openai" },
    }));
    expect(mockEvents).toEqual(["input", "env", "proxy", "output", "semantic", "audit"]);
  });

  test("unrequested metadata does not alter the old result", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { text: "A task.", turnAdmission: FIRST, turnBound: true }, error: null });
    const result = await callLlm(INPUT);
    expect(Object.keys(result)).toEqual(["text", "safety", "audit"]);
  });

  test("old failure identity and JSON read count remain unchanged", async () => {
    const error = proxyFailure(409, { error: "reask_ineligible", turnAdmission: REJECTED });
    const clone = jest.spyOn(error.context, "clone");
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    await expect(callLlm(INPUT)).rejects.toBe(error);
    expect(clone).not.toHaveBeenCalled();
  });

  test("old automatic failover still works when no reservation is sent", async () => {
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error("outage") });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await callLlm(INPUT);
    expect(mockInvoke.mock.calls.map(([name]) => name)).toEqual(["openai-proxy", "gemini-proxy"]);
  });

  test("RED input still audits and returns before any proxy call", async () => {
    const result = await callLlm(reservationInput({ user: "I want to end my life tonight" }));
    expect(result.safety.zone).toBe("red");
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("turnAdmission");
  });

  test("proxy crisis outranks admission errors and keeps the fixed response and audit", async () => {
    const error = proxyFailure(422, { error: "safety_red_zone", turnAdmission: FIRST });
    mockInvoke.mockResolvedValueOnce({ data: null, error });
    const result = await callLlm(reservationInput());
    expect(result.safety.zone).toBe("red");
    expect(result.turnAdmission).toEqual(FIRST);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockCrisis).toHaveBeenCalledTimes(1);
  });

  test("output swap keeps admission and adds the existing swap audit", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { text: "I want to end my life tonight", audited: true, turnAdmission: SECOND }, error: null });
    const result = await callLlm(reservationInput());
    expect(result.safety.zone).toBe("red");
    expect(result.turnAdmission).toEqual(SECOND);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockCrisis).toHaveBeenCalledTimes(1);
  });

  test("captured session receives the same body and fences stale owner results", async () => {
    let stale = false;
    const controller = new AbortController();
    const session: AuthenticatedAccountSessionLease = {
      userId: INPUT.userId, epoch: 1, accessToken: "test-captured-token", signal: controller.signal,
      assertCurrent: () => { if (stale) throw new Error("stale_owner"); }, abort: jest.fn(), release: jest.fn(),
    };
    await callLlm(reservationInput({ session }));
    expect(mockCapturedInvoke).toHaveBeenCalledWith("openai-proxy", "test-captured-token", expect.objectContaining({
      body: expect.objectContaining({ chatTurnId: TURN_ID, chatAttemptIntent: "reask" }), signal: session.signal,
    }));
    mockCapturedInvoke.mockImplementationOnce(async () => {
      stale = true;
      return { data: { text: "A task.", turnAdmission: FIRST }, error: null };
    });
    await expect(callLlm(reservationInput({ session }))).rejects.toThrow("stale_owner");
  });
});
