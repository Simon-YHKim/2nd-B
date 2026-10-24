import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("u1"); });

const mockInvoke = jest.fn();
const mockCapturedInvoke = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));
jest.mock("../../supabase/captured-session-client", () => ({
  invokeFunctionWithCapturedSession: (...args: unknown[]) => mockCapturedInvoke(...args),
}));
jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../supabase/crisis-events", () => ({ insertCrisisEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../env", () => ({
  getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_USE_VERTEX: false, EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true }),
}));
// Keep the real input proxy/classifier/gate. Only output classification is a stub.
jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return {
    ...actual,
    classifyObfuscatedInput: jest.fn(actual.classifyObfuscatedInput),
    classifySafety: jest.fn().mockResolvedValue({ zone: "green", triggers: [], confidence: 1 }),
  };
});
jest.mock("../../safety/crisis-obfuscation", () => {
  const actual = jest.requireActual("../../safety/crisis-obfuscation");
  return { ...actual, hasCrisisObfuscation: jest.fn(actual.hasCrisisObfuscation) };
});
jest.mock("../../safety/classifier", () => {
  const actual = jest.requireActual("../../safety/classifier");
  return { ...actual, classifyInputAnyLocale: jest.fn(actual.classifyInputAnyLocale) };
});

import { callLlm } from "../boundary";
import { classifyInputAnyLocale } from "../../safety/classifier";
import { hasCrisisObfuscation } from "../../safety/crisis-obfuscation";
import { classifyObfuscatedInput, classifySafety } from "../safety";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";
import { resetAuditWriteOutboxForTests } from "../audit-write-outbox";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import type { PromptInput, PromptPurpose } from "../types";

const input: PromptInput = { userId: "u1", locale: "en", purpose: "secondb_chat", user: "I want.to die." };
const mockLexicon = jest.mocked(classifyInputAnyLocale);
const mockGate = jest.mocked(hasCrisisObfuscation);
const mockAudit = jest.mocked(insertAiAuditLog);
const mockCrisis = jest.mocked(insertCrisisEvent);
const flags = ["EXPO_PUBLIC_OBFUSCATION_SAFETY", "EXPO_PUBLIC_SERVER_SAFETY", "EXPO_PUBLIC_CHAT_VENDOR", "EXPO_PUBLIC_FAILOVER_VENDOR"];
const saved = flags.map((key) => process.env[key]);
const semanticResponse = (zone: string) => ({ data: { text: JSON.stringify({ zone, triggers: ["active_ideation_no_method"], confidence: 0.87 }) }, error: null });
const generationResponse = { data: { text: "A quiet afternoon.", modelUsed: "test-generation", audited: true }, error: null };
const generationCalls = () => mockInvoke.mock.calls.filter(([, { body }]) => body.purpose !== "safety_classify");
const semanticCalls = () => mockInvoke.mock.calls.filter(([, { body }]) => body.purpose === "safety_classify");
const healthRows = () => mockAudit.mock.calls.filter(([row]) => row.modelUsed === "obfuscation-safety-unavailable");

beforeEach(async () => {
  await resetAuditWriteOutboxForTests();
  jest.clearAllMocks();
  flags.forEach((key) => { delete process.env[key]; });
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "openai";
  process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "none";
  mockInvoke.mockImplementation(async (_fn, { body }) => body.purpose === "safety_classify" ? semanticResponse("green") : generationResponse);
  mockCapturedInvoke.mockImplementation(async (fn, _token, request) => mockInvoke(fn, request));
});
afterAll(() => flags.forEach((key, i) => {
  if (saved[i] === undefined) delete process.env[key];
  else process.env[key] = saved[i];
}));
afterEach(() => jest.useRealTimers());

test.each([
  ["en", false, "988"], ["ko", false, "109"], ["ko", true, "1388"],
] as const)("semantic RED uses the input-red route: locale=%s minor=%s", async (locale, minor, number) => {
  mockInvoke.mockResolvedValueOnce(semanticResponse("red"));
  const result = await callLlm({ ...input, locale, minor });
  expect(generationCalls()).toHaveLength(0);
  expect(semanticCalls()).toHaveLength(1);
  expect(classifySafety).not.toHaveBeenCalled();
  expect(result.text).toContain(number);
  expect(result.safety.zone).toBe("red");
  expect(mockAudit).toHaveBeenCalledTimes(1);
  expect(result.audit).toMatchObject({ modelUsed: "none-crisis-routed", purpose: "secondb_chat", safetyZone: "red" });
  expect(mockCrisis).toHaveBeenCalledTimes(1);
  expect(mockCrisis.mock.calls[0][0]).toMatchObject({ classifierConfidence: 0.87, triggerCategories: ["crisis", "input_semantic_red"], locale });
  expect(healthRows()).toHaveLength(0);
});

