// Real conversation -> context/usage -> boundary/classifiers -> audit outbox.
// Only the Supabase and vendor/network transports are substituted.
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockQuery = jest.fn();
const mockDownload = jest.fn();
let mockBeforeDownload: (() => Promise<void>) | undefined;
let mockBeforeQueryDispatch: ((table: string, columns: string) => Promise<void> | undefined) | undefined;
let mockBeforeRpcDispatch: ((args: unknown[]) => Promise<void> | undefined) | undefined;
let mockBeforeInvokeDispatch: ((purpose: string) => Promise<void> | undefined) | undefined;

// The SDK has acquired its current session. The production fetch adapter checks
// the owner here; actual fetch observes only user cancellation, including in flight.
async function mockSend(signal: AbortSignal | undefined, send: () => unknown) {
  const { beforeOwnerDispatch } = require("../../auth/live-owner-guard") as typeof import("../../auth/live-owner-guard");
  const dispatched = beforeOwnerDispatch(signal);
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    dispatched?.addEventListener("abort", onAbort, { once: true });
    if (dispatched?.aborted) onAbort();
  });
  try { return await Promise.race([Promise.resolve(send()), cancelled]); }
  finally { dispatched?.removeEventListener("abort", onAbort); }
}
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
            return mockSend(signal, () => mockRpc(...args));
          }).then(yes, no),
      };
      return query;
    }, functions: { invoke: async (fn: string, request: { body: Record<string, unknown>; signal?: AbortSignal }) => {
      try {
        await mockBeforeInvokeDispatch?.(String(request.body.purpose));
        return await mockSend(request.signal, () => mockInvoke(fn, request));
      } catch (error) {
        // functions-js converts a fetch rejection to a FunctionsFetchError.
        return { data: null, error: Object.assign(new Error("fetch failed"), { name: "FunctionsFetchError", context: error }) };
      }
    } },
    storage: { from: () => ({ download: async (path: string, _options: unknown, parameters?: { signal?: AbortSignal }) => {
      await mockBeforeDownload?.();
      return mockSend(parameters?.signal, () => mockDownload(path));
    } }) },
    from: (table: string) => {
      let columns = "";
      let signal: AbortSignal | undefined;
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "order", "limit", "in", "contains", "range", "is", "maybeSingle", "abortSignal"]) {
        query[method] = (...args: unknown[]) => { if (method === "select") columns = String(args[0]); if (method === "abortSignal") signal = args[0] as AbortSignal; return query; };
      }
      query.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve().then(async () => {
          await mockBeforeQueryDispatch?.(table, columns);
          return mockSend(signal, () => mockQuery(table, columns));
        }).then(resolve, reject);
      return query;
    },
  }),
}));

import { createLiveChatTurn, sendLiveChatMessage, type LiveChatTurn } from "../conversation-turn";
import { loadChatContext, sendChatMessage, type SendMessageInput } from "../conversation";
import type { TurnAdmission } from "../../llm/types";
import { enqueueAuditWrite, flushAuditWriteOutbox, getAuditWriteOutboxForTests, resetAuditWriteOutboxForTests } from "../../llm/audit-write-outbox";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { createHash } from "node:crypto";
import noSwitchBaseline from "./owner-gate-no-switch.json";
import { callLlm } from "../../llm/boundary";

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
  mockBeforeRpcDispatch = undefined; mockBeforeQueryDispatch = undefined; mockBeforeDownload = undefined;
  mockBeforeInvokeDispatch = undefined;
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
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
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

