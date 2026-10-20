import { createChatSessionKeep, snapshotKeepExchange, type ChatAutosaveTicket } from "../session-keep";
import { createChatSessionRegistry } from "../session-registry";
import { createContentWipeLedger } from "../../account/content-wipe";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { CHAT_KEEP_TAG, KEEP_MAX_CHARS, composeExchangeBody } from "../keep-exchange";
import { contentHash } from "../../ingest/dedup";
import { dismissCrisisNotice, getCrisisNotice, subscribeCrisisNotice } from "../../safety/crisis-notice";
import * as capture from "../../wiki/capture";
import * as classifier from "../../safety/classifier";
import type { SessionTurn } from "../session-types";
import type { CreateSourceInput } from "../../wiki/queries";
import { prepareSavedDataDeletion } from "../../wiki/saved-data-changes";

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
const redPair = (): SessionTurn[] => [
  { ...pair()[0], text: "I want to kill myself", safetyZone: "red" },
  { ...pair()[1], text: "Call 988 now.", safetyZone: "red", crisisNotice: true },
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
  jest.spyOn(capture, "captureFromMarkdown");
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

test.each(["revoked", "superseded", "other-exchange"])("M2 autosave rejects a %s ticket before capture or source writes", async kind => {
  const f = fixture([...pair(), ...pair("other", 3)]);
  const t = f.ticket(kind === "other-exchange" ? f.snapshot("other") : f.input);
  let revision = t.value.revision;
  const ticket = { ...t.value, isCurrent: () => !t.controller.signal.aborted && t.value.revision === revision };
  if (kind === "revoked") t.controller.abort();
  if (kind === "superseded") revision += 1;
  expect(await f.keep.keepExchange(f.input, { reason: "autosave", ticket })).toEqual({ status: "rejected", reason: "consent-stale" });
  expect(capture.captureFromMarkdown).not.toHaveBeenCalled();
  expect(mockQueries.filter(q => q.table === "sources" && q.insert)).toHaveLength(0);
  expect(mockUpload).not.toHaveBeenCalled(); expect(mockAuth).not.toHaveBeenCalled();
  expect(f.keep.receipts.getSnapshot()).toEqual([]);
});

test.each(["admission", "auth"])("M2 autosave OFF after %s admission prevents capture even before the ticket signal aborts", async stage => {
  const f = fixture(), t = f.ticket(), pending = deferred<ReturnType<typeof auth>>();
  let consent = true;
  const ticket = { ...t.value, isCurrent: () => consent };
  if (stage === "admission") f.keep.receipts.subscribe(() => {
    if (f.keep.receipts.get(f.input.exchangeId)?.state === "saving") consent = false;
  });
  else mockAuth.mockReturnValue(pending.promise);
  const first = f.keep.keepExchange(f.input, { reason: "autosave", ticket });
  if (stage === "auth") {
    expect(mockAuth).toHaveBeenCalledTimes(1); expect(capture.captureFromMarkdown).not.toHaveBeenCalled();
    consent = false; pending.resolve(auth());
  }
  expect(await first).toMatchObject({ status: "settled", receipt: { state: "failed", reason: "autosave" } });
  expect(ticket.signal.aborted).toBe(false);
  expect(capture.captureFromMarkdown).not.toHaveBeenCalled();
  expect(mockQueries.filter(q => q.table === "sources" && q.insert)).toHaveLength(0);
  expect(mockUpload).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled();
});

test("K03 source event reopens manual save, never autosave, through actual capture and ID-only requery", async () => {
  const f = fixture(); await f.manual();
  prepareSavedDataDeletion({ ownerId: "a", kind: "source", ids: ["source1"] })("requested"); await flush();
  expect(f.keep.receipts.get(f.input.exchangeId)?.state).toBe("missing");
  expect(mockQueries.filter(q => q.columns === "id")).toEqual([
    expect.objectContaining({ table: "sources", filters: { user_id: "a", id: ["source1"] } }),
  ]);
  const t = f.ticket();
  expect(await f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value })).toMatchObject({ status: "rejected", reason: "autosave-blocked" });
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "present", deletedAfterSave: true, autosaveTombstone: true } });
  expect(mockUpload).toHaveBeenCalledTimes(2);
  f.keep.dispose();
  const count = mockQueries.length;
  prepareSavedDataDeletion({ ownerId: "a", kind: "source", all: true })("requested"); await flush();
  expect(mockQueries).toHaveLength(count); expect(jest.getTimerCount()).toBe(0);
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

