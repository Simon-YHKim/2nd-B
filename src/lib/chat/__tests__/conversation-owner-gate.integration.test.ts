// Real conversation -> context/usage -> boundary/classifiers -> audit outbox.
// Only the Supabase and vendor/network transports are substituted.
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockQuery = jest.fn();
let mockBeforeRpcDispatch: ((args: unknown[]) => Promise<void> | undefined) | undefined;
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn(() => { throw new Error("direct_network_forbidden"); }) }));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    rpc: (...args: unknown[]) => {
      let signal: AbortSignal | undefined;
      const query = {
        abortSignal: (next: AbortSignal) => { signal = next; return query; },
        then: (yes: (value: unknown) => void, no: (error: unknown) => void) =>
          Promise.resolve().then(async () => {
            await mockBeforeRpcDispatch?.(args);
            if (signal?.aborted) throw Object.assign(new Error("owner_changed"), { name: "AbortError" });
            return mockRpc(...args);
          }).then(yes, no),
      };
      return query;
    }, functions: { invoke: mockInvoke },
    from: (table: string) => {
      let columns = "";
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "order", "limit", "in", "contains", "range", "is", "maybeSingle", "abortSignal"]) {
        query[method] = (...args: unknown[]) => { if (method === "select") columns = String(args[0]); return query; };
      }
      query.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve(mockQuery(table, columns)).then(resolve, reject);
      return query;
    },
  }),
}));

import { createLiveChatTurn, sendLiveChatMessage, type LiveChatTurn } from "../conversation-turn";
import { loadChatContext, sendChatMessage, type SendMessageInput } from "../conversation";
import type { TurnAdmission } from "../../llm/types";
import { enqueueAuditWrite, flushAuditWriteOutbox, getAuditWriteOutboxForTests, resetAuditWriteOutboxForTests } from "../../llm/audit-write-outbox";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input: SendMessageInput = { userId: "owner-a", message: "Help me plan my week.", locale: "en", tier: "free" };
const first: TurnAdmission = { mode: "enforce", allowed: true, kind: "first", attempt: 1, quotaCharged: true, bindingEligible: true, reaskAvailable: true };
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
  process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY = "true";
  process.env.GOOGLE_API_KEY = "";
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network_forbidden"));
  count = 4; purposeCount = 0; events.length = 0; notify = jest.fn(); receipts = jest.fn();
  mockBeforeRpcDispatch = undefined;
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

function switchOwner(next: string | null) {
  beginAccountOwnerTransition(next); noteResolvedOwner(next); clearAccountTransition(currentAccountEpoch());
}

const crisis = { kind: "crisis_event" as const, ownerUserId: input.userId, warnLabel: "[test] crisis queued",
  payload: { classifierConfidence: 0.95, triggerCategories: ["input_red"], routingTemplateVersion: "test-v1", locale: "en" as const } };

test("queued crisis waits for its original owner and sends exactly once on return", async () => {
  const hold = deferred<unknown>(), transport = mockRpc.getMockImplementation()!;
  mockRpc.mockImplementationOnce(() => hold.promise);
  const firstWrite = enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: input.userId, warnLabel: "[test] held audit",
    payload: { userId: input.userId, promptHash: "p", outputHash: "o", modelUsed: "test", safetyZone: "green", vertexBackend: false, latencyMs: 0 } });
  await until(() => mockRpc.mock.calls.length === 1);
  const queued = enqueueAuditWrite(crisis);
  switchOwner("owner-b");
  hold.resolve({ data: null, error: null });
  await Promise.all([firstWrite, queued]);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_crisis_event"))).toHaveLength(0);
  expect(await getAuditWriteOutboxForTests()).toContainEqual(crisis);
  await flushAuditWriteOutbox(input.userId);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_crisis_event"))).toHaveLength(0);
  switchOwner(input.userId); mockRpc.mockImplementation(transport);
  await flushAuditWriteOutbox(input.userId); await flushAuditWriteOutbox(input.userId);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_crisis_event"))).toHaveLength(1);
  expect(await getAuditWriteOutboxForTests()).toEqual([]);
});

