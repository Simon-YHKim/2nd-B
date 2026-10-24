const mockCapturedInvoke = jest.fn();
const mockGlobalInvoke = jest.fn();
const mockClassifySafety = jest.fn();
const mockEnqueueAuditWrite = jest.fn();
const mockGetSession = jest.fn();
const mockGlobalRpc = jest.fn();
const mockGlobalFrom = jest.fn();
const mockEmbedContent = jest.fn();
let mockUseVertex = false;
let mockViaEdge = true;

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    functions: { invoke: (...args: unknown[]) => mockGlobalInvoke(...args) },
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockGlobalRpc(...args),
    from: (...args: unknown[]) => mockGlobalFrom(...args),
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
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: mockViaEdge,
    EXPO_PUBLIC_USE_VERTEX: mockUseVertex,
  }),
}));

jest.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: jest.fn(), embedContent: (...args: unknown[]) => mockEmbedContent(...args) };
  },
}));

import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { beginAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { callLlm, classifyChatTextForCrisis, embedTexts, EMBED_MODEL } from "../boundary";

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

describe("chat local RED with a captured account session", () => {
  const releases: (() => void)[] = [];
  const GREEN = "Today I went for a walk.";
  const RED = "I want to die";
  const noEgressOrQuota = () => {
    expect(mockCapturedInvoke).not.toHaveBeenCalled(); expect(mockGlobalInvoke).not.toHaveBeenCalled();
    expect(mockClassifySafety).not.toHaveBeenCalled(); expect(mockGlobalRpc).not.toHaveBeenCalled();
    expect(mockGlobalFrom).not.toHaveBeenCalled();
    expect(mockGetSession).toHaveBeenCalledTimes(1); // authentication, never a boundary re-read
  };
  async function session() {
    const pending = beginAccountSessionLease("user-a"); releases.push(pending.release);
    return pending.authenticate();
  }
  function moveOwner(aba = false) {
    beginAccountOwnerTransition("user-b");
    if (aba) {
      noteResolvedOwner("user-b"); clearAccountTransition(currentAccountEpoch());
      noteResolvedOwner("user-a"); clearAccountTransition(currentAccountEpoch());
    }
  }
  beforeEach(() => {
    jest.resetAllMocks(); __resetAccountEpochForTests(); noteResolvedOwner("user-a");
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-a" }, access_token: "captured-chat-token" } }, error: null });
    mockEnqueueAuditWrite.mockResolvedValue(undefined);
  });
  afterEach(() => { releases.splice(0).forEach(release => release()); __resetAccountEpochForTests(); });

  test("GREEN returns null with no observer, audit, model, quota or second auth read", async () => {
    const capability = await session(); const observer = jest.fn();
    await expect(classifyChatTextForCrisis(GREEN, "en", "user-a", false, {
      session: capability, signal: capability.signal, onCrisisDetected: observer,
    })).resolves.toBeNull();
    expect(observer).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); noEgressOrQuota();
  });

  test.each([GREEN, RED])("owner mismatch is refused even before local routing: %s", async text => {
    const capability = await session(); const observer = jest.fn();
    await expect(classifyChatTextForCrisis(text, "en", "user-b", false, {
      session: capability, onCrisisDetected: observer,
    })).rejects.toThrow("llm_session_owner_mismatch");
    expect(observer).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); noEgressOrQuota();
  });

  test.each([GREEN, RED])("different signal is refused before local routing: %s", async text => {
    const capability = await session(); const observer = jest.fn();
    await expect(classifyChatTextForCrisis(text, "en", "user-a", false, {
      session: capability, signal: new AbortController().signal, onCrisisDetected: observer,
    })).rejects.toThrow("llm_session_signal_mismatch");
    expect(observer).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); noEgressOrQuota();
  });

  test.each(["abort", "hold", "ABA"])("%s before classification starts no audit or observer", async reason => {
    const capability = await session(); const observer = jest.fn();
    if (reason === "abort") capability.abort(); else moveOwner(reason === "ABA");
    await expect(classifyChatTextForCrisis(RED, "en", "user-a", false, {
      session: capability, onCrisisDetected: observer,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(observer).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); noEgressOrQuota();
  });

  test.each(["abort", "hold", "ABA", "hold-and-throw"])("observer %s reentry fences the first audit", async reason => {
    const capability = await session();
    const observer = jest.fn(() => {
      if (reason === "abort") capability.abort(); else moveOwner(reason === "ABA");
      if (reason === "hold-and-throw") throw new Error("observer effect failed");
    });
    await expect(classifyChatTextForCrisis(RED, "en", "user-a", false, {
      session: capability, onCrisisDetected: observer,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(observer).toHaveBeenCalledTimes(1); expect(observer).toHaveBeenCalledWith("GLOBAL_988");
    expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); noEgressOrQuota();
  });

  test("an observer exception alone preserves both original captured ledgers", async () => {
    const capability = await session(); const order: string[] = [];
    mockEnqueueAuditWrite.mockImplementation(async (entry) => { order.push(entry.kind); });
    const observer = jest.fn(() => { order.push("visible"); throw new Error("UI effect"); });
    await expect(classifyChatTextForCrisis(RED, "en", "user-a", false, {
      session: capability, onCrisisDetected: observer,
    })).resolves.toMatchObject({ safety: { zone: "red", crisisRouting: { hotline: "GLOBAL_988" } } });
    expect(order).toEqual(["visible", "ai_audit_log", "crisis_event"]); expect(observer).toHaveBeenCalledTimes(1);
    for (const [entry, delivery] of mockEnqueueAuditWrite.mock.calls) {
      expect(entry.ownerUserId).toBe("user-a");
      expect(delivery).toMatchObject({ userId: "user-a", accessToken: "captured-chat-token", signal: capability.signal });
      expect(delivery.assertCurrent).toBe(capability.assertCurrent);
    }
    noEgressOrQuota();
  });

  test.each([1, 2])("owner hold during audit %s prevents later audit/result without hiding the early notice", async stage => {
    const capability = await session(); const observer = jest.fn();
    let finish!: () => void; const pendingAudit = new Promise<void>(resolve => { finish = resolve; });
    let calls = 0;
    mockEnqueueAuditWrite.mockImplementation(() => ++calls === stage ? pendingAudit : Promise.resolve());
    const result = classifyChatTextForCrisis(RED, "en", "user-a", false, { session: capability, onCrisisDetected: observer });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(observer).toHaveBeenCalledTimes(1); expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(stage);
    moveOwner(); finish(); await rejected;
    expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(stage); expect(observer).toHaveBeenCalledTimes(1); noEgressOrQuota();
  });

  test("an owner hold after routing settles still fences the helper's returned result", async () => {
    const capability = await session(); const observer = jest.fn();
    let finish!: () => void; const pendingEvent = new Promise<void>(resolve => { finish = resolve; });
    mockEnqueueAuditWrite.mockResolvedValueOnce(undefined).mockImplementationOnce(() => pendingEvent);
    const result = classifyChatTextForCrisis(RED, "en", "user-a", false, { session: capability, onCrisisDetected: observer });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(2);
    finish();
    // The event writer resumes first; then routeCrisis gets its final fence.
    // Put the owner hold after that continuation, before this helper resumes.
    await Promise.resolve();
    await Promise.resolve().then(() => moveOwner());
    await rejected;
    expect(observer).toHaveBeenCalledTimes(1); expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(2); noEgressOrQuota();
  });
});

describe("embedTexts captured execution", () => {
  const originalFetch = globalThis.fetch;
  const originalVendor = process.env.EXPO_PUBLIC_EMBED_VENDOR;
  const releases: (() => void)[] = [];
  const vector = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
  const input = { userId: "user-a", texts: ["A walk by the river"], locale: "en" as const };
  let fetchMock: jest.Mock;
  const response = (audited = false) => new Response(JSON.stringify({ vectors: [vector], modelUsed: "fixture-embedding-space", audited }), { status: 200 });
  async function lease() {
    const pending = beginAccountSessionLease("user-a"); releases.push(pending.release);
    return pending.authenticate();
  }
  function retire(session: AuthenticatedAccountSessionLease, reason: string) {
    if (reason === "abort") session.abort();
    else {
      beginAccountOwnerTransition("user-b");
      if (reason === "ABA") {
        noteResolvedOwner("user-b"); clearAccountTransition(currentAccountEpoch());
        noteResolvedOwner("user-a"); clearAccountTransition(currentAccountEpoch());
      }
    }
  }
  beforeEach(() => {
    jest.resetAllMocks(); __resetAccountEpochForTests(); noteResolvedOwner("user-a");
    mockUseVertex = false; mockViaEdge = true;
    process.env.EXPO_PUBLIC_EMBED_VENDOR = "openai";
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-a" }, access_token: "captured-embed-token" } }, error: null });
    mockCapturedInvoke.mockImplementation(jest.requireActual<typeof import("../../supabase/captured-session-client")>("../../supabase/captured-session-client").invokeFunctionWithCapturedSession);
    mockGlobalInvoke.mockImplementation(() => { throw new Error("Mutable embedding egress forbidden"); });
    mockEnqueueAuditWrite.mockResolvedValue(undefined);
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: vector }] });
    fetchMock = jest.fn(async () => response());
    globalThis.fetch = fetchMock as typeof fetch;
  });
  afterEach(() => {
    releases.splice(0).forEach(release => release()); __resetAccountEpochForTests();
    mockUseVertex = false; mockViaEdge = true; globalThis.fetch = originalFetch;
    if (originalVendor === undefined) delete process.env.EXPO_PUBLIC_EMBED_VENDOR;
    else process.env.EXPO_PUBLIC_EMBED_VENDOR = originalVendor;
  });

  test.each(["openai", "gemini"])("%s uses actual captured transport and original signal, without reauthentication", async vendor => {
    const session = await lease(); process.env.EXPO_PUBLIC_EMBED_VENDOR = vendor;
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-b" }, access_token: "must-not-be-used" } }, error: null });
    const result = await embedTexts({ ...input, session, signal: session.signal });
    expect(result.vectors).toEqual([vector]); expect(result.audit.modelUsed).toBe("fixture-embedding-space");
    expect(fetchMock).toHaveBeenCalledWith(`https://example.supabase.co/functions/v1/${vendor}-proxy`, expect.objectContaining({
      signal: session.signal, body: JSON.stringify({ op: "embed", texts: input.texts, purpose: "embed_index" }),
      headers: expect.objectContaining({ Authorization: "Bearer captured-embed-token" }),
    }));
    expect(mockGetSession).toHaveBeenCalledTimes(1); expect(mockGlobalInvoke).not.toHaveBeenCalled();
    expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(1);
    expect(mockEnqueueAuditWrite).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-a", payload: expect.objectContaining({ purpose: "embed_index", modelUsed: "fixture-embedding-space" }) }), expect.objectContaining({ userId: "user-a", accessToken: "captured-embed-token", signal: session.signal }));
  });

  test.each(["owner", "signal", "abort", "hold", "ABA"])("%s mismatch before embedding sends no body or audit", async reason => {
    const session = await lease();
    if (!["owner", "signal"].includes(reason)) retire(session, reason);
    await expect(embedTexts({ ...input, session, userId: reason === "owner" ? "user-b" : "user-a", signal: reason === "signal" ? new AbortController().signal : session.signal })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled(); expect(mockGlobalInvoke).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled();
  });

  test.each(["abort", "hold", "ABA"].flatMap(reason => ["audited", "unaudited", "reject"].map(outcome => [reason, outcome] as const)))("%s at proxy %s blocks audit and vectors", async (reason, outcome) => {
    const session = await lease();
    fetchMock.mockImplementationOnce(async () => {
      retire(session, reason);
      if (outcome === "reject") throw new Error("Late upstream failure");
      return response(outcome === "audited");
    });
    await expect(embedTexts({ ...input, session })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); expect(mockGlobalInvoke).not.toHaveBeenCalled();
  });

  test.each(["abort", "hold", "ABA"].flatMap(reason => ["resolve", "reject"].map(outcome => [reason, outcome] as const)))("%s at audit %s does not return late vectors", async (reason, outcome) => {
    const session = await lease();
    mockEnqueueAuditWrite.mockImplementationOnce(async () => { retire(session, reason); if (outcome === "reject") throw new Error("Late audit failure"); });
    await expect(embedTexts({ ...input, session })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])("server audited=%s retains the original client audit count", async audited => {
    const session = await lease(); fetchMock.mockResolvedValueOnce(response(audited));
    await expect(embedTexts({ ...input, session })).resolves.toMatchObject({ vectors: [vector] });
    expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(audited ? 0 : 1);
  });

  test.each([false, true])("RED mixed=%s never sends the withheld text and retains a captured red audit", async mixed => {
    const session = await lease(); fetchMock.mockResolvedValueOnce(response(true));
    const texts = mixed ? ["A walk by the river", "I want to die"] : ["I want to die"];
    const result = await embedTexts({ ...input, texts, session });
    expect(result.vectors.at(-1)).toEqual(new Array(768).fill(0)); expect(result.audit.safetyZone).toBe("red");
    expect(fetchMock).toHaveBeenCalledTimes(mixed ? 1 : 0);
    if (mixed) expect(JSON.parse(fetchMock.mock.calls[0][1].body).texts).toEqual([texts[0]]);
    expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(1);
    expect(mockEnqueueAuditWrite.mock.calls[0][1].accessToken).toBe("captured-embed-token");
  });

  test("empty input has no egress or audit and is still owner-fenced", async () => {
    const session = await lease();
    await expect(embedTexts({ ...input, texts: [], session })).resolves.toMatchObject({ vectors: [] });
    retire(session, "hold");
    await expect(embedTexts({ ...input, texts: [], session })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).not.toHaveBeenCalled();
  });

  test("caller mutation while egress awaits cannot replace the captured owner or RED positions", async () => {
    const session = await lease(); const other = capturedSession("user-b").session;
    const request = { ...input, texts: ["A walk by the river", "I want to die"], session };
    fetchMock.mockImplementationOnce(async () => { request.userId = "user-b"; request.session = other; request.texts.reverse(); return response(); });
    const result = await embedTexts(request);
    expect(result.vectors).toEqual([vector, new Array(768).fill(0)]);
    expect(mockEnqueueAuditWrite.mock.calls[0][0].ownerUserId).toBe("user-a");
    expect(mockEnqueueAuditWrite.mock.calls[0][1].accessToken).toBe("captured-embed-token");
  });

  test("Vertex retains model/dimension and passes the operation signal", async () => {
    mockViaEdge = false; mockUseVertex = true; const session = await lease();
    await expect(embedTexts({ ...input, session })).resolves.toMatchObject({ vectors: [vector], audit: { modelUsed: EMBED_MODEL, vertexBackend: true } });
    expect(mockEmbedContent).toHaveBeenCalledWith({ model: EMBED_MODEL, contents: input.texts, config: { outputDimensionality: 768, abortSignal: session.signal } });
    expect(fetchMock).not.toHaveBeenCalled(); expect(mockEnqueueAuditWrite).toHaveBeenCalledTimes(1);
  });

  test.each(["resolve", "reject"])("Vertex late %s after owner hold cannot return vectors or enqueue audit", async outcome => {
    mockViaEdge = false; mockUseVertex = true; const session = await lease();
    mockEmbedContent.mockImplementationOnce(async () => { retire(session, "hold"); if (outcome === "reject") throw new Error("Vertex late failure"); return { embeddings: [{ values: vector }] }; });
    await expect(embedTexts({ ...input, session })).rejects.toMatchObject({ name: "AbortError" });
    expect(mockEnqueueAuditWrite).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
