import { deleteAllSources, deleteAllWikiPages, deleteSourcesByIds, deleteUningestedSources } from "../../records/delete-bulk";
import { deleteSource, deleteWikiPage } from "../queries";
import { subscribeSavedDataChanges, type SavedDataChange } from "../saved-data-changes";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

type Result = { count?: number | null; error: unknown; data?: unknown };
type Query = { table: string; steps: unknown[][] };
const mockQueries: Query[] = [], cleanups: (() => void)[] = [];
const mockExecute = jest.fn<Promise<Result>, [Query]>();
const mockLookup = jest.fn<Promise<Result>, [Query]>();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  from(table: string) {
    const query: Query = { table, steps: [] }; mockQueries.push(query);
    const chain = {
      delete(...args: unknown[]) { query.steps.push(["delete", ...args]); return chain; },
      select(columns: string) { query.steps.push(["select", columns]); return chain; },
      eq(key: string, value: string) { query.steps.push(["eq", key, value]); return chain; },
      in(key: string, value: string[]) { query.steps.push(["in", key, [...value]]); return chain; },
      update(value: unknown) { query.steps.push(["update", value]); return chain; },
      maybeSingle() { query.steps.push(["maybeSingle"]); return mockLookup(query); },
      then(resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) { return mockExecute(query).then(resolve, reject); },
    };
    return chain;
  },
}) }));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function listen(listener = jest.fn<void, [SavedDataChange]>()) {
  cleanups.push(subscribeSavedDataChanges("a", listener)); return listener;
}
type Path = { name: string; run: (owner: string) => Promise<unknown>; result: unknown; count: number;
  single?: true; event: SavedDataChange; queries: Query[] };
const paths: Path[] = [
  { name: "deleteSource", run: owner => deleteSource(owner, "s1"), result: undefined, count: 1, single: true,
    event: { ownerId: "a", kind: "source", ids: ["s1"], basis: "requested" },
    queries: [{ table: "sources", steps: [["delete"], ["eq", "user_id", "a"], ["eq", "id", "s1"]] }] },
  { name: "deleteWikiPage", run: owner => deleteWikiPage(owner, "p1"), result: undefined, count: 1, single: true,
    event: { ownerId: "a", kind: "wiki_page", ids: ["p1"], basis: "requested" },
    queries: [
      { table: "wiki_pages", steps: [["select", "source_id"], ["eq", "user_id", "a"], ["eq", "id", "p1"], ["maybeSingle"]] },
      { table: "wiki_pages", steps: [["delete"], ["eq", "user_id", "a"], ["eq", "id", "p1"]] },
    ] },
  { name: "deleteSourcesByIds", run: owner => deleteSourcesByIds(owner, ["s1", "s2"]), result: 2, count: 2,
    event: { ownerId: "a", kind: "source", ids: ["s1", "s2"], basis: "affected" },
    queries: [{ table: "sources", steps: [["delete", { count: "exact" }], ["eq", "user_id", "a"], ["in", "id", ["s1", "s2"]]] }] },
  { name: "deleteAllWikiPages", run: deleteAllWikiPages, result: 2, count: 2,
    event: { ownerId: "a", kind: "wiki_page", all: true, basis: "affected" },
    queries: [{ table: "wiki_pages", steps: [["delete", { count: "exact" }], ["eq", "user_id", "a"]] }] },
  { name: "deleteAllSources", run: deleteAllSources, result: 2, count: 2,
    event: { ownerId: "a", kind: "source", all: true, basis: "affected" },
    queries: [{ table: "sources", steps: [["delete", { count: "exact" }], ["eq", "user_id", "a"]] }] },
  { name: "deleteUningestedSources", run: deleteUningestedSources, result: 2, count: 2,
    event: { ownerId: "a", kind: "source", scope: "uningested", basis: "affected" },
    queries: [{ table: "sources", steps: [["delete", { count: "exact" }], ["eq", "user_id", "a"], ["eq", "ingested", false]] }] },
];

beforeEach(() => {
  __resetAccountEpochForTests(); noteResolvedOwner("a"); mockQueries.length = 0;
  mockExecute.mockReset().mockResolvedValue({ count: 2, error: null });
  mockLookup.mockReset().mockResolvedValue({ data: null, error: null });
});
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });

