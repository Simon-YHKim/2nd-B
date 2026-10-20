// Real capture, registry, account leases and ledger. Only SDK/fetch I/O is replaced.
import { captureFromMarkdown, type CaptureInput, type CaptureMutationObserver } from "../../wiki/capture";
import { createChatSessionKeep, snapshotKeepExchange, type ChatAutosaveTicket } from "../session-keep";
import { createChatSessionRegistry } from "../session-registry";
import { createContentWipeLedger } from "../../account/content-wipe";
import { beginAccountSessionLease, type AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease,
  clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import { bumpChatUsageIfUnderCap } from "../usage";
import { buildSourcePayload } from "../../wiki/ingest-helpers";
import { contentHash } from "../../ingest/dedup";
import type { SessionTurn } from "../session-types";

type Query = { table: string; columns?: string; insert?: Record<string, unknown>; signal?: AbortSignal };
const mockAuth = jest.fn(), mockIO = jest.fn(), mockUpload = jest.fn(), mockRemove = jest.fn();
const mockQueries: Query[] = [], mockEvents: string[] = [];
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mockAuth },
  storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
  from(table: string) {
    const query: Query = { table }; mockQueries.push(query);
    const run = () => { mockEvents.push(query.insert ? `insert:${table}` : `read:${table}`); return mockIO(query); };
    const builder = {
      select(columns?: string) { query.columns = columns; return builder; },
      insert(row: Record<string, unknown>) { query.insert = row; return builder; },
      eq() { return builder; }, overlaps() { return builder; }, in() { return builder; }, limit() { return builder; },
      abortSignal(signal: AbortSignal) { query.signal = signal; return builder; },
      single: run, maybeSingle: run,
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  },
}) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon" }) }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
};
const flush = async () => { for (let n = 0; n < 60; n++) await Promise.resolve(); };
const cleanups: (() => void)[] = [];
const originalFetch = globalThis.fetch;
const mockFetch = jest.fn();
const md = "# Weekend\n\nA walk by the river.";
const minorError = { code: "P0001", message: "minor_import_locked: fixture" };
const sourceReply = (q = mockQueries.findLast(q => q.table === "sources" && q.insert)!) =>
  ({ data: { ...q.insert, id: "source-a" }, error: null, status: 201 });
const defaultIO = (q: Query) => q.insert
  ? q.table === "sources" ? sourceReply(q) : { data: null, error: null, status: 201 }
  : { data: [], error: null, status: 200 };