test.each(["resolve", "reject"])("M1 guidance is synchronous while auth is pending and remains after auth %s", async outcome => {
  const turns = pair(); turns[0] = { ...turns[0], text: "I want to kill myself" };
  const f = fixture(turns), pending = deferred<ReturnType<typeof auth>>(); mockAuth.mockReturnValue(pending.promise);
  const notice = jest.fn(); cleanups.push(subscribeCrisisNotice(notice));
  const first = f.manual();
  expect(getCrisisNotice()?.hotline).toBe("GLOBAL_988"); expect(notice).toHaveBeenCalledTimes(1);
  expect(capture.captureFromMarkdown).not.toHaveBeenCalled(); expect(mockQueries).toEqual([]);
  const shown = getCrisisNotice();
  if (outcome === "reject") pending.reject(new Error("auth unavailable")); else pending.resolve(auth());
  expect(await first).toMatchObject({ status: "settled", receipt: { state: outcome === "reject" ? "failed" : "present" } });
  expect(getCrisisNotice()).toBe(shown); expect(notice).toHaveBeenCalledTimes(1);
  expect(capture.captureFromMarkdown).toHaveBeenCalledTimes(outcome === "reject" ? 0 : 1);
  expect(mockQueries.filter(q => q.table === "sources" && q.insert)).toHaveLength(outcome === "reject" ? 0 : 1);
});

test("M1 manual twice plus autosave join publishes one guidance for the same red operation", async () => {
  const f = fixture(redPair()), pending = deferred<ReturnType<typeof auth>>(); mockAuth.mockReturnValue(pending.promise);
  const notice = jest.fn(); cleanups.push(subscribeCrisisNotice(notice));
  const first = f.manual(), t = f.ticket();
  expect(f.manual()).toBe(first);
  expect(f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value })).toBe(first);
  expect(notice).toHaveBeenCalledTimes(1); expect(getCrisisNotice()?.hotline).toBe("GLOBAL_988");
  pending.resolve(auth()); await first;
  expect(notice).toHaveBeenCalledTimes(1); expect(capture.captureFromMarkdown).toHaveBeenCalledTimes(1);
});

test("M3 autosave retains a red input and fixed guidance with both hold evidence items, without another notice", async () => {
  const f = fixture(redPair());
  const expected = { state: "hold-required", evidence: [
    { kind: "turn-zone-red", turnId: "exchange-prompt" }, { kind: "turn-zone-red", turnId: "exchange-reply" },
  ] };
  expect(f.input).not.toBeNull(); expect(f.input).toMatchObject({ aiReuse: expected });
  const notice = jest.fn(); cleanups.push(subscribeCrisisNotice(notice));
  const t = f.ticket(), first = f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value });
  expect(notice).not.toHaveBeenCalled();
  expect(await first).toMatchObject({ status: "settled", receipt: { state: "present", aiReuse: expected } });
  expect(capture.captureFromMarkdown).toHaveBeenCalledTimes(1);
  expect(mockQueries.filter(q => q.table === "sources" && q.insert)).toHaveLength(1);
  expect(mockUpload.mock.calls[0][1]).toContain("I want to kill myself");
  expect(mockUpload.mock.calls[0][1]).toContain("Call 988 now.");
  expect(notice).not.toHaveBeenCalled(); expect(getCrisisNotice()).toBeNull();
});

