// Real conversation -> context/usage -> boundary/classifiers -> audit outbox.
// Only the Supabase and vendor/network transports are substituted.
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockQuery = jest.fn();
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn(() => { throw new Error("direct_network_forbidden"); }) }));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    rpc: mockRpc, functions: { invoke: mockInvoke },
    from: (table: string) => {
      let columns = "";
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "order", "limit", "in", "contains", "range", "is", "maybeSingle"]) {
        query[method] = (...args: unknown[]) => { if (method === "select") columns = String(args[0]); return query; };
      }
      query.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve(mockQuery(table, columns)).then(resolve, reject);
      return query;
    },
  }),
}));

import { createLiveChatTurn, sendLiveChatMessage, type LiveChatTurn } from "../conversation-turn";
import { sendChatMessage, type SendMessageInput } from "../conversation";
import { nextTurnAction } from "../turn-result-state";
import { classifyChatTextForCrisis, classifyLiveChatTextForCrisis, callLlm } from "../../llm/boundary";
import type { TurnAdmission } from "../../llm/types";
import { resetAuditWriteOutboxForTests } from "../../llm/audit-write-outbox";
import { __resetAccountEpochForTests, captureAccountOwnerLease, noteResolvedOwner } from "../../auth/account-epoch";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEXT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input: SendMessageInput = { userId: "owner-a", message: "Help me plan my week.", locale: "en", tier: "free" };
const first: TurnAdmission = { mode: "enforce", allowed: true, kind: "first", attempt: 1, quotaCharged: true, bindingEligible: true, reaskAvailable: true };
const second: TurnAdmission = { ...first, kind: "reask", attempt: 2, quotaCharged: false, reaskAvailable: false };
const unknown: TurnAdmission = { mode: "enforce", allowed: null, kind: null, attempt: null, quotaCharged: false, bindingEligible: null, reaskAvailable: null };
const rejected: TurnAdmission = { ...unknown, allowed: false, kind: "rejected", bindingEligible: false, reaskAvailable: false };
const envKeys = ["EXPO_PUBLIC_LLM_MODE", "EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION", "EXPO_PUBLIC_USE_VERTEX", "EXPO_PUBLIC_CHAT_VENDOR",
  "EXPO_PUBLIC_FAILOVER_VENDOR", "EXPO_PUBLIC_EMBED_VENDOR", "EXPO_PUBLIC_SERVER_SAFETY", "EXPO_PUBLIC_SAFETY_VENDOR", "EXPO_PUBLIC_OBFUSCATION_SAFETY", "GOOGLE_API_KEY"];
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let count: number, purposeCount: number, notify: jest.Mock, receipts: jest.Mock;
let primary: (body: Record<string, unknown>) => unknown;
let semantic: (body: Record<string, unknown>) => unknown;
let bump: () => unknown;
const events: string[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 150 && !check(); i++) await new Promise<void>(resolve => setImmediate(resolve));
  expect(check()).toBe(true);
}
function failure(status: number, error: string, turnAdmission?: TurnAdmission) {
  return { data: null, error: Object.assign(new Error(error), {
    context: new Response(JSON.stringify({ error, ...(turnAdmission ? { turnAdmission } : {}) }), { status }),
  }) };
}
function success(text = "Start with one small task.", turnAdmission = first) {
  return { data: { text, turnAdmission, audited: false, turnBound: false }, error: null };
}
function makeTurn(message = input.message, pairId = "pair-1"): LiveChatTurn {
  return createLiveChatTurn({ owner: captureAccountOwnerLease(input.userId)!, conversationId: "conversation-1", pairId, message,
    onCrisisDetected: notify, onReceipt: receipts });
}
function calls(purpose: string) { return mockInvoke.mock.calls.filter(([, options]) => options.body.purpose === purpose); }
function bumps() { return mockRpc.mock.calls.filter(([name]) => name.startsWith("bump_chat_usage")); }
function audits() { return mockRpc.mock.calls.filter(([name, args]) => name.startsWith("log_ai_audit") && args.p_purpose === "secondb_chat"); }
function expireWait(turn: LiveChatTurn) { turn.endWait(turn.read().attempts.at(-1)!.ticket); }

