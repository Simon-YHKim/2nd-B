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
afterEach(() => jest.restoreAllMocks());
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
  expect(mockCapturedInvoke).toHaveBeenCalledWith("openai-proxy", lease.accessToken, expect.objectContaining({ signal: controller.signal }));
  expect(lease.assertCurrent).toHaveBeenCalledTimes(3);
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
  expect(mockInvoke).toHaveBeenCalledWith("openai-proxy", expect.objectContaining({ signal: controller.signal }));
});