test.each(["legacy", "reserved"])("%s output classification failure after switch sends no cross-owner health or audit row", async path => {
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
    if (path === "legacy") {
      const outbox = require("../../llm/audit-write-outbox") as typeof import("../../llm/audit-write-outbox");
      expect(await outbox.getAuditWriteOutboxForTests()).toEqual([expect.objectContaining({ kind: "ai_audit_log", ownerUserId: input.userId })]);
    }
    // A later current-owner turn can still write its health row.
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
  const hold = deferred<void>(); let waiting = false;
  mockBeforeInvokeDispatch = next => { if (next === purpose) { waiting = true; return hold.promise; } };
  const pending = sendChatMessage(input).catch(error => error);
  await until(() => waiting);
  beginAccountOwnerTransition("owner-b"); hold.resolve();
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(calls(purpose)).toEqual([]);
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
    // The insert actually started and was cancelled. Its session slot is reusable.
    account.beginAccountOwnerTransition(input.userId); account.noteResolvedOwner(input.userId); account.clearAccountTransition(account.currentAccountEpoch());
    mockBeforeRpcDispatch = undefined; count = 0;
    await conversation.sendChatMessage({ ...input, message: model === "lexicon-only" ? input.message : "I want.to die." });
    await until(() => mockRpc.mock.calls.some(([, row]) => row.p_model_used === model));
    await conversation.sendChatMessage(input);
    expect(mockRpc.mock.calls.filter(([, row]) => row.p_model_used === model)).toHaveLength(1);
  });
});

test.each(["usage", "bump", "structured", "profile", "wiki", "sources", "rag-match", "rag-pages"])(
  "%s is cancelled inside the SDK session wait before dispatch", async point => {
    const hold = deferred<void>(); let waiting = false;
    const table = ({ usage: "chat_usage", structured: "records", profile: "users", wiki: "wiki_pages",
      sources: "sources", "rag-pages": "wiki_pages" } as Record<string, string>)[point];
    const rpcName = point === "bump" ? "bump_chat_usage_if_under_cap" : "match_wiki_pages";
    const query = mockQuery.getMockImplementation()!, rpc = mockRpc.getMockImplementation()!, invoke = mockInvoke.getMockImplementation()!;
    if (point.startsWith("rag-")) {
      mockInvoke.mockImplementation((fn, request) => request.body.op === "embed"
        ? { data: { vectors: [Array(768).fill(0.1)], audited: true, modelUsed: "test-embed" }, error: null } : invoke(fn, request));
      mockRpc.mockImplementation((name, args) => name === "match_wiki_pages"
        ? { data: [{ id: "w1", slug: "week", title: "Week", similarity: 0.9 }], error: null } : rpc(name, args));
      mockQuery.mockImplementation((name, columns) => name === "wiki_pages"
        ? { data: [{ id: "w1", slug: "week", title: "Week", body_md: "A grounded plan.", frontmatter: {} }], error: null } : query(name, columns));
    }
    if (table) mockBeforeQueryDispatch = name => { if (name !== table) return; waiting = true; return hold.promise; };
    else mockBeforeRpcDispatch = ([name]) => { if (name !== rpcName) return; waiting = true; return hold.promise; };
    const pending = sendChatMessage(input).catch(error => error);
    await until(() => waiting);
    switchOwner("owner-b"); hold.resolve();
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(table ? mockQuery.mock.calls.filter(([name]) => name === table) : mockRpc.mock.calls.filter(([name]) => name === rpcName)).toEqual([]);
    expect(calls("secondb_chat")).toEqual([]);
  },
);