describe.each(paths)("$name live deletion contract", path => {
  test("notifies only after delete acknowledgement, with unchanged query order and return value", async () => {
    const listener = listen(), result = deferred<Result>();
    mockExecute.mockReturnValue(result.promise);
    const work = path.run("a"); await flush();
    expect(mockQueries).toEqual(path.queries);
    expect(listener).not.toHaveBeenCalled();
    result.resolve({ count: path.count, error: null });
    await expect(work).resolves.toBe(path.result);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(path.event);
    expect(mockQueries).toEqual(path.queries);
  });

  test("preserves the original server error and never notifies", async () => {
    const listener = listen(), error = { message: "delete rejected" };
    mockExecute.mockResolvedValue({ count: path.count, error });
    await expect(path.run("a")).rejects.toBe(error);
    expect(listener).not.toHaveBeenCalled();
  });

  test("response loss preserves the original rejection and never notifies", async () => {
    const listener = listen(), error = new Error("response lost");
    mockExecute.mockRejectedValue(error);
    await expect(path.run("a")).rejects.toBe(error);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each([0, null, undefined])("unknown/zero count %s is never reported as affected", async count => {
    const listener = listen(); mockExecute.mockResolvedValue({ count, error: null });
    await expect(path.run("a")).resolves.toBe(path.single ? undefined : 0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ ...path.event, basis: "requested" });
  });

  test("throwing listeners do not change results, queries or later delivery", async () => {
    listen(jest.fn<void, [SavedDataChange]>(() => { throw new Error("observer failed"); }));
    const listener = listen(); mockExecute.mockResolvedValue({ count: path.count, error: null });
    await expect(path.run("a")).resolves.toBe(path.result);
    expect(mockQueries).toEqual(path.queries);
    expect(listener).toHaveBeenCalledWith(path.event);
  });

  test("without listeners the same query and result are preserved", async () => {
    mockExecute.mockResolvedValue({ count: path.count, error: null });
    await expect(path.run("a")).resolves.toBe(path.result);
    expect(mockQueries).toEqual(path.queries);
  });

  test("async observer rejection preserves the caller result and subsequent delivery", async () => {
    cleanups.push(subscribeSavedDataChanges("a", async () => { throw new Error("observer failed"); }));
    const listener = listen(); mockExecute.mockResolvedValue({ count: path.count, error: null });
    await expect(path.run("a")).resolves.toBe(path.result);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mockQueries).toEqual(path.queries);
    expect(listener).toHaveBeenCalledWith(path.event);
  });

  test("a mismatched owner still gets the original delete result, but no event", async () => {
    const listener = listen(); mockExecute.mockResolvedValue({ count: path.count, error: null });
    await expect(path.run("b")).resolves.toBe(path.result);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each(["hold", "ABA"])("late commit after account %s does not notify", async transition => {
    const old = listen(), result = deferred<Result>(); mockExecute.mockReturnValue(result.promise);
    const work = path.run("a"); await flush();
    if (transition === "hold") beginAccountOwnerTransition("b");
    else {
      noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch());
      noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch());
    }
    const current = listen(); result.resolve({ count: path.count, error: null });
    await expect(work).resolves.toBe(path.result);
    expect(old).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
  });
});

test("empty bulk selection does no I/O or notification", async () => {
  const listener = listen();
  await expect(deleteSourcesByIds("a", [])).resolves.toBe(0);
  expect(mockQueries).toEqual([]); expect(listener).not.toHaveBeenCalled();
});

test("partial bulk deletion preserves count and requests requery without affected-row proof", async () => {
  const listener = listen(); mockExecute.mockResolvedValue({ count: 1, error: null });
  await expect(deleteSourcesByIds("a", ["s1", "s2"])).resolves.toBe(1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith({ ownerId: "a", kind: "source", ids: ["s1", "s2"], basis: "requested" });
});

test("caller mutation cannot change the event's captured IDs", async () => {
  const listener = listen(), result = deferred<Result>(), ids = ["s1", "s2"];
  mockExecute.mockReturnValue(result.promise);
  const work = deleteSourcesByIds("a", ids); await flush(); ids.push("s3");
  result.resolve({ count: 2, error: null }); await work;
  expect(listener).toHaveBeenCalledWith({ ownerId: "a", kind: "source", ids: ["s1", "s2"], basis: "affected" });
});

test.each(["error", "rejection"])("page lookup %s prevents deletion and notification", async failure => {
  const listener = listen(), error = new Error("lookup failed");
  if (failure === "error") mockLookup.mockResolvedValue({ error });
  else mockLookup.mockRejectedValue(error);
  await expect(deleteWikiPage("a", "p1")).rejects.toBe(error);
  expect(mockQueries).toEqual([paths[1].queries[0]]);
  expect(mockExecute).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});

test("page lookup cannot renew a stale owner's notification lease", async () => {
  const listener = listen(), lookup = deferred<Result>(); mockLookup.mockReturnValue(lookup.promise);
  const work = deleteWikiPage("a", "p1"); await flush();
  expect(mockExecute).not.toHaveBeenCalled();
  noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch());
  noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch());
  const current = listen(); lookup.resolve({ data: null, error: null });
  await expect(work).resolves.toBeUndefined();
  expect(mockQueries).toEqual(paths[1].queries);
  expect(listener).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
});

test.each(["ok", "error", "rejection"])("page deletion preserves source reset (%s) and emits only a page request", async reset => {
  const listener = listen(), error = new Error("reset failed");
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockLookup.mockResolvedValue({ data: { source_id: "s1" }, error: null });
  mockExecute.mockResolvedValueOnce({ error: null });
  if (reset === "rejection") mockExecute.mockRejectedValueOnce(error);
  else mockExecute.mockResolvedValueOnce({ error: reset === "error" ? error : null });
  try {
    await expect(deleteWikiPage("a", "p1")).resolves.toBeUndefined();
    expect(mockQueries).toEqual([...paths[1].queries, { table: "sources", steps: [
      ["update", { ingested: false, ingested_at: null }], ["eq", "user_id", "a"], ["eq", "id", "s1"],
    ] }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(paths[1].event);
    expect(warn).toHaveBeenCalledTimes(reset === "ok" ? 0 : 1);
  } finally { warn.mockRestore(); }
});