test.each(["green", "yellow"])("semantic %s generates once with the original user text", async (zone) => {
  mockInvoke.mockResolvedValueOnce(semanticResponse(zone));
  const result = await callLlm(input);
  expect(result.text).toBe(generationResponse.data.text);
  expect(semanticCalls()).toHaveLength(1);
  expect(generationCalls()).toHaveLength(1);
  expect(generationCalls()[0][1].body.user).toBe(input.user);
  expect(mockCrisis).not.toHaveBeenCalled();
  expect(healthRows()).toHaveLength(0);
  expect(mockLexicon.mock.invocationCallOrder[0]).toBeLessThan(mockGate.mock.invocationCallOrder[0]);
  expect(mockGate.mock.invocationCallOrder[0]).toBeLessThan(mockInvoke.mock.invocationCallOrder[0]);
  expect(mockInvoke.mock.calls.map(([, { body }]) => body.purpose)).toEqual(["safety_classify", "secondb_chat"]);
});

test.each(["transport", "limit", "malformed"])("null from %s fails open with one health row", async (failure) => {
  if (failure === "transport") mockInvoke.mockRejectedValueOnce(new Error("offline"));
  else mockInvoke.mockResolvedValueOnce(failure === "limit" ? { data: null, error: { status: 429 } } : { data: { text: "broken" }, error: null });
  await callLlm(input);
  expect(semanticCalls()).toHaveLength(1);
  expect(generationCalls()).toHaveLength(1);
  expect(healthRows()).toHaveLength(1);
  expect(healthRows()[0][0]).toMatchObject({ promptHash: "", outputHash: "", purpose: "safety_classify" });
  expect(mockCrisis).not.toHaveBeenCalled();
});

test.each([undefined, "false"])("disabled flag (%s) makes zero semantic calls regardless of gate", async (flag) => {
  if (flag === undefined) delete process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY;
  else process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = flag;
  await callLlm(input);
  expect(mockGate).not.toHaveBeenCalled();
  expect(semanticCalls()).toHaveLength(0);
  expect(generationCalls()).toHaveLength(1);
  expect(healthRows()).toHaveLength(0);
});

test.each(["reasoning_connect", "interview_probe", "ops_recommend"] satisfies PromptPurpose[])("other purpose %s does not enter the gate", async (purpose) => {
  await callLlm({ ...input, purpose });
  expect(mockGate).not.toHaveBeenCalled();
  expect(semanticCalls()).toHaveLength(0);
  expect(generationCalls()).toHaveLength(1);
  expect(healthRows()).toHaveLength(0);
});

test("ordinary input has no extra call or health row", async () => {
  await callLlm({ ...input, user: "I enjoyed lunch." });
  expect(mockGate).toHaveBeenCalledTimes(1);
  expect(semanticCalls()).toHaveLength(0);
  expect(generationCalls()).toHaveLength(1);
  expect(healthRows()).toHaveLength(0);
});

test.each(["I want to die.", "지금 죽고 싶어.", "self-harm"])("lexicon RED stops before gate/semantics: %s", async (user) => {
  const result = await callLlm({ ...input, user });
  expect(result.text).toContain("988");
  expect(mockGate).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockCrisis.mock.calls[0][0]).toMatchObject({ classifierConfidence: 0.95, triggerCategories: ["crisis", "input_red"] });
});