test.each(["switch", "return", "hold", "logout"])("loader skips embed after owner %s during profile read", async change => {
  const hold = deferred<unknown>(), query = mockQuery.getMockImplementation()!;
  mockQuery.mockImplementation((table, columns) => table === "users" ? hold.promise : query(table, columns));
  const pending = loadChatContext(input, null).catch(error => error);
  await until(() => mockQuery.mock.calls.some(([table]) => table === "users"));
  if (change === "hold") beginAccountOwnerTransition("owner-b");
  else switchOwner(change === "logout" ? null : "owner-b");
  if (change === "return") switchOwner(input.userId);
  hold.resolve({ data: { id: input.userId, birth_date: "2010-01-01", profile_details: {} }, error: null });
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(calls("embed_index")).toHaveLength(0);
});

test.each(["legacy", "reserved"])("%s output classification failure after switch emits no health or audit row", async path => {
  await jest.isolateModulesAsync(async () => {
    const account = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    const conversation = require("../conversation") as typeof import("../conversation");
    const live = require("../conversation-turn") as typeof import("../conversation-turn");
    account.noteResolvedOwner(input.userId);
    const turn = live.createLiveChatTurn({ owner: account.captureAccountOwnerLease(input.userId)!, conversationId: "c", pairId: "p",
      message: input.message, onCrisisDetected: notify });
    const hold = deferred<unknown>(); semantic = () => hold.promise;
    const pending = (path === "legacy" ? conversation.sendChatMessage(input) : live.sendLiveChatMessage(input, turn)).catch(error => error);
    await until(() => calls("safety_classify").length === 1);
    const before = mockRpc.mock.calls.length;
    account.noteResolvedOwner("owner-b"); hold.resolve({ data: null, error: new Error("unavailable") });
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(mockRpc.mock.calls.slice(before)).toEqual([]);
    // A skipped stale health write must not consume the once-per-session slot.
    account.noteResolvedOwner(input.userId); account.clearAccountTransition(account.currentAccountEpoch());
    count = 0;
    await conversation.sendChatMessage(input);
    expect(mockRpc.mock.calls.filter(([name, args]) => name.startsWith("log_ai_audit") && args.p_model_used === "lexicon-only")).toHaveLength(1);
  });
});

test.each(["usage", "bump", "obfuscation"])("legacy send stops after owner switch during %s", async point => {
  const hold = deferred<unknown>(), query = mockQuery.getMockImplementation()!, rpc = mockRpc.getMockImplementation()!;
  const message = point === "obfuscation" ? "I want.to die." : input.message;
  if (point === "usage") mockQuery.mockImplementation((table, columns) => table === "chat_usage" ? hold.promise : query(table, columns));
  if (point === "bump") mockRpc.mockImplementation((name, args) => name === "bump_chat_usage_if_under_cap" ? hold.promise : rpc(name, args));
  if (point === "obfuscation") semantic = () => hold.promise;
  const pending = sendChatMessage({ ...input, message }).catch(error => error);
  await until(() => point === "usage" ? mockQuery.mock.calls.some(([table]) => table === "chat_usage")
    : point === "bump" ? bumps().length === 1 : calls("safety_classify").length === 1);
  switchOwner("owner-b");
  hold.resolve(point === "usage" ? { data: { count: 0, ad_bonus: 0 }, error: null }
    : point === "bump" ? { data: 1, error: null } : { data: null, error: new Error("unavailable") });
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(calls("secondb_chat")).toHaveLength(0);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_"))).toEqual([]);
});

test("unchanged owner preserves embed, quota, chat, output classification and audit ordering", async () => {
  const result = await sendChatMessage(input);
  expect(result).toMatchObject({ status: "ok", used: 5, remaining: 0 });
  expect(events.filter(event => !event.startsWith("read:"))).toEqual([
    "embed_index", "bump_chat_usage_if_under_cap", "secondb_chat", "safety_classify", "log_ai_audit_once",
  ]);
});

test("device RED guidance is synchronous while the audit is stalled", async () => {
  const hold = deferred<unknown>(); mockRpc.mockImplementation(() => hold.promise);
  const message = "I want to kill myself.";
  const pending = sendLiveChatMessage({ ...input, message }, makeTurn(message));
  expect(notify).toHaveBeenCalledTimes(1);
  await until(() => audits().length === 1);
  hold.resolve({ data: null, error: null });
  expect(await pending).toMatchObject({ status: "crisis" });
});

