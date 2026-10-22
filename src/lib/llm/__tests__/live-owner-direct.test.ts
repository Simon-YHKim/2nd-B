const mockEmbed = jest.fn(), mockEnqueue = jest.fn().mockResolvedValue(undefined);
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn(() => ({ models: { embedContent: mockEmbed } })) }));
jest.mock("../audit-write-outbox", () => ({ enqueueAuditWrite: (...args: unknown[]) => mockEnqueue(...args) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: false,
  EXPO_PUBLIC_USE_VERTEX: true, GOOGLE_CLOUD_PROJECT: "test-project", GOOGLE_CLOUD_LOCATION: "us-central1" }) }));

import { embedTexts } from "../boundary";
import { captureLiveOwnerCheck, observeLiveOwner } from "../../auth/live-owner-guard";
import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";

beforeEach(() => { jest.clearAllMocks(); __resetAccountEpochForTests(); noteResolvedOwner("a"); });

test("sent direct embed retains A's C3 while blocking stale delivery", async () => {
  let finish!: (value: unknown) => void;
  const parent = new AbortController(), owner = observeLiveOwner(captureLiveOwnerCheck("a"), parent.signal);
  const transport = mockEmbed;
  transport.mockImplementation(request => new Promise((resolve, reject) => {
    finish = resolve;
    request.config?.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
  try {
    const pending = embedTexts({ userId: "a", texts: ["Plan my week."], locale: "en", signal: owner.signal }).catch(error => error);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].config.abortSignal).toBe(parent.signal);
    noteResolvedOwner("b");
    finish({ embeddings: [{ values: [0.1] }] });
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: "ai_audit_log", ownerUserId: "a",
      payload: expect.objectContaining({ userId: "a", purpose: "embed_index" }) }), undefined);
  } finally { owner.release(); }
});
