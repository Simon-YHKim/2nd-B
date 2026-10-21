// Actual A/B/C3 -> C1c -> C1b -> transport and D3a ledger. Only I/O is replaced.
import { createChatOperationFactory } from "../session-operation";
import { createChatSessionRegistry } from "../session-registry";
import { createChatSessionController } from "../session-controller";
import type { CapturedChatInput, ChatOperationSupervisor, ChatSessionDeps } from "../session-deps";
import { createContentWipeLedger } from "../../account/content-wipe";
import * as leaseModule from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease,
  clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import { resetAuditWriteOutboxForTests } from "../../llm/audit-write-outbox";
import { EMBED_DIM, EMBED_MODEL } from "../../llm/boundary";
import { publishCrisisNotice, getCrisisNotice, dismissCrisisNotice } from "../../safety/crisis-notice";
const mockAuth = jest.fn(), mockRpc = jest.fn(), mockRead = jest.fn();
type Query = { table: string; columns: string; filters: Record<string, unknown>; limit?: number };
const mockQueries: Query[] = [];
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mockAuth }, rpc: mockRpc,
  from(table: string) {
    const query: Query = { table, columns: "", filters: {} }; mockQueries.push(query);
    const builder = {
      select(columns: string) { query.columns = columns; return builder; },
      eq(key: string, value: unknown) { query.filters[key] = value; return builder; },
      not() { return builder; }, order() { return builder; },
      in(key: string, value: unknown) { query.filters[key] = value; return builder; },
      overlaps() { return builder; }, limit(value: number) { query.limit = value; return builder; },
      maybeSingle: () => mockRead(query),
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(mockRead(query)).then(resolve, reject); },
    }; return builder;
  },
}) }));
jest.mock("../../env", () => ({ getEnv: () => ({
  EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon",
  EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true, EXPO_PUBLIC_USE_VERTEX: false,
}) }));
jest.mock("@google/genai", () => ({ GoogleGenAI: class { constructor() { throw new Error("direct provider forbidden in fixture"); } } }));
const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const cleanups: (() => void)[] = [];
const envKeys = ["EXPO_PUBLIC_SERVER_SAFETY", "EXPO_PUBLIC_FAILOVER_VENDOR", "EXPO_PUBLIC_CHAT_VENDOR", "EXPO_PUBLIC_EMBED_VENDOR"] as const;
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
};
function owner(id: string) { beginAccountOwnerTransition(id); noteResolvedOwner(id); clearAccountTransition(currentAccountEpoch()); return captureAccountOwnerLease(id)!; }
const body = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);
const calls = (kind: string) => fetchMock.mock.calls.filter(call => kind === "quota" ? String(call[0]).endsWith("/bump_chat_usage_if_under_cap") : body(call).purpose === kind || body(call).op === kind);
function defaultRead(query: Query) {
  return { data: query.table === "chat_usage" ? { count: 0, ad_bonus: 2 } : query.table === "users" ? null : [], error: null };
}
async function defaultFetch(url: string, init: RequestInit) {
  if (url.endsWith("/bump_chat_usage_if_under_cap")) return response(1);
  if (url.includes("/rest/v1/rpc/")) return response(null);
  const data = JSON.parse(init.body as string);
  if (data.op === "embed") return response({ vectors: [Array(EMBED_DIM).fill(0.1)], modelUsed: EMBED_MODEL, audited: true });
  if (data.purpose === "safety_classify") return response({ text: JSON.stringify({ zone: "green", triggers: [], confidence: 1 }), audited: true });
  if (data.purpose === "secondb_chat") return response({ text: "A plain safe reply.", modelUsed: "fixture-model", audited: true });
  throw new Error(`unexpected transport ${url}`);
}
beforeEach(async () => {
  await resetAuditWriteOutboxForTests(); __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); owner("a");
  mockAuth.mockReset().mockResolvedValue({ data: { session: { user: { id: "a" }, access_token: "captured-a" } }, error: null });
  mockRpc.mockReset().mockImplementation(async (name: string) => { if (name !== "match_wiki_pages") throw new Error(`mutable mutation forbidden: ${name}`); return { data: [], error: null }; });
  mockRead.mockReset().mockImplementation(defaultRead); mockQueries.length = 0;
  fetchMock.mockReset().mockImplementation(defaultFetch); globalThis.fetch = fetchMock as typeof fetch;
  process.env.EXPO_PUBLIC_SERVER_SAFETY = "true"; process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "none";
  process.env.EXPO_PUBLIC_CHAT_VENDOR = "openai"; process.env.EXPO_PUBLIC_EMBED_VENDOR = "openai";
});
afterEach(async () => {
  await resetAuditWriteOutboxForTests(); cleanups.splice(0).reverse().forEach(fn => fn());
  const notice = getCrisisNotice(); if (notice) dismissCrisisNotice(notice.id);
  globalThis.fetch = originalFetch; jest.restoreAllMocks();
  for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
});

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function fixture() {
  let sequence = 0;
  const ledger = createContentWipeLedger(), current = captureAccountOwnerLease("a")!;
  const registry = createChatSessionRegistry(ledger, () => `registry-${++sequence}`);
  const view = registry.attachView("a", "entry")!, token = view.snapshot.session!;
  const begin = createChatOperationFactory(registry, ledger);
  const actualLease = jest.spyOn(leaseModule, "beginAccountSessionLease");
  const operations: { supervisor: ChatOperationSupervisor; released: jest.SpyInstance; done: ReturnType<typeof deferred<void>> }[] = [];
  const complete = jest.fn(), releaseThinking = jest.fn();
  const deps: ChatSessionDeps = {
    readAdmission: () => ({ ready: true, ordinaryAllowed: true, locale: "en", minor: false, tier: "free", recovery: "legacy",
      errors: { request: "Request failed", presentation: "Display failed", consent_required: "Consent needed", consent_check_unavailable: "Consent unavailable" } }),
    beginOperation: (account, session, id) => {
      const supervisor = begin(account, session, id), raw = actualLease.mock.results.at(-1)!.value as leaseModule.PendingAccountSessionLease;
      const released = jest.spyOn(raw, "release"), done = deferred<void>();
      operations.push({ supervisor, released, done });
      const observe = <T,>(operation: Promise<T>) => { void operation.then(() => done.resolve(), () => done.resolve()); return operation; };
      return { ...supervisor, send: input => observe(supervisor.send(input)), auditLocalRed: input => observe(supervisor.auditLocalRed(input)) };
    },
    publishCrisisNotice: jest.fn(publishCrisisNotice), consentError: () => null, holdThinking: () => releaseThinking,
  };
  const controller = createChatSessionController(registry, deps, () => `controller-${++sequence}`);
  controller.subscribeCompletion(complete);
  cleanups.push(() => { controller.dispose(); registry.dispose(); operations.forEach(op => op.supervisor.release()); });
  const send = (text = "Tell me about my saved weekend plans.") => {
    registry.editDraft(token, text);
    return controller.send({ session: token, text, expectedDraftRevision: registry.getDraftSnapshot(token)!.revision });
  };
  const wipe = () => ledger.beginWipe(current, token.contentGeneration, "explicit-intent")!;
  const facts = () => ledger.inspect(captureAccountOwnerLease("a")!).tickets;
  return { ledger, current, registry, token, view, begin, deps, controller, complete, operations, actualLease, send, wipe, facts, releaseThinking };
}
async function direct(f: ReturnType<typeof fixture>) {
  const op = f.begin(f.current, f.token, "direct"); cleanups.push(op.release);
  const raw = f.actualLease.mock.results.at(-1)!.value as leaseModule.PendingAccountSessionLease;
  const released = jest.spyOn(raw, "release");
  const session = await op.lease.authenticate();
  const input: CapturedChatInput = { userId: "a", message: "Tell me about my saved weekend plans.", locale: "en", tier: "free", session,
    signal: session.signal, onCrisisDetected: jest.fn() };
  return { op, raw, released, input };
}

