// Real live turn -> boundary -> candidate -> captured-session refund transport.
const mockInvoke = jest.fn();
const mockAudit = jest.fn();
const mockNotice = jest.fn();
const mockSession = jest.fn();
const mockBump = jest.fn();
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mockSession }, functions: { invoke: mockInvoke },
}) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
  EXPO_PUBLIC_SUPABASE_URL: "https://fixture.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-fixture" }) }));
jest.mock("../../llm/audit-write-outbox", () => ({ enqueueAuditWrite: (...args: unknown[]) => mockAudit(...args) }));
jest.mock("../../llm/safety", () => ({ ...jest.requireActual("../../llm/safety"),
  classifySafety: jest.fn().mockResolvedValue({ zone: "green", triggers: [], confidence: 0 }),
}));
jest.mock("../conversation", () => ({ loadChatContext: jest.fn().mockResolvedValue({}), assembleChatSystemPrompt: () => "fixture system" }));
jest.mock("../usage", () => ({
  ...jest.requireActual("../usage"),
  readChatUsageDetail: jest.fn().mockResolvedValue({ used: 4, adBonus: 0 }),
  bumpChatUsageForTurn: (...args: unknown[]) => mockBump(...args),
}));

import { createLiveChatTurn, sendLiveChatMessage } from "../conversation-turn";
import { __resetAccountEpochForTests, captureAccountOwnerLease, noteResolvedOwner } from "../../auth/account-epoch";
import type { SendMessageInput } from "../conversation";

const TURN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUDIT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECOND = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const input: SendMessageInput = { userId: "owner-a", message: "Plan my week.", locale: "en", tier: "free" };
const savedVendor = process.env.EXPO_PUBLIC_CHAT_VENDOR;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const success = (auditId = AUDIT, text = "I want to kill myself.") => ({
  data: { text, audited: true, auditId, turnBound: false,
    turnAdmission: { mode: "enforce", allowed: true, kind: auditId === SECOND ? "reask" : "first",
      attempt: auditId === SECOND ? 2 : 1, quotaCharged: auditId !== SECOND, bindingEligible: true, reaskAvailable: auditId !== SECOND },
  }, error: null,
});
const turn = (pairId = "pair-1", message = input.message) => createLiveChatTurn({ owner: captureAccountOwnerLease("owner-a")!,
  conversationId: "conversation-1", pairId, message, onCrisisDetected: mockNotice });
async function until(check: () => boolean) {
  for (let i = 0; i < 150 && !check(); i++) await new Promise<void>(resolve => setTimeout(resolve, 5));
  expect(check()).toBe(true);
}
const refunds = () => jest.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/rpc/"));

