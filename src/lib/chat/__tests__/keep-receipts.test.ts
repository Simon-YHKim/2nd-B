import * as savedDataChanges from "../../wiki/saved-data-changes";
import { createKeepReceipts, type KeepAiReuseRequirement, type KeepPair } from "../keep-receipts";
import { createChatSessionRegistry } from "../session-registry";
import { createContentWipeLedger } from "../../account/content-wipe";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { prepareSavedDataDeletion, type SavedDataDeletionTarget } from "../../wiki/saved-data-changes";

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
  const ledger = createContentWipeLedger(), registry = createChatSessionRegistry(ledger);
  const view = registry.attachView("a", "entry")!, session = view.snapshot.session!;
  const store = createKeepReceipts(registry, session, 100);
  cleanups.push(() => { store.dispose(); registry.dispose(); });
  const saved = (operationId = "op1", sourceId = "source1") => {
    expect(store.begin(pair, operationId, "manual")).not.toBeNull();
    return store.settle(pair.exchangeId, operationId, { state: "present", sourceId, deduped: null, storagePending: false });
  };
  return { registry, view, session, store, saved, ledger };
}
const deleted = (target: SavedDataDeletionTarget = { ownerId: "a", kind: "source", ids: ["source1"] },
  outcome: "requested" | number = "requested") => prepareSavedDataDeletion(target)(outcome);
function saveOther(store: ReturnType<typeof createKeepReceipts>, sourceId = "source2") {
  const other = { ...pair, exchangeId: "other", promptTurnId: "other-prompt", replyTurnId: "other-reply" };
  expect(store.begin(other, "other-op", "manual")).not.toBeNull();
  store.settle(other.exchangeId, "other-op", { state: "present", sourceId, storagePending: false, deduped: null });
  return other;
}
beforeEach(() => {
  __resetAccountEpochForTests(); noteResolvedOwner("a"); mockQueries.length = 0;
  mockRead.mockReset().mockResolvedValue({ data: [{ id: "source1" }], error: null });
  jest.useFakeTimers();
});
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); jest.restoreAllMocks(); jest.useRealTimers(); });

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

test.each(["requested", 2] as const)("W08 ID event (%s) rechecks only matching receipts, without resetting the session or other work", async outcome => {
  const f = fixture(); f.saved(); const other = saveOther(f.store), unchanged = f.store.get(other.exchangeId);
  const retire = jest.fn(), work = f.registry.claimWork(f.session, "send", "other-task", retire)!;
  const sessionBefore = f.registry.getSessionSnapshot(f.session);
  const pending = deferred<unknown>(); mockRead.mockReturnValue(pending.promise);
  deleted({ ownerId: "a", kind: "source", ids: ["source1", "not-a-receipt"] }, outcome);
  await flush();
  expect(mockQueries).toHaveLength(1);
  expect(mockQueries[0]).toMatchObject({ table: "sources", columns: "id", owner: "a", ids: ["source1"] });
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "checking", deletedAfterSave: false });
  expect(f.store.permission(pair, "manual")).toBe("check-required");
  expect(f.store.get(other.exchangeId)).toBe(unchanged);
  pending.resolve({ data: [], error: null }); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  expect(f.store.get(other.exchangeId)).toBe(unchanged);
  expect(f.registry.getSessionSnapshot(f.session)).toBe(sessionBefore);
  expect(retire).not.toHaveBeenCalled();
  expect(f.registry.settleWork(work)).toBe(true);
});

test("W08 unrecognized IDs leave an ongoing check and receipt snapshot untouched", async () => {
  const f = fixture(); f.saved(); const pending = deferred<unknown>(); mockRead.mockReturnValue(pending.promise);
  const check = f.store.check(); await flush(); const snapshot = f.store.getSnapshot();
  deleted({ ownerId: "a", kind: "source", ids: ["unrelated"] }); await flush();
  expect(mockQueries).toHaveLength(1); expect(mockQueries[0].signal?.aborted).toBe(false);
  expect(f.store.getSnapshot()).toBe(snapshot);
  pending.resolve({ data: [{ id: "source1" }], error: null }); await check;
  expect(f.store.get(pair.exchangeId)?.state).toBe("present");
});

