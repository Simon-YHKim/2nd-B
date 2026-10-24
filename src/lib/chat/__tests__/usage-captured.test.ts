// I01: actual usage + RPC transport + account lease/epoch + content ledger.
// Authentication and SDK reads have local fixtures; mutation transport only replaces fetch.
import { bumpChatUsageIfUnderCap, ChatLimitExceededError, readChatUsage, readChatUsageDetail, type CapturedChatUsageExecution } from "../usage";
import { createContentWipeLedger } from "../../account/content-wipe";
import { beginAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";

const mockAuth = jest.fn(), mockRpc = jest.fn(), mockRead = jest.fn(), mockFrom = jest.fn();
type Query = { table: string; columns: string; filters: Record<string, unknown> };
const mockQueries: Query[] = [];
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mockAuth }, rpc: mockRpc,
  from: (table: string) => {
    mockFrom(table); const query: Query = { table, columns: "", filters: {} }; mockQueries.push(query);
    const builder = {
      select(columns: string) { query.columns = columns; return builder; },
      eq(key: string, value: unknown) { query.filters[key] = value; return builder; },
      maybeSingle: () => mockRead(query),
    };
    return builder;
  },
}) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test/", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon" }) }));
const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const cleanups: (() => void)[] = [];
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
  const execution: CapturedChatUsageExecution = { session, observer: { owner: current, generation: ledger.read(current).generation, operationId: "operation", stepId: "quota", ledger } };
  return { ledger, current, session, execution };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const send = (f: Fixture) => bumpChatUsageIfUnderCap("a", 5, "2026-10-16", f.execution);
const facts = (f: Fixture) => f.ledger.inspect(captureAccountOwnerLease("a")!).tickets;
const wipe = (f: Fixture) => f.ledger.beginWipe(f.current, f.execution.observer.generation, "explicit-intent")!;
beforeEach(() => {
  __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); owner("a");
  mockAuth.mockReset().mockResolvedValue({ data: { session: { user: { id: "a" }, access_token: "captured-a" } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: 2, error: null }); mockFrom.mockReset(); mockQueries.length = 0;
  mockRead.mockReset().mockResolvedValue({ data: { count: 3, ad_bonus: 2 }, error: null });
  fetchMock.mockReset().mockImplementation(async () => response(1)); globalThis.fetch = fetchMock as typeof fetch;
});
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); globalThis.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers(); });

test.each([1, 7, 2_147_483_647])("captured count %i uses the original JWT/signal and settles before returning", async count => {
  const f = await fixture(); const settle = jest.spyOn(f.ledger, "settleMutation");
  mockAuth.mockResolvedValue({ data: { session: { user: { id: "b" }, access_token: "mutable-b" } }, error: null });
  fetchMock.mockImplementation(async () => {
    expect(facts(f)[0].outcome).toBe("issued-pending"); return response(count);
  });
  await expect(send(f)).resolves.toBe(count);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(mockAuth).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("https://project.example.test/rest/v1/rpc/bump_chat_usage_if_under_cap", {
    method: "POST", headers: { Authorization: "Bearer captured-a", apikey: "public-anon", "content-type": "application/json" },
    body: JSON.stringify({ p_user_id: "a", p_day: "2026-10-16", p_cap: 5 }), signal: f.session.signal,
  });
  expect(settle).toHaveBeenCalledWith(expect.anything(), { outcome: "committed", count });
  expect(facts(f)[0].outcome).toBe("committed"); expect(mockRpc).not.toHaveBeenCalled(); expect(mockFrom).not.toHaveBeenCalled();
});