beforeEach(() => {
  jest.clearAllMocks();
  __resetAccountEpochForTests(); noteResolvedOwner("owner-a");
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "openai";
  mockInvoke.mockResolvedValue(success());
  mockAudit.mockResolvedValue(undefined);
  mockBump.mockResolvedValue({ count: 5, turnId: TURN });
  mockSession.mockResolvedValue({ data: { session: { user: { id: "owner-a" }, access_token: "fixture-a" } }, error: null });
  jest.spyOn(globalThis, "fetch").mockImplementation(async url => new Response(JSON.stringify(String(url).includes("/rpc/") ? 0 : [])));
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { if (savedVendor === undefined) delete process.env.EXPO_PUBLIC_CHAT_VENDOR; else process.env.EXPO_PUBLIC_CHAT_VENDOR = savedVendor; });

test("guidance and the crisis return never await a stopped refund Promise", async () => {
  const gate = deferred<Response>(), live = turn();
  jest.mocked(fetch).mockReturnValueOnce(gate.promise);
  let returned = false;
  const pending = sendLiveChatMessage(input, live).then(value => { returned = true; return value; });
  try {
    await until(() => refunds().length === 1);
    await until(() => returned);
    expect(mockNotice).toHaveBeenCalledTimes(1);
    expect(live.read().terminal).toBe("crisis");
    expect((await pending).status).toBe("crisis");
    expect(refunds()[0][1]?.body).toBe(JSON.stringify({ p_audit_id: AUDIT }));
  } finally { gate.resolve(new Response("0")); await pending; }
});

test("guidance precedes C3; refund starts only after C3 completion", async () => {
  const gate = deferred<void>(), live = turn();
  mockAudit.mockReturnValueOnce(gate.promise);
  const pending = sendLiveChatMessage(input, live);
  await until(() => mockNotice.mock.calls.length === 1);
  expect(refunds()).toHaveLength(0);
  gate.resolve();
  await pending;
  await until(() => refunds().length === 1);
});

test("both replaced attempts become candidates after the first closes the turn, with separate C3 and one notice", async () => {
  const original = deferred<ReturnType<typeof success>>(), reask = deferred<ReturnType<typeof success>>(), live = turn();
  mockInvoke.mockReturnValueOnce(original.promise).mockReturnValueOnce(reask.promise);
  jest.mocked(fetch).mockImplementation(async (url, args) => new Response(JSON.stringify(String(url).includes("/rpc/")
    ? JSON.parse(String(args?.body)).p_audit_id === AUDIT ? null : 0 : [])));
  const first = sendLiveChatMessage(input, live);
  await until(() => mockInvoke.mock.calls.length === 1);
  live.endWait(live.read().attempts[0].ticket);
  const second = sendLiveChatMessage(input, live);
  await until(() => mockInvoke.mock.calls.length === 2);
  original.resolve(success(AUDIT));
  await first;
  await until(() => refunds().length === 2); // First NULL + its bounded retry.
  reask.resolve(success(SECOND));
  await second;
  await until(() => refunds().length === 3);
  expect(refunds().map(([, args]) => JSON.parse(String(args?.body)))).toEqual([
    { p_audit_id: AUDIT }, { p_audit_id: AUDIT }, { p_audit_id: SECOND },
  ]);
  expect(mockNotice).toHaveBeenCalledTimes(1);
  expect(mockAudit.mock.calls.filter(([row]) => row.kind === "ai_audit_log")).toHaveLength(2);
  expect(live.historyValue()).toBeNull();
});

test("a late original swap still settles after another answer won and a new pair was sent", async () => {
  const original = deferred<ReturnType<typeof success>>(), live = turn();
  mockInvoke.mockReturnValueOnce(original.promise).mockResolvedValueOnce(success(SECOND, "One task first."));
  const first = sendLiveChatMessage(input, live);
  await until(() => mockInvoke.mock.calls.length === 1);
  live.endWait(live.read().attempts[0].ticket);
  expect((await sendLiveChatMessage(input, live)).status).toBe("selected");
  live.retireRetry();
  mockInvoke.mockResolvedValueOnce(success(SECOND, "Next task."));
  await sendLiveChatMessage(input, turn("pair-2"));
  original.resolve(success(AUDIT));
  expect((await first).status).toBe("crisis");
  await until(() => refunds().length === 1);
  expect(refunds()[0][1]?.body).toBe(JSON.stringify({ p_audit_id: AUDIT }));
});

test("a new generation's receipt cannot replace the old request's captured receipt", async () => {
  const original = deferred<ReturnType<typeof success>>(), live = turn();
  mockInvoke.mockReturnValueOnce(original.promise).mockResolvedValueOnce({ data: null, error: Object.assign(new Error("ineligible"), {
    context: new Response(JSON.stringify({ error: "reask_ineligible", turnAdmission: { mode: "enforce", allowed: false,
      kind: "rejected", attempt: null, quotaCharged: false, bindingEligible: false, reaskAvailable: false } }), { status: 409 }),
  }) });
  const first = sendLiveChatMessage(input, live);
  await until(() => mockInvoke.mock.calls.length === 1);
  live.endWait(live.read().attempts[0].ticket);
  await expect(sendLiveChatMessage(input, live)).rejects.toMatchObject({ code: "reask_ineligible" });
  mockBump.mockResolvedValueOnce({ count: 5, turnId: SECOND });
  mockInvoke.mockResolvedValueOnce(success(SECOND, "A new answer."));
  await sendLiveChatMessage(input, live);
  expect(live.read().receipt?.turnId).toBe(SECOND);
  original.resolve(success(AUDIT));
  await first;
  await until(() => refunds().length === 1);
  expect(refunds()[0][1]?.body).toBe(JSON.stringify({ p_audit_id: AUDIT }));
});

test.each(["input", "422", "normal", "missing-audit", "legacy"])("%s creates no refund candidate", async mode => {
  if (mode === "422") mockInvoke.mockResolvedValue({ data: null, error: Object.assign(new Error("blocked"), {
    context: new Response('{"error":"safety_red_zone"}', { status: 422 }),
  }) });
  if (mode === "normal") mockInvoke.mockResolvedValue(success(AUDIT, "One small step."));
  if (mode === "missing-audit") mockInvoke.mockResolvedValue({ data: { ...success().data, auditId: undefined }, error: null });
  if (mode === "legacy") mockBump.mockResolvedValue({ count: 5, turnId: null });
  const message = mode === "input" ? "I want to kill myself." : input.message;
  await sendLiveChatMessage({ ...input, message }, turn("pair-1", message));
  expect(refunds()).toHaveLength(0);
  expect(mockSession).not.toHaveBeenCalled();
});
