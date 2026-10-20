import { createKeepReceipts, type KeepAiReuseRequirement, type KeepPair } from "../keep-receipts";
import { createChatSessionRegistry } from "../session-registry";
import { createContentWipeLedger } from "../../account/content-wipe";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

type Query = { table: string; columns?: string; owner?: string; ids?: string[]; signal?: AbortSignal };
const mockRead = jest.fn();
const mockQueries: Query[] = [];
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  from(table: string) {
    const query: Query = { table }; mockQueries.push(query);
    const builder = {
      select(columns: string) { query.columns = columns; return builder; },
      eq(key: string, value: string) { if (key !== "user_id") throw new Error("unexpected filter"); query.owner = value; return builder; },
      in(key: string, ids: string[]) { if (key !== "id") throw new Error("unexpected filter"); query.ids = ids; return builder; },
      abortSignal(signal: AbortSignal) { query.signal = signal; return builder; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(mockRead(query)).then(resolve, reject); },
    };
    return builder;
  },
}) }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const cleanups: (() => void)[] = [];
const pair: KeepPair & { aiReuse: KeepAiReuseRequirement } = {
  exchangeId: "exchange", promptTurnId: "prompt", replyTurnId: "reply", aiReuse: { state: "unconfirmed" },
};
function fixture() {
  const registry = createChatSessionRegistry(createContentWipeLedger());
  const view = registry.attachView("a", "entry")!, session = view.snapshot.session!;
  const store = createKeepReceipts(registry, session, 100);
  cleanups.push(() => { store.dispose(); registry.dispose(); });
  const saved = (operationId = "op1", sourceId = "source1") => {
    expect(store.begin(pair, operationId, "manual")).not.toBeNull();
    return store.settle(pair.exchangeId, operationId, { state: "present", sourceId, deduped: null, storagePending: false });
  };
  return { registry, view, session, store, saved };
}
beforeEach(() => {
  __resetAccountEpochForTests(); noteResolvedOwner("a"); mockQueries.length = 0;
  mockRead.mockReset().mockResolvedValue({ data: [{ id: "source1" }], error: null });
  jest.useFakeTimers();
});
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); jest.useRealTimers(); });

test("K03 queries only known source IDs for the captured owner; page-only deletion keeps source receipt", async () => {
  const f = fixture();
  await f.store.check(); expect(mockQueries).toEqual([]);
  f.saved(); const before = f.store.getSnapshot(); expect(f.store.getSnapshot()).toBe(before);
  await f.store.check();
  expect(mockQueries).toHaveLength(1);
  expect(mockQueries[0]).toMatchObject({ table: "sources", columns: "id", owner: "a", ids: ["source1"] });
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "present", sourceId: "source1", deletedAfterSave: false });
  expect(f.store.permission(pair, "manual")).toBe("already-saved");
  expect(jest.getTimerCount()).toBe(0);
});

test("M3 red hold evidence is immutable metadata across settlement, deletion checks and manual resave", async () => {
  const f = fixture(), item = { kind: "turn-zone-red" as const, turnId: "prompt" };
  const evidence = [item];
  const heldPair = { ...pair, aiReuse: { state: "hold-required" as const, evidence } };
  const expected = { state: "hold-required", evidence: [{ kind: "turn-zone-red", turnId: "prompt" }] };
  const started = f.store.begin(heldPair, "op1", "manual")!;
  expect(started.aiReuse).toEqual(expected);
  expect(Object.isFrozen(started.aiReuse)).toBe(true);
  if (started.aiReuse.state !== "hold-required") throw new Error("missing hold evidence");
  expect(Object.isFrozen(started.aiReuse.evidence)).toBe(true);
  expect(Object.isFrozen(started.aiReuse.evidence[0])).toBe(true);
  item.turnId = "changed"; evidence.length = 0;
  expect(started.aiReuse).toEqual(expected);
  expect(f.store.settle(pair.exchangeId, "op1", { state: "present", sourceId: "source1", deduped: null, storagePending: false }))
    .toMatchObject({ aiReuse: expected });
  await f.store.check(); expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "present", aiReuse: expected });
  mockRead.mockResolvedValue({ data: [], error: null }); await f.store.check();
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "missing", aiReuse: expected });
  expect(f.store.begin({ ...pair, aiReuse: started.aiReuse }, "op2", "manual"))
    .toMatchObject({ state: "saving", aiReuse: expected, deletedAfterSave: true });
  expect(f.store.settle(pair.exchangeId, "op2", { state: "unknown" })).toMatchObject({ state: "unknown", aiReuse: expected });
});

test("K03 confirmed deletion allows only the same pair's manual resave and retains autosave tombstone", async () => {
  const f = fixture(); f.saved(); mockRead.mockResolvedValue({ data: [], error: null });
  await f.store.check();
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "missing", deletedAfterSave: true, autosaveTombstone: true });
  expect(f.store.permission(pair, "manual")).toBeNull();
  expect(f.store.permission({ ...pair, replyTurnId: "other" }, "manual")).toBe("pair-changed");
  expect(f.store.permission(pair, "autosave")).toBe("autosave-blocked");
  expect(f.store.begin(pair, "auto2", "autosave")).toBeNull();
  expect(f.saved("op2", "source2")).toMatchObject({ state: "present", sourceId: "source2", deletedAfterSave: true, autosaveTombstone: true });
  expect(f.store.permission(pair, "autosave")).toBe("autosave-blocked");
});