test("actual B sends once with one authentication, original JWT/signal and release; detach does not replay", async () => {
  const f = fixture();
  expect(mockAuth).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  const accepted = f.send(); expect(accepted.accepted).toBe(true);
  f.registry.detachView(f.view.viewId);
  await flush(); await f.operations[0].done.promise; await flush();
  expect(mockAuth).toHaveBeenCalledTimes(1); expect(f.complete).toHaveBeenCalledTimes(1);
  expect(f.operations[0].released).toHaveBeenCalledTimes(1); expect(f.releaseThinking).toHaveBeenCalledTimes(1);
  expect(f.facts()).toMatchObject([{ operationId: accepted.accepted ? accepted.operationId : "", stepId: "quota", kind: "usage", outcome: "committed" }]);
  for (const [, init] of fetchMock.mock.calls) { expect(init.signal).toBe(f.operations[0].supervisor.lease.signal); expect(init.headers.Authorization).toBe("Bearer captured-a"); }
  expect(f.registry.attachView("a", "entry")!.snapshot.session!.turns[1].text).toBe("A plain safe reply.");
  f.controller.subscribeCompletion(jest.fn()); await flush();
  expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(1);
  expect(JSON.stringify(f.registry.getSnapshot("entry"))).not.toContain("captured-a");
});