beforeEach(async () => {
  await resetAuditWriteOutboxForTests();
  jest.clearAllMocks();
  __resetAccountEpochForTests(); noteResolvedOwner(input.userId);
  process.env.EXPO_PUBLIC_LLM_MODE = "live";
  process.env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION = "true";
  process.env.EXPO_PUBLIC_USE_VERTEX = "false";
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "openai";
  process.env.EXPO_PUBLIC_EMBED_VENDOR = "openai";
  process.env.EXPO_PUBLIC_SAFETY_VENDOR = "openai";
  process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
  process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "none";
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "false";
  process.env.GOOGLE_API_KEY = "";
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network_forbidden"));
  count = 4; purposeCount = 0; events.length = 0; notify = jest.fn(); receipts = jest.fn();
  bump = () => ({ data: { count: ++count, turnId: ID }, error: null, status: 200 });
  primary = () => { purposeCount++; return success(); };
  semantic = () => ({ data: { text: JSON.stringify({ zone: "green", triggers: [], confidence: 0.1 }) }, error: null });
  mockQuery.mockImplementation(table => {
    events.push(`read:${table}`);
    return { data: table === "chat_usage" ? { count, ad_bonus: 0 } : table === "users"
      ? { id: input.userId, birth_date: "2010-01-01", profile_details: {} } : [], error: null };
  });
  mockRpc.mockImplementation((name, args) => {
    events.push(name);
    if (name === "bump_chat_usage_for_turn") return bump();
    if (name === "bump_chat_usage_if_under_cap") return { data: ++count, error: null, status: 200 };
    if (name.startsWith("log_")) return { data: null, error: null };
    throw new Error(`unexpected_rpc:${name}:${Object.keys(args).join(",")}`);
  });
  mockInvoke.mockImplementation((fn, { body }) => {
    events.push(body.purpose);
    if (body.op === "embed") return { data: { vectors: [], audited: true }, error: null };
    if (body.purpose === "safety_classify") return semantic(body);
    if (body.purpose === "secondb_chat") return primary(body);
    throw new Error(`unexpected_proxy:${fn}`);
  });
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; } });

test.each(["consent_check_unavailable", "chat_admission_unavailable", "key_missing"])("T14 two pre-admission %s failures then success: one bump, same ID, full repeated context", async code => {
  const turn = makeTurn();
  let attempts = 0;
  primary = () => ++attempts <= 2 ? failure(code === "key_missing" ? 500 : 503, code, unknown) : (purposeCount++, success());
  for (let i = 0; i < 2; i++) {
    await expect(sendLiveChatMessage(input, turn)).rejects.toThrow();
    expect(nextTurnAction(turn.read())).toBe("reask");
    expect(count).toBe(5);
  }
  expect((await sendLiveChatMessage(input, turn)).status).toBe("selected");
  expect(bumps()).toHaveLength(1); expect(purposeCount).toBe(1);
  expect(calls("secondb_chat").map(([, x]) => [x.body.chatTurnId, x.body.chatAttemptIntent])).toEqual([[ID, "first"], [ID, "reask"], [ID, "reask"]]);
  expect(mockQuery.mock.calls.filter(([table]) => table === "chat_usage")).toHaveLength(1);
  expect(mockQuery.mock.calls.filter(([table]) => table === "users")).toHaveLength(3);
  expect(calls("embed_index")).toHaveLength(3);
  expect(audits()).toHaveLength(1);
  expect(receipts).toHaveBeenCalledWith({ count: 5, turnId: ID });
});

test("T14 legacy key-missing pre-admission envelope keeps the candidate", async () => {
  const turn = makeTurn();
  primary = () => failure(500, "key_missing", { ...unknown, mode: "legacy" });
  await expect(sendLiveChatMessage(input, turn)).rejects.toThrow();
  expect(nextTurnAction(turn.read())).toBe("reask");
  expect(bumps()).toHaveLength(1);
});

test.each(["reask_ineligible", "first_already_registered"])("T18 %s does nothing on receipt; next click charges once with the same pair", async code => {
  const turn = makeTurn();
  primary = () => failure(409, code, rejected);
  await expect(sendLiveChatMessage(input, turn)).rejects.toThrow();
  expect(nextTurnAction(turn.read())).toBe("charge");
  expect(bumps()).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(1);
  count = 0; bump = () => ({ data: { count: ++count, turnId: NEXT_ID }, error: null, status: 200 });
  primary = () => success();
  expect((await sendLiveChatMessage(input, turn)).status).toBe("selected");
  expect(bumps()).toHaveLength(2);
  expect(turn.read()).toMatchObject({ owner: { pairId: "pair-1" }, message: input.message, generation: 2 });
  expect(calls("secondb_chat")[1][1].body).toMatchObject({ chatTurnId: NEXT_ID, chatAttemptIntent: "first", user: input.message });
});