test.each(["error", "throw", "null", "malformed", "foreign-id"])("K04 %s is unknown, never confirmed deletion or a write permission", async kind => {
  const f = fixture(); f.saved();
  if (kind === "throw") mockRead.mockRejectedValue(new Error("offline"));
  else mockRead.mockResolvedValue(kind === "error" ? { data: [], error: new Error("offline") }
    : { data: kind === "null" ? null : kind === "malformed" ? [{}] : [{ id: "not-requested" }], error: null });
  await f.store.check();
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "unknown", sourceId: "source1", deletedAfterSave: false });
  expect(f.store.permission(pair, "manual", true)).toBe("check-required");
  expect(f.store.permission(pair, "autosave")).toBe("autosave-blocked");
  expect(jest.getTimerCount()).toBe(0);
});

test("K04 checking and timeout are uncertain; late present cannot turn timeout into success", async () => {
  const f = fixture(); f.saved(); const pending = deferred<unknown>(); mockRead.mockReturnValue(pending.promise);
  const check = f.store.check(); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("checking");
  expect(f.store.permission(pair, "manual")).toBe("check-required");
  await jest.advanceTimersByTimeAsync(100); await check;
  expect(f.store.get(pair.exchangeId)?.state).toBe("unknown");
  expect(mockQueries[0].signal?.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  pending.resolve({ data: [{ id: "source1" }], error: null }); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("unknown");
  mockRead.mockResolvedValue({ data: [], error: null }); await f.store.check();
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
});

test("K04 late query generation and old operation cannot overwrite newer deletion and resave", async () => {
  const f = fixture(); f.saved(); const old = deferred<unknown>(); mockRead.mockReturnValueOnce(old.promise);
  const oldCheck = f.store.check(); await flush();
  mockRead.mockResolvedValue({ data: [], error: null }); await f.store.check(); await oldCheck;
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  f.saved("op2", "source2");
  old.resolve({ data: [{ id: "source1" }], error: null }); await flush();
  expect(f.store.settle(pair.exchangeId, "op1", { state: "unknown" })).toBeNull();
  expect(f.store.get(pair.exchangeId)).toMatchObject({ operationId: "op2", state: "present", sourceId: "source2", deletedAfterSave: true });
});

test("K04 account hold and ABA clear receipts, reject stale reads and clean subscriptions/timers", async () => {
  const f = fixture(); f.saved(); const old = deferred<unknown>(); mockRead.mockReturnValue(old.promise);
  const listener = jest.fn(), unsubscribe = f.store.subscribe(listener);
  const check = f.store.check(); await flush();
  beginAccountOwnerTransition("b");
  expect(f.store.getSnapshot()).toEqual([]); expect(jest.getTimerCount()).toBe(0); await check;
  noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch());
  noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch());
  const calls = listener.mock.calls.length;
  old.resolve({ data: [{ id: "source1" }], error: null }); await flush();
  expect(listener).toHaveBeenCalledTimes(calls); expect(f.store.get(pair.exchangeId)).toBeNull();
  expect(f.store.begin(pair, "op2", "manual")).toBeNull(); unsubscribe();
});

test("K04 a previous capture operation cannot settle a newer pending resave", async () => {
  const f = fixture(); f.saved(); mockRead.mockResolvedValue({ data: [], error: null }); await f.store.check();
  f.store.begin(pair, "op2", "manual");
  expect(f.store.settle(pair.exchangeId, "op1", { state: "present", sourceId: "old-source", storagePending: false, deduped: null })).toBeNull();
  expect(f.store.get(pair.exchangeId)).toMatchObject({ operationId: "op2", state: "saving" });
  expect(f.store.settle(pair.exchangeId, "op2", { state: "present", sourceId: "new-source", storagePending: false, deduped: null }))
    .toMatchObject({ operationId: "op2", state: "present", sourceId: "new-source" });
});

test("view unsubscribe does not dispose receipts; session retirement does", async () => {
  const f = fixture(); f.saved(); const listener = jest.fn(), unsubscribe = f.store.subscribe(listener); unsubscribe();
  f.registry.detachView(f.view.viewId);
  expect(f.registry.attachView("a", "entry")?.snapshot.session?.sessionId).toBe(f.session.sessionId);
  await f.store.check(); expect(listener).not.toHaveBeenCalled();
  f.registry.dispose(); expect(f.store.getSnapshot()).toEqual([]);
  await f.store.check(); expect(mockQueries).toHaveLength(1); expect(jest.getTimerCount()).toBe(0);
});

test("a checking subscriber can retire the owner before any query I/O", async () => {
  const f = fixture(); f.saved();
  f.store.subscribe(() => { if (f.store.get(pair.exchangeId)?.state === "checking") beginAccountOwnerTransition("b"); });
  await f.store.check(); expect(mockQueries).toEqual([]); expect(jest.getTimerCount()).toBe(0);
});