test.each([false, true])("real local RED (strict %s) has one notice and no context, quota or model", async strict => {
  const f = fixture();
  // Busy safety goes through B's strict local helper; direct invocation checks that port too.
  if (strict) {
    const d = await direct(f); d.input.message = "I want to kill myself";
    await expect(d.op.auditLocalRed(d.input)).resolves.toMatchObject({ used: null, reply: { safety: { zone: "red" } } });
    expect(d.input.onCrisisDetected).toHaveBeenCalledTimes(1); d.op.release(); expect(d.released).toHaveBeenCalledTimes(1);
  } else {
    expect(f.send("I want to kill myself").accepted).toBe(true); await flush(); await f.operations[0].done.promise; await flush();
    expect(f.deps.publishCrisisNotice).toHaveBeenCalledTimes(1); expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.registry.getSessionSnapshot(f.token)!.turns[1]).toMatchObject({ safetyZone: "red" });
    expect(f.operations[0].released).toHaveBeenCalledTimes(1);
  }
  expect(mockQueries).toEqual([]); expect(calls("quota")).toHaveLength(0); expect(calls("secondb_chat")).toHaveLength(0);
  expect(f.facts()).toEqual([]); expect(f.ledger.read(f.current).phase).toBe("open");
});

test.each(["auth", "read", "model"])("%s waiting + wipe closes body and aborts unissued work", async stage => {
  const f = fixture(), entered = deferred<void>(), pending = deferred<unknown>();
  if (stage === "auth") mockAuth.mockImplementation(() => { entered.resolve(); return pending.promise; });
  if (stage === "read") mockRead.mockImplementation(() => { entered.resolve(); return pending.promise; });
  if (stage === "model") fetchMock.mockImplementation((url, init) => {
    if (JSON.parse(init.body).purpose === "secondb_chat") { entered.resolve(); return pending.promise; } return defaultFetch(url, init);
  });
  expect(f.send().accepted).toBe(true); await entered.promise;
  const signal = f.operations[0].supervisor.lease.signal;
  expect(f.wipe().ackConfirmed).toBe(true); expect(signal.aborted).toBe(true);
  const before = fetchMock.mock.calls.length;
  pending.resolve(stage === "auth" ? { data: { session: { user: { id: "a" }, access_token: "captured-a" } }, error: null }
    : stage === "read" ? defaultRead({ table: "chat_usage", columns: "", filters: {} }) : response({ text: "Late reply", audited: true }));
  await flush(); if (stage !== "auth") await f.operations[0].done.promise; await flush();
  expect(f.complete).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(before);
  expect(f.registry.getSessionSnapshot(f.token)).toBeNull(); expect(f.operations[0].released).toHaveBeenCalledTimes(1);
});

test("wipe during actual ticket acquisition prevents dispatch before the first quota fetch", async () => {
  const f = fixture(); let wiped = false;
  f.ledger.observe(f.current, () => { if (!wiped && f.facts().some(t => t.outcome === "registered")) { wiped = true; f.wipe(); } });
  expect(f.send().accepted).toBe(true); await flush(); await f.operations[0].done.promise; await flush();
  expect(wiped).toBe(true); expect(calls("quota")).toHaveLength(0); expect(calls("secondb_chat")).toHaveLength(0);
  expect(f.facts()).toMatchObject([{ outcome: "definitely-not-issued" }]); expect(f.complete).not.toHaveBeenCalled();
  expect(f.operations[0].released).toHaveBeenCalledTimes(1);
});