test("T15 late reservation retains ID/count with zero automatic dispatch", async () => {
  const turn = makeTurn(), receipt = deferred<unknown>(); bump = () => receipt.promise;
  const pending = sendLiveChatMessage(input, turn).catch(error => error);
  await until(() => bumps().length === 1);
  expireWait(turn);
  receipt.resolve({ data: { count: 5, turnId: ID }, error: null, status: 200 });
  await pending;
  expect(turn.read().receipt).toEqual({ count: 5, turnId: ID });
  expect(receipts).toHaveBeenCalledTimes(1); expect(calls("secondb_chat")).toHaveLength(0);
  expect(nextTurnAction(turn.read())).toBe("first");
  expect((await sendLiveChatMessage(input, turn)).status).toBe("selected");
  expect(calls("secondb_chat")[0][1].body.chatAttemptIntent).toBe("first"); expect(bumps()).toHaveLength(1);
});

test("T15 late retired receipt settles accounting but cannot restore retry or dispatch", async () => {
  const turn = makeTurn(), receipt = deferred<unknown>(); bump = () => receipt.promise;
  const pending = sendLiveChatMessage(input, turn);
  await until(() => bumps().length === 1);
  turn.retireRetry();
  receipt.resolve({ data: { count: 5, turnId: ID }, error: null, status: 200 });
  expect((await pending).status).toBe("ignored");
  expect(turn.read().receipt?.turnId).toBe(ID); expect(nextTurnAction(turn.read())).toBe("closed");
  expect(calls("secondb_chat")).toHaveLength(0);
});

test.each(["original", "reask"])("T16 first fully checked %s alone authorizes all downstream effects", async winner => {
  const turn = makeTurn(), original = deferred<unknown>(), retry = deferred<unknown>();
  primary = body => body.chatAttemptIntent === "first" ? original.promise : retry.promise;
  const p1 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 1); expireWait(turn);
  const p2 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 2);
  const effects = { display: jest.fn(), history: jest.fn(), sound: jest.fn(), save: jest.fn(), plan: jest.fn() };
  const consume = (result: Awaited<ReturnType<typeof sendLiveChatMessage>>) => {
    if (result.status === "selected") for (const effect of Object.values(effects)) effect(result.result.reply.text);
  };
  const selected = winner === "original" ? original : retry, later = winner === "original" ? retry : original;
  selected.resolve(success(winner, winner === "original" ? first : second));
  consume(await (winner === "original" ? p1 : p2));
  later.resolve(success("loser", winner === "original" ? second : first));
  consume(await (winner === "original" ? p2 : p1));
  for (const effect of Object.values(effects)) { expect(effect).toHaveBeenCalledTimes(1); expect(effect).toHaveBeenCalledWith(winner); }
  expect(turn.historyValue()?.reply.text).toBe(winner); expect(audits()).toHaveLength(2);
});

test("T16 original completing during retry context allows reads to finish but prevents dispatch and display", async () => {
  const turn = makeTurn(), original = deferred<unknown>(), context = deferred<unknown>(); primary = () => original.promise;
  const p1 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 1); expireWait(turn);
  mockQuery.mockImplementationOnce(() => context.promise);
  const reads = mockQuery.mock.calls.length;
  const p2 = sendLiveChatMessage(input, turn);
  await until(() => mockQuery.mock.calls.length > reads);
  original.resolve(success("original")); expect((await p1).status).toBe("selected");
  const display = jest.fn();
  context.resolve({ data: [], error: null });
  const result = await p2;
  if (result.status === "selected") display(result.result);
  expect(result.status).toBe("ignored");
  expect(display).not.toHaveBeenCalled();
  expect(calls("secondb_chat")).toHaveLength(1);
  expect(bumps()).toHaveLength(1);
  expect(turn.historyValue()?.reply.text).toBe("original");
});

