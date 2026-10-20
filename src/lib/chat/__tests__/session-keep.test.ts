import { createChatSessionKeep, snapshotKeepExchange, type ChatAutosaveTicket } from "../session-keep";
import { createChatSessionRegistry } from "../session-registry";
import { createContentWipeLedger } from "../../account/content-wipe";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { CHAT_KEEP_TAG, KEEP_MAX_CHARS, composeExchangeBody } from "../keep-exchange";
import { contentHash } from "../../ingest/dedup";
import { dismissCrisisNotice, getCrisisNotice, subscribeCrisisNotice } from "../../safety/crisis-notice";
import type { SessionTurn } from "../session-types";
import type { CreateSourceInput } from "../../wiki/queries";

type Query = { table: string; columns?: string; filters: Record<string, unknown>; insert?: CreateSourceInput; signal?: AbortSignal };
const mockAuth = jest.fn(), mockUpload = jest.fn(), mockIO = jest.fn();
const mockQueries: Query[] = [];
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mockAuth }, storage: { from: () => ({ upload: mockUpload }) },
  from(table: string) {
    const query: Query = { table, filters: {} }; mockQueries.push(query);
    const builder = {
      select(columns?: string) { query.columns = columns; return builder; },
      insert(input: CreateSourceInput) { query.insert = input; return builder; },
      eq(key: string, value: unknown) { query.filters[key] = value; return builder; },
      overlaps(key: string, value: unknown) { query.filters[key] = value; return builder; },
      in(key: string, value: unknown) { query.filters[key] = value; return builder; },
      limit() { return builder; },
      abortSignal(signal: AbortSignal) { query.signal = signal; return builder; },
      single: () => mockIO(query), maybeSingle: () => mockIO(query),
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(mockIO(query)).then(resolve, reject); },
    };
    return builder;
  },
}) }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const cleanups: (() => void)[] = [];
const pair = (exchangeId = "exchange", sequence = 1): SessionTurn[] => [
  { id: `${exchangeId}-prompt`, exchangeId, sequence, role: "user", text: "My weekend plan" },
  { id: `${exchangeId}-reply`, exchangeId, sequence: sequence + 1, role: "secondb", text: "You could take a walk." },
];
const auth = () => ({ data: { session: { user: { id: "a" }, access_token: "fixture-only" } }, error: null });
const source = (input: Partial<CreateSourceInput> = {}) => ({ ...input, id: "source1", user_id: "a", storage_path: "a/clip.md" });
const defaultIO = (q: Query) => ({ data: q.insert ? source(q.insert) : [], error: null });
function fixture(turns = pair()) {
  const registry = createChatSessionRegistry(createContentWipeLedger());
  const view = registry.attachView("a", "entry")!, session = view.snapshot.session!;
  registry.replaceTurns(session, turns);
  const keep = createChatSessionKeep(registry, session, { timeoutMs: 100, readTimeoutMs: 100 });
  cleanups.push(() => { keep.dispose(); registry.dispose(); });
  const snapshot = (exchangeId = "exchange") => snapshotKeepExchange(registry.getSessionSnapshot(session)!, exchangeId,
    { speaker: "HustleK", locale: "en", minor: false })!;
  const input = snapshot(), complete = jest.fn(); keep.subscribeCompletion(complete);
  const ticket = (s = input) => {
    const controller = new AbortController();
    const value: ChatAutosaveTicket = { session: s.session, exchangeId: s.exchangeId, promptTurnId: s.promptTurnId,
      replyTurnId: s.replyTurnId, revision: 1, signal: controller.signal, isCurrent: () => !controller.signal.aborted };
    return { controller, value };
  };
  const manual = (s = input, retryUnknown?: true) => keep.keepExchange(s, { reason: "manual", retryUnknown });
  return { registry, view, session, keep, input, snapshot, ticket, manual, complete };
}
beforeEach(() => {
  __resetAccountEpochForTests(); noteResolvedOwner("a"); mockQueries.length = 0;
  mockAuth.mockReset().mockImplementation(async () => auth());
  mockUpload.mockReset().mockResolvedValue({ error: null }); mockIO.mockReset().mockImplementation(defaultIO);
  jest.useFakeTimers();
});
afterEach(() => {
  cleanups.splice(0).reverse().forEach(fn => fn());
  const notice = getCrisisNotice(); if (notice) dismissCrisisNotice(notice.id);
  jest.restoreAllMocks(); jest.useRealTimers();
});