test.each(["success", "cap", "malformed", "network"])("pending quota + wipe preserves signal and original %s outcome, never treats ACK as drain", async outcome => {
  const f = fixture(), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => { if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; } return defaultFetch(url, init); });
  expect(f.send().accepted).toBe(true); await entered.promise;
  const op = f.operations[0], signal = op.supervisor.lease.signal, wipe = f.wipe();
  expect(wipe.ackConfirmed).toBe(true); expect(signal.aborted).toBe(false);
  expect(() => op.supervisor.lease.assertCurrent()).toThrow(); expect(f.facts()).toMatchObject([{ outcome: "issued-pending" }]);
  expect(f.ledger.claimDeletionAttempt(f.current, wipe.wipeId!, wipe.generation)).toBeNull();
  op.supervisor.release(); op.supervisor.release(); expect(op.released).not.toHaveBeenCalled(); expect(signal.aborted).toBe(false);
  if (outcome === "network") pending.reject(new Error("connection lost"));
  else pending.resolve(outcome === "cap" ? response({ code: "P0001", message: "chat_limit_exceeded" }, 400) : response(outcome === "malformed" ? null : 1));
  await op.done.promise; await flush();
  expect(f.facts()).toMatchObject([{ outcome: outcome === "success" ? "committed" : outcome === "cap" ? "definitely-not-committed" : "unknown" }]);
  expect(op.released).toHaveBeenCalledTimes(1); expect(signal.aborted).toBe(true);
  expect(f.complete).not.toHaveBeenCalled(); expect(calls("secondb_chat")).toHaveLength(0); expect(calls("quota")).toHaveLength(1);
  if (outcome === "malformed" || outcome === "network") expect(f.ledger.claimDeletionAttempt(f.current, wipe.wipeId!, wipe.generation)).toBeNull();
  expect(fetchMock.mock.calls.some(call => call[1].method === "DELETE")).toBe(false);
});

test.each(["hold", "aba", "dispose"])("pending issued quota + %s aborts now and preserves unknown on the original ledger", async change => {
  const f = fixture(), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => { if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; } return defaultFetch(url, init); });
  f.send(); await entered.promise;
  const op = f.operations[0], signal = op.supervisor.lease.signal;
  if (change === "hold") beginAccountOwnerTransition("b");
  else if (change === "aba") { owner("b"); owner("a"); }
  else f.controller.dispose();
  expect(signal.aborted).toBe(true);
  pending.reject(Object.assign(new Error("aborted"), { name: "AbortError" })); await op.done.promise; await flush();
  if (change === "hold") owner("a");
  expect(f.facts()).toMatchObject([{ ownerEpoch: f.current.epoch, outcome: "unknown" }]);
  expect(op.released).toHaveBeenCalledTimes(1); expect(f.complete).not.toHaveBeenCalled(); expect(calls("secondb_chat")).toHaveLength(0);
  const current = captureAccountOwnerLease("a")!, wipe = f.ledger.beginWipe(current, 0, "later")!;
  expect(f.ledger.claimDeletionAttempt(current, wipe.wipeId!, wipe.generation)).toBeNull();
});

test("direct supervisor authentication is memoized and replay cannot dispatch a second quota/model", async () => {
  const f = fixture(), d = await direct(f);
  expect(await d.op.lease.authenticate()).toBe(d.input.session); expect(mockAuth).toHaveBeenCalledTimes(1);
  mockAuth.mockResolvedValue({ data: { session: { user: { id: "b" }, access_token: "replacement-b" } }, error: null });
  const pending = d.op.send(d.input); await expect(d.op.send(d.input)).rejects.toMatchObject({ name: "AbortError" });
  await expect(pending).resolves.toMatchObject({ status: "ok" });
  await expect(d.op.auditLocalRed(d.input)).rejects.toMatchObject({ name: "AbortError" });
  d.op.release(); d.op.release(); d.op.retire("disposed");
  expect(d.released).toHaveBeenCalledTimes(1); expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(1);
  expect(calls("embed")).toHaveLength(1); expect(mockQueries).toHaveLength(5); expect(mockAuth).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.every(call => call[1].headers.Authorization === "Bearer captured-a")).toBe(true);
});