test.each([{ all: true as const }, { scope: "uningested" as const }])("W08 unknown source target %j rechecks all known IDs without treating the event as proof", async target => {
  const f = fixture(); f.saved(); const other = saveOther(f.store);
  // Both requested and affected notifications still require the ID-only read.
  mockRead.mockResolvedValue({ data: [{ id: "source2" }], error: null });
  deleted({ ownerId: "a", kind: "source", ...target }, 2); await flush();
  expect(mockQueries).toHaveLength(1);
  expect(mockQueries[0]).toMatchObject({ columns: "id", owner: "a", ids: ["source1", "source2"] });
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  expect(f.store.get(other.exchangeId)?.state).toBe("present");
});

test("W08 multiple receipts for one source share an ID-only query", async () => {
  const f = fixture(); f.saved(); const other = saveOther(f.store, "source1");
  mockRead.mockResolvedValue({ data: [], error: null }); deleted(); await flush();
  expect(mockQueries).toHaveLength(1); expect(mockQueries[0].ids).toEqual(["source1"]);
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  expect(f.store.get(other.exchangeId)?.state).toBe("missing");
});

test.each([{ ids: ["source1"] }, { all: true as const }])("W08 wiki_page %j leaves source facts and reads alone", async target => {
  const f = fixture(); f.saved(); const before = f.store.getSnapshot();
  const listener = jest.fn(); f.store.subscribe(listener);
  deleted({ ownerId: "a", kind: "wiki_page", ...target }, 1); await flush();
  expect(mockQueries).toEqual([]); expect(f.store.getSnapshot()).toBe(before);
  expect(listener).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});

test("W08 another owner's notification cannot query or change this receipt", async () => {
  const f = fixture(); f.saved(); const before = f.store.getSnapshot();
  deleted({ ownerId: "b", kind: "source", all: true }); await flush();
  expect(mockQueries).toEqual([]); expect(f.store.getSnapshot()).toBe(before);
});

test("K04 a late mixed focus read cannot overwrite an event's missing result, while its unrelated receipt completes", async () => {
  const f = fixture(); f.saved(); const other = saveOther(f.store);
  const old = deferred<unknown>(); mockRead.mockReturnValueOnce(old.promise);
  const focus = f.store.check(); await flush();
  mockRead.mockResolvedValue({ data: [], error: null }); deleted(); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  expect(f.store.get(other.exchangeId)?.state).toBe("checking");
  expect(mockQueries[0].signal?.aborted).toBe(false);
  old.resolve({ data: [{ id: "source1" }, { id: "source2" }], error: null }); await focus;
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  expect(f.store.get(other.exchangeId)?.state).toBe("present");
  expect(jest.getTimerCount()).toBe(0);
});

test("K04 disjoint source events settle independently in reverse order", async () => {
  const f = fixture(); f.saved(); const other = saveOther(f.store), first = deferred<unknown>(), second = deferred<unknown>();
  mockRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  deleted(); await flush(); deleted({ ownerId: "a", kind: "source", ids: ["source2"] }); await flush();
  second.resolve({ data: [], error: null }); await flush();
  first.resolve({ data: [{ id: "source1" }], error: null }); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("present");
  expect(f.store.get(other.exchangeId)?.state).toBe("missing");
  expect(jest.getTimerCount()).toBe(0);
});

test.each(["present", "missing", "error"])("K04 event read returning %s cannot overwrite a later manual resave", async result => {
  const f = fixture(); f.saved(); mockRead.mockResolvedValue({ data: [], error: null });
  deleted(); await flush(); const other = saveOther(f.store);
  const old = deferred<unknown>(); mockRead.mockReturnValueOnce(old.promise);
  deleted({ ownerId: "a", kind: "source", all: true }); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("missing");
  f.saved("new-operation", "new-source");
  const saved = f.store.get(pair.exchangeId);
  old.resolve({ data: result === "present" ? [{ id: "source1" }, { id: "source2" }] : [],
    error: result === "error" ? new Error("offline") : null }); await flush();
  expect(f.store.get(pair.exchangeId)).toBe(saved);
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "present", sourceId: "new-source", autosaveTombstone: true });
  expect(f.store.get(other.exchangeId)?.state).not.toBe("checking");
  expect(f.store.permission(pair, "autosave")).toBe("autosave-blocked");
  expect(jest.getTimerCount()).toBe(0);
});