test("K01 manual clicks, detach/return and autosave join share the exact Promise and one real capture", async () => {
  const f = fixture([...pair(), ...pair("other", 3)]), upload = deferred<{ error: null }>(); mockUpload.mockReturnValue(upload.promise);
  const first = f.manual(); const t = f.ticket();
  expect(f.manual()).toBe(first);
  expect(f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value })).toBe(first);
  await flush(); expect(mockUpload).toHaveBeenCalledTimes(1);
  f.registry.detachView(f.view.viewId); f.registry.attachView("a", "entry");
  expect(f.manual()).toBe(first); expect(await f.manual(f.snapshot("other"))).toEqual({ status: "rejected", reason: "busy" });
  upload.resolve({ error: null });
  expect(await first).toMatchObject({ status: "settled", receipt: { state: "present", sourceId: "source1", reason: "manual", storagePending: false } });
  expect(mockAuth).toHaveBeenCalledTimes(1); expect(mockUpload).toHaveBeenCalledTimes(1);
  const inserts = mockQueries.filter(q => q.insert && q.table === "sources"); expect(inserts).toHaveLength(1);
  expect(inserts[0].insert).toMatchObject({ user_id: "a", kind: "self_knowledge", tags: [CHAT_KEEP_TAG] });
  expect(f.complete).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test("K01 a reentrant subscriber cannot start another capture while admission is publishing", async () => {
  const f = fixture(); let joined: ReturnType<typeof f.manual> | undefined;
  f.keep.receipts.subscribe(() => { if (f.keep.receipts.get(f.input.exchangeId)?.state === "saving") joined = f.manual(); });
  const first = f.manual(); expect(joined).toBe(first); await first;
  expect(mockUpload).toHaveBeenCalledTimes(1); expect(f.complete).toHaveBeenCalledTimes(1);
});

test("K02 storagePending preserves inline source evidence without claiming a clean upload", async () => {
  const f = fixture(); jest.spyOn(console, "warn").mockImplementation(() => {});
  mockUpload.mockResolvedValue({ error: new Error("offline") });
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "present", sourceId: "source1", storagePending: true } });
  expect(f.keep.receipts.get(f.input.exchangeId)?.storagePending).toBe(true);
  expect(mockQueries.find(q => q.table === "sources" && q.insert)?.insert?.frontmatter).toMatchObject({
    _storage_pending: true, _body_fallback: expect.stringContaining("You could take a walk."),
  });
  mockIO.mockImplementation(q => q.columns === "id" ? { data: [{ id: "source1" }], error: null } : defaultIO(q));
  await f.keep.receipts.check(); expect(f.keep.receipts.get(f.input.exchangeId)?.storagePending).toBe(true);
});

test("K02 explicit retry after a lost insert response uses real content dedup and retains the existing source ID", async () => {
  const f = fixture(); let committed: CreateSourceInput | undefined;
  mockIO.mockImplementation((q: Query) => {
    if (q.table === "sources" && q.insert) { committed = q.insert; return Promise.reject(new Error("response lost after commit")); }
    return defaultIO(q);
  });
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "unknown" } });
  expect(f.keep.receipts.get(f.input.exchangeId)?.sourceId).toBeUndefined();
  expect(await f.manual()).toEqual({ status: "rejected", reason: "retry-required" });
  const t = f.ticket(); expect(await f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value })).toEqual({ status: "rejected", reason: "autosave-blocked" });
  mockIO.mockImplementation((q: Query) => {
    if (q.columns === "id, content_hash, dedup_signature") return { data: [{ id: "source1", content_hash: committed!.content_hash }], error: null };
    if (q.columns === "*") return { data: source(committed), error: null };
    return defaultIO(q);
  });
  expect(await f.manual(f.input, true)).toMatchObject({ status: "settled", receipt: { state: "present", sourceId: "source1", deduped: "exact_duplicate" } });
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockQueries.filter(q => q.insert && q.table === "sources")).toHaveLength(1);
  expect(mockQueries.filter(q => q.insert && q.table === "ingest_log")).toHaveLength(1);
});

test("K02 capture rejection before insert is still unknown; unissued authentication failure is failed", async () => {
  const f = fixture(); mockIO.mockRejectedValue(new Error("candidate lookup failed"));
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "unknown" } });
  expect(mockUpload).not.toHaveBeenCalled();
  mockAuth.mockRejectedValue(new Error("auth unavailable"));
  expect(await f.manual(f.input, true)).toMatchObject({ status: "settled", receipt: { state: "failed" } });
  expect(mockUpload).not.toHaveBeenCalled();
});