test.each(["owner", "epoch", "content", "session", "operation", "hold", "wipe", "disposed"])("invalid construction %s creates no auth lease or I/O", mode => {
  const f = fixture(); let account = f.current, token = f.token, id = "operation";
  if (mode === "owner") account = { ...account, ownerId: "b" };
  if (mode === "epoch") account = { ...account, epoch: account.epoch + 1 };
  if (mode === "content") token = { ...token, contentGeneration: token.contentGeneration + 1 };
  if (mode === "session") token = { ...token, sessionId: "wrong" };
  if (mode === "operation") id = " ";
  if (mode === "hold") beginAccountOwnerTransition("b");
  if (mode === "wipe") f.wipe();
  if (mode === "disposed") f.registry.dispose();
  expect(() => f.begin(account, token, id)).toThrow(); expect(f.actualLease).not.toHaveBeenCalled();
  expect(mockAuth).not.toHaveBeenCalled(); expect(mockQueries).toEqual([]); expect(fetchMock).not.toHaveBeenCalled();
});

test.each(["auth", "read", "model"])("%s waiting keeps busy-clear refusal; explicit retirement cannot fill the new session", async stage => {
  const f = fixture(), entered = deferred<void>(), pending = deferred<unknown>();
  if (stage === "auth") mockAuth.mockImplementation(() => { entered.resolve(); return pending.promise; });
  if (stage === "read") mockRead.mockImplementation(() => { entered.resolve(); return pending.promise; });
  if (stage === "model") fetchMock.mockImplementation((url, init) => {
    if (JSON.parse(init.body).purpose === "secondb_chat") { entered.resolve(); return pending.promise; } return defaultFetch(url, init);
  });
  f.send(); await entered.promise;
  expect(f.registry.clear(f.registry.getSnapshot("entry")!.choice)).toBe(false);
  expect(f.controller.dispose()).toBe(true);
  expect(f.registry.clear(f.registry.getSnapshot("entry")!.choice)).toBe(true);
  expect(f.operations[0].supervisor.lease.signal.aborted).toBe(true);
  pending.resolve(stage === "auth" ? { data: { session: { user: { id: "a" }, access_token: "captured-a" } }, error: null }
    : stage === "read" ? defaultRead({ table: "chat_usage", columns: "", filters: {} }) : response({ text: "Late reply", audited: true }));
  await flush(); if (stage !== "auth") await f.operations[0].done.promise; await flush();
  const next = f.registry.getSnapshot("entry")!.session!;
  expect(next.sessionId).not.toBe(f.token.sessionId); expect(next.turns).toEqual([]);
  expect(f.complete).not.toHaveBeenCalled(); expect(f.operations[0].released).toHaveBeenCalledTimes(1);
});

test("pending body parsing is still an issued request: release waits beyond response headers", async () => {
  const f = fixture(), bodyRead = deferred<unknown>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => {
    if (url.endsWith("/bump_chat_usage_if_under_cap")) {
      const value = response(1); value.json = () => { entered.resolve(); return bodyRead.promise; }; return Promise.resolve(value);
    }
    return defaultFetch(url, init);
  });
  f.send(); await entered.promise;
  const op = f.operations[0], wipe = f.wipe(); op.supervisor.release();
  expect(op.supervisor.lease.signal.aborted).toBe(false); expect(op.released).not.toHaveBeenCalled();
  expect(f.ledger.claimDeletionAttempt(f.current, wipe.wipeId!, wipe.generation)).toBeNull();
  bodyRead.resolve(1); await op.done.promise; await flush();
  expect(f.facts()).toMatchObject([{ outcome: "committed" }]); expect(op.released).toHaveBeenCalledTimes(1);
  expect(calls("secondb_chat")).toHaveLength(0); expect(f.complete).not.toHaveBeenCalled();
});

test("synchronous dispatch reentry sees issued state before a wipe and preserves its signal", async () => {
  const f = fixture(), pending = deferred<Response>(), entered = deferred<void>(); let ack: boolean | undefined, alive: boolean | undefined;
  fetchMock.mockImplementation((url, init) => {
    if (url.endsWith("/bump_chat_usage_if_under_cap")) { ack = f.wipe().ackConfirmed; alive = !init.signal.aborted; entered.resolve(); return pending.promise; }
    return defaultFetch(url, init);
  });
  f.send(); await entered.promise;
  expect(ack).toBe(true); expect(alive).toBe(true); expect(f.facts()).toMatchObject([{ outcome: "issued-pending" }]);
  pending.resolve(response(1)); await f.operations[0].done.promise; await flush();
  expect(f.facts()).toMatchObject([{ outcome: "committed" }]); expect(f.complete).not.toHaveBeenCalled(); expect(calls("secondb_chat")).toHaveLength(0);
});

