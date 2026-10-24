// Real conversation -> context/RAG/boundary -> usage/transport -> lease/ledger.
// Only authentication, SDK reads and fetch are local I/O fixtures. No helper guard is mocked.
import { auditChatLocalRed, sendChatMessage, type SendMessageInput } from "../conversation";
import { createContentWipeLedger } from "../../account/content-wipe";
import { beginAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease,
  clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import { resetAuditWriteOutboxForTests } from "../../llm/audit-write-outbox";
import { EMBED_DIM, EMBED_MODEL } from "../../llm/boundary";

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
async function fixture() {
  const ledger = createContentWipeLedger(), current = captureAccountOwnerLease("a")!;
  const lease = beginAccountSessionLease("a"); cleanups.push(lease.release);
  const session = await lease.authenticate();
  const input: SendMessageInput = { userId: "a", message: "Tell me about my saved weekend plans.", locale: "en", tier: "free",
    session, signal: session.signal, onCrisisDetected: jest.fn(), mutationObserver: {
      owner: current, generation: ledger.read(current).generation, operationId: "turn", stepId: "quota", ledger,
    } };
  return { ledger, current, session, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const send = (f: Fixture) => sendChatMessage(f.input);
const wipe = (f: Fixture) => f.ledger.beginWipe(f.current, f.input.mutationObserver!.generation, "explicit-intent")!;
const facts = (f: Fixture) => f.ledger.inspect(captureAccountOwnerLease("a")!).tickets;
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
  globalThis.fetch = originalFetch; jest.restoreAllMocks();
  for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
});

test("real ordinary pipeline preserves captured token/signal through RAG, quota, model and safety", async () => {
  const f = await fixture();
  mockAuth.mockResolvedValue({ data: { session: { user: { id: "b" }, access_token: "mutable-b" } }, error: null });
  await expect(send(f)).resolves.toMatchObject({ status: "ok", used: 1, limit: 5, remaining: 6, reply: { text: "A plain safe reply." } });
  expect(mockAuth).toHaveBeenCalledTimes(1); expect(calls("embed")).toHaveLength(1); expect(calls("quota")).toHaveLength(1);
  expect(calls("secondb_chat")).toHaveLength(1); expect(calls("safety_classify").length).toBeGreaterThanOrEqual(1);
  for (const [, init] of fetchMock.mock.calls) { expect(init.signal).toBe(f.session.signal); expect(init.headers.Authorization).toBe("Bearer captured-a"); }
  expect(facts(f)).toMatchObject([{ kind: "usage", outcome: "committed" }]);
  expect(mockQueries.map(q => q.table)).toEqual(["chat_usage", "records_ai_eligible", "users", "wiki_pages_ai_eligible", "sources"]);
  expect(mockQueries.every(q => q.filters.user_id === "a" || q.filters.id === "a")).toBe(true);
  expect(mockRpc.mock.calls.map(call => call[0])).toEqual(["match_wiki_pages"]);
  const prompt = body(calls("secondb_chat")[0]).system;
  expect(prompt).toContain('<UNTRUSTED type="wiki_snapshot">');
});

test.each(["session", "signal", "observer", "callback", "request-owner", "observer-owner", "epoch", "generation", "signal-mismatch", "hold", "wipe", "released"])("invalid %s rejects before reads, quota and model", async mode => {
  const f = await fixture();
  if (mode === "session") delete f.input.session;
  if (mode === "signal") delete f.input.signal;
  if (mode === "observer") delete f.input.mutationObserver;
  if (mode === "callback") delete f.input.onCrisisDetected;
  if (mode === "request-owner") f.input.userId = "b";
  if (mode === "observer-owner") f.input.mutationObserver = { ...f.input.mutationObserver!, owner: { ...f.current, ownerId: "b" } };
  if (mode === "epoch") f.input.mutationObserver = { ...f.input.mutationObserver!, owner: { ...f.current, epoch: f.current.epoch + 1 } };
  if (mode === "generation") f.input.mutationObserver = { ...f.input.mutationObserver!, generation: f.input.mutationObserver!.generation + 1 };
  if (mode === "signal-mismatch") f.input.signal = new AbortController().signal;
  if (mode === "hold") beginAccountOwnerTransition("b");
  if (mode === "wipe") wipe(f);
  if (mode === "released") f.session.release();
  await expect(send(f)).rejects.toBeDefined(); expect(mockQueries).toEqual([]); expect(mockRpc).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});

test.each(["send", "strict"])("real local RED %s emits guidance and audits without quota/context/model", async mode => {
  const f = await fixture();
  Object.assign(f.input, { message: "I want to kill myself", displayName: "Alex", personaHint: "Speak plainly.", mode: "divergent", minor: true,
    history: [{ role: "user", text: "What did I record?" }, { role: "assistant", text: "A saved plan." }] });
  const result = await (mode === "strict" ? auditChatLocalRed(f.input) : send(f));
  expect(result).toMatchObject({ status: "ok", used: null, limit: null, remaining: null,
    reply: { safety: { zone: "red" }, audit: { modelUsed: "none-crisis-routed" } } });
  expect(f.input.onCrisisDetected).toHaveBeenCalledTimes(1); expect(mockQueries).toEqual([]); expect(mockRpc).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(fetchMock.mock.calls.every(call => String(call[0]).includes("/rest/v1/rpc/log_"))).toBe(true);
  expect(facts(f)).toEqual([]);
});

test("strict local RED port never turns actual GREEN into an ordinary send", async () => {
  const f = await fixture(); await expect(auditChatLocalRed(f.input)).rejects.toThrow("chat_local_red_result_missing");
  expect(mockQueries).toEqual([]); expect(fetchMock).not.toHaveBeenCalled(); expect(facts(f)).toEqual([]);
});

test("local RED observer wipe reentry happens before any audit/usage/model egress", async () => {
  const f = await fixture(); f.input.message = "I want to kill myself";
  f.input.onCrisisDetected = jest.fn(() => { wipe(f); });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  expect(f.input.onCrisisDetected).toHaveBeenCalledTimes(1); expect(mockQueries).toEqual([]); expect(fetchMock).not.toHaveBeenCalled();
});

const pendingStages = ["chat_usage", "records_ai_eligible", "users", "embed", "match_wiki_pages", "wiki_pages_ai_eligible", "sources", "quota", "secondb_chat", "safety_classify"] as const;
test.each(pendingStages.flatMap(stage => ["wipe", "hold", "aba"].map(change => [stage, change] as const)))("pending %s + %s fences the next egress/result", async (stage, change) => {
  const f = await fixture(), pending = deferred<unknown>(), entered = deferred<void>();
  mockRead.mockImplementation((query: Query) => { if (query.table === stage) { entered.resolve(); return pending.promise; } return defaultRead(query); });
  mockRpc.mockImplementation(async (name: string) => { if (name === stage) { entered.resolve(); return pending.promise; } return { data: [], error: null }; });
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    const data = JSON.parse(init.body as string);
    if ((stage === "quota" && url.endsWith("/bump_chat_usage_if_under_cap")) || data.op === stage || data.purpose === stage) {
      entered.resolve(); return pending.promise;
    }
    return defaultFetch(url, init);
  });
  const work = send(f); const assertion = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await entered.promise;
  const before = { fetch: fetchMock.mock.calls.length, queries: mockQueries.length, rpc: mockRpc.mock.calls.length };
  if (change === "wipe") wipe(f);
  else if (change === "hold") beginAccountOwnerTransition("b");
  else { owner("b"); owner("a"); }
  if (["chat_usage", "records_ai_eligible", "users", "wiki_pages_ai_eligible", "sources"].includes(stage)) pending.resolve(defaultRead({ table: stage, columns: "", filters: {} }));
  else if (stage === "match_wiki_pages") pending.resolve({ data: [], error: null });
  else if (stage === "quota") pending.resolve(response(1));
  else if (stage === "embed") pending.resolve(response({ vectors: [Array(EMBED_DIM).fill(0.1)], modelUsed: EMBED_MODEL, audited: true }));
  else if (stage === "safety_classify") pending.resolve(response({ text: JSON.stringify({ zone: "green", triggers: [], confidence: 1 }), audited: true }));
  else pending.resolve(response({ text: "Late reply", audited: true }));
  await assertion;
  expect({ fetch: fetchMock.mock.calls.length, queries: mockQueries.length, rpc: mockRpc.mock.calls.length }).toEqual(before);
  if (change === "hold") owner("a");
  expect(facts(f)).toEqual(["quota", "secondb_chat", "safety_classify"].includes(stage) ? [expect.objectContaining({ kind: "usage", outcome: "committed" })] : []);
});

