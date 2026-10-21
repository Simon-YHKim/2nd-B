const mockInvoke = jest.fn();
const mockSemantic = jest.fn();
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }) }));
jest.mock("../audit-write-outbox", () => ({ enqueueAuditWrite: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true }) }));
jest.mock("../safety", () => ({ ...jest.requireActual("../safety"), classifySafety: (...args: unknown[]) => mockSemantic(...args) }));

import { callLlm } from "../boundary";
import type { PromptInput } from "../types";

const TURN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUDIT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECOND = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const input: PromptInput = { userId: "owner-a", locale: "en", purpose: "secondb_chat", user: "Plan my week.",
  chatTurn: { route: { vendor: "openai", reservationSupported: true }, turnId: TURN, intent: "first" } };
const response = (auditId: unknown = AUDIT, audited: unknown = true) => ({ data: {
  text: "One step at a time.", audited, auditId, turnBound: false,
}, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue(response());
  mockSemantic.mockResolvedValue({ zone: "red", triggers: [], confidence: 1, cssrsLevel: null, source: "lexicon-fallback" });
});

test("only a replaced output exposes this invocation's server receipt, even with turnBound=false", async () => {
  const reply = await callLlm(input);
  expect(reply.safety.zone).toBe("red");
  expect(reply.outputSwap).toEqual({ auditId: AUDIT, reservationId: TURN });
  expect(reply.turnBound).toBe(false);
  expect(reply.audit.modelUsed).toContain("+swap:");
});

test.each([undefined, null, "", "bad-id", "bbbbbbbb-bbbb-0bbb-8bbb-bbbbbbbbbbbb", 42])("rejects malformed audit %p", async auditId => {
  mockInvoke.mockResolvedValue({ data: { ...response().data, auditId }, error: null });
  expect(await callLlm(input)).not.toHaveProperty("outputSwap");
});

test.each([false, undefined, "true"])("requires audited true: %p", async audited => {
  mockInvoke.mockResolvedValue({ data: { ...response().data, audited }, error: null });
  expect(await callLlm(input)).not.toHaveProperty("outputSwap");
});

test.each([undefined, "bad-id"])("requires a valid requested reservation: %p", async turnId => {
  expect(await callLlm({ ...input, chatTurn: { ...input.chatTurn!, turnId } })).not.toHaveProperty("outputSwap");
});

test("normal output, non-reservation calls, other purposes, and input RED have no swap receipt", async () => {
  mockSemantic.mockResolvedValueOnce({ zone: "green", triggers: [], confidence: 0 });
  expect(await callLlm(input)).not.toHaveProperty("outputSwap");
  expect(await callLlm({ ...input, chatTurn: undefined })).not.toHaveProperty("outputSwap");
  expect(await callLlm({ ...input, purpose: "source_ingest" })).not.toHaveProperty("outputSwap");
  mockInvoke.mockClear();
  expect(await callLlm({ ...input, user: "I want to kill myself." })).not.toHaveProperty("outputSwap");
  expect(mockInvoke).not.toHaveBeenCalled();
});

test("proxy input 422 never acquires an output receipt, even if the envelope carries one", async () => {
  mockInvoke.mockResolvedValue({ data: null, error: Object.assign(new Error("blocked"), {
    context: new Response(JSON.stringify({ error: "safety_red_zone", auditId: AUDIT, audited: true }), { status: 422 }),
  }) });
  const reply = await callLlm(input);
  expect(reply.safety.zone).toBe("red");
  expect(reply).not.toHaveProperty("outputSwap");
});

test("overlapping attempts retain their own audit IDs when the original finishes last", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  mockInvoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(response(SECOND));
  const original = callLlm(input);
  while (!finish) await Promise.resolve();
  const reask = await callLlm({ ...input, chatTurn: { ...input.chatTurn!, intent: "reask" } });
  finish(response(AUDIT));
  expect(reask.outputSwap).toEqual({ auditId: SECOND, reservationId: TURN });
  expect((await original).outputSwap).toEqual({ auditId: AUDIT, reservationId: TURN });
});