test("wipe then owner hold upgrades cancellation while keeping the original late confirmed receipt", async () => {
  const f = fixture(), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => { if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; } return defaultFetch(url, init); });
  f.send(); await entered.promise;
  const op = f.operations[0]; f.wipe(); expect(op.supervisor.lease.signal.aborted).toBe(false);
  beginAccountOwnerTransition("b"); expect(op.supervisor.lease.signal.aborted).toBe(true);
  // The fixture delivers an actual success despite cancellation; abort is not proof of rollback.
  pending.resolve(response(1)); await op.done.promise; await flush(); owner("a");
  expect(f.facts()).toMatchObject([{ ownerEpoch: f.current.epoch, outcome: "committed" }]);
  expect(calls("secondb_chat")).toHaveLength(0); expect(f.complete).not.toHaveBeenCalled(); expect(op.released).toHaveBeenCalledTimes(1);
});

test("C3 copies body and callback, owns the ledger and operation ID despite pending input edits", async () => {
  const f = fixture(), d = await direct(f), entered = deferred<void>(), pending = deferred<unknown>();
  const original = d.input.onCrisisDetected, replacement = jest.fn(), alternate = createContentWipeLedger();
  d.input.history = [{ role: "user", text: "Original history" }];
  mockRead.mockImplementation(query => { if (query.table === "chat_usage") { entered.resolve(); return pending.promise; } return defaultRead(query); });
  fetchMock.mockImplementation((url, init) => JSON.parse(init.body).purpose === "secondb_chat"
    ? response({ text: "I want to kill myself", audited: true }) : defaultFetch(url, init));
  const result = d.op.send(d.input); await entered.promise;
  d.input.message = "Changed message"; d.input.history[0].text = "Changed history";
  Object.assign(d.input, { onCrisisDetected: replacement, mutationObserver: { owner: f.current, generation: 0, operationId: "changed", stepId: "changed", ledger: alternate } });
  pending.resolve(defaultRead({ table: "chat_usage", columns: "", filters: {} }));
  await expect(result).resolves.toMatchObject({ status: "ok", reply: { safety: { zone: "red" } } });
  expect(original).toHaveBeenCalledTimes(1); expect(replacement).not.toHaveBeenCalled();
  expect(f.facts()).toMatchObject([{ operationId: "direct", stepId: "quota", outcome: "committed" }]); expect(alternate.inspect(f.current).tickets).toEqual([]);
  const prompt = body(calls("secondb_chat")[0]);
  expect(prompt.user).toBe("Tell me about my saved weekend plans."); expect(prompt.system).toContain("Original history"); expect(prompt.system).not.toContain("Changed history");
});

test.each(["user", "session", "signal", "callback", "released"])("input %s mismatch is rejected without egress", async mode => {
  const f = fixture(), d = await direct(f);
  if (mode === "user") d.input.userId = "b";
  if (mode === "session") Object.assign(d.input, { session: { ...d.input.session } });
  if (mode === "signal") Object.assign(d.input, { signal: new AbortController().signal });
  if (mode === "callback") Object.assign(d.input, { onCrisisDetected: null });
  if (mode === "released") d.op.release();
  await expect(d.op.send(d.input)).rejects.toMatchObject({ name: "AbortError" });
  expect(mockQueries).toEqual([]); expect(fetchMock).not.toHaveBeenCalled(); expect(f.facts()).toEqual([]);
});