test.each(["ordinary", "abort", "wipe-error"])("RAG %s keeps fallback distinct from cancellation", async mode => {
  const f = await fixture();
  mockRpc.mockImplementation(async () => {
    if (mode === "wipe-error") wipe(f);
    throw mode === "abort" ? Object.assign(new Error("cancelled"), { name: "AbortError" }) : new Error("ordinary lookup unavailable");
  });
  if (mode === "ordinary") {
    await expect(send(f)).resolves.toMatchObject({ status: "ok", used: 1 });
    expect(mockQueries.some(q => q.table === "sources")).toBe(true); expect(calls("secondb_chat")).toHaveLength(1);
  } else {
    await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
    expect(mockQueries.some(q => q.table === "wiki_pages_ai_eligible" || q.table === "sources")).toBe(false);
    expect(calls("quota")).toHaveLength(0); expect(calls("secondb_chat")).toHaveLength(0);
  }
});

test.each(["records_ai_eligible", "users"])("ordinary %s read error remains fail-soft for the same owner", async table => {
  const f = await fixture(); mockRead.mockImplementation((query: Query) => { if (query.table === table) throw new Error("ordinary read failed"); return defaultRead(query); });
  await expect(send(f)).resolves.toMatchObject({ status: "ok", used: 1 }); expect(calls("quota")).toHaveLength(1);
});