test("T16 output checks finish before selection; transport arrival is not the winner", async () => {
  const turn = makeTurn(), check = deferred<unknown>();
  semantic = () => check.promise;
  const p1 = sendLiveChatMessage(input, turn);
  await until(() => calls("safety_classify").length === 1); expireWait(turn);
  semantic = () => ({ data: { text: '{"zone":"green","triggers":[],"confidence":0.1}' }, error: null });
  primary = () => success("checked retry", second);
  expect((await sendLiveChatMessage(input, turn)).status).toBe("selected");
  check.resolve({ data: { text: '{"zone":"green","triggers":[],"confidence":0.1}' }, error: null });
  expect((await p1).status).toBe("ignored"); expect(turn.historyValue()?.reply.text).toBe("checked retry");
});

test("T16 new send does not discard an issued old pair or rewrite the new request history", async () => {
  const old = makeTurn(), result = deferred<unknown>(); primary = () => result.promise;
  const pending = sendLiveChatMessage(input, old);
  await until(() => calls("secondb_chat").length === 1); old.retireRetry();
  count = 0; primary = () => success("new answer");
  const fresh = makeTurn("Another question.", "pair-2");
  await sendLiveChatMessage({ ...input, message: "Another question.", history: [] }, fresh);
  const system = calls("secondb_chat")[1][1].body.system;
  result.resolve(success("old answer")); expect((await pending).status).toBe("selected");
  expect(old.historyValue()?.reply.text).toBe("old answer"); expect(calls("secondb_chat")).toHaveLength(2);
  expect(calls("secondb_chat")[1][1].body.system).toBe(system); expect(system).not.toContain("old answer");
});

test("T17 duplicate late crises notify once but preserve both C3 audits", async () => {
  const turn = makeTurn(), a = deferred<unknown>(), b = deferred<unknown>();
  primary = body => body.chatAttemptIntent === "first" ? a.promise : b.promise;
  const p1 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 1); expireWait(turn);
  const p2 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 2);
  a.resolve(failure(422, "safety_red_zone", unknown)); b.resolve(failure(422, "safety_red_zone", unknown));
  expect((await Promise.all([p1, p2])).map(result => result.status)).toEqual(["ignored", "ignored"]);
  expect(notify).toHaveBeenCalledTimes(1); expect(audits()).toHaveLength(2);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_crisis_event"))).toHaveLength(2);
  expect(nextTurnAction(turn.read())).toBe("closed"); expect(turn.historyValue()).toBeNull();
});

test("T17 422 guidance precedes stalled body parsing and per-attempt audit", async () => {
  const body = deferred<unknown>(), turn = makeTurn();
  primary = () => ({ data: null, error: { context: { status: 422, clone: () => ({ json: () => body.promise }) } } });
  const pending = sendLiveChatMessage(input, turn);
  await until(() => notify.mock.calls.length === 1);
  expect(audits()).toHaveLength(0); expect(nextTurnAction(turn.read())).toBe("closed");
  body.resolve({ error: "safety_red_zone", turnAdmission: unknown });
  expect((await pending).status).toBe("ignored"); expect(audits()).toHaveLength(1);
});

test.each(["receipt", "response", "crisis"])("T17 account switch while awaiting %s prevents cross-owner delivery", async phase => {
  const turn = makeTurn(), wait = deferred<unknown>();
  if (phase === "receipt") bump = () => wait.promise; else primary = () => wait.promise;
  const pending = sendLiveChatMessage(input, turn);
  const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await until(() => phase === "receipt" ? bumps().length === 1 : calls("secondb_chat").length === 1);
  noteResolvedOwner("owner-b");
  wait.resolve(phase === "receipt" ? { data: { count: 5, turnId: ID }, error: null, status: 200 }
    : phase === "crisis" ? failure(422, "safety_red_zone", unknown) : success());
  await rejection; expect(notify).not.toHaveBeenCalled(); expect(audits()).toHaveLength(0);
  if (phase === "receipt") { expect(receipts).not.toHaveBeenCalled(); expect(calls("secondb_chat")).toHaveLength(0); }
});