describe.each(["wipe", "account", "dispose"] as const)("actual factory under B construction %s reentry", change => {
  test.each([false, "throw", true])("a late %s ACK cannot erase the earlier false handoff", async outcome => {
    const f = fixture(), begin = f.deps.beginOperation; let ack: boolean | undefined;
    f.deps.beginOperation = (...args) => {
      const actual = begin(...args);
      const supervisor = { ...actual, retire(reason: Parameters<ChatOperationSupervisor["retire"]>[0]) {
        actual.retire(reason); if (outcome === "throw") throw new Error("late refused"); return outcome === true;
      } };
      if (change === "wipe") ack = f.wipe().ackConfirmed;
      else { if (change === "account") beginAccountOwnerTransition("b"); ack = f.controller.dispose(); }
      return supervisor;
    };
    expect(f.send().accepted).toBe(true); await flush();
    expect(ack).toBe(false); expect(mockAuth).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    expect(f.operations[0].released).toHaveBeenCalledTimes(1); expect(f.complete).not.toHaveBeenCalled();
    expect(f.controller.dispose()).toBe(false); expect(f.controller.dispose()).toBe(false);
    if (change === "wipe") {
      const state = f.ledger.inspect(f.current); expect(state.ackConfirmed).toBe(false);
      expect(f.ledger.claimDeletionAttempt(f.current, state.wipeId!, state.generation)).toBeNull();
    }
  });
});

test.each([false, "throw", true])("actual retire + B dispose reentry preserves false ACK despite outer %s", async outcome => {
  const f = fixture(), begin = f.deps.beginOperation, entered = deferred<void>(), pending = deferred<unknown>(); let ack: boolean | undefined;
  mockRead.mockImplementation(() => { entered.resolve(); return pending.promise; });
  f.deps.beginOperation = (...args) => {
    const actual = begin(...args);
    return { ...actual, retire(reason) {
      actual.retire(reason); ack = f.controller.dispose(); if (outcome === "throw") throw new Error("handoff refused"); return outcome === true;
    } };
  };
  f.send(); await entered.promise; expect(f.wipe().ackConfirmed).toBe(false); expect(ack).toBe(false);
  pending.resolve(defaultRead({ table: "chat_usage", columns: "", filters: {} })); await f.operations[0].done.promise; await flush();
  expect(f.controller.dispose()).toBe(false); expect(f.complete).not.toHaveBeenCalled(); expect(f.operations[0].released).toHaveBeenCalledTimes(1);
});

test("retirement closes a body capability independently of the content generation", async () => {
  const f = fixture(), d = await direct(f), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => { if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; } return defaultFetch(url, init); });
  const work = d.op.send(d.input), rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await entered.promise; expect(d.op.retire("content-wipe")).toBe(true); expect(d.op.retire("content-wipe")).toBe(true);
  expect(d.input.signal.aborted).toBe(false); expect(f.ledger.read(f.current).phase).toBe("open");
  expect(() => d.input.session.assertCurrent()).toThrow();
  pending.resolve(response(1)); await rejected;
  expect(f.facts()).toMatchObject([{ outcome: "committed" }]); expect(calls("secondb_chat")).toHaveLength(0);
  d.op.release(); expect(d.released).toHaveBeenCalledTimes(1);
});

