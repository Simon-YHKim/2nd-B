import { createHash } from "node:crypto";

const mockInvoke = jest.fn();
const mockCapturedInvoke = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));
jest.mock("../../supabase/captured-session-client", () => ({
  invokeFunctionWithCapturedSession: (...args: unknown[]) => mockCapturedInvoke(...args),
}));
jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../env", () => ({
  getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_USE_VERTEX: false }),
}));

import { classifyObfuscatedInput, classifySafety } from "../safety";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";

const flags = ["EXPO_PUBLIC_SERVER_SAFETY", "EXPO_PUBLIC_OBFUSCATION_SAFETY", "EXPO_PUBLIC_SAFETY_VENDOR"];
const saved = flags.map((key) => process.env[key]);
const response = { data: { text: JSON.stringify({ zone: "red", triggers: ["active_ideation_no_method"], confidence: 0.87 }) }, error: null };

beforeEach(() => {
  jest.clearAllMocks();
  flags.forEach((key) => { delete process.env[key]; });
  mockInvoke.mockResolvedValue(response);
  mockCapturedInvoke.mockResolvedValue(response);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
afterAll(() => flags.forEach((key, i) => {
  if (saved[i] === undefined) delete process.env[key];
  else process.env[key] = saved[i];
}));

test("the complete SYSTEM_PROMPT bytes match the measured v2 SHA256", async () => {
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  await classifyObfuscatedInput("I want.to die.", "en");
  const [fn, { body }] = mockInvoke.mock.calls[0];
  expect(fn).toBe("openai-proxy");
  expect(body.purpose).toBe("safety_classify");
  expect(body.effort).toBe("low");
  expect(body).not.toHaveProperty("model");
  const suffix = "\n\nClassify the user message below. Output JSON only, no prose.";
  expect(body.system.endsWith(suffix)).toBe(true);
  expect(createHash("sha256").update(body.system.slice(0, -suffix.length), "utf8").digest("hex"))
    .toBe("27937807b0c9f0ff922a727eeaa3d41f85375716f2d551adaa50d32bebc97426");
});

test.each([
  [undefined, undefined, 0, 0], ["false", "false", 0, 0],
  ["true", undefined, 1, 0], [undefined, "true", 0, 1], ["true", "true", 1, 1],
] as const)("independent flags: obfuscation=%s server=%s", async (obfuscation, server, gateCalls, fullCalls) => {
  if (obfuscation !== undefined) process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = obfuscation;
  if (server !== undefined) process.env.EXPO_PUBLIC_SERVER_SAFETY = server;
  const result = await classifyObfuscatedInput("I want.to die.", "en");
  expect(mockInvoke).toHaveBeenCalledTimes(gateCalls);
  expect(result?.zone ?? null).toBe(gateCalls ? "red" : null);
  mockInvoke.mockClear();
  await classifySafety("A quiet afternoon.", "en");
  expect(mockInvoke).toHaveBeenCalledTimes(fullCalls);
});

test.each([
  "", "not json", "null", '{"zone":"purple"}', "[]", '{"zone":"red"}',
  '{"zone":"red","triggers":"bad","confidence":0.8}',
  '{"zone":"red","triggers":[1],"confidence":0.8}',
  '{"zone":"red","triggers":[],"confidence":"bad"}',
])("broken payload returns null: %s", async (text) => {
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  mockInvoke.mockResolvedValue({ data: { text }, error: null });
  await expect(classifyObfuscatedInput("sui.cide", "en")).resolves.toBeNull();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

test.each(["throw", "limit", "empty"])("unavailable proxy returns null without retry: %s", async (kind) => {
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  if (kind === "throw") mockInvoke.mockRejectedValue(new Error("network"));
  else mockInvoke.mockResolvedValue({ data: null, error: kind === "limit" ? { status: 429 } : null });
  await expect(classifyObfuscatedInput("sui.cide", "en")).resolves.toBeNull();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

test("captured session owns token and cancellation, with a fence after the proxy", async () => {
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  const controller = new AbortController();
  const lease: AuthenticatedAccountSessionLease = {
    userId: "u1", epoch: 1, accessToken: "test-only-token", signal: controller.signal,
    assertCurrent: jest.fn(), abort: () => controller.abort(), release: jest.fn(),
  };
  const result = await classifyObfuscatedInput("sui.cide", "en", { capturedSession: lease });
  expect(result).toMatchObject({ zone: "red", confidence: 0.87, source: "llm" });
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockCapturedInvoke).toHaveBeenCalledWith("openai-proxy", lease.accessToken, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(mockCapturedInvoke.mock.calls[0][2].signal.aborted).toBe(false);
  expect(lease.assertCurrent).toHaveBeenCalledTimes(4);
  mockCapturedInvoke.mockImplementationOnce(async () => {
    (lease.assertCurrent as jest.Mock).mockImplementation(() => { throw new Error("stale-session"); });
    return response;
  });
  await expect(classifyObfuscatedInput("sui.cide", "en", { capturedSession: lease })).rejects.toThrow("stale-session");
});

test("standalone abort is propagated, including on a failed request", async () => {
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  const controller = new AbortController();
  mockInvoke.mockImplementationOnce(async () => {
    controller.abort();
    throw new Error("transport stopped");
  });
  await expect(classifyObfuscatedInput("sui.cide", "en", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(mockInvoke.mock.calls[0][1].signal.aborted).toBe(true);
});

describe("R1 obfuscated input deadline", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  });

  test.each([false, true])("never-settling proxy returns null at 5000ms: captured=%s", async (captured) => {
    const controller = new AbortController();
    const lease: AuthenticatedAccountSessionLease = {
      userId: "u1", epoch: 1, accessToken: "test-only-token", signal: controller.signal,
      assertCurrent: jest.fn(), abort: () => controller.abort(), release: jest.fn(),
    };
    const invoke = captured ? mockCapturedInvoke : mockInvoke;
    invoke.mockImplementation(() => new Promise(() => {}));
    const settled = jest.fn();
    void classifyObfuscatedInput("sui.cide", "en", captured ? { capturedSession: lease } : undefined)
      .then(settled, (error: unknown) => settled({ error }));
    await jest.advanceTimersByTimeAsync(4999);
    expect(settled).not.toHaveBeenCalled();
    const request = invoke.mock.calls[0][captured ? 2 : 1];
    expect(request.signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(null);
    expect(request.signal.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(["red", "green"])("%s arriving at 4999ms keeps its verdict and clears timer/listeners", async (zone) => {
    const controller = new AbortController();
    const add = jest.spyOn(controller.signal, "addEventListener");
    const remove = jest.spyOn(controller.signal, "removeEventListener");
    let deliver!: (value: typeof response) => void;
    mockInvoke.mockReturnValue(new Promise((resolve) => { deliver = resolve; }));
    const settled = jest.fn();
    void classifyObfuscatedInput("sui.cide", "en", { signal: controller.signal }).then(settled);
    await jest.advanceTimersByTimeAsync(4999);
    expect(settled).not.toHaveBeenCalled();
    deliver({ data: { text: JSON.stringify({ zone, triggers: [], confidence: 0.87 }) }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ zone, confidence: 0.87 }));
    expect(jest.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    controller.abort();
    expect(mockInvoke.mock.calls[0][1].signal.aborted).toBe(false);
  });

  test.each(["user", "session", "invalid"] as const)("%s cancellation beats the timeout, including its continuation", async (kind) => {
    const user = new AbortController();
    const session = new AbortController();
    let current = true;
    const lease: AuthenticatedAccountSessionLease = {
      userId: "u1", epoch: 1, accessToken: "test-only-token", signal: session.signal,
      assertCurrent: () => { if (!current) throw new Error("stale-session"); },
      abort: () => session.abort(), release: jest.fn(),
    };
    mockCapturedInvoke.mockReturnValue(new Promise(() => {}));
    const settled = jest.fn();
    const rejected = jest.fn();
    void classifyObfuscatedInput("sui.cide", "en", { capturedSession: lease, signal: user.signal })
      .then(settled, rejected);
    // Fire the deadline, then cancel before its promise continuation runs.
    jest.advanceTimersByTime(5000);
    if (kind === "user") user.abort();
    else if (kind === "session") session.abort();
    else current = false;
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining(
      kind === "invalid" ? { message: "stale-session" } : { name: "AbortError" },
    ));
    expect(mockCapturedInvoke.mock.calls[0][2].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("timeout remains null when an abort-aware transport rejects", async () => {
    const stopped = jest.fn();
    mockInvoke.mockImplementation((_fn, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        stopped();
        reject(Object.assign(new Error("request aborted"), { name: "AbortError" }));
      });
    }));
    const settled = jest.fn();
    void classifyObfuscatedInput("sui.cide", "en").then(settled, (error: unknown) => settled({ error }));
    await jest.advanceTimersByTimeAsync(5000);
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(null);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each([false, true])("late RED payload is discarded before parsing (retention callback: %s)", async retain => {
    let deliver!: (value: typeof response) => void;
    mockInvoke.mockReturnValue(new Promise((resolve) => { deliver = resolve; }));
    const settled = jest.fn();
    const onRedResult = jest.fn();
    void classifyObfuscatedInput("sui.cide", "en", retain ? { onRedResult } : undefined).then(settled);
    await jest.advanceTimersByTimeAsync(5000);
    expect(settled).toHaveBeenCalledWith(null);
    const readText = jest.fn(() => response.data.text);
    deliver({ data: { get text() { return readText(); } }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(readText).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(onRedResult).not.toHaveBeenCalled();
  });

  test("legacy full semantic path has no new deadline or composed signal", async () => {
    process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
    const controller = new AbortController();
    const lease: AuthenticatedAccountSessionLease = {
      userId: "u1", epoch: 1, accessToken: "test-only-token", signal: controller.signal,
      assertCurrent: jest.fn(), abort: () => controller.abort(), release: jest.fn(),
    };
    let deliver!: (value: typeof response) => void;
    mockCapturedInvoke.mockReturnValue(new Promise((resolve) => { deliver = resolve; }));
    const settled = jest.fn();
    void classifySafety("A quiet afternoon.", "en", { capturedSession: lease }).then(settled);
    await jest.advanceTimersByTimeAsync(10000);
    expect(settled).not.toHaveBeenCalled();
    expect(mockCapturedInvoke.mock.calls[0][2].signal).toBe(controller.signal);
    expect(controller.signal.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    deliver(response);
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ zone: "red" }));
  });
});