test("C9 device RED at 5/5 guides immediately without context, quota, or models", async () => {
  count = 5;
  const message = "죽고 싶어요", turn = makeTurn(message), audit = deferred<unknown>();
  mockRpc.mockImplementationOnce(() => audit.promise);
  const pending = sendLiveChatMessage({ ...input, message, locale: "ko", minor: true }, turn);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(mockQuery).not.toHaveBeenCalled(); expect(mockInvoke).not.toHaveBeenCalled(); expect(bumps()).toHaveLength(0);
  audit.resolve({ data: null, error: null });
  expect((await pending).status).toBe("ignored"); expect(audits()).toHaveLength(1);
});

test("reask repeats input/output and minor routing; crisis output waits for no ancillary classifier", async () => {
  const turn = makeTurn(); primary = () => failure(503, "consent_check_unavailable", unknown);
  await expect(sendLiveChatMessage(input, turn)).rejects.toThrow();
  primary = () => success("죽고 싶어요", second);
  await sendLiveChatMessage({ ...input, locale: "ko", minor: true }, turn);
  expect(notify).toHaveBeenCalledWith("KR_1388"); expect(nextTurnAction(turn.read())).toBe("closed");
  expect(audits().at(-1)![1].p_safety_zone).toBe("red"); expect(bumps()).toHaveLength(1);
});

test.each(["consent_required", "purpose_limit_exceeded"])("confirmed %s closes retries; a pre-admission outage does not", async code => {
  const turn = makeTurn(); primary = () => failure(code === "consent_required" ? 403 : 429, code, code === "consent_required" ? unknown : { ...rejected, reaskAvailable: null });
  await expect(sendLiveChatMessage(input, turn)).rejects.toThrow();
  expect(nextTurnAction(turn.read())).toBe("closed");
});

test("route is fixed before bump and dispatched is recorded synchronously before invoke", async () => {
  const turn = makeTurn();
  bump = () => { process.env.EXPO_PUBLIC_CHAT_VENDOR = "xai"; return { data: { count: 5, turnId: ID }, error: null, status: 200 }; };
  primary = () => { expect(turn.read().attempts[0].dispatched).toBe(true); return success(); };
  await sendLiveChatMessage(input, turn);
  expect(calls("secondb_chat")[0][0]).toBe("openai-proxy");
});

test("unsupported route uses legacy bump with no reservation wire fields", async () => {
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "xai";
  const turn = makeTurn(); await sendLiveChatMessage(input, turn);
  expect(bumps().map(([name]) => name)).toEqual(["bump_chat_usage_if_under_cap"]);
  expect(calls("secondb_chat")[0][0]).toBe("xai-proxy");
  expect(calls("secondb_chat")[0][1].body).not.toHaveProperty("chatTurnId");
});

test.each(["session", "signal", "onCrisisDetected", "mutationObserver"])("mixed captured field %s fails before any I/O", async field => {
  await expect(sendLiveChatMessage({ ...input, [field]: {} }, makeTurn())).rejects.toThrow("chat_live_captured_execution_mismatch");
  expect(mockQuery).not.toHaveBeenCalled(); expect(mockInvoke).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
});

test("dormant entry does not change the existing send's request or bump", async () => {
  await sendChatMessage(input);
  expect(bumps().map(([name]) => name)).toEqual(["bump_chat_usage_if_under_cap"]);
  expect(calls("secondb_chat")[0][1].body).not.toHaveProperty("chatTurnId");
  expect(calls("secondb_chat")[0][1].body).not.toHaveProperty("chatAttemptIntent");
});

test.each(["en", "ko"] as const)("C9 live adapter preserves the existing %s device verdict, lane and minor routing", async locale => {
  for (const minor of [false, true]) {
    for (const message of ["Help me plan my week.", "I want to end my life tonight", "죽고 싶어요"]) {
      const legacy = await classifyChatTextForCrisis(message, locale, input.userId, minor);
      notify.mockClear();
      const live = await classifyLiveChatTextForCrisis(message, locale, input.userId, minor,
        { assertCurrent: () => undefined, onCrisisDetected: notify });
      expect(live).toEqual(legacy);
      if (legacy) expect(notify).toHaveBeenCalledWith(legacy.safety.crisisRouting?.hotline);
      else expect(notify).not.toHaveBeenCalled();
    }
  }
  expect(mockQuery).not.toHaveBeenCalled(); expect(mockInvoke).not.toHaveBeenCalled(); expect(bumps()).toHaveLength(0);
});