async function transport(url: string, init: RequestInit) {
  let reply;
  if (url.includes("/storage/v1/object/raw-clippings/")) {
    const path = decodeURIComponent(url.split("/raw-clippings/")[1]);
    const uploaded = await mockUpload(path, init.body, { contentType: "text/markdown; charset=utf-8", upsert: false, signal: init.signal });
    reply = { ...uploaded, data: uploaded.data ? { Id: "storage-id", Key: `raw-clippings/${uploaded.data.path}` } : null, status: 200 };
  } else if (url.endsWith("/storage/v1/object/raw-clippings")) {
    reply = { ...await mockRemove(JSON.parse(init.body as string).prefixes), status: 200 };
  } else {
    const table = url.includes("/sources?") ? "sources" : "ingest_log";
    const query = { table, insert: JSON.parse(init.body as string), signal: init.signal as AbortSignal };
    mockQueries.push(query); mockEvents.push(`insert:${table}`); reply = await mockIO(query);
  }
  const minimal = url.endsWith("/ingest_log") && reply.status === 201 && reply.data === null && !reply.error;
  return new Response(minimal ? "" : JSON.stringify(reply.error ?? reply.data ?? {}), {
    status: reply.status ?? 200, headers: { "content-type": "application/json" },
  });
}
function switchOwner(id: string) {
  beginAccountOwnerTransition(id); noteResolvedOwner(id); clearAccountTransition(currentAccountEpoch());
  return captureAccountOwnerLease(id)!;
}
function fixture() {
  const ledger = createContentWipeLedger(), owner = captureAccountOwnerLease("a")!;
  let id = 0;
  const registry = createChatSessionRegistry(ledger, () => `work-${++id}`);
  const session = registry.attachView("a", "entry")!.snapshot.session!;
  const controller = new AbortController();
  const lease = beginAccountSessionLease("a", controller.signal);
  let authenticated: AuthenticatedAccountSessionLease;
  const ready = lease.authenticate().then(value => { authenticated = value; });
  const observer: CaptureMutationObserver = { owner, generation: 0, operationId: "capture", ledger,
    get session() { return authenticated; }, assertCurrent() {} };
  const input: CaptureInput = { userId: "a", rawMd: md, signal: lease.signal, mutationObserver: observer };
  const facts = () => ledger.inspect(captureAccountOwnerLease("a")!).tickets;
  const start = () => ready.then(() => captureFromMarkdown(input)).then(value => ({ value }), error => ({ error }));
  const wipe = () => ledger.beginWipe(captureAccountOwnerLease("a")!, 0, "wipe-intent")!;
  const deletionIO = jest.fn(async () => 0);
  const deleteFirst = async () => {
    const current = captureAccountOwnerLease("a")!, boundary = ledger.read(current);
    const permit = ledger.claimDeletionAttempt(current, boundary.wipeId!, boundary.generation);
    if (!permit) return null;
    const ticket = ledger.acquireDeletion(current, permit, "wiki-pages")!;
    const operation = ledger.issueMutation(current, ticket, deletionIO)!;
    await operation; ledger.settleMutation(ticket, { outcome: "committed", count: 0 });
    return permit;
  };
  cleanups.push(() => { controller.abort(); lease.release(); registry.dispose(); });
  return { ledger, owner, registry, session, controller, observer, input, facts, start, wipe, deletionIO, deleteFirst };
}
function keepFixture() {
  const f = fixture();
  const turns: SessionTurn[] = [
    { id: "prompt", exchangeId: "exchange", sequence: 1, role: "user", text: "A weekend plan" },
    { id: "reply", exchangeId: "exchange", sequence: 2, role: "secondb", text: "Take a walk." },
  ];
  f.registry.replaceTurns(f.session, turns);
  const claim = jest.spyOn(f.registry, "claimWork");
  const keep = createChatSessionKeep(f.registry, f.session, { ledger: f.ledger, timeoutMs: 100 });
  const input = snapshotKeepExchange(f.registry.getSessionSnapshot(f.session)!, "exchange", { locale: "en", speaker: "HustleK", minor: false })!;
  const complete = jest.fn(); keep.subscribeCompletion(complete);
  const consent = new AbortController();
  const ticket: ChatAutosaveTicket = { ...input, revision: 1, signal: consent.signal, isCurrent: () => !consent.signal.aborted };
  const startKeep = (auto = false) => keep.keepExchange(input, auto ? { reason: "autosave", ticket } : { reason: "manual" });
  cleanups.push(keep.dispose);
  return { ...f, keep, input, complete, consent, startKeep, retire: () => claim.mock.calls[0][3] };
}
beforeEach(() => {
  __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); switchOwner("a");
  mockQueries.length = 0; mockEvents.length = 0;
  mockAuth.mockReset().mockResolvedValue({ data: { session: { user: { id: "a" }, access_token: "fixture-a" } }, error: null });
  mockIO.mockReset().mockImplementation(defaultIO);
  mockUpload.mockReset().mockImplementation(async (path: string) => { mockEvents.push("upload"); return { data: { path }, error: null }; });
  mockRemove.mockReset().mockImplementation(async ([path]: string[]) => ({ data: [{ name: path }], error: null }));
  mockFetch.mockReset().mockImplementation(transport); globalThis.fetch = mockFetch;
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); globalThis.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers(); });

test("each normal write is registered and issued before I/O, then committed to its original identity", async () => {
  const f = fixture();
  mockUpload.mockImplementation(async (path: string) => {
    expect(f.facts()).toMatchObject([{ kind: "raw-upload", outcome: "issued-pending", generation: 0, ownerEpoch: f.owner.epoch }]);
    return { data: { path }, error: null };
  });
  mockIO.mockImplementation(q => {
    if (q.insert) expect(f.facts().map(t => t.outcome)).toEqual(["committed", "issued-pending"]);
    return defaultIO(q);
  });
  expect(await f.start()).toHaveProperty("value.source.id", "source-a");
  expect(f.facts().map(t => [t.kind, t.outcome])).toEqual([["raw-upload", "committed"], ["source-insert", "committed"]]);
  expect(mockFetch).toHaveBeenCalledTimes(2);
  for (const [, init] of mockFetch.mock.calls) {
    expect(init.signal).toBe(f.input.signal); expect(init.headers.Authorization).toBe("Bearer fixture-a");
  }
  expect(mockFetch.mock.calls[1][1].headers).toMatchObject({ Prefer: "return=representation", Accept: "application/vnd.pgrst.object+json" });
});