test.each(["server", "server-119", "server-112", "semantic", "output"].flatMap(path =>
  ["logout", "switch", "return"].map(change => [path, change])))(
  "received %s RED is retained for A across %s, never delivered as B", async (path, change) => {
    const hold = deferred<unknown>();
    let responseRead = false;
    const message = path === "semantic" ? "I want.to die." : input.message;
    if (path.startsWith("server")) {
      primary = () => {
        const lane = path === "server-119" ? "medical_emergency" : path === "server-112" ? "immediate_threat" : undefined;
        // The HTTP response is already received; hold its body read across the switch.
        const context = new Response(JSON.stringify({ error: "safety_red_zone", ...(lane ? { crisis_lane: lane } : {}) }), { status: 422 });
        const clone = context.clone.bind(context);
        context.clone = () => {
          const body = clone(), json = body.json.bind(body);
          body.json = async () => { responseRead = true; await hold.promise; return json(); };
          return body;
        };
        return { data: null, error: Object.assign(new Error("server_red"), { context }) };
      };
    } else {
      if (path === "output") primary = () => success("I want to kill myself.");
      semantic = () => hold.promise;
    }
    const pending = sendChatMessage({ ...input, message }).catch(error => error);
    await until(() => path.startsWith("server") ? responseRead : calls("safety_classify").length === 1);
    switchOwner(change === "logout" ? null : "owner-b");
    if (change === "return") switchOwner(input.userId);
    // Inspect retained rows before retry: fail transport while A is current again.
    const transport = mockRpc.getMockImplementation()!;
    const sentAs: string[] = [];
    mockRpc.mockImplementation((name, args) => {
      if (name.startsWith("log_")) return { data: null, error: new Error("offline") };
      return transport(name, args);
    });
    hold.resolve({ data: { text: '{"zone":"red","triggers":["active_ideation_no_method"],"confidence":0.9}' }, error: null });
    expect(await pending).toMatchObject({ name: "AbortError" });
    // A received verdict may finish parsing in the cancelled request continuation.
    let queued = await getAuditWriteOutboxForTests();
    for (let i = 0; i < 30 && queued.length < 2; i++) {
      await new Promise<void>(resolve => setImmediate(resolve)); queued = await getAuditWriteOutboxForTests();
    }
    expect(queued).toHaveLength(2);
    expect(queued.map(row => row.ownerUserId)).toEqual([input.userId, input.userId]);
    expect(queued).toContainEqual(expect.objectContaining({ kind: "ai_audit_log", payload: expect.objectContaining({ safetyZone: "red" }) }));
    expect(queued).toContainEqual(expect.objectContaining({ kind: "crisis_event", payload: expect.objectContaining({
      triggerCategories: expect.arrayContaining([path === "semantic" ? "input_semantic_red" : path === "output" ? "output_swap" : "proxy_input_red"]),
    }) }));
    if (path === "server-119" || path === "server-112") {
      expect(queued).toContainEqual(expect.objectContaining({ kind: "crisis_event", payload: expect.objectContaining({
        routingTemplateVersion: `red-${path === "server-119" ? "medical_emergency" : "immediate_threat"}-en-v1`,
      }) }));
    }
    switchOwner("owner-b");
    mockRpc.mockImplementation((name, args) => { if (name.startsWith("log_")) sentAs.push(require("../../auth/account-epoch").currentAccountOwner()); return transport(name, args); });
    await flushAuditWriteOutbox(input.userId);
    expect(sentAs).toEqual([]);
    expect(await getAuditWriteOutboxForTests()).toEqual(queued);
    switchOwner(input.userId);
    const before = mockRpc.mock.calls.length;
    await flushAuditWriteOutbox(input.userId); await flushAuditWriteOutbox(input.userId);
    expect(sentAs).toEqual([input.userId, input.userId]);
    const delivered = mockRpc.mock.calls.slice(before);
    expect(delivered.filter(([name]) => name.startsWith("log_crisis_event"))).toHaveLength(1);
    expect(delivered.filter(([name, args]) => name.startsWith("log_ai_audit") && args.p_safety_zone === "red")).toHaveLength(1);
    expect(await getAuditWriteOutboxForTests()).toEqual([]);
  },
);

test("saved conversation body cannot leave while Storage awaits the current session", async () => {
  const hold = deferred<void>(); let waiting = false;
  const query = mockQuery.getMockImplementation()!;
  const { CHAT_KEEP_TAG } = require("../keep-exchange") as typeof import("../keep-exchange");
  mockQuery.mockImplementation((table, columns) => table === "sources" ? { data: [{
    id: "saved", kind: "self_knowledge", title: "Saved", tags: [CHAT_KEEP_TAG],
    storage_path: `${input.userId}/saved.md`, frontmatter: {}, captured_at: "2026-10-01T00:00:00Z",
  }], error: null } : query(table, columns));
  mockBeforeDownload = () => { waiting = true; return hold.promise; };
  const pending = sendChatMessage(input).catch(error => error);
  await until(() => waiting); switchOwner("owner-b"); hold.resolve();
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(mockDownload).not.toHaveBeenCalled();
  expect(calls("secondb_chat")).toEqual([]);
});

test("consent rejection still precedes failover on the unchanged legacy path", async () => {
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "xai"; process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "openai";
  primary = () => failure(403, "consent_required");
  await expect(sendChatMessage(input)).rejects.toMatchObject({ code: "consent_required" });
  expect(calls("secondb_chat")).toHaveLength(1);
});

