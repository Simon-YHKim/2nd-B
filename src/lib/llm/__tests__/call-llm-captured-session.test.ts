const mockCapturedInvoke = jest.fn();
const mockGlobalInvoke = jest.fn();
const mockClassifySafety = jest.fn();
const mockEnqueueAuditWrite = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    functions: { invoke: (...args: unknown[]) => mockGlobalInvoke(...args) },
  }),
}));

jest.mock("../../supabase/captured-session-client", () => ({
  invokeFunctionWithCapturedSession: (...args: unknown[]) => mockCapturedInvoke(...args),
}));

jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return {
    ...actual,
    classifySafety: (...args: unknown[]) => mockClassifySafety(...args),
  };
});

jest.mock("../audit-write-outbox", () => ({
  enqueueAuditWrite: (...args: unknown[]) => mockEnqueueAuditWrite(...args),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

jest.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: jest.fn() };
  },
}));

import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { callLlm } from "../boundary";

function capturedSession(owner = "user-a") {
  let current = true;
  const controller = new AbortController();
  const session: AuthenticatedAccountSessionLease = {
    userId: owner,
    epoch: 7,
    accessToken: "captured-token-a",
    signal: controller.signal,
    assertCurrent: jest.fn(() => {
      if (!current) throw Object.assign(new Error("stale account"), { name: "AbortError" });
    }),
    abort: jest.fn(() => controller.abort()),
    release: jest.fn(() => controller.abort()),
  };
  return { session, makeStale: () => { current = false; } };
}

const OCR_INPUT = {
  userId: "user-a",
  locale: "en" as const,
  purpose: "capture_ocr" as const,
  user: "Transcribe the image.",
  image: { mimeType: "image/png", data: "iVBORw0KGgo=" },
};

describe("callLlm captured account session", () => {
  const originalFailoverVendor = process.env.EXPO_PUBLIC_FAILOVER_VENDOR;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedInvoke.mockResolvedValue({
      data: { text: "captured OCR", audited: false },
      error: null,
    });
    mockClassifySafety.mockResolvedValue({
      zone: "green",
      triggers: [],
      confidence: 0.1,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "test",
    });
    mockEnqueueAuditWrite.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalFailoverVendor === undefined) {
      delete process.env.EXPO_PUBLIC_FAILOVER_VENDOR;
    } else {
      process.env.EXPO_PUBLIC_FAILOVER_VENDOR = originalFailoverVendor;
    }
  });

  it("uses only the captured JWT for OCR proxy, safety, and audit continuations", async () => {
    const { session } = capturedSession();

    await expect(callLlm({ ...OCR_INPUT, session })).resolves.toMatchObject({
      text: "captured OCR",
    });

    expect(mockGlobalInvoke).not.toHaveBeenCalled();
    expect(mockCapturedInvoke).toHaveBeenCalledWith(
      "openai-proxy",
      "captured-token-a",
      expect.objectContaining({ signal: session.signal }),
    );
    expect(mockClassifySafety).toHaveBeenCalledWith(
      "captured OCR",
      "en",
      { userId: "user-a", capturedSession: session },
    );
    expect(mockEnqueueAuditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "user-a" }),
      expect.objectContaining({
        userId: "user-a",
        accessToken: "captured-token-a",
        signal: session.signal,
      }),
    );
  });

  it("rejects an owner mismatch before any network or audit work", async () => {
    const { session } = capturedSession("user-b");

    await expect(callLlm({ ...OCR_INPUT, session })).rejects.toThrow(
      "llm_session_owner_mismatch",
    );

    expect(mockCapturedInvoke).not.toHaveBeenCalled();
    expect(mockGlobalInvoke).not.toHaveBeenCalled();
    expect(mockEnqueueAuditWrite).not.toHaveBeenCalled();
  });

  it("drops a response that becomes stale while the captured request is in flight", async () => {
    const { session, makeStale } = capturedSession();
    mockCapturedInvoke.mockImplementationOnce(async () => {
      makeStale();
      return { data: { text: "must not escape" }, error: null };
    });

    await expect(callLlm({ ...OCR_INPUT, session })).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(mockClassifySafety).not.toHaveBeenCalled();
    expect(mockEnqueueAuditWrite).not.toHaveBeenCalled();
  });

  it("reuses the captured JWT when an outage falls back to another proxy", async () => {
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    const { session } = capturedSession();
    mockCapturedInvoke
      .mockResolvedValueOnce({ data: null, error: new Error("primary outage") })
      .mockResolvedValueOnce({
        data: { text: "captured failover OCR", audited: false },
        error: null,
      });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(callLlm({ ...OCR_INPUT, session })).resolves.toMatchObject({
      text: "captured failover OCR",
    });

    expect(mockCapturedInvoke).toHaveBeenNthCalledWith(
      1,
      "openai-proxy",
      "captured-token-a",
      expect.objectContaining({ signal: session.signal }),
    );
    expect(mockCapturedInvoke).toHaveBeenNthCalledWith(
      2,
      "gemini-proxy",
      "captured-token-a",
      expect.objectContaining({ signal: session.signal }),
    );
    expect(mockGlobalInvoke).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses the captured capability for a pre-egress crisis short-circuit", async () => {
    const { session } = capturedSession();

    await expect(
      callLlm({ ...OCR_INPUT, user: "I want to die", session }),
    ).resolves.toMatchObject({ safety: { zone: "red" } });

    expect(mockCapturedInvoke).not.toHaveBeenCalled();
    expect(mockGlobalInvoke).not.toHaveBeenCalled();
    expect(mockEnqueueAuditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "user-a" }),
      expect.objectContaining({ accessToken: "captured-token-a" }),
    );
  });
});