test.each(["read", "registered", "upload", "source"])("W02 wipe during %s blocks next write; only confirmed drain permits explicit deletion", async stage => {
  const f = fixture(), pending = deferred<unknown>();
  if (stage === "read") mockIO.mockReturnValue(pending.promise);
  if (stage === "upload") mockUpload.mockReturnValue(pending.promise);
  if (stage === "source") mockIO.mockImplementation(q => q.insert ? pending.promise : defaultIO(q));
  if (stage === "registered") cleanups.push(f.ledger.observe(f.owner, () => {
    if (f.facts().some(t => t.outcome === "registered")) f.wipe();
  }));
  const result = f.start(); await flush();
  if (stage !== "registered") f.wipe();
  expect(f.registry.getSnapshot("entry")?.session).toBeNull();
  if (stage === "upload" || stage === "source") expect(await f.deleteFirst()).toBeNull();
  expect(f.deletionIO).not.toHaveBeenCalled();
  pending.resolve(stage === "upload" ? { data: { path: mockUpload.mock.calls[0][0] }, error: null }
    : stage === "source" ? sourceReply() : { data: [], error: null });
  expect(await result).toHaveProperty("error");
  expect(mockQueries.filter(q => q.insert)).toHaveLength(stage === "source" ? 1 : 0);
  if (stage === "registered") expect(f.facts()[0].outcome).toBe("definitely-not-issued");
  expect(f.deletionIO).not.toHaveBeenCalled();
  expect(await f.deleteFirst()).not.toBeNull(); expect(f.deletionIO).toHaveBeenCalledTimes(1);
});

test.each([["upload", false], ["source", false], ["upload", true], ["source", true]] as const)("W02 keep %s (auto %s) retire ACK is false; wipe retains the issued signal, suppresses completion and latches ACK failure", async (stage, auto) => {
  const f = keepFixture(), pending = deferred<unknown>();
  if (stage === "upload") mockUpload.mockReturnValue(pending.promise);
  else mockIO.mockImplementation(q => q.insert ? pending.promise : defaultIO(q));
  const result = f.startKeep(auto); await flush();
  const signal: AbortSignal = stage === "upload" ? mockUpload.mock.calls[0][2].signal : mockQueries.find(q => q.insert)!.signal!;
  const barrier = f.wipe();
  expect(barrier.ackConfirmed).toBe(false); expect(f.retire()("content-wipe")).toBe(false);
  f.keep.dispose(); // Generic follow-up cleanup cannot cancel the retained write.
  expect(signal.aborted).toBe(false); expect(await result).toMatchObject({ status: "rejected" });
  expect(await f.deleteFirst()).toBeNull();
  pending.resolve(stage === "upload" ? { data: { path: mockUpload.mock.calls[0][0] }, error: null } : sourceReply()); await flush();
  expect(f.facts().every(t => t.outcome === "committed")).toBe(true);
  expect(f.complete).not.toHaveBeenCalled(); expect(f.keep.receipts.getSnapshot()).toEqual([]);
  expect(mockQueries.filter(q => q.insert)).toHaveLength(stage === "source" ? 1 : 0);
  // D3a/A have no ACK reset API. Do not claim that settlement resets a failed handoff.
  expect(await f.deleteFirst()).toBeNull(); expect(f.deletionIO).not.toHaveBeenCalled();
});

test.each(["upload", "source"])("synchronous wipe inside %s dispatch sees a pending ticket and retains its signal", async stage => {
  const f = keepFixture(); let retained = false;
  if (stage === "upload") mockUpload.mockImplementation(async (path, _body, opts) => {
    expect(f.facts().at(-1)?.outcome).toBe("issued-pending");
    expect(f.wipe().ackConfirmed).toBe(false); retained = !opts.signal.aborted;
    return { data: { path }, error: null };
  });
  else mockIO.mockImplementation(q => {
    if (q.insert) { expect(f.wipe().ackConfirmed).toBe(false); retained = !q.signal!.aborted; }
    return defaultIO(q);
  });
  expect(await f.startKeep()).toMatchObject({ status: "rejected" }); await flush();
  expect(retained).toBe(true); expect(f.facts().at(-1)?.outcome).toBe("committed");
  expect(f.complete).not.toHaveBeenCalled();
});