test.each(["semantic", "server", "output"])("%s RED retains evidence without a stale guidance callback", async path => {
  const hold = deferred<unknown>();
  const user = path === "semantic" ? "I want.to die." : input.message;
  if (path === "server") primary = () => hold.promise;
  else { semantic = () => hold.promise; if (path === "output") primary = () => success("I want to kill myself."); }
  const pending = callLlm({ userId: input.userId, locale: input.locale, purpose: "secondb_chat", user, onCrisisDetected: notify }).catch(error => error);
  await until(() => calls(path === "server" ? "secondb_chat" : "safety_classify").length === 1);
  // The known lexical verdict is announced before its optional classifier waits.
  expect(notify).toHaveBeenCalledTimes(path === "output" ? 1 : 0);
  switchOwner("owner-b");
  hold.resolve(path === "server" ? failure(422, "safety_red_zone")
    : { data: { text: '{"zone":"red","triggers":["active_ideation_no_method"],"confidence":0.9}' }, error: null });
  expect(await pending).toMatchObject({ name: "AbortError" });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(await getAuditWriteOutboxForTests()).toHaveLength(2);
  expect(notify).toHaveBeenCalledTimes(path === "output" ? 1 : 0);
});

const parityCases = ["green", "yellow", "limit", "bonus", "quota-race", "device-red", "semantic-red", "semantic-unavailable",
  "output-red", "server-red", "server-unconfirmed", "server-error", "failover", "embed-error", "embed-abort", "health",
  "mock", "claude", "xai", "gemini", "minor-ko", "history", "rag-hit"];

// Digests were measured against the main commit named in the fixture, with a
// fixed clock. CI compares result, notification, order and full request bodies;
// only transport AbortSignal objects are excluded. No live network is used.
test.each(parityCases)("differential no-switch %s", async scenario => {
  await jest.isolateModulesAsync(async () => {
  jest.useFakeTimers({ now: noSwitchBaseline.clock, doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "setImmediate", "clearImmediate", "nextTick", "queueMicrotask", "performance", "hrtime"] });
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
  const account = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
  account.noteResolvedOwner(input.userId);
  const conversation = require("../conversation") as typeof import("../conversation");
  const result = await conversation.sendChatMessage(options).catch(error => ({ error: error.name, message: error.message, code: error.code }));
  const trace = { result, events: [...events], notifications: notify.mock.calls, purposeCount,
    rpc: mockRpc.mock.calls, invoke: mockInvoke.mock.calls.map(([fn, request]) => [fn, request.body]), query: mockQuery.mock.calls };
  expect(JSON.stringify(trace)).not.toContain("access_token");
  if (scenario === "health") expect(mockRpc.mock.calls.filter(([, row]) => row.p_model_used === "lexicon-only")).toHaveLength(1);
  if (scenario === "mock") {
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(audits()).toHaveLength(1);
    expect(audits()[0][1].p_model_used).toMatch(/^mock:/);
  }
  if (process.env.OWNER_GATE_TRACE) {
    const { appendFileSync } = require("node:fs") as typeof import("node:fs");
    appendFileSync(process.env.OWNER_GATE_TRACE, `${JSON.stringify({ scenario, trace })}\n`);
  }
  expect(createHash("sha256").update(JSON.stringify(trace)).digest("hex"))
    .toBe(noSwitchBaseline.sha256[scenario as keyof typeof noSwitchBaseline.sha256]);
  if (["green", "yellow", "bonus", "failover", "embed-error", "embed-abort", "mock", "claude", "xai", "gemini", "history", "rag-hit"].includes(scenario)) {
    expect(result).toMatchObject({ status: "ok" });
  }
  });
});