test("local RED cannot be replayed on the same supervisor", async () => {
  const f = fixture(), d = await direct(f); d.input.message = "I want to kill myself";
  await expect(d.op.auditLocalRed(d.input)).resolves.toMatchObject({ used: null });
  const issued = fetchMock.mock.calls.length;
  await expect(d.op.auditLocalRed(d.input)).rejects.toMatchObject({ name: "AbortError" });
  await expect(d.op.send(d.input)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(issued); expect(d.input.onCrisisDetected).toHaveBeenCalledTimes(1);
});

test("late RED through actual B emits one notice, preserves non-synthetic result and never starts a wipe", async () => {
  const f = fixture();
  fetchMock.mockImplementation((url, init) => JSON.parse(init.body).purpose === "secondb_chat"
    ? response({ text: "I want to kill myself", audited: true }) : defaultFetch(url, init));
  f.controller.subscribeCompletion(() => { throw new Error("presentation listener failed"); });
  f.send(); await flush(); await f.operations[0].done.promise; await flush();
  expect(f.deps.publishCrisisNotice).toHaveBeenCalledTimes(1); expect(f.complete).toHaveBeenCalledTimes(1);
  const turn = f.registry.getSessionSnapshot(f.token)!.turns[1];
  expect(turn.safetyZone).toBe("red"); expect(turn.synthetic).not.toBe(true);
  expect(f.controller.getSnapshot(f.token)!.send!.retry).toBe("none"); expect(f.ledger.read(f.current).phase).toBe("open");
  expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(1); expect(f.operations[0].released).toHaveBeenCalledTimes(1);
});

test.each(["clear", "replacement"])("direct factory observes a real registry %s and aborts read work", async change => {
  const f = fixture(), d = await direct(f), entered = deferred<void>(), pending = deferred<unknown>();
  mockRead.mockImplementation(() => { entered.resolve(); return pending.promise; });
  const work = d.op.send(d.input), rejected = expect(work).rejects.toMatchObject({ name: "AbortError" }); await entered.promise;
  const choice = f.registry.getSnapshot("entry")!.choice;
  expect(change === "clear" ? f.registry.clear(choice) : f.registry.chooseNew(choice, { fromNode: null, mode: "analytic", persona: "secondb", seed: "new" })).toBe(true);
  expect(d.input.signal.aborted).toBe(true);
  pending.resolve(defaultRead({ table: "chat_usage", columns: "", filters: {} })); await rejected;
  expect(calls("quota")).toHaveLength(0); expect(calls("embed")).toHaveLength(0); expect(f.registry.getSnapshot("entry")!.session!.turns).toEqual([]);
});

test("C3 account subscription alone aborts issued quota after wipe and registry disposal, before owner resolution", async () => {
  const f = fixture(), d = await direct(f), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => {
    if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; }
    return defaultFetch(url, init);
  });
  const work = d.op.send(d.input), rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await entered.promise;
  f.wipe(); f.registry.dispose();
  expect(d.input.signal.aborted).toBe(false); expect(d.released).not.toHaveBeenCalled();
  // No B work/finally, registry listener or resolved-owner notification can supply this abort.
  beginAccountOwnerTransition("b");
  expect(d.input.signal.aborted).toBe(true);
  pending.resolve(response(1)); await rejected; owner("a");
  expect(f.facts()).toMatchObject([{ ownerEpoch: f.current.epoch, outcome: "committed" }]);
  expect(calls("secondb_chat")).toHaveLength(0);
});

test("C3 ignores a caller mutation observer already present at admission", async () => {
  const f = fixture(), d = await direct(f), alternate = createContentWipeLedger();
  Object.assign(d.input, { mutationObserver: { owner: f.current, generation: 0,
    operationId: "caller-operation", stepId: "quota", ledger: alternate } });
  await expect(d.op.send(d.input)).resolves.toMatchObject({ status: "ok" });
  expect(f.facts()).toMatchObject([{ operationId: "direct", stepId: "quota", outcome: "committed" }]);
  expect(alternate.inspect(f.current).tickets).toEqual([]);
  expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(1);
});

test("C3 settlement finishes deferred release without B finally or a second release call", async () => {
  const f = fixture(), d = await direct(f), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => {
    if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; }
    return defaultFetch(url, init);
  });
  const work = d.op.send(d.input), rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await entered.promise; d.op.release();
  expect(d.released).not.toHaveBeenCalled(); expect(d.input.signal.aborted).toBe(false);
  pending.resolve(response(1)); await rejected;
  expect(d.released).toHaveBeenCalledTimes(1); expect(d.input.signal.aborted).toBe(true);
  expect(f.facts()).toMatchObject([{ outcome: "committed" }]);
  expect(calls("secondb_chat")).toHaveLength(0);
});

test("C3 release immediately closes body and token access while the original quota still drains", async () => {
  const f = fixture(), d = await direct(f), pending = deferred<Response>(), entered = deferred<void>();
  fetchMock.mockImplementation((url, init) => {
    if (url.endsWith("/bump_chat_usage_if_under_cap")) { entered.resolve(); return pending.promise; }
    return defaultFetch(url, init);
  });
  const work = d.op.send(d.input), rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await entered.promise;
  expect(f.registry.isCurrent(f.token)).toBe(true); expect(f.ledger.read(f.current).phase).toBe("open");
  d.op.release();
  expect(d.released).not.toHaveBeenCalled(); expect(d.input.signal.aborted).toBe(false);
  expect(() => d.op.lease.assertCurrent()).toThrow();
  expect(() => d.input.session.assertCurrent()).toThrow();
  expect(() => d.input.session.accessToken).toThrow();
  pending.resolve(response(1)); await rejected;
  expect(calls("secondb_chat")).toHaveLength(0);
});