test.each(["auth", "read"])("W02 keep wipe before issue at %s aborts immediately and acknowledges cleanup", async stage => {
  const f = keepFixture(), pending = deferred<unknown>();
  if (stage === "auth") mockAuth.mockReturnValue(pending.promise); else mockIO.mockReturnValue(pending.promise);
  const result = f.startKeep(); await flush();
  const signal = mockQueries[0]?.signal;
  expect(f.wipe().ackConfirmed).toBe(true);
  if (signal) expect(signal.aborted).toBe(true);
  pending.resolve({ data: [], error: null });
  expect(await result).toMatchObject({ status: "rejected" }); await flush();
  expect(f.facts()).toEqual([]); expect(mockUpload).not.toHaveBeenCalled();
  expect(f.complete).not.toHaveBeenCalled(); expect(await f.deleteFirst()).not.toBeNull();
});

test.each(["consent", "hold", "timeout", "wipe-then-hold", "wipe-then-consent"])("%s immediately aborts an issued source, records unknown and accepts only late ledger proof", async cause => {
  jest.useFakeTimers(); const f = keepFixture(), pending = deferred<unknown>();
  mockIO.mockImplementation(q => q.insert ? pending.promise : defaultIO(q));
  const result = f.startKeep(true); await flush();
  const signal = mockQueries.find(q => q.insert)!.signal!;
  if (cause.startsWith("wipe-then")) { f.wipe(); expect(signal.aborted).toBe(false); }
  if (cause.endsWith("consent")) f.consent.abort();
  else if (cause.endsWith("hold")) beginAccountOwnerTransition("b");
  else await jest.advanceTimersByTimeAsync(100);
  expect(signal.aborted).toBe(true); await result;
  if (cause.endsWith("hold")) switchOwner("a");
  expect(f.facts().at(-1)?.outcome).toBe("unknown");
  expect(f.complete).not.toHaveBeenCalled();
  pending.resolve(sourceReply()); await flush();
  expect(f.facts().at(-1)?.outcome).toBe("committed"); expect(f.complete).not.toHaveBeenCalled();
  expect(mockQueries.filter(q => q.insert)).toHaveLength(1);
});

test("W03 source loss blocks deletion, completion and new saves; late proof alone never retries deletion", async () => {
  const f = keepFixture(), acquired = jest.spyOn(f.ledger, "acquireMutation");
  mockIO.mockImplementation(q => q.insert ? Promise.reject(new Error("lost reply")) : defaultIO(q));
  expect(await f.startKeep()).toMatchObject({ receipt: { state: "unknown" } });
  expect(f.facts().at(-1)?.outcome).toBe("unknown"); expect(f.complete).not.toHaveBeenCalled();
  expect(await f.keep.keepExchange(f.input, { reason: "manual", retryUnknown: true })).toMatchObject({ reason: "content-blocked" });
  f.wipe(); expect(await f.deleteFirst()).toBeNull();
  f.ledger.settleMutation(acquired.mock.results.at(-1)!.value, { outcome: "committed" });
  await flush(); expect(f.deletionIO).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled();
  expect(await f.deleteFirst()).not.toBeNull(); expect(mockQueries.filter(q => q.insert)).toHaveLength(1);
});

test("W03 usage loss shares the barrier with capture; late receipt permits only explicit retry", async () => {
  const f = fixture(), lease = beginAccountSessionLease("a"); cleanups.push(lease.release);
  const session = await lease.authenticate(), acquired = jest.spyOn(f.ledger, "acquireMutation");
  const fetch = jest.fn().mockRejectedValue(new Error("lost quota receipt")); globalThis.fetch = fetch;
  await expect(bumpChatUsageIfUnderCap("a", 5, "2026-10-20", { session, observer: { ...f.observer, stepId: "quota" } })).rejects.toThrow();
  expect(f.facts()[0].outcome).toBe("unknown"); f.wipe();
  expect(await f.start()).toHaveProperty("error"); expect(mockUpload).not.toHaveBeenCalled();
  expect(await f.deleteFirst()).toBeNull();
  f.ledger.settleMutation(acquired.mock.results[0].value, { outcome: "committed", count: 1 });
  await flush(); expect(f.deletionIO).not.toHaveBeenCalled();
  expect(await f.deleteFirst()).not.toBeNull(); expect(fetch).toHaveBeenCalledTimes(1);
});