const retainedPaths = ["semantic", "server", "server-119", "server-112", "failover-red", "retry-red", "output-lexical", "output-semantic", "output-response", "c3-green", "c3-unavailable", "c3-response"];
test.each(retainedPaths.flatMap(path => ["logout", "switch", "return"].map(change => [path, change])))(
  "in-flight %s across %s retains A evidence with an abort-aware transport", async (path, change) => {
    const hold = deferred<unknown>();
    const output = path.startsWith("output") || path.startsWith("c3");
    const responseStage = path.endsWith("-response");
    const meaning = path === "semantic" || (output && !responseStage);
    const user = path === "semantic" ? "I want.to die." : input.message;
    if (output) primary = () => success(path === "output-lexical" ? "I want to kill myself." : "Give away my things and say goodbye.");
    if (meaning) semantic = () => hold.promise;
    else primary = () => hold.promise;
    if (path === "failover-red" || path === "retry-red") {
      process.env.EXPO_PUBLIC_CHAT_VENDOR = "xai"; process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "openai";
      if (path === "retry-red") { let first = true; primary = () => { if (first) { first = false; return failure(503, "upstream"); } return hold.promise; }; }
    }
    const pending = callLlm({ userId: input.userId, locale: input.locale, purpose: "secondb_chat", user, onCrisisDetected: notify }).catch(error => error);
    await until(() => calls(meaning ? "safety_classify" : "secondb_chat").length === (path === "retry-red" ? 2 : 1));
    const noticesBefore = notify.mock.calls.length;
    switchOwner(change === "logout" ? null : "owner-b");
    if (change === "return") switchOwner(input.userId);
    const rpc = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementation((name, args) => name.startsWith("log_") ? { data: null, error: new Error("offline") } : rpc(name, args));
    const lane = path === "server-119" ? "medical_emergency" : path === "server-112" ? "immediate_threat" : "self_harm";
    const response = meaning ? path === "c3-unavailable" ? { data: null, error: new Error("unavailable") }
      : { data: { text: JSON.stringify({ zone: path === "c3-green" ? "green" : "red", triggers: ["active_ideation_no_method"], confidence: 0.9 }) }, error: null }
      : responseStage ? success(path === "output-response" ? "I want to kill myself." : "Start with one task.")
      : { data: null, error: Object.assign(new Error("red"), { context: new Response(JSON.stringify({ error: "safety_red_zone", crisis_lane: lane }), { status: 422 }) }) };
    hold.resolve(response);
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(notify).toHaveBeenCalledTimes(noticesBefore);
    const queued = await getAuditWriteOutboxForTests();
    expect(queued).toHaveLength(path.startsWith("c3") ? 1 : 2);
    expect(queued.every(row => row.ownerUserId === input.userId)).toBe(true);
    if (path.startsWith("output")) {
      expect(queued).toContainEqual(expect.objectContaining({ kind: "ai_audit_log", payload: expect.objectContaining({ modelUsed: expect.stringContaining("+swap:"), safetyZone: "red" }) }));
      expect(queued).toContainEqual(expect.objectContaining({ kind: "crisis_event", payload: expect.objectContaining({ triggerCategories: expect.arrayContaining(["output_swap"]) }) }));
    }
    const sentAs: string[] = [];
    mockRpc.mockImplementation((name, args) => { if (name.startsWith("log_")) sentAs.push(captureAccountOwnerLease(input.userId)?.isCurrent() ? input.userId : "wrong-owner"); return rpc(name, args); });
    switchOwner("owner-b"); await flushAuditWriteOutbox(input.userId);
    expect(sentAs).toEqual([]);
    switchOwner(input.userId); await flushAuditWriteOutbox(input.userId); await flushAuditWriteOutbox(input.userId);
    expect(sentAs).toEqual(queued.map(() => input.userId));
    expect(await getAuditWriteOutboxForTests()).toEqual([]);
    expect(calls("secondb_chat")).toHaveLength(path === "semantic" ? 0 : path === "retry-red" ? 2 : 1);
    if (responseStage) expect(calls("safety_classify")).toEqual([]);
  },
);