test.each(["error", "throw", "null", "malformed", "foreign-id", "timeout"])("K03 confirmed missing survives a %s recheck and stays manually saveable", async kind => {
  const f = fixture(); f.saved(); mockRead.mockResolvedValue({ data: [], error: null });
  deleted(); await flush(); const missing = f.store.get(pair.exchangeId), listener = jest.fn();
  f.store.subscribe(listener);
  if (kind === "throw") mockRead.mockRejectedValue(new Error("offline"));
  else if (kind === "timeout") mockRead.mockReturnValue(new Promise(() => {}));
  else mockRead.mockResolvedValue({ data: kind === "null" ? null : kind === "malformed" ? [{}]
    : kind === "foreign-id" ? [{ id: "foreign" }] : [], error: kind === "error" ? new Error("offline") : null });
  deleted();
  expect(f.store.get(pair.exchangeId)).toBe(missing);
  expect(f.store.permission(pair, "manual")).toBeNull();
  await flush();
  if (kind === "timeout") await jest.advanceTimersByTimeAsync(100);
  expect(f.store.get(pair.exchangeId)).toBe(missing);
  expect(listener).not.toHaveBeenCalled();
  expect(f.store.permission(pair, "manual")).toBeNull();
  expect(f.store.permission(pair, "autosave")).toBe("autosave-blocked");
  expect(jest.getTimerCount()).toBe(0);
});

test("K03 new present evidence may replace missing, while a later failed read is uncertain", async () => {
  const f = fixture(); f.saved(); mockRead.mockResolvedValue({ data: [], error: null }); deleted(); await flush();
  mockRead.mockResolvedValue({ data: [{ id: "source1" }], error: null }); deleted(); await flush();
  expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "present", deletedAfterSave: true });
  mockRead.mockResolvedValue({ data: null, error: new Error("offline") }); deleted(); await flush();
  expect(f.store.get(pair.exchangeId)?.state).toBe("unknown");
  expect(f.store.permission(pair, "manual")).toBe("check-required");
});

test.each(["dispose", "wipe", "account-ABA"])("K04 %s cancels all reads/timers, rejects old events and never revives the old owner", async cause => {
  const f = fixture(); f.saved(); const old = deferred<unknown>(); mockRead.mockReturnValue(old.promise);
  const oldEvent = prepareSavedDataDeletion({ ownerId: "a", kind: "source", all: true });
  deleted(); await flush();
  if (cause === "dispose") f.store.dispose();
  else if (cause === "wipe") expect(f.ledger.beginWipe(captureAccountOwnerLease("a")!, 0, "wipe")?.ackConfirmed).toBe(true);
  else {
    beginAccountOwnerTransition("b"); noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch());
    deleted({ ownerId: "b", kind: "source", all: true });
    noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch());
  }
  expect(f.store.getSnapshot()).toEqual([]);
  expect(mockQueries[0].signal?.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  oldEvent("requested"); deleted(); await flush();
  expect(mockQueries).toHaveLength(1);
  old.resolve({ data: [{ id: "source1" }], error: null }); await flush();
  expect(f.store.getSnapshot()).toEqual([]);
  if (cause === "account-ABA") {
    const fresh = fixture(); fresh.saved();
    mockRead.mockResolvedValue({ data: [], error: null }); oldEvent("requested"); await flush();
    expect(mockQueries).toHaveLength(1);
    deleted(); await flush();
    expect(mockQueries).toHaveLength(2); expect(fresh.store.get(pair.exchangeId)?.state).toBe("missing");
  }
});