test("K02 exact duplicate of an inline fallback source still reports its pending upload", async () => {
  const f = fixture();
  const body = composeExchangeBody({ prompt: f.input.prompt.text, reply: f.input.reply.text, speaker: f.input.speaker }, "en");
  mockIO.mockImplementation((q: Query) => q.columns === "id, content_hash, dedup_signature"
    ? { data: [{ id: "source1", content_hash: contentHash(body) }], error: null }
    : q.columns === "*" ? { data: source({ frontmatter: { _storage_pending: true } }), error: null } : defaultIO(q));
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "present", deduped: "exact_duplicate", storagePending: true } });
  expect(mockUpload).not.toHaveBeenCalled();
});

test("K02 timeout remains unknown, holds single-flight until transport settles, never resends or accepts late success", async () => {
  const f = fixture(), inserted = deferred<unknown>();
  mockIO.mockImplementation((q: Query) => q.insert ? inserted.promise : defaultIO(q));
  const first = f.manual(); await flush();
  expect(mockQueries.filter(q => q.insert)).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(100);
  expect(await first).toMatchObject({ status: "settled", receipt: { state: "unknown" } });
  expect(f.manual(f.input, true)).toBe(first); expect(mockUpload).toHaveBeenCalledTimes(1);
  inserted.resolve({ data: source(), error: null }); await flush();
  expect(f.keep.receipts.get(f.input.exchangeId)?.state).toBe("unknown");
  expect(f.complete).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test("K01 autosave OFF cannot cancel accepted manual capture or grant another automatic attempt", async () => {
  const f = fixture(), upload = deferred<{ error: null }>(); mockUpload.mockReturnValue(upload.promise);
  const first = f.manual(), t = f.ticket();
  expect(f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value })).toBe(first);
  t.controller.abort(); upload.resolve({ error: null });
  expect(await first).toMatchObject({ status: "settled", receipt: { state: "present", reason: "manual" } });
  const fresh = f.ticket();
  expect(await f.keep.keepExchange(f.input, { reason: "autosave", ticket: fresh.value })).toEqual({ status: "rejected", reason: "autosave-blocked" });
});

test("K01 manual join does not promote cancelled auto capture; only a later explicit retry can write", async () => {
  const f = fixture(), upload = deferred<{ error: null }>(); mockUpload.mockReturnValueOnce(upload.promise);
  const t = f.ticket(), first = f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value });
  expect(f.manual()).toBe(first); await flush(); t.controller.abort();
  expect(await first).toMatchObject({ status: "settled", receipt: { state: "unknown", reason: "autosave" } });
  upload.resolve({ error: null }); await flush();
  expect(mockQueries.filter(q => q.insert && q.table === "sources")).toHaveLength(0);
  expect(mockUpload).toHaveBeenCalledTimes(1); expect(f.complete).not.toHaveBeenCalled();
  expect(await f.manual(f.input, true)).toMatchObject({ status: "settled", receipt: { state: "present", reason: "manual" } });
  expect(mockUpload).toHaveBeenCalledTimes(2);
});

test("K03 source deletion reopens manual save, never autosave, through actual capture and ID-only check", async () => {
  const f = fixture(); await f.manual(); await f.keep.receipts.check();
  expect(f.keep.receipts.get(f.input.exchangeId)?.state).toBe("missing");
  const t = f.ticket();
  expect(await f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value })).toMatchObject({ status: "rejected", reason: "autosave-blocked" });
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "present", deletedAfterSave: true, autosaveTombstone: true } });
  expect(mockUpload).toHaveBeenCalledTimes(2);
});

test.each(["auth", "candidates", "upload", "insert"])("K04 account hold/ABA at %s blocks next I/O and final effects", async stage => {
  const f = fixture(), pending = deferred<unknown>();
  if (stage === "auth") mockAuth.mockReturnValue(pending.promise);
  if (stage === "upload") mockUpload.mockReturnValue(pending.promise);
  if (stage === "candidates" || stage === "insert") mockIO.mockImplementation((q: Query) =>
    (stage === "insert" ? !!q.insert : !q.insert) ? pending.promise : defaultIO(q));
  const first = f.manual(); await flush(); const queryCount = mockQueries.length, uploads = mockUpload.mock.calls.length;
  beginAccountOwnerTransition("b");
  expect(f.keep.receipts.getSnapshot()).toEqual([]); expect(jest.getTimerCount()).toBe(0);
  noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch());
  noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch());
  pending.resolve(stage === "auth" ? auth() : stage === "upload" ? { error: null } : { data: stage === "insert" ? source() : [], error: null });
  expect(await first).toEqual({ status: "rejected", reason: "stale" }); await flush();
  expect(mockQueries).toHaveLength(queryCount); expect(mockUpload).toHaveBeenCalledTimes(uploads);
  expect(f.complete).not.toHaveBeenCalled(); expect(await f.manual()).toEqual({ status: "rejected", reason: "stale" });
});