test("C9 device guidance reentry cannot borrow the live observer for an ordinary call", async () => {
  const message = "죽고 싶어요";
  let ordinary!: ReturnType<typeof classifyChatTextForCrisis>;
  notify.mockImplementation(() => { ordinary = classifyChatTextForCrisis(message, "ko", input.userId); });
  await sendLiveChatMessage({ ...input, message, locale: "ko" }, makeTurn(message));
  await ordinary;
  expect(notify).toHaveBeenCalledTimes(1); expect(audits()).toHaveLength(2);
  expect(mockInvoke).not.toHaveBeenCalled();
});

test("C9 a throwing guidance observer cannot skip its audit", async () => {
  const message = "죽고 싶어요";
  notify.mockImplementation(() => { throw new Error("observer_failed"); });
  expect((await sendLiveChatMessage({ ...input, message }, makeTurn(message))).status).toBe("ignored");
  expect(audits()).toHaveLength(1); expect(mockInvoke).not.toHaveBeenCalled();
});

test("T16 a late failing reask preserves the already selected original", async () => {
  const turn = makeTurn(), original = deferred<unknown>(), retry = deferred<unknown>();
  primary = body => body.chatAttemptIntent === "first" ? original.promise : retry.promise;
  const p1 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 1); expireWait(turn);
  const p2 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 2);
  original.resolve(success("original")); expect((await p1).status).toBe("selected");
  retry.resolve(failure(503, "chat_admission_unavailable", unknown));
  expect((await p2).status).toBe("ignored"); expect(turn.historyValue()?.reply.text).toBe("original");
});

test.each([false, true])("T17 a late crisis closes retries and history (original already selected: %s)", async selected => {
  const turn = makeTurn(), original = deferred<unknown>(), retry = deferred<unknown>();
  primary = body => body.chatAttemptIntent === "first" ? original.promise : retry.promise;
  const p1 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 1); expireWait(turn);
  const p2 = sendLiveChatMessage(input, turn);
  await until(() => calls("secondb_chat").length === 2);
  if (selected) { original.resolve(success()); expect((await p1).status).toBe("selected"); }
  retry.resolve(failure(422, "safety_red_zone", unknown)); expect((await p2).status).toBe("ignored");
  if (!selected) { original.resolve(success()); expect((await p1).status).toBe("ignored"); }
  expect(turn.historyValue()).toBeNull(); expect(notify).toHaveBeenCalledTimes(1);
  expect((await sendLiveChatMessage(input, turn)).status).toBe("ignored");
  expect(calls("secondb_chat")).toHaveLength(2); expect(bumps()).toHaveLength(1); expect(audits()).toHaveLength(2);
});

test("T15 an ambiguous reservation failure never creates another bump", async () => {
  const turn = makeTurn(); bump = () => { throw new Error("receipt_unknown"); };
  await expect(sendLiveChatMessage(input, turn)).rejects.toThrow("receipt_unknown");
  expect(turn.read().reservation).toBe("unknown");
  expect((await sendLiveChatMessage(input, turn)).status).toBe("ignored");
  expect(bumps()).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(0);
});

test("context fails before bump and a later explicit send can charge", async () => {
  const turn = makeTurn();
  mockQuery.mockImplementation((table: string) => {
    if (table === "wiki_pages") throw new Error("context_unavailable");
    return { data: [], error: null };
  });
  await expect(sendLiveChatMessage(input, turn)).rejects.toThrow("context_unavailable");
  expect(bumps()).toHaveLength(0); expect(calls("secondb_chat")).toHaveLength(0);
  expect(nextTurnAction(turn.read())).toBe("charge");
  mockQuery.mockResolvedValue({ data: [], error: null });
  expect((await sendLiveChatMessage(input, turn)).status).toBe("selected");
  expect(bumps()).toHaveLength(1);
});

test.each(["chatTurnRoute", "chatTurnId", "chatAttemptIntent", "session", "signal"])("bundled route rejects mixed %s before I/O", async field => {
  await expect(callLlm({ userId: input.userId, locale: "en", purpose: "secondb_chat", user: input.message,
    chatTurn: { route: { vendor: "openai", reservationSupported: true }, turnId: ID, intent: "first" },
    [field]: field === "chatTurnId" ? ID : {},
  })).rejects.toThrow("chat_turn_execution_mismatch");
  expect(mockInvoke).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
});