test("export child synchronously starting wipe prevents sibling sources read", async () => {
  const f = await fixture(); mockRead.mockImplementation(defaultRead);
  // listWikiPages starts its async query before the sibling starts. Its builder is
  // created synchronously, so exercise the actual exported child's session fence.
  const realAssert = f.session.assertCurrent; let applied = false;
  jest.spyOn(f.session, "assertCurrent").mockImplementation(() => {
    realAssert();
    if (!applied && mockQueries.some(q => q.table === "wiki_pages_ai_eligible")) { applied = true; wipe(f); }
  });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  expect(applied).toBe(true); expect(mockQueries.some(q => q.table === "sources")).toBe(false);
  expect(calls("quota")).toHaveLength(0);
});

test.each(["known-cap", "lower-server-cap", "ambiguous-cap", "malformed-count"])("real quota %s preserves refusal/unknown semantics without a model", async mode => {
  const f = await fixture(); let reads = 0;
  mockRead.mockImplementation((query: Query) => query.table === "chat_usage"
    ? { data: { count: reads++ ? mode === "known-cap" ? 7 : 3 : 0, ad_bonus: 2 }, error: null } : defaultRead(query));
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (!url.endsWith("/bump_chat_usage_if_under_cap")) return defaultFetch(url, init);
    if (mode === "malformed-count") return Promise.resolve(response(null));
    return Promise.resolve(response({ code: "P0001", message: "chat_limit_exceeded" }, mode === "ambiguous-cap" ? 500 : 400));
  });
  if (mode === "known-cap" || mode === "lower-server-cap") {
    await expect(send(f)).resolves.toMatchObject({ status: "blocked", used: mode === "known-cap" ? 7 : 3, limit: mode === "known-cap" ? 5 : null });
    expect(reads).toBe(2); expect(facts(f)[0].outcome).toBe("definitely-not-committed");
  } else { await expect(send(f)).rejects.toBeDefined(); expect(reads).toBe(1); expect(facts(f)[0].outcome).toBe("unknown"); }
  expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(0);
});