test.each([null, 0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, "1", false, [], { count: 1 }])("invalid success %j stays unknown and cannot acquire a fresh retry", async value => {
  const f = await fixture(); fetchMock.mockResolvedValue(response(value));
  await expect(send(f)).rejects.toThrow("invalid_chat_usage_response"); expect(facts(f)[0].outcome).toBe("unknown");
  const next = { ...f, execution: { ...f.execution, observer: { ...f.execution.observer, operationId: "new-operation" } } };
  await expect(send(next)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(facts(f)).toHaveLength(1);
  const barrier = wipe(f); expect(f.ledger.claimDeletionAttempt(f.current, barrier.wipeId!, barrier.generation)).toBeNull();
});

test.each(["NaN", "Infinity", "", "{broken"])("malformed success body %s is unknown", async body => {
  const f = await fixture(); fetchMock.mockResolvedValue(new Response(body));
  await expect(send(f)).rejects.toThrow("captured_session_request_failed");
  expect(facts(f)[0].outcome).toBe("unknown"); expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("exact PostgREST SQL cap rejection settles definite noncommit and keeps typed legacy error", async () => {
  const f = await fixture(); fetchMock.mockResolvedValue(response({ code: "P0001", message: "chat_limit_exceeded", details: null, hint: null }, 400));
  await expect(send(f)).rejects.toBeInstanceOf(ChatLimitExceededError);
  expect(facts(f)[0].outcome).toBe("definitely-not-committed"); expect(fetchMock).toHaveBeenCalledTimes(1);
  const barrier = wipe(f); expect(f.ledger.claimDeletionAttempt(f.current, barrier.wipeId!, barrier.generation)).not.toBeNull();
});

test.each([
  { status: 200, body: { code: "P0001", message: "chat_limit_exceeded" } },
  { status: 401, body: { code: "P0001", message: "chat_limit_exceeded" } },
  { status: 500, body: { code: "P0001", message: "chat_limit_exceeded" } },
  { status: 400, body: { message: "chat_limit_exceeded" } },
  { status: 400, body: { code: "42501", message: "chat_limit_exceeded" } },
  { status: 400, body: { code: "P0001", message: "prefix chat_limit_exceeded suffix" } },
  { status: 400, body: "chat_limit_exceeded" },
  { status: 400, body: [{ code: "P0001", message: "chat_limit_exceeded" }] },
])("ambiguous cap-like response %# is unknown", async ({ status, body }) => {
  const f = await fixture(); fetchMock.mockResolvedValue(response(body, status));
  await expect(send(f)).rejects.not.toBeInstanceOf(ChatLimitExceededError);
  expect(facts(f)[0].outcome).toBe("unknown"); expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each(["reject", "throw", "malformed-cap"])("%s does not prove cap rollback or trigger retry", async mode => {
  const f = await fixture();
  if (mode === "reject") fetchMock.mockRejectedValue(new Error("P0001 chat_limit_exceeded"));
  else if (mode === "throw") fetchMock.mockImplementation(() => { throw new Error("chat_limit_exceeded"); });
  else fetchMock.mockResolvedValue(new Response("chat_limit_exceeded", { status: 400 }));
  await expect(send(f)).rejects.not.toBeInstanceOf(ChatLimitExceededError);
  expect(facts(f)[0].outcome).toBe("unknown"); expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each(["missing-observer", "missing-session", "request-owner", "session-owner", "observer-owner", "epoch", "generation", "invalid-generation", "hold", "released", "wipe"])("%s rejects before acquire/transport", async mode => {
  const f = await fixture(); let execution = f.execution, userId = "a";
  if (mode === "missing-observer") execution = { session: f.session } as CapturedChatUsageExecution;
  if (mode === "missing-session") execution = { observer: f.execution.observer } as CapturedChatUsageExecution;
  if (mode === "request-owner") userId = "b";
  if (mode === "session-owner") execution = { ...execution, session: { ...f.session, userId: "b" } };
  if (mode === "observer-owner") execution = { ...execution, observer: { ...execution.observer, owner: { ...f.current, ownerId: "b" } } };
  if (mode === "epoch") execution = { ...execution, observer: { ...execution.observer, owner: { ...f.current, epoch: f.current.epoch + 1 } } };
  if (mode === "generation" || mode === "invalid-generation") execution = { ...execution, observer: { ...execution.observer, generation: mode === "generation" ? 1 : NaN } };
  if (mode === "hold") beginAccountOwnerTransition("b");
  if (mode === "released") f.session.release();
  if (mode === "wipe") wipe(f);
  await expect(bumpChatUsageIfUnderCap(userId, 5, "2026-10-16", execution)).rejects.toBeDefined();
  expect(fetchMock).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
  if (mode === "hold") owner("a"); expect(facts(f)).toHaveLength(0);
});

test.each(["wipe", "hold", "aba"])("registration observer %s reentry closes unissued ticket without transport", async mode => {
  const f = await fixture(); let once = false;
  f.ledger.observe(f.current, () => {
    if (once) return; once = true;
    if (mode === "wipe") wipe(f); else { beginAccountOwnerTransition("b"); if (mode === "aba") { owner("b"); owner("a"); } }
  });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  if (mode === "hold") owner("a");
  expect(facts(f)[0].outcome).toBe("definitely-not-issued"); expect(fetchMock).not.toHaveBeenCalled();
});

test("final caller gate wipe reentry cannot dispatch the registered ticket", async () => {
  const f = await fixture(), realAssert = f.session.assertCurrent; let once = false;
  jest.spyOn(f.session, "assertCurrent").mockImplementation(() => {
    realAssert(); if (!once && facts(f)[0]?.outcome === "registered") { once = true; wipe(f); }
  });
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  expect(facts(f)[0].outcome).toBe("definitely-not-issued"); expect(fetchMock).not.toHaveBeenCalled();
});

test("same operation/step dispatches only once while the original result is pending", async () => {
  const f = await fixture(), pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
  const first = send(f); await expect(send(f)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(1); pending.resolve(response(1)); await expect(first).resolves.toBe(1);
  await expect(send(f)).rejects.toMatchObject({ name: "AbortError" }); expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("issued publication follows synchronous transport dispatch, even when its observer starts wipe", async () => {
  const f = await fixture(), pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
  let observedCalls = -1;
  f.ledger.observe(f.current, () => {
    if (observedCalls >= 0 || facts(f)[0]?.outcome !== "issued-pending") return;
    observedCalls = fetchMock.mock.calls.length; wipe(f);
  });
  const work = send(f); expect(observedCalls).toBe(1);
  pending.resolve(response(1)); await expect(work).rejects.toMatchObject({ name: "AbortError" });
  expect(facts(f)[0].outcome).toBe("committed"); expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("wipe inside real fetch sees issued-pending; late commit settles before the body fence", async () => {
  const f = await fixture(), pending = deferred<Response>(); const settled = jest.spyOn(f.ledger, "settleMutation");
  fetchMock.mockImplementation(() => {
    expect(facts(f)[0].outcome).toBe("issued-pending"); const barrier = wipe(f);
    expect(f.ledger.claimDeletionAttempt(f.current, barrier.wipeId!, barrier.generation)).toBeNull();
    expect(f.session.signal.aborted).toBe(false); return pending.promise;
  });
  const work = send(f); pending.resolve(response(7)); await expect(work).rejects.toMatchObject({ name: "AbortError" });
  expect(settled).toHaveBeenCalledWith(expect.anything(), { outcome: "committed", count: 7 });
  expect(facts(f)[0].outcome).toBe("committed"); expect(f.ledger.inspect(f.current).detail).toBe("draining");
  expect(f.session.signal.aborted).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each(["hold", "owner", "aba", "released"])("late count after %s updates the original fact but never returns the count", async mode => {
  const f = await fixture(), pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
  const work = send(f);
  if (mode === "hold") beginAccountOwnerTransition("b");
  if (mode === "owner" || mode === "aba") owner("b");
  if (mode === "aba") owner("a");
  if (mode === "released") f.session.release();
  pending.resolve(response(2)); await expect(work).rejects.toMatchObject({ name: "AbortError" });
  if (mode === "owner") expect(f.ledger.inspect(captureAccountOwnerLease("b")!).tickets).toHaveLength(0);
  owner("a"); expect(facts(f)[0].outcome).toBe("committed");
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(mockAuth).toHaveBeenCalledTimes(1);
});

test.each(["cap", "malformed", "rejection"])("late %s settles the original fact before invalid owner rejects", async mode => {
  const f = await fixture(), pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise); const work = send(f);
  owner("b");
  if (mode === "rejection") pending.reject(new Error("network secret"));
  else pending.resolve(mode === "cap" ? response({ code: "P0001", message: "chat_limit_exceeded" }, 400) : response(null));
  await expect(work).rejects.toMatchObject({ name: "AbortError" }); owner("a");
  expect(facts(f)[0].outcome).toBe(mode === "cap" ? "definitely-not-committed" : "unknown");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("legacy callers retain SDK RPC, typed substring cap error and no captured transport", async () => {
  await expect(bumpChatUsageIfUnderCap("a", 5, "2026-10-16")).resolves.toBe(2);
  expect(mockRpc).toHaveBeenCalledWith("bump_chat_usage_if_under_cap", { p_user_id: "a", p_day: "2026-10-16", p_cap: 5 });
  mockRpc.mockResolvedValue({ data: null, error: { message: "P0001: chat_limit_exceeded" } });
  await expect(bumpChatUsageIfUnderCap("a", 5)).rejects.toBeInstanceOf(ChatLimitExceededError);
  expect(fetchMock).not.toHaveBeenCalled();
});

const readers = [{ name: "count", read: readChatUsage, columns: "count", expected: 3 },
  { name: "detail", read: readChatUsageDetail, columns: "count, ad_bonus", expected: { used: 3, adBonus: 2 } }];
describe.each(readers)("captured $name read", ({ read, columns, expected }) => {
  test("keeps the original owner/day SELECT and value", async () => {
    const f = await fixture(); await expect(read("a", "2026-10-16", f.session)).resolves.toEqual(expected);
    expect(mockQueries).toEqual([{ table: "chat_usage", columns, filters: { user_id: "a", day: "2026-10-16" } }]);
    expect(fetchMock).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled(); expect(facts(f)).toHaveLength(0);
  });
  test.each(["mismatch", "hold", "abort"])("%s before read issues no SELECT", async mode => {
    const f = await fixture(); if (mode === "hold") beginAccountOwnerTransition("b"); if (mode === "abort") f.session.abort();
    await expect(read(mode === "mismatch" ? "b" : "a", "2026-10-16", f.session)).rejects.toBeDefined(); expect(mockFrom).not.toHaveBeenCalled();
  });
  test.each(["success", "error", "reject"])("late %s after account hold is fenced", async mode => {
    const f = await fixture(), pending = deferred<unknown>(); mockRead.mockReturnValue(pending.promise);
    const work = read("a", "2026-10-16", f.session); beginAccountOwnerTransition("b");
    if (mode === "reject") pending.reject(new Error("private old failure"));
    else pending.resolve({ data: { count: 3, ad_bonus: 2 }, error: mode === "error" ? new Error("private old error") : null });
    await expect(work).rejects.toMatchObject({ name: "AbortError" }); expect(mockQueries).toHaveLength(1);
  });
  test("current errors and normal missing row keep their existing meanings", async () => {
    const f = await fixture(), error = new Error("offline"); mockRead.mockResolvedValue({ data: null, error });
    await expect(read("a", undefined, f.session)).rejects.toBe(error);
    mockRead.mockResolvedValue({ data: null, error: null });
    await expect(read("a", undefined, f.session)).resolves.toEqual(columns === "count" ? 0 : { used: 0, adBonus: 0 });
  });
});