test.each(["embed_index", "secondb_chat", "safety_classify"])("%s cannot send after the SDK waited for a session", async purpose => {
  const hold = deferred<void>(), transport = mockInvoke.getMockImplementation()!;
  const sent: string[] = [];
  mockInvoke.mockImplementation(async (fn, request) => {
    if (request.body.purpose === purpose) {
      await hold.promise;
      if (request.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      sent.push(purpose);
    }
    return transport(fn, request);
  });
  const pending = sendChatMessage(input).catch(error => error);
  await until(() => calls(purpose).length === 1);
  beginAccountOwnerTransition("owner-b"); hold.resolve();
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(sent).toEqual([]);
});

test.each(["crisis_event", "ai_audit_log"] as const)("queued %s also waits if the account switches inside the SDK session wait", async kind => {
  const hold = deferred<void>(); let waiting = false;
  mockBeforeRpcDispatch = () => { waiting = true; return hold.promise; };
  const submission = kind === "crisis_event" ? crisis : { kind, ownerUserId: input.userId, warnLabel: "[test] audit",
    payload: { userId: input.userId, promptHash: "p", outputHash: "o", modelUsed: "test", safetyZone: "green" as const, vertexBackend: false, latencyMs: 0 } };
  const pending = enqueueAuditWrite(submission);
  await until(() => waiting);
  beginAccountOwnerTransition("owner-b"); hold.resolve(); await pending;
  expect(mockRpc).not.toHaveBeenCalled();
  expect(await getAuditWriteOutboxForTests()).toContainEqual(submission);
  switchOwner(input.userId); mockBeforeRpcDispatch = undefined;
  await flushAuditWriteOutbox(input.userId);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test("an ordinary embed AbortError for an unchanged owner still falls back to the wiki snapshot", async () => {
  const invoke = mockInvoke.getMockImplementation()!;
  mockInvoke.mockImplementation((fn, request) => request.body.op === "embed"
    ? Promise.reject(Object.assign(new Error("transport aborted"), { name: "AbortError" })) : invoke(fn, request));
  await expect(sendChatMessage(input)).resolves.toMatchObject({ status: "ok" });
  expect(calls("secondb_chat")).toHaveLength(1);
});

test.each(["lexicon-only", "obfuscation-safety-unavailable"])("%s health still cancels if SDK dispatch outlives the completed chat", async model => {
  await jest.isolateModulesAsync(async () => {
    const account = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    const conversation = require("../conversation") as typeof import("../conversation");
    account.noteResolvedOwner(input.userId);
    const hold = deferred<void>(); let waiting = false, settled = false;
    mockBeforeRpcDispatch = args => {
      const row = args[1] as Record<string, unknown>;
      if (row.p_model_used !== model) return undefined;
      waiting = true; return hold.promise.then(() => { settled = true; });
    };
    semantic = () => ({ data: null, error: new Error("unavailable") });
    await expect(conversation.sendChatMessage({ ...input, message: model === "lexicon-only" ? input.message : "I want.to die." }))
      .resolves.toMatchObject({ status: "ok" });
    expect(waiting).toBe(true);
    account.beginAccountOwnerTransition("owner-b"); hold.resolve();
    await until(() => settled);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mockRpc.mock.calls.filter(([, row]) => row.p_model_used === model)).toEqual([]);
  });
});

const parityCases = ["green", "yellow", "limit", "bonus", "quota-race", "device-red", "semantic-red", "semantic-unavailable",
  "output-red", "server-red", "server-unconfirmed", "server-error", "failover", "embed-error", "embed-abort", "health",
  "mock", "claude", "xai", "gemini", "minor-ko", "history", "rag-hit"];

// A local transformer can replay these same scenarios against the base commit.
// Compare result, notification, RPC/invoke order and complete bodies, excluding
// transport-only AbortSignals. No real network or authentication is involved.
test.each(parityCases)("differential no-switch %s", async scenario => {
  jest.spyOn(Date, "now").mockReturnValue(1_792_699_200_000);
  jest.spyOn(require("expo-crypto") as { randomUUID(): string }, "randomUUID").mockReturnValue(ID);
  count = scenario === "limit" ? 5 : 0;
  const options = { ...input };
  if (scenario === "yellow") options.message = "I have anxiety about tomorrow.";
  if (scenario === "device-red") options.message = "I want to kill myself.";
  if (scenario === "minor-ko") Object.assign(options, { message: "죽고 싶어요", locale: "ko", minor: true });
  if (scenario === "history") options.history = [{ role: "user", text: "A saved idea" }, { role: "assistant", text: "Try a walk." }];
  if (scenario.startsWith("semantic-")) {
    options.message = "I want.to die.";
    semantic = () => scenario === "semantic-red" ? { data: { text: '{"zone":"red","triggers":["active_ideation_no_method"],"confidence":0.9}' }, error: null }
      : { data: null, error: new Error("unavailable") };
  }
  if (scenario === "health") semantic = () => ({ data: null, error: new Error("unavailable") });
  if (scenario === "output-red") primary = () => success("I want to kill myself.");
  if (scenario === "server-red") primary = () => failure(422, "safety_red_zone");
  if (scenario === "server-unconfirmed") primary = () => failure(422, "unknown");
  if (scenario === "server-error") primary = () => failure(503, "temporarily_unavailable");
  if (scenario === "failover") {
    process.env.EXPO_PUBLIC_CHAT_VENDOR = "xai"; process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "openai";
    let firstCall = true; primary = () => { if (firstCall) { firstCall = false; return failure(503, "upstream"); } return success(); };
  }
  if (["claude", "xai", "gemini"].includes(scenario)) process.env.EXPO_PUBLIC_CHAT_VENDOR = scenario;
  if (scenario === "mock") process.env.EXPO_PUBLIC_LLM_MODE = "mock";
  const transport = mockInvoke.getMockImplementation()!;
  if (scenario.startsWith("embed-")) mockInvoke.mockImplementation((fn, request) => request.body.op === "embed"
    ? Promise.reject(Object.assign(new Error("embed failed"), { name: scenario === "embed-abort" ? "AbortError" : "Error" })) : transport(fn, request));
  if (scenario === "quota-race") {
    const rpc = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementation((name, args) => name === "bump_chat_usage_if_under_cap"
      ? { data: null, error: { code: "P0001", message: "chat_limit_exceeded" } } : rpc(name, args));
  }
  if (scenario === "bonus") {
    const query = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation((table, columns) => table === "chat_usage" ? { data: { count: 4, ad_bonus: 2 }, error: null } : query(table, columns));
    count = 4;
  }
  if (scenario === "rag-hit") {
    const rpc = mockRpc.getMockImplementation()!, query = mockQuery.getMockImplementation()!;
    mockInvoke.mockImplementation((fn, request) => request.body.op === "embed" ? { data: { vectors: [Array(768).fill(0.1)], audited: true, modelUsed: "test-embed" }, error: null } : transport(fn, request));
    mockRpc.mockImplementation((name, args) => name === "match_wiki_pages"
      ? { data: [{ id: "w1", slug: "week", title: "Week", similarity: 0.9 }], error: null } : rpc(name, args));
    mockQuery.mockImplementation((table, columns) => table === "wiki_pages" && String(columns).includes("frontmatter")
      ? { data: [{ id: "w1", slug: "week", title: "Week", body_md: "A grounded plan.", frontmatter: {} }], error: null } : query(table, columns));
  }
  const result = await sendChatMessage(options).catch(error => ({ error: error.name, message: error.message, code: error.code }));
  const trace = { result, events: [...events], notifications: notify.mock.calls, purposeCount,
    rpc: mockRpc.mock.calls, invoke: mockInvoke.mock.calls.map(([fn, request]) => [fn, request.body]), query: mockQuery.mock.calls };
  expect(JSON.stringify(trace)).not.toContain("access_token");
  if (["green", "yellow", "bonus", "failover", "embed-error", "embed-abort", "mock", "claude", "xai", "gemini", "history", "rag-hit"].includes(scenario)) {
    expect(result).toMatchObject({ status: "ok" });
  }
  if (process.env.OWNER_GATE_TRACE) {
    const { appendFileSync } = require("node:fs") as typeof import("node:fs");
    appendFileSync(process.env.OWNER_GATE_TRACE, `${JSON.stringify({ scenario, trace })}\n`);
  }
});