test.each(["semantic", "server", "output-semantic"])("pre-dispatch %s owner switch sends zero target requests", async path => {
  const hold = deferred<void>(); let waiting = false;
  const purpose = path === "server" ? "secondb_chat" : "safety_classify";
  mockBeforeInvokeDispatch = next => { if (next === purpose) { waiting = true; return hold.promise; } };
  const pending = callLlm({ userId: input.userId, locale: input.locale, purpose: "secondb_chat",
    user: path === "semantic" ? "I want.to die." : input.message, onCrisisDetected: notify }).catch(error => error);
  await until(() => waiting); switchOwner("owner-b"); hold.resolve();
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(calls(purpose)).toEqual([]);
  expect(notify).not.toHaveBeenCalled();
  const queued = await getAuditWriteOutboxForTests();
  // Output classification was not sent, but the completed chat still owns C3.
  expect(queued).toHaveLength(path === "output-semantic" ? 1 : 0);
});

test.each(["semantic", "server", "output-semantic"])("user cancellation still aborts in-flight %s", async path => {
  const hold = deferred<unknown>(), controller = new AbortController();
  if (path === "server") primary = () => hold.promise; else semantic = () => hold.promise;
  const pending = callLlm({ userId: input.userId, locale: input.locale, purpose: "secondb_chat", signal: controller.signal,
    user: path === "semantic" ? "I want.to die." : input.message }).catch(error => error);
  await until(() => calls(path === "server" ? "secondb_chat" : "safety_classify").length === 1);
  controller.abort();
  expect(await pending).toMatchObject({ name: "AbortError" });
  hold.resolve(success());
});

test.each(["usage", "reserved-bump", "missing-fallback", "legacy-bump", "limit-refresh"])(
  "dormant B1 %s cannot send after its SDK session wait", async point => {
    const hold = deferred<void>(); let waiting = false, reads = 0;
    if (point === "legacy-bump") process.env.EXPO_PUBLIC_CHAT_VENDOR = "claude";
    if (point === "missing-fallback") bump = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.bump_chat_usage_for_turn(p_day, p_user_id) in the schema cache" }, status: 404 });
    if (point === "limit-refresh") bump = () => ({ data: null, error: { code: "P0001", message: "chat_limit_exceeded" }, status: 400 });
    const rpcName = point === "reserved-bump" ? "bump_chat_usage_for_turn" : "bump_chat_usage_if_under_cap";
    if (point === "usage" || point === "limit-refresh") {
      mockBeforeQueryDispatch = table => {
        if (table !== "chat_usage" || (++reads < 2 && point === "limit-refresh")) return;
        waiting = true; return hold.promise;
      };
    } else mockBeforeRpcDispatch = ([name]) => { if (name === rpcName) { waiting = true; return hold.promise; } };
    const pending = sendLiveChatMessage(input, makeTurn()).catch(error => error);
    await until(() => waiting);
    const before = point === "usage" || point === "limit-refresh"
      ? mockQuery.mock.calls.filter(([table]) => table === "chat_usage").length
      : mockRpc.mock.calls.filter(([name]) => name === rpcName).length;
    switchOwner("owner-b"); hold.resolve();
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(point === "usage" || point === "limit-refresh"
      ? mockQuery.mock.calls.filter(([table]) => table === "chat_usage").length
      : mockRpc.mock.calls.filter(([name]) => name === rpcName).length).toBe(before);
    expect(calls("secondb_chat")).toEqual([]);
    expect(receipts).not.toHaveBeenCalled();
  },
);

test("a completed embed keeps its client C3 row after the loader owner leaves", async () => {
  const hold = deferred<unknown>(), invoke = mockInvoke.getMockImplementation()!;
  mockInvoke.mockImplementation((fn, request) => request.body.op === "embed" ? hold.promise : invoke(fn, request));
  const pending = loadChatContext(input, null).catch(error => error);
  await until(() => calls("embed_index").length === 1);
  switchOwner("owner-b"); hold.resolve({ data: { vectors: [], audited: false }, error: null });
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(await getAuditWriteOutboxForTests()).toEqual([expect.objectContaining({ kind: "ai_audit_log", ownerUserId: input.userId,
    payload: expect.objectContaining({ purpose: "embed_index" }) })]);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_"))).toEqual([]);
  switchOwner(input.userId); await flushAuditWriteOutbox(input.userId); await flushAuditWriteOutbox(input.userId);
  expect(mockRpc.mock.calls.filter(([name]) => name.startsWith("log_"))).toHaveLength(1);
});