test("W09 old A epoch unknown survives A -> B -> A, exposes no body and blocks the new A wipe", async () => {
  const f = keepFixture(), acquired = jest.spyOn(f.ledger, "acquireMutation");
  mockIO.mockImplementation(q => q.insert ? Promise.reject(new Error("lost")) : defaultIO(q));
  await f.startKeep(); const oldEpoch = f.owner.epoch;
  const b = switchOwner("b"); expect(f.ledger.inspect(b).tickets).toEqual([]);
  switchOwner("a"); expect(f.keep.receipts.getSnapshot()).toEqual([]);
  expect(f.facts().at(-1)).toMatchObject({ ownerEpoch: oldEpoch, outcome: "unknown", generation: 0 });
  expect(JSON.stringify(f.facts())).not.toMatch(/weekend|Take a walk|fixture-a/);
  f.wipe(); expect(await f.deleteFirst()).toBeNull(); expect(f.complete).not.toHaveBeenCalled();
  f.ledger.settleMutation(acquired.mock.results.at(-1)!.value, { outcome: "committed" });
  expect(f.deletionIO).not.toHaveBeenCalled(); expect(await f.deleteFirst()).not.toBeNull();
});

test.each(["upload", "source", "drop", "cleanup"])("malformed %s success remains unknown", async stage => {
  const f = fixture();
  if (stage === "upload") mockUpload.mockResolvedValue({ data: { path: "wrong/path" }, error: null });
  if (stage === "source") mockIO.mockImplementation(q => q.insert ? { data: {}, error: null, status: 201 } : defaultIO(q));
  if (stage === "drop") mockIO.mockImplementation(q => q.insert ? { error: null } : { data: [{ id: "existing", content_hash: contentHash(buildSourcePayload(md).body) }], error: null });
  if (stage === "cleanup") {
    mockIO.mockImplementation(q => q.insert ? { data: null, error: minorError, status: 400 } : defaultIO(q));
    mockRemove.mockResolvedValue({ data: [], error: null });
  }
  expect(await f.start()).toHaveProperty("error");
  expect(f.facts().at(-1)?.outcome).toBe("unknown"); f.wipe(); expect(await f.deleteFirst()).toBeNull();
});

test("exact duplicate records its ingest-drop receipt before returning the survivor", async () => {
  const f = fixture(), pending = deferred<unknown>();
  mockIO.mockImplementation(q => q.insert ? pending.promise : q.columns === "*"
    ? { data: { id: "existing", user_id: "a", storage_path: "a/existing.md" }, error: null }
    : { data: [{ id: "existing", content_hash: contentHash(buildSourcePayload(md).body) }], error: null });
  const result = f.start(); await flush(); expect(f.facts()[0]).toMatchObject({ kind: "ingest-drop", outcome: "issued-pending" });
  pending.resolve({ data: null, error: null, status: 201 });
  expect(await result).toHaveProperty("value.deduped", "exact_duplicate");
  expect(f.facts()[0].outcome).toBe("committed"); expect(mockUpload).not.toHaveBeenCalled();
});

test("wipe during ingest-drop drains its receipt and cannot read or save a late survivor", async () => {
  const f = fixture(), pending = deferred<unknown>();
  mockIO.mockImplementation(q => q.insert ? pending.promise
    : { data: [{ id: "existing", content_hash: contentHash(buildSourcePayload(md).body) }], error: null });
  const result = f.start(); await flush(); f.wipe(); expect(await f.deleteFirst()).toBeNull();
  pending.resolve({ data: null, error: null, status: 201 });
  expect(await result).toHaveProperty("error"); expect(f.facts()[0].outcome).toBe("committed");
  expect(mockQueries.some(q => q.columns === "*")).toBe(false); expect(mockUpload).not.toHaveBeenCalled();
  expect(await f.deleteFirst()).not.toBeNull();
});