test.each(["prompt", "reply"])("M3 snapshot and receipt retain the %s red verdict even beyond the clipped body", async side => {
  const turns = pair(), index = side === "prompt" ? 0 : 1;
  turns[index] = { ...turns[index], text: "x".repeat(KEEP_MAX_CHARS + 20), safetyZone: "red" };
  const f = fixture(turns), expected = { state: "hold-required", evidence: [{ kind: "turn-zone-red", turnId: turns[index].id }] };
  expect(f.input).toMatchObject({ aiReuse: expected });
  expect(await f.manual()).toMatchObject({ receipt: { state: "present", aiReuse: expected } });
});

test("M3 a fixed guidance turn without a red verdict remains keepable without granting AI reuse", async () => {
  const turns = pair(); turns[1] = { ...turns[1], crisisNotice: true };
  const f = fixture(turns); expect(f.input).toMatchObject({ aiReuse: { state: "unconfirmed" } });
  expect(await f.manual()).toMatchObject({ receipt: { aiReuse: { state: "unconfirmed" } } });
});

test("validated IDs and text reject stale/tampered pairs without finding a different turn by index", async () => {
  const f = fixture();
  expect(await f.manual({ ...f.input, prompt: { ...f.input.prompt, text: "different private text" } })).toMatchObject({ status: "rejected", reason: "pair-changed" });
  f.registry.replaceTurns(f.session, [{ ...f.input.prompt }, { ...f.input.reply, text: "new reply" }]);
  expect(await f.manual()).toMatchObject({ status: "rejected", reason: "pair-changed" });
  expect(mockAuth).not.toHaveBeenCalled(); expect(mockUpload).not.toHaveBeenCalled();
});

test.each([{ synthetic: true }, { consentError: "consent_required" as const }, { retryText: "retry" }, { text: " " }])(
  "snapshot rejects non-keepable reply %p", fields => {
    const f = fixture(); const snapshot = f.registry.getSessionSnapshot(f.session)!;
    expect(snapshotKeepExchange({ ...snapshot, turns: [snapshot.turns[0], { ...snapshot.turns[1], ...fields }] }, "exchange", f.input)).toBeNull();
  });