test("already capped local RED still bypasses quota; ordinary input does not", async () => {
  const f = await fixture(); mockRead.mockResolvedValue({ data: { count: 7, ad_bonus: 2 }, error: null });
  await expect(send(f)).resolves.toMatchObject({ status: "blocked", used: 7, limit: 5 });
  expect(mockQueries.map(q => q.table)).toEqual(["chat_usage"]); expect(fetchMock).not.toHaveBeenCalled();
  f.input.message = "I want to kill myself";
  await expect(send(f)).resolves.toMatchObject({ status: "ok", used: null, reply: { safety: { zone: "red" } } });
  expect(mockQueries.map(q => q.table)).toEqual(["chat_usage"]); expect(calls("quota")).toHaveLength(0);
});

test.each(["model-red", "semantic-red"])("real %s observer wipe suppresses later audit/result after committed quota", async mode => {
  const f = await fixture(); f.input.onCrisisDetected = jest.fn(() => { wipe(f); });
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    const data = JSON.parse(init.body as string);
    if (data.purpose === "secondb_chat" && mode === "model-red") return Promise.resolve(response({ text: "I want to kill myself", audited: true }));
    if (data.purpose === "safety_classify" && mode === "semantic-red") return Promise.resolve(response({ text: JSON.stringify({ zone: "red", triggers: ["self_harm"], confidence: 1 }), audited: true }));
    return defaultFetch(url, init);
  });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  expect(f.input.onCrisisDetected).toHaveBeenCalledTimes(1); expect(facts(f)[0].outcome).toBe("committed");
  expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(1);
  expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/rpc/log_"))).toBe(false);
});

test("quota settlement observer ABA records the original commit before suppressing the model", async () => {
  const f = await fixture(); let changed = false;
  f.ledger.observe(f.current, () => {
    if (!changed && facts(f)[0]?.outcome === "committed") { changed = true; owner("b"); owner("a"); }
  });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" }); expect(changed).toBe(true);
  expect(facts(f)[0].outcome).toBe("committed"); expect(calls("quota")).toHaveLength(1); expect(calls("secondb_chat")).toHaveLength(0);
});

test("an actual cancelled transport is propagated without retry or model fallback", async () => {
  const f = await fixture(); fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (JSON.parse(init.body as string).op === "embed") { f.session.abort(); return Promise.reject(Object.assign(new Error("cancelled"), { name: "AbortError" })); }
    return defaultFetch(url, init);
  });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  expect(calls("embed")).toHaveLength(1); expect(calls("quota")).toHaveLength(0); expect(calls("secondb_chat")).toHaveLength(0);
  expect(mockQueries.map(q => q.table)).toEqual(["chat_usage", "records_ai_eligible", "users"]);
});


// R1 M1/M2: mandatory observer authority is validated and captured before any I/O.
test.each(["operationId-missing", "operationId-empty", "operationId-space", "operationId-long", "operationId-number",
  "stepId-missing", "stepId-empty", "stepId-space", "stepId-long", "stepId-number", "owner", "isCurrent", "ledger", "read", "acquireMutation", "issueMutation", "settleMutation"])("incomplete captured authority %s rejects before reads/audits/usage", async mode => {
  const f = await fixture(), source = f.input.mutationObserver!;
  if (mode.includes("-")) {
    const [field, shape] = mode.split("-");
    const value = shape === "missing" ? undefined : shape === "empty" ? "" : shape === "space" ? " " : shape === "long" ? "x".repeat(161) : 3;
    f.input.mutationObserver = { ...source, [field]: value };
  } else if (mode === "owner" || mode === "ledger") Object.assign(source, { [mode]: undefined });
  else if (mode === "isCurrent") f.input.mutationObserver = { ...source, owner: { ...source.owner, isCurrent: undefined } } as unknown as typeof source;
  else f.input.mutationObserver = { ...source, ledger: { ...source.ledger, [mode]: undefined } } as typeof source;
  await expect(send(f)).rejects.toThrow();
  expect(mockQueries).toEqual([]); expect(mockRpc).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled(); expect(facts(f)).toEqual([]);
});