test("a custom drop callback without a transport receipt cannot claim committed", async () => {
  const f = fixture(), drop = jest.fn(async () => {});
  f.input.gateDeps = { findCandidates: async () => [{ id: "existing", contentHash: contentHash(buildSourcePayload(md).body) }], recordDrop: drop };
  expect(await f.start()).toHaveProperty("error"); expect(drop).toHaveBeenCalledTimes(1);
  expect(f.facts()[0]).toMatchObject({ kind: "ingest-drop", outcome: "unknown" });
});

test("no observer does not access the drop callback on a nonduplicate capture", async () => {
  const gateDeps = { findCandidates: async () => [], get recordDrop(): never { throw new Error("unused legacy callback"); } };
  await expect(captureFromMarkdown({ userId: "a", rawMd: md, gateDeps })).resolves.toHaveProperty("source.id", "source-a");
});

test("only a verified minor refusal is noncommit; cleanup has its own ticket and receipt", async () => {
  const f = fixture(), pending = deferred<unknown>();
  mockIO.mockImplementation(q => q.insert ? { data: null, error: minorError, status: 400 } : defaultIO(q));
  mockRemove.mockReturnValue(pending.promise);
  const result = f.start(); await flush();
  expect(f.facts().map(t => [t.kind, t.outcome])).toEqual([
    ["raw-upload", "committed"], ["source-insert", "definitely-not-committed"], ["raw-cleanup", "issued-pending"],
  ]);
  f.wipe(); expect(await f.deleteFirst()).toBeNull();
  pending.resolve({ data: [{ name: mockRemove.mock.calls[0][0][0] }], error: null });
  expect(await result).toEqual({ error: minorError });
  expect(f.facts().at(-1)?.outcome).toBe("committed"); expect(await f.deleteFirst()).not.toBeNull();
});

test.each([200, 500])("minor-like error status %i is unknown and cannot initiate cleanup", async status => {
  const f = fixture(); mockIO.mockImplementation(q => q.insert ? { data: null, error: minorError, status } : defaultIO(q));
  expect(await f.start()).toHaveProperty("error");
  expect(f.facts().at(-1)?.outcome).toBe("unknown"); expect(mockRemove).not.toHaveBeenCalled();
});

test.each(["invalid-json", "missing-id", "wrong-key", "wrong-mime", "lost-body"])("original upload receipt %s stays unknown", async mode => {
  const f = fixture();
  mockFetch.mockImplementation(async (url: string) => {
    const key = "raw-clippings/" + decodeURIComponent(url.split("/raw-clippings/")[1]);
    const body = mode === "invalid-json" ? "{" : JSON.stringify({ ...(mode === "missing-id" ? {} : { Id: "storage-id" }), Key: mode === "wrong-key" ? "other/path" : key });
    const response = new Response(body, { headers: { "content-type": mode === "wrong-mime" ? "text/html" : "application/json" } });
    if (mode === "lost-body") jest.spyOn(response, "text").mockRejectedValue(new Error("lost body"));
    return response;
  });
  expect(await f.start()).toHaveProperty("error"); expect(f.facts()[0].outcome).toBe("unknown");
  expect(mockFetch).toHaveBeenCalledTimes(1); f.wipe(); expect(await f.deleteFirst()).toBeNull();
});

test("no observer preserves legacy response, error identity, query order, upload options and inline fallback", async () => {
  const signal = new AbortController().signal, error = new Error("legacy upload failed");
  mockUpload.mockImplementation(async () => { mockEvents.push("upload"); throw error; });
  const result = await captureFromMarkdown({ userId: "a", rawMd: md, signal });
  expect(mockEvents).toEqual(["read:sources", "read:sources", "upload", "insert:sources"]);
  expect(mockUpload.mock.calls[0][2]).toEqual({ contentType: "text/markdown; charset=utf-8", upsert: false });
  expect(result).toEqual({ source: { ...mockQueries.at(-1)!.insert, id: "source-a" }, storage_path: mockUpload.mock.calls[0][0],
    storagePending: true, deduped: null, hadFrontmatter: false, suggested_slug: "weekend" });
  expect(result.source.frontmatter).toMatchObject({ _storage_pending: true, _body_fallback: md });
  const refusal = { message: "minor_import_locked: legacy" };
  mockUpload.mockResolvedValue({ error: null }); mockIO.mockImplementation(q => q.insert ? { error: refusal } : defaultIO(q));
  await expect(captureFromMarkdown({ userId: "a", rawMd: md, signal })).rejects.toBe(refusal);
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