test("K04 owner change during receipt publication suppresses completion without rewriting write evidence", async () => {
  const f = fixture(); f.keep.receipts.subscribe(() => {
    if (f.keep.receipts.get(f.input.exchangeId)?.state === "present") beginAccountOwnerTransition("b");
  });
  expect(await f.manual()).toEqual({ status: "rejected", reason: "stale" });
  expect(f.complete).not.toHaveBeenCalled(); expect(f.keep.receipts.getSnapshot()).toEqual([]);
});

test("K04 owner change in a completion observer suppresses remaining observers and the returned receipt", async () => {
  const f = fixture(), later = jest.fn();
  f.keep.subscribeCompletion(() => beginAccountOwnerTransition("b")); f.keep.subscribeCompletion(later);
  expect(await f.manual()).toEqual({ status: "rejected", reason: "stale" }); expect(later).not.toHaveBeenCalled();
});

test("K01 root guidance is emitted once before delayed storage, including after view detach", async () => {
  const turns = pair(); turns[0] = { ...turns[0], text: "I want to kill myself" };
  const f = fixture(turns), upload = deferred<{ error: null }>(); mockUpload.mockReturnValue(upload.promise);
  const notice = jest.fn(), stop = subscribeCrisisNotice(notice); cleanups.push(stop);
  const first = f.manual(); f.registry.detachView(f.view.viewId); expect(f.manual()).toBe(first); await flush();
  expect(getCrisisNotice()?.hotline).toBe("GLOBAL_988"); expect(notice).toHaveBeenCalledTimes(1);
  upload.resolve({ error: null }); await first; expect(notice).toHaveBeenCalledTimes(1);
});

test("validated IDs and text reject stale/tampered pairs without finding a different turn by index", async () => {
  const f = fixture();
  expect(await f.manual({ ...f.input, prompt: { ...f.input.prompt, text: "different private text" } })).toMatchObject({ status: "rejected", reason: "pair-changed" });
  f.registry.replaceTurns(f.session, [{ ...f.input.prompt }, { ...f.input.reply, text: "new reply" }]);
  expect(await f.manual()).toMatchObject({ status: "rejected", reason: "pair-changed" });
  expect(mockAuth).not.toHaveBeenCalled(); expect(mockUpload).not.toHaveBeenCalled();
});

test.each([{ synthetic: true }, { crisisNotice: true as const }, { safetyZone: "red" as const }, { retryText: "retry" }, { text: " " }])(
  "snapshot rejects non-keepable reply %p", fields => {
    const f = fixture(); const snapshot = f.registry.getSessionSnapshot(f.session)!;
    expect(snapshotKeepExchange({ ...snapshot, turns: [snapshot.turns[0], { ...snapshot.turns[1], ...fields }] }, "exchange", f.input)).toBeNull();
  });

test("capture body reuses speaker attribution, CHAT_KEEP_TAG and per-side KEEP_MAX_CHARS", async () => {
  const turns = pair(); turns[0] = { ...turns[0], text: "p".repeat(KEEP_MAX_CHARS + 20) };
  turns[1] = { ...turns[1], text: "r".repeat(KEEP_MAX_CHARS + 20), citationText: "never capture citation markup" };
  const f = fixture(turns); await f.manual();
  const body = composeExchangeBody({ prompt: turns[0].text, reply: turns[1].text, speaker: "HustleK" }, "en");
  expect(mockUpload.mock.calls[0][1]).toBe(body); expect(body).not.toContain("never capture");
  expect(body).toContain("**I asked**"); expect(body).toContain("**HustleK**");
  expect(body).not.toContain("r".repeat(KEEP_MAX_CHARS + 1));
  expect(mockQueries.find(q => q.insert)?.insert?.content_hash).toBe(contentHash(body));
});

test("construction is dormant and a disposed controller cannot authenticate or capture", async () => {
  const f = fixture(); expect(mockAuth).not.toHaveBeenCalled(); expect(mockQueries).toEqual([]);
  f.keep.dispose(); expect(await f.manual()).toEqual({ status: "rejected", reason: "stale" });
  expect(mockAuth).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});