test.each(["user", "secondb"] as const)("M3 an intervening %s turn prevents binding an older prompt to the reply", role => {
  const f = fixture(), snapshot = f.registry.getSessionSnapshot(f.session)!;
  const turns = [snapshot.turns[0], { id: "intervening", exchangeId: "other", sequence: 2, role, text: "Another turn" },
    { ...snapshot.turns[1], sequence: 3 }];
  expect(snapshotKeepExchange({ ...snapshot, turns }, "exchange", f.input)).toBeNull();
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

test.each(["clear", "replacement", "dispose"])("D1 registry %s retires keep before admission with zero egress", async change => {
  const f = fixture(), choice = f.registry.getSnapshot("entry")!.choice;
  if (change === "dispose") f.registry.dispose();
  else expect(change === "clear" ? f.registry.clear(choice)
    : f.registry.chooseNew(choice, { fromNode: null, mode: "analytic", persona: "secondb", seed: "new" })).toBe(true);
  expect(f.registry.isCurrent(f.session)).toBe(false);
  expect(await f.manual()).toEqual({ status: "rejected", reason: "stale" });
  expect(mockAuth).not.toHaveBeenCalled(); expect(capture.captureFromMarkdown).not.toHaveBeenCalled();
  expect(mockQueries).toEqual([]); expect(mockUpload).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test.each(["session", "prompt", "reply"])("D1 autosave rejects a ticket bound to another %s despite current consent", async field => {
  const f = fixture(), t = f.ticket();
  const ticket = { ...t.value, ...(field === "session" ? { session: { ...t.value.session, sessionId: "other-session" } }
    : field === "prompt" ? { promptTurnId: "other-prompt" } : { replyTurnId: "other-reply" }) };
  expect(ticket.isCurrent()).toBe(true); expect(ticket.signal.aborted).toBe(false);
  expect(await f.keep.keepExchange(f.input, { reason: "autosave", ticket }))
    .toEqual({ status: "rejected", reason: "consent-stale" });
  expect(mockAuth).not.toHaveBeenCalled(); expect(capture.captureFromMarkdown).not.toHaveBeenCalled();
  expect(mockQueries).toEqual([]); expect(mockUpload).not.toHaveBeenCalled();
  expect(f.keep.receipts.getSnapshot()).toEqual([]);
});

test("D1 autosave of a red body with an ordinary reply publishes guidance exactly once", async () => {
  const turns = redPair(); turns[1] = { ...pair()[1], safetyZone: "red" };
  const f = fixture(turns), t = f.ticket(), pending = deferred<ReturnType<typeof auth>>();
  mockAuth.mockReturnValue(pending.promise);
  const notice = jest.fn(); cleanups.push(subscribeCrisisNotice(notice));
  const work = f.keep.keepExchange(f.input, { reason: "autosave", ticket: t.value });
  expect(f.manual()).toBe(work);
  expect(notice).toHaveBeenCalledTimes(1); expect(getCrisisNotice()?.hotline).toBe("GLOBAL_988");
  pending.resolve(auth());
  expect(await work).toMatchObject({ status: "settled", receipt: { state: "present", reason: "autosave" } });
  expect(notice).toHaveBeenCalledTimes(1); expect(capture.captureFromMarkdown).toHaveBeenCalledTimes(1);
});

test("D1 rejects a returned source owned by another account without publishing saved evidence", async () => {
  const f = fixture();
  // Exercise this adapter's result boundary independently of capture's own owner checks.
  jest.mocked(capture.captureFromMarkdown).mockResolvedValueOnce({
    source: { ...source(), user_id: "b" } as capture.CaptureResult["source"],
    storage_path: "b/clip.md", hadFrontmatter: true, suggested_slug: "clip", deduped: null, storagePending: false,
  });
  expect(await f.manual()).toMatchObject({ status: "settled", receipt: { state: "unknown" } });
  expect(f.keep.receipts.get(f.input.exchangeId)?.sourceId).toBeUndefined();
  expect(f.complete).toHaveBeenCalledWith(expect.objectContaining({ state: "unknown" }));
  expect(capture.captureFromMarkdown).toHaveBeenCalledTimes(1);
});

test.each([
  { locale: "ko" as const, minor: true, hotline: "KR_1388" },
  { locale: "ko" as const, minor: null, hotline: "KR_1388" },
  { locale: "ko" as const, minor: false, hotline: "KR_109" },
  { locale: "en" as const, minor: true, hotline: "GLOBAL_988" },
  { locale: "en" as const, minor: false, hotline: "GLOBAL_988" },
])("D1 guidance fallback for $locale / minor=$minor uses $hotline", async ({ locale, minor, hotline }) => {
  const f = fixture();
  // A classifier-supplied route would hide mutations of the adapter's fallback.
  jest.spyOn(classifier, "classifyInputAnyLocale").mockReturnValue({ zone: "red", matched: [], categories: ["crisis"] });
  const notice = jest.fn(); cleanups.push(subscribeCrisisNotice(notice));
  const work = f.manual({ ...f.input, locale, minor });
  expect(getCrisisNotice()?.hotline).toBe(hotline); expect(notice).toHaveBeenCalledTimes(1);
  await work; expect(notice).toHaveBeenCalledTimes(1);
});

test("D1 exchange title uses the prompt's first line and escapes its quotes in capture markdown", async () => {
  const turns = pair(); turns[0] = { ...turns[0], text: 'My "weekend" plan\nAdditional details' };
  const f = fixture(turns);
  expect(await f.manual()).toMatchObject({ receipt: { state: "present" } });
  expect(jest.mocked(capture.captureFromMarkdown).mock.calls[0][0].rawMd)
    .toMatch(/^---\ntitle: "My 'weekend' plan"\n---\n/);
  expect(mockQueries.find(q => q.table === "sources" && q.insert)?.insert?.title).toBe("My 'weekend' plan");
});