test("saved-data disposal unsubscribes the actual callback while the same account epoch remains live", async () => {
  const subscribe = savedDataChanges.subscribeSavedDataChanges;
  const delivered = jest.fn();
  const stop = jest.fn();
  jest.spyOn(savedDataChanges, "subscribeSavedDataChanges").mockImplementation((ownerId, listener) => {
    const unsubscribe = subscribe(ownerId, change => { delivered(change); listener(change); });
    return () => { stop(); unsubscribe(); };
  });
  const f = fixture(); f.saved();
  deleted({ ownerId: "a", kind: "wiki_page", all: true });
  expect(delivered).toHaveBeenCalledTimes(1); expect(stop).not.toHaveBeenCalled();
  delivered.mockClear();
  f.store.dispose(); f.store.dispose();
  expect(stop).toHaveBeenCalledTimes(1);
  const live = jest.fn(), unsubscribe = subscribe("a", live); cleanups.push(unsubscribe);
  deleted(); await flush();
  expect(live).toHaveBeenCalledTimes(1);
  expect(delivered).not.toHaveBeenCalled(); expect(mockQueries).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([{ all: true as const }, { scope: "uningested" as const }, { ids: ["source1"] }])(
  "W08 saving remembers source target %j until settlement and rechecks once before manual resave", async target => {
    const f = fixture(), pending = deferred<unknown>(); mockRead.mockReturnValueOnce(pending.promise);
    const states: string[] = [];
    f.store.subscribe(() => { const row = f.store.get(pair.exchangeId); if (row) states.push(row.state); });
    expect(f.store.begin(pair, "op1", "manual")).not.toBeNull();
    deleted({ ownerId: "a", kind: "source", ...target });
    deleted({ ownerId: "a", kind: "source", ...target }, 1);
    deleted({ ownerId: "a", kind: "source", ids: ["unrelated"] });
    await flush();
    expect(mockQueries).toEqual([]); expect(f.store.get(pair.exchangeId)?.state).toBe("saving");
    expect(f.store.settle(pair.exchangeId, "op1", { state: "present", sourceId: "source1", deduped: null, storagePending: false }))
      .toMatchObject({ state: "checking", sourceId: "source1", deletedAfterSave: false });
    expect(states).toEqual(["saving", "checking"]);
    await flush();
    expect(mockQueries).toHaveLength(1);
    expect(mockQueries[0]).toMatchObject({ table: "sources", columns: "id", owner: "a", ids: ["source1"] });
    expect(f.store.permission(pair, "manual")).toBe("check-required");
    pending.resolve({ data: [], error: null }); await flush();
    expect(f.store.get(pair.exchangeId)).toMatchObject({ state: "missing", deletedAfterSave: true });
    expect(f.store.permission(pair, "manual")).toBeNull();
    expect(f.store.permission(pair, "autosave")).toBe("autosave-blocked");
    expect(f.saved("op2", "source2")).toMatchObject({ state: "present", sourceId: "source2" });
    await flush(); expect(mockQueries).toHaveLength(1); expect(jest.getTimerCount()).toBe(0);
  });

test.each([
  { ownerId: "a", kind: "source", ids: ["unrelated"] },
  { ownerId: "a", kind: "wiki_page", all: true },
  { ownerId: "b", kind: "source", all: true },
] satisfies SavedDataDeletionTarget[])("W08 saving ignores nonmatching notification %j", async target => {
  const f = fixture(); f.store.begin(pair, "op1", "manual");
  deleted(target);
  expect(f.store.settle(pair.exchangeId, "op1", { state: "present", sourceId: "source1", deduped: null, storagePending: false }))
    .toMatchObject({ state: "present" });
  await flush(); expect(mockQueries).toEqual([]); expect(jest.getTimerCount()).toBe(0);
});

test("W08 saving accumulates distinct source IDs and consumes notifications on an uncertain settlement", async () => {
  const f = fixture(); f.store.begin(pair, "op1", "manual");
  deleted({ ownerId: "a", kind: "source", ids: ["source1"] });
  deleted({ ownerId: "a", kind: "source", ids: ["source2"] });
  mockRead.mockResolvedValue({ data: [{ id: "source1" }], error: null });
  f.store.settle(pair.exchangeId, "op1", { state: "present", sourceId: "source1", deduped: null, storagePending: false });
  await flush(); expect(mockQueries).toHaveLength(1);
  expect(f.store.get(pair.exchangeId)?.state).toBe("present");
  const other = { ...pair, exchangeId: "other" };
  f.store.begin(other, "other-op", "manual"); deleted({ ownerId: "a", kind: "source", all: true });
  f.store.settle(other.exchangeId, "other-op", { state: "unknown" });
  await flush(); const reads = mockQueries.length;
  f.store.begin(other, "retry", "manual", true);
  expect(f.store.settle(other.exchangeId, "retry", { state: "present", sourceId: "source2", deduped: null, storagePending: false }))
    .toMatchObject({ state: "present" });
  await flush(); expect(mockQueries).toHaveLength(reads);
});