test.each(["red", "green", "unavailable"])("session invalidated while awaiting %s never proceeds to generation or records", async (zone) => {
  let current = true;
  const controller = new AbortController();
  const session: AuthenticatedAccountSessionLease = {
    userId: "u1", epoch: 1, accessToken: "test-only-token", signal: controller.signal,
    assertCurrent: () => { if (!current) throw new Error("stale-session"); },
    abort: () => controller.abort(), release: jest.fn(),
  };
  mockCapturedInvoke.mockImplementationOnce(async () => {
    current = false;
    return zone === "unavailable" ? { data: null, error: { status: 429 } } : semanticResponse(zone);
  });
  await expect(callLlm({ ...input, session })).rejects.toThrow("stale-session");
  expect(mockCapturedInvoke).toHaveBeenCalledTimes(1);
  expect(mockCapturedInvoke).toHaveBeenCalledWith("openai-proxy", session.accessToken, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(generationCalls()).toHaveLength(0);
  expect(mockAudit).not.toHaveBeenCalled();
  expect(mockCrisis).not.toHaveBeenCalled();
});

test("abort while waiting for semantics never generates or records", async () => {
  const controller = new AbortController();
  mockInvoke.mockImplementationOnce(async () => { controller.abort(); return semanticResponse("green"); });
  await expect(callLlm({ ...input, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(generationCalls()).toHaveLength(0);
  expect(mockAudit).not.toHaveBeenCalled();
  expect(mockCrisis).not.toHaveBeenCalled();
});

test("callLlm itself fences after the semantic await even if the classifier returns", async () => {
  const controller = new AbortController();
  jest.mocked(classifyObfuscatedInput).mockImplementationOnce(async () => {
    controller.abort();
    return null;
  });
  await expect(callLlm({ ...input, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockAudit).not.toHaveBeenCalled();
});

test("a failed health write cannot stop fail-open generation", async () => {
  mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 429 } });
  mockAudit.mockRejectedValueOnce(new Error("audit unavailable"));
  const result = await callLlm(input);
  expect(result.text).toBe(generationResponse.data.text);
  expect(healthRows()).toHaveLength(1);
  expect(generationCalls()).toHaveLength(1);
});

describe("R1 bounded semantic wait in callLlm", () => {
  beforeEach(() => jest.useFakeTimers());

  test("never-settling proxy records once then generates once at 5000ms", async () => {
    mockInvoke.mockImplementationOnce(() => new Promise(() => {}));
    const settled = jest.fn();
    void callLlm(input).then(settled, (error: unknown) => settled({ error }));
    await jest.advanceTimersByTimeAsync(4999);
    expect(settled).not.toHaveBeenCalled();
    expect(healthRows()).toHaveLength(0);
    expect(generationCalls()).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ text: generationResponse.data.text }));
    expect(healthRows()).toHaveLength(1);
    expect(generationCalls()).toHaveLength(1);
    expect(mockAudit.mock.invocationCallOrder[0]).toBeLessThan(mockInvoke.mock.invocationCallOrder[1]);
    expect(mockCrisis).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(["red", "green"])("%s received before the deadline preserves routing", async (zone) => {
    let deliver!: (value: ReturnType<typeof semanticResponse>) => void;
    mockInvoke.mockReturnValueOnce(new Promise((resolve) => { deliver = resolve; }));
    const settled = jest.fn();
    void callLlm(input).then(settled);
    await jest.advanceTimersByTimeAsync(4999);
    expect(settled).not.toHaveBeenCalled();
    deliver(semanticResponse(zone));
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(generationCalls()).toHaveLength(zone === "red" ? 0 : 1);
    expect(mockCrisis).toHaveBeenCalledTimes(zone === "red" ? 1 : 0);
    expect(healthRows()).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("late RED cannot replace generation or add any record", async () => {
    let deliver!: (value: ReturnType<typeof semanticResponse>) => void;
    mockInvoke.mockReturnValueOnce(new Promise((resolve) => { deliver = resolve; }));
    const settled = jest.fn();
    void callLlm(input).then(settled);
    await jest.advanceTimersByTimeAsync(5000);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ text: generationResponse.data.text }));
    expect(healthRows()).toHaveLength(1);
    const auditCount = mockAudit.mock.calls.length;
    deliver(semanticResponse("red"));
    await jest.runAllTimersAsync();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(generationCalls()).toHaveLength(1);
    expect(mockAudit).toHaveBeenCalledTimes(auditCount);
    expect(mockCrisis).not.toHaveBeenCalled();
  });

  test.each([
    ["user", 1000], ["session", 1000], ["invalid", 1000],
    ["user", 5000], ["session", 5000], ["invalid", 5000],
  ] as const)("%s cancellation at %sms throws without generation/records", async (kind, at) => {
    const controller = new AbortController();
    let current = true;
    const session: AuthenticatedAccountSessionLease = {
      userId: "u1", epoch: 1, accessToken: "test-only-token", signal: controller.signal,
      assertCurrent: () => { if (!current) throw new Error("stale-session"); },
      abort: () => controller.abort(), release: jest.fn(),
    };
    mockInvoke.mockImplementationOnce(() => new Promise(() => {}));
    const settled = jest.fn();
    const rejected = jest.fn();
    void callLlm(kind === "user" ? { ...input, signal: controller.signal } : { ...input, session })
      .then(settled, rejected);
    // At 5000ms the deadline fires first, without flushing its continuation.
    jest.advanceTimersByTime(at);
    if (kind === "invalid") current = false;
    controller.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining(
      kind === "invalid" ? { message: "stale-session" } : { name: "AbortError" },
    ));
    expect(generationCalls()).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockCrisis).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await jest.runAllTimersAsync();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(generationCalls()).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