test.each(["replace", "remove"])("original crisis observer survives caller %s during a real read", async mode => {
  const f = await fixture(), pending = deferred<unknown>(), entered = deferred<void>();
  const original = f.input.onCrisisDetected as jest.Mock, substitute = jest.fn(); original.mockImplementation(() => { wipe(f); });
  mockRead.mockImplementation((query: Query) => { if (query.table === "chat_usage") { entered.resolve(); return pending.promise; } return defaultRead(query); });
  fetchMock.mockImplementation((url: string, init: RequestInit) => JSON.parse(init.body as string).purpose === "secondb_chat"
    ? Promise.resolve(response({ text: "I want to kill myself", audited: true })) : defaultFetch(url, init));
  const work = send(f), assertion = expect(work).rejects.toMatchObject({ name: "AbortError" }); await entered.promise;
  if (mode === "replace") f.input.onCrisisDetected = substitute; else delete f.input.onCrisisDetected;
  pending.resolve(defaultRead({ table: "chat_usage", columns: "", filters: {} })); await assertion;
  expect(original).toHaveBeenCalledTimes(1); expect(substitute).not.toHaveBeenCalled();
  expect(facts(f)).toMatchObject([{ operationId: "turn", stepId: "quota", outcome: "committed" }]);
  expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/rpc/log_"))).toBe(false);
});

test.each(["observer", "methods", "owner", "session"])("original execution survives caller %s mutation during a real read", async mode => {
  const f = await fixture(), pending = deferred<unknown>(), entered = deferred<void>(), alternate = createContentWipeLedger();
  const originalSignal = f.session.signal;
  const substitutes = { read: jest.fn(), acquireMutation: jest.fn(), issueMutation: jest.fn(), settleMutation: jest.fn(), isCurrent: jest.fn(), assertCurrent: jest.fn(), abort: jest.fn(), release: jest.fn() };
  mockRead.mockImplementation((query: Query) => { if (query.table === "chat_usage") { entered.resolve(); return pending.promise; } return defaultRead(query); });
  const work = send(f); await entered.promise;
  if (mode === "observer") Object.assign(f.input.mutationObserver!, { ledger: alternate, operationId: "other-turn", stepId: "other-step", generation: 1 });
  if (mode === "methods") Object.assign(f.ledger, { read: substitutes.read, acquireMutation: substitutes.acquireMutation, issueMutation: substitutes.issueMutation, settleMutation: substitutes.settleMutation });
  if (mode === "owner") Object.assign(f.current, { ownerId: "b", epoch: 42, isCurrent: substitutes.isCurrent });
  if (mode === "session") {
    Object.assign(f.session, { userId: "b", epoch: 42, signal: new AbortController().signal, assertCurrent: substitutes.assertCurrent, abort: substitutes.abort, release: substitutes.release });
    Object.defineProperty(f.session, "accessToken", { value: "replacement-b", configurable: true });
  }
  pending.resolve(defaultRead({ table: "chat_usage", columns: "", filters: {} }));
  await expect(work).resolves.toMatchObject({ status: "ok", used: 1 });
  expect(facts(f)).toMatchObject([{ ownerId: "a", operationId: "turn", stepId: "quota", outcome: "committed" }]);
  expect(alternate.inspect(captureAccountOwnerLease("a")!).tickets).toEqual([]);
  for (const fn of Object.values(substitutes)) expect(fn).not.toHaveBeenCalled();
  for (const [, init] of fetchMock.mock.calls) { expect(init.signal).toBe(originalSignal); expect(init.headers.Authorization).toBe("Bearer captured-a"); }
});

test.each(["send", "strict"])("local RED %s preserves its original observer through synchronous capture reentry", async mode => {
  const f = await fixture(), original = f.input.onCrisisDetected as jest.Mock, substitute = jest.fn();
  f.input.message = "I want to kill myself"; original.mockImplementation(() => { wipe(f); });
  const read = f.ledger.read;
  jest.spyOn(f.ledger, "read").mockImplementation(ownerLease => {
    f.input.onCrisisDetected = substitute; return read(ownerLease);
  });
  await expect(mode === "send" ? send(f) : auditChatLocalRed(f.input)).rejects.toMatchObject({ name: "AbortError" });
  expect(original).toHaveBeenCalledTimes(1); expect(substitute).not.toHaveBeenCalled();
  expect(mockQueries).toEqual([]); expect(fetchMock).not.toHaveBeenCalled(); expect(facts(f)).toEqual([]);
});
