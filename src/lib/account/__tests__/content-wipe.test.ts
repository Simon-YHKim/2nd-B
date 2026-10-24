import { createContentWipeLedger, type ContentDeletionPermit, type ContentMutationTicket, type ContentSettlement } from "../content-wipe";
import { createChatSessionRegistry } from "../../chat/session-registry";
import { createChatSessionController } from "../../chat/session-controller";
import type { ChatSessionDeps, CapturedChatInput } from "../../chat/session-deps";
import type { SendMessageOk } from "../../chat/conversation";
import { beginAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner, subscribeAccountTransition } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../local-deletion-fence";

const mockGetSession = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
const cleanups: (() => void)[] = [];
let ids = 0;
const deferred = <T,>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function publishOwner(id: string) { noteResolvedOwner(id); clearAccountTransition(currentAccountEpoch()); }
function fixture(newId = () => "session-" + ++ids) {
  const ledger = createContentWipeLedger(), owner = captureAccountOwnerLease("a")!;
  const registry = createChatSessionRegistry(ledger, newId);
  const view = registry.attachView("a", "entry")!;
  cleanups.push(() => registry.dispose());
  return { ledger, owner, registry, session: view.snapshot.session! };
}
type Fixture = ReturnType<typeof fixture>;
const acquire = (f: Fixture, stepId = "step") => f.ledger.acquireMutation(f.owner, f.ledger.read(f.owner).generation,
  { operationId: "operation", stepId, kind: "usage" })!;
function begin(f: Fixture, intent = "intent") { return f.ledger.beginWipe(f.owner, f.ledger.read(f.owner).generation, intent)!; }
function claim(f: Fixture) { const s = f.ledger.read(f.owner); return f.ledger.claimDeletionAttempt(f.owner, s.wipeId!, s.generation); }
async function committedStep(f: Fixture, p: ContentDeletionPermit, stage: string, count = 0) {
  const t = f.ledger.acquireDeletion(f.owner, p, stage)!; expect(t).not.toBeNull();
  const dispatch = jest.fn(async () => true);
  await f.ledger.issueMutation(f.owner, t, dispatch); expect(dispatch).toHaveBeenCalledTimes(1);
  expect(f.ledger.settleMutation(t, { outcome: "committed", count })).toBe(true); return t;
}
async function throughRecords(f: Fixture, count = 0) {
  begin(f); const p = claim(f)!; expect(p).not.toBeNull();
  await committedStep(f, p, "wiki-pages"); await committedStep(f, p, "sources");
  const records = await committedStep(f, p, "records", count);
  return { p, records };
}
async function complete(f: Fixture, derivedFailure = false) {
  const { p, records } = await throughRecords(f);
  expect(f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 0, batchCounts: [] })).toBe(true);
  await committedStep(f, p, "usage");
  if (derivedFailure) {
    const t = f.ledger.acquireDeletion(f.owner, p, "self-contexts")!;
    await f.ledger.issueMutation(f.owner, t, async () => true);
    f.ledger.settleMutation(t, { outcome: "definitely-not-committed" });
  } else await committedStep(f, p, "self-contexts");
  await committedStep(f, p, "clipper-templates");
  return f.ledger.finishWipe(f.owner, p)!;
}
beforeEach(() => {
  __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); noteResolvedOwner("a"); ids = 0;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "a" }, access_token: "synthetic-token" } }, error: null });
});
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); jest.useRealTimers(); jest.restoreAllMocks(); });

test("L01 factory starts no I/O or subscription; foreign factory and copied handles cannot issue or settle", () => {
  const ledger = createContentWipeLedger(); expect(mockGetSession).not.toHaveBeenCalled();
  const f = fixture(), t = acquire(f), dispatch = jest.fn(async () => true);
  expect(ledger.issueMutation(f.owner, t, dispatch)).toBeNull();
  expect(ledger.settleMutation(t, { outcome: "committed" })).toBe(false);
  expect(f.ledger.issueMutation(f.owner, { ...t }, dispatch)).toBeNull();
  expect(f.ledger.settleMutation({ ...t }, { outcome: "committed" })).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
});
test("L02 owner/generation/operation/step mismatches never dispatch", () => {
  const f = fixture();
  expect(f.ledger.acquireMutation(f.owner, 1, { operationId: "op", stepId: "s", kind: "usage" })).toBeNull();
  const t = acquire(f); expect(acquire(f)).toBeNull();
  publishOwner("b"); const b = captureAccountOwnerLease("b")!, dispatch = jest.fn(async () => true);
  expect(f.ledger.issueMutation(b, t, dispatch)).toBeNull(); expect(dispatch).not.toHaveBeenCalled();
  expect(() => f.ledger.inspect(f.owner)).toThrow();
});
test.each(["wipe", "hold", "aba"])("L03/L04 registration publication %s rechecks ownership before handing out a ticket", mode => {
  const f = fixture(); let once = false;
  f.ledger.observe(f.owner, () => {
    if (once) return; once = true;
    if (mode === "wipe") begin(f);
    else { beginAccountOwnerTransition("b"); if (mode === "aba") { publishOwner("b"); publishOwner("a"); } }
  });
  expect(acquire(f)).toBeNull();
  if (mode === "wipe") expect(f.ledger.inspect(f.owner).tickets[0].outcome).toBe("definitely-not-issued");
  expect(mockGetSession).not.toHaveBeenCalled();
});
test("L05 final caller gate can reenter wipe; no dispatch follows", () => {
  const f = fixture(), t = acquire(f), dispatch = jest.fn(async () => true);
  expect(f.ledger.issueMutation(f.owner, t, dispatch, () => { begin(f); return true; })).toBeNull();
  expect(dispatch).not.toHaveBeenCalled(); expect(f.ledger.inspect(f.owner).tickets[0].outcome).toBe("definitely-not-issued");
});
test.each(["hold", "aba"])("L05 final caller gate %s cannot issue using the old owner epoch", mode => {
  const f = fixture(), t = acquire(f), dispatch = jest.fn(async () => true);
  expect(f.ledger.issueMutation(f.owner, t, dispatch, () => {
    beginAccountOwnerTransition("b");
    if (mode === "aba") { publishOwner("b"); publishOwner("a"); }
    return true;
  })).toBeNull();
  expect(dispatch).not.toHaveBeenCalled();
});
test("L05 issued publication occurs after dispatch and can synchronously start a wipe without cancelling an issued fact", async () => {
  const f = fixture(), t = acquire(f), dispatch = jest.fn(async () => true);
  let beforeDispatch = false, once = false;
  f.ledger.observe(f.owner, () => {
    if (once) return; once = true;
    beforeDispatch = dispatch.mock.calls.length === 0; begin(f);
  });
  await f.ledger.issueMutation(f.owner, t, dispatch);
  expect(beforeDispatch).toBe(false); expect(dispatch).toHaveBeenCalledTimes(1);
  expect(claim(f)).toBeNull();
});
test("L06 marking issued precedes dispatch reentry; same ticket issues once and wipe cannot claim", async () => {
  const f = fixture(), t = acquire(f), nested = jest.fn(async () => true);
  const dispatch = jest.fn(async () => {
    expect(f.ledger.inspect(f.owner).tickets[0].outcome).toBe("issued-pending");
    expect(f.ledger.issueMutation(f.owner, t, nested)).toBeNull(); begin(f); expect(claim(f)).toBeNull(); return true;
  });
  await f.ledger.issueMutation(f.owner, t, dispatch);
  expect(dispatch).toHaveBeenCalledTimes(1); expect(nested).not.toHaveBeenCalled();
  f.ledger.settleMutation(t, { outcome: "committed" }); expect(claim(f)).not.toBeNull();
});
test.each(["throw", "reject", "timeout", "malformed"])("L07 %s preserves unknown and denies deletion/new mutation", async mode => {
  const f = fixture(), t = acquire(f);
  const operation = f.ledger.issueMutation(f.owner, t, () => {
    if (mode === "throw") throw new Error("private transport detail");
    if (mode === "reject") return Promise.reject(new Error("private transport detail"));
    return Promise.resolve(true);
  });
  if (mode === "throw" || mode === "reject") await expect(operation).rejects.toThrow();
  else { await operation; f.ledger.settleMutation(t, { outcome: mode === "timeout" ? "unknown" : "not-a-receipt" } as ContentSettlement); }
  expect(f.ledger.inspect(f.owner).tickets[0].outcome).toBe("unknown");
  expect(acquire(f, "new-step")).toBeNull(); begin(f); expect(claim(f)).toBeNull();
  f.registry.dispose(); expect(claim(f)).toBeNull();
  jest.useFakeTimers(); jest.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(claim(f)).toBeNull();
});
test("L08 late original settlement after ABA changes only its fact and never notifies an old observer", async () => {
  const f = fixture(), t = acquire(f), observer = jest.fn();
  await f.ledger.issueMutation(f.owner, t, async () => true);
  f.ledger.settleMutation(t, { outcome: "unknown" }); f.ledger.observe(f.owner, observer);
  publishOwner("b"); const b = captureAccountOwnerLease("b")!;
  expect(f.ledger.inspect(b).tickets).toEqual([]);
  f.ledger.settleMutation(t, { outcome: "committed" });
  expect(observer).not.toHaveBeenCalled(); publishOwner("a");
  const a = captureAccountOwnerLease("a")!;
  expect(f.ledger.inspect(a).tickets[0]).toMatchObject({ ownerEpoch: f.owner.epoch, outcome: "committed" });
  expect(mockGetSession).not.toHaveBeenCalled();
});
test("L09 identical terminal receipt is idempotent; contradictory receipt remains integrity-blocked", async () => {
  const f = fixture(), t = acquire(f);
  await f.ledger.issueMutation(f.owner, t, async () => true);
  expect(f.ledger.settleMutation(t, { outcome: "committed" })).toBe(true);
  expect(f.ledger.settleMutation(t, { outcome: "committed" })).toBe(true);
  expect(f.ledger.settleMutation(t, { outcome: "definitely-not-committed" })).toBe(false);
  begin(f); expect(claim(f)).toBeNull(); expect(f.ledger.inspect(f.owner).integrityBlocked).toBe(true);
});
test.each([false, "throw", "promise", "undefined"])("W05/W06 sticky ACK %s still calls all listeners and blocks reentrant claims", kind => {
  const f = fixture(), last = jest.fn(() => true);
  const nested: unknown[] = [];
  f.ledger.subscribe(f.owner, () => {
    nested.push(claim(f), begin(f, "nested"));
    if (kind === "throw") throw new Error("observer");
    return (kind === "promise" ? Promise.resolve(true) : kind === "undefined" ? undefined : false) as unknown as boolean;
  });
  f.ledger.subscribe(f.owner, last); begin(f);
  expect(nested).toEqual([null, null]);
  expect(last).toHaveBeenCalledTimes(1); expect(claim(f)).toBeNull();
  f.registry.dispose(); expect(claim(f)).toBeNull();
});
test("W07 snapshot fanout cannot skip ACK through unsubscribe; new blocked registry cannot create a body", () => {
  const f = fixture(), last = jest.fn(() => false); let stop = () => {};
  f.ledger.subscribe(f.owner, () => { stop(); return true; }); stop = f.ledger.subscribe(f.owner, last);
  begin(f); expect(last).toHaveBeenCalledTimes(1); expect(claim(f)).toBeNull();
  const next = createChatSessionRegistry(f.ledger, () => "new"); cleanups.push(() => next.dispose());
  expect(next.attachView("a", "new")!.snapshot.session).toBeNull();
});
test("W08 registered-only work becomes not-issued; issued work remains a drain condition", async () => {
  const f = fixture(), first = acquire(f, "first"), second = acquire(f, "second");
  await f.ledger.issueMutation(f.owner, second, async () => true); begin(f);
  expect(f.ledger.inspect(f.owner).tickets.map(t => t.outcome)).toEqual(["definitely-not-issued", "issued-pending"]);
  expect(f.ledger.closeUnissued(first)).toBe(false); expect(claim(f)).toBeNull();
});
test.each(["claim", "registration"])("W04 %s publication rechecks owner before returning deletion authority", mode => {
  const f = fixture(); begin(f);
  const p = mode === "registration" ? claim(f)! : null;
  let once = false;
  f.ledger.observe(f.owner, () => {
    if (once) return; once = true;
    beginAccountOwnerTransition("b"); publishOwner("b"); publishOwner("a");
  });
  if (p) expect(f.ledger.acquireDeletion(f.owner, p, "wiki-pages")).toBeNull();
  else expect(claim(f)).toBeNull();
  const a = captureAccountOwnerLease("a")!, s = f.ledger.read(a);
  const next = f.ledger.claimDeletionAttempt(a, s.wipeId!, s.generation)!;
  expect(next).not.toBeNull();
  const ticket = f.ledger.acquireDeletion(a, next, "wiki-pages")!;
  expect(ticket).not.toBeNull(); expect(mockGetSession).not.toHaveBeenCalled();
});
test("W04 settlement publication cannot begin a new attempt; explicit command after publication can", async () => {
  const f = fixture(), t = acquire(f); await f.ledger.issueMutation(f.owner, t, async () => true); begin(f);
  const nested: unknown[] = [];
  const stop = f.ledger.observe(f.owner, () => { nested.push(claim(f)); });
  f.ledger.settleMutation(t, { outcome: "committed" }); stop();
  expect(nested).toEqual([null]); expect(claim(f)).not.toBeNull();
});
test("W10 unknown across A-B-A allows begin to block the body but refuses all deletion claims", async () => {
  const f = fixture(), t = acquire(f); await f.ledger.issueMutation(f.owner, t, async () => true);
  f.ledger.settleMutation(t, { outcome: "unknown" }); publishOwner("b"); publishOwner("a");
  const a = captureAccountOwnerLease("a")!;
  expect(f.ledger.beginWipe(a, 0, "intent")?.generation).toBe(1);
  const s = f.ledger.read(a); expect(s.phase).toBe("blocked");
  expect(f.ledger.claimDeletionAttempt(a, s.wipeId!, s.generation)).toBeNull();
  expect(f.ledger.startAfterWipe(a, s, () => true)).toBe(false);
});
test("W12 definite core failure retains partial receipt and only explicit retry reissues the failed stage", async () => {
  const f = fixture(); begin(f); const p = claim(f)!; await committedStep(f, p, "wiki-pages", 3);
  const t = f.ledger.acquireDeletion(f.owner, p, "sources")!;
  await f.ledger.issueMutation(f.owner, t, async () => true); f.ledger.settleMutation(t, { outcome: "definitely-not-committed" });
  expect(f.ledger.acquireDeletion(f.owner, p, "sources")).toBeNull();
  expect(f.ledger.acquireDeletion(f.owner, p, "records")).toBeNull();
  expect(f.ledger.finishWipe(f.owner, p)?.phase).toBe("blocked"); const retry = claim(f)!;
  expect(f.ledger.acquireDeletion(f.owner, retry, "wiki-pages")).toBeNull();
  expect(f.ledger.acquireDeletion(f.owner, retry, "sources")).not.toBeNull();
});
test("W13/W18 deletion unknown survives ABA; late settlement grants no next step until explicit new-epoch resume", async () => {
  const f = fixture(); begin(f); const p = claim(f)!, t = f.ledger.acquireDeletion(f.owner, p, "wiki-pages")!;
  await f.ledger.issueMutation(f.owner, t, async () => true); f.ledger.settleMutation(t, { outcome: "unknown" });
  publishOwner("b"); publishOwner("a"); const a = captureAccountOwnerLease("a")!, s = f.ledger.read(a);
  expect(f.ledger.claimDeletionAttempt(a, s.wipeId!, s.generation)).toBeNull();
  f.ledger.settleMutation(t, { outcome: "committed", count: 2 });
  expect(f.ledger.acquireDeletion(a, p, "sources")).toBeNull();
  const resumed = f.ledger.claimDeletionAttempt(a, s.wipeId!, s.generation)!;
  expect(f.ledger.acquireDeletion(a, resumed, "wiki-pages")).toBeNull();
  expect(f.ledger.acquireDeletion(a, resumed, "sources")).not.toBeNull();
});
test.each([false, true])("W14/W15 actual A explicit NULL-session CAS opens only after confirmed core/derived (partial=%s)", async partial => {
  const f = fixture(); const receipt = await complete(f, partial);
  expect(receipt.phase).toBe("needs-explicit-start");
  expect(f.registry.attachView("a", "bare")!.snapshot.session).toBeNull();
  const choice = f.registry.getSnapshot("entry")!.choice;
  expect(f.registry.startAfterWipe({ ...choice, expectedSessionId: "wrong" })).toBe(false);
  expect(f.registry.startAfterWipe(choice)).toBe(true);
  const fresh = f.registry.getSnapshot("entry")!.session!;
  expect(fresh.turns).toEqual([]); expect(fresh.work).toEqual([]); expect(f.registry.getDraftSnapshot(fresh)?.text).toBe("");
  expect(f.ledger.read(f.owner).phase).toBe("open");
  expect(f.ledger.claimDeletionAttempt(f.owner, receipt.wipeId!, receipt.generation)).toBeNull();
  expect(f.registry.startAfterWipe(choice)).toBe(false);
});
test.each(["false", "throw", "promise"])("W16 leaf commit %s keeps original eligible receipt and blocks nested commands", async kind => {
  const f = fixture(); await complete(f); const before = f.ledger.read(f.owner);
  const during: unknown[] = [];
  expect(f.ledger.startAfterWipe(f.owner, before, () => {
    during.push(f.ledger.read(f.owner).phase, begin(f, "nested"), acquire(f, "during-start"));
    if (kind === "throw") throw new Error("commit");
    return (kind === "promise" ? Promise.resolve(true) : false) as unknown as boolean;
  })).toBe(false);
  expect(during).toEqual(["needs-explicit-start", null, null]);
  expect(f.ledger.read(f.owner)).toEqual(before); expect(f.registry.attachView("a", "new")!.snapshot.session).toBeNull();
});
test.each(["throw", "hold", "aba"])("W16 actual A newId %s cannot leak a candidate or enable a later bare attach", async mode => {
  let trigger = false; const f = fixture(() => {
    if (trigger) { trigger = false; if (mode === "throw") throw new Error("id");
      beginAccountOwnerTransition("b"); if (mode === "aba") { publishOwner("b"); publishOwner("a"); } }
    return "id-" + ++ids;
  });
  await complete(f); trigger = true;
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(false);
  if (mode === "hold") { beginAccountOwnerTransition("a"); publishOwner("a"); }
  const a = captureAccountOwnerLease("a")!;
  expect(f.ledger.read(a).phase).toBe("needs-explicit-start");
  expect(f.registry.attachView("a", "new")!.snapshot.session).toBeNull();
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("new")!.choice)).toBe(true);
  expect(f.ledger.read(a).phase).toBe("open");
});
test("W17 new explicit session invalidates old wipe retry and requires a fresh intent", async () => {
  const f = fixture(), receipt = await complete(f, true);
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(true);
  const current = f.registry.getSnapshot("entry")!.session!;
  f.registry.editDraft(current, "new private draft");
  expect(f.ledger.claimDeletionAttempt(f.owner, receipt.wipeId!, receipt.generation)).toBeNull();
  expect(f.registry.getDraftSnapshot(current)?.text).toBe("new private draft");
  expect(begin(f)).toBeNull();
  expect(begin(f, "new-intent").generation).toBe(2);
});
test("W16 A removes a fully constructed candidate when the producer rejects commit after synchronous reentry", async () => {
  let trigger = false, t: ContentMutationTicket;
  const f = fixture(() => {
    if (trigger) { trigger = false; f.ledger.settleMutation(t, { outcome: "definitely-not-committed" }); }
    return "candidate-" + ++ids;
  });
  t = acquire(f); await f.ledger.issueMutation(f.owner, t, async () => true);
  f.ledger.settleMutation(t, { outcome: "committed" }); await complete(f);
  trigger = true;
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(false);
  expect(f.registry.getSnapshot("entry")!.session).toBeNull();
  expect(f.registry.attachView("a", "later")!.snapshot.session).toBeNull();
  expect(f.ledger.read(f.owner).phase).toBe("blocked");
});
test("P01/P02 records count is separate: first of 100+1 photo batches unknown blocks usage/derived/attempt/start", async () => {
  const f = fixture(), { p, records } = await throughRecords(f, 101);
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 101, batchCounts: [100, 1] });
  const batches = f.ledger.inspect(f.owner).recordPhotos!.batches;
  const t = f.ledger.acquireDeletion(f.owner, p, batches[0].id)!;
  await f.ledger.issueMutation(f.owner, t, async () => true); f.ledger.settleMutation(t, { outcome: "unknown" });
  expect(f.ledger.inspect(f.owner).tickets.find(x => x.stepId.endsWith(":records"))?.count).toBe(101);
  expect(f.ledger.inspect(f.owner).recordPhotos?.complete).toBe(false);
  for (const stage of [batches[1].id, "usage", "self-contexts", "clipper-templates"]) expect(f.ledger.acquireDeletion(f.owner, p, stage)).toBeNull();
  expect(claim(f)).toBeNull(); expect(f.ledger.finishWipe(f.owner, p)).toBeNull();
});
test("P03/P05 photo late success after ABA retains logical IDs and resume only issues the unattempted third batch", async () => {
  const f = fixture(), { p, records } = await throughRecords(f, 201);
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 201, batchCounts: [100, 100, 1] });
  const batches = f.ledger.inspect(f.owner).recordPhotos!.batches;
  const first = f.ledger.acquireDeletion(f.owner, p, batches[0].id)!;
  await f.ledger.issueMutation(f.owner, first, async () => true);
  f.ledger.settleMutation(first, { outcome: "committed", scopeConfirmed: true, observedRemovedCount: 100 });
  const second = f.ledger.acquireDeletion(f.owner, p, batches[1].id)!;
  await f.ledger.issueMutation(f.owner, second, async () => true); f.ledger.settleMutation(second, { outcome: "unknown" });
  publishOwner("b"); const b = captureAccountOwnerLease("b")!; expect(f.ledger.inspect(b).recordPhotos).toBeNull();
  f.ledger.settleMutation(second, { outcome: "committed", scopeConfirmed: true, observedRemovedCount: 100 });
  publishOwner("a"); const a = captureAccountOwnerLease("a")!, state = f.ledger.read(a);
  expect(f.ledger.acquireDeletion(a, p, batches[2].id)).toBeNull();
  const resume = f.ledger.claimDeletionAttempt(a, state.wipeId!, state.generation)!;
  expect(f.ledger.acquireDeletion(a, resume, batches[0].id)).toBeNull();
  expect(f.ledger.acquireDeletion(a, resume, batches[1].id)).toBeNull();
  expect(f.ledger.acquireDeletion(a, resume, batches[2].id)).not.toBeNull();
});
test("P04 definite photo refusal is required core incomplete; explicit retry preserves manifest and skips DB", async () => {
  const f = fixture(), { p, records } = await throughRecords(f, 1);
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 1, batchCounts: [1] });
  const batch = f.ledger.inspect(f.owner).recordPhotos!.batches[0], t = f.ledger.acquireDeletion(f.owner, p, batch.id)!;
  await f.ledger.issueMutation(f.owner, t, async () => true); f.ledger.settleMutation(t, { outcome: "definitely-not-committed" });
  expect(f.ledger.acquireDeletion(f.owner, p, batch.id)).toBeNull();
  expect(f.ledger.acquireDeletion(f.owner, p, "usage")).toBeNull();
  expect(f.ledger.finishWipe(f.owner, p)?.phase).toBe("blocked");
  const retry = claim(f)!;
  expect(f.ledger.acquireDeletion(f.owner, retry, "records")).toBeNull();
  expect(f.ledger.acquireDeletion(f.owner, retry, batch.id)).not.toBeNull();
});
test("P06 DB commit publication and missing/malformed plan never permit a false empty-photo completion", async () => {
  const f = fixture(); begin(f); const p = claim(f)!;
  await committedStep(f, p, "wiki-pages"); await committedStep(f, p, "sources");
  const seen: string[] = [], nested: unknown[] = [];
  const stop = f.ledger.observe(f.owner, () => { seen.push(f.ledger.read(f.owner).phase); nested.push(f.ledger.finishWipe(f.owner, p)); });
  const records = await committedStep(f, p, "records", 2); stop();
  expect(nested).toEqual([null, null, null]);
  expect(seen.every(x => x === "blocked")).toBe(true);
  expect(f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 1, batchCounts: [] })).toBe(false);
  expect(f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 2, batchCounts: [101] })).toBe(false);
  expect(f.ledger.acquireDeletion(f.owner, p, "usage")).toBeNull();
});
test.each([{}, { scopeConfirmed: true, observedRemovedCount: 0 }, { observedRemovedCount: 1 }])("P06 incomplete Storage proof %# stays unknown", async proof => {
  const f = fixture(), { p, records } = await throughRecords(f, 1);
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 1, batchCounts: [1] });
  const t = f.ledger.acquireDeletion(f.owner, p, f.ledger.inspect(f.owner).recordPhotos!.batches[0].id)!;
  await f.ledger.issueMutation(f.owner, t, async () => true); f.ledger.settleMutation(t, { outcome: "committed", ...proof } as ContentSettlement);
  expect(f.ledger.inspect(f.owner).recordPhotos!.complete).toBe(false);
  expect(f.ledger.acquireDeletion(f.owner, p, "usage")).toBeNull();
});
test("P06 manifest loss never reconstructs paths from a repeated records DELETE; snapshots contain metadata only", async () => {
  const f = fixture(), { p, records } = await throughRecords(f, 1);
  const privateManifest = ["a/photo-private-id.jpg"];
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 1, batchCounts: [privateManifest.length] });
  expect(f.ledger.loseRecordPhotoManifest(records)).toBe(true);
  expect(f.ledger.acquireDeletion(f.owner, p, f.ledger.inspect(f.owner).recordPhotos!.batches[0].id)).toBeNull();
  expect(f.ledger.acquireDeletion(f.owner, p, "records")).toBeNull(); expect(f.ledger.acquireDeletion(f.owner, p, "usage")).toBeNull();
  const serialized = JSON.stringify(f.ledger.inspect(f.owner));
  for (const secret of [privateManifest[0], "synthetic-token", "private draft", "structured", "Authorization"]) expect(serialized).not.toContain(secret);
});
test.each(["wiki-pages", "photo", "self-contexts", "clipper-templates"].flatMap(stage =>
  ["not-issued", "definite-failure"].map(outcome => ({ stage, outcome }))))(
  "R2 $stage / $outcome consumes its physical step until a new explicit attempt", async ({ stage, outcome }) => {
    const f = fixture(); let p: ContentDeletionPermit, physicalStage = stage;
    if (stage === "wiki-pages") { begin(f); p = claim(f)!; }
    else {
      const prepared = await throughRecords(f, stage === "photo" ? 1 : 0); p = prepared.p;
      f.ledger.registerRecordPhotoPlan(prepared.records, { returnedRowCount: stage === "photo" ? 1 : 0,
        batchCounts: stage === "photo" ? [1] : [] });
      if (stage === "photo") physicalStage = f.ledger.inspect(f.owner).recordPhotos!.batches[0].id;
      else { await committedStep(f, p, "usage"); if (stage === "clipper-templates") await committedStep(f, p, "self-contexts"); }
    }
    const first = f.ledger.acquireDeletion(f.owner, p, physicalStage)!;
    const dispatch = jest.fn(async () => true);
    if (outcome === "not-issued") expect(f.ledger.issueMutation(f.owner, first, dispatch, () => false)).toBeNull();
    else { await f.ledger.issueMutation(f.owner, first, dispatch); f.ledger.settleMutation(first, { outcome: "definitely-not-committed" }); }
    const originalDispatches = outcome === "not-issued" ? 0 : 1;
    expect(f.ledger.acquireDeletion(f.owner, p, physicalStage)).toBeNull();
    expect(f.ledger.issueMutation(f.owner, first, dispatch)).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(originalDispatches);
    const oldFacts = f.ledger.inspect(f.owner).tickets;
    expect(f.ledger.finishWipe(f.owner, p)).not.toBeNull();
    const next = claim(f)!; expect(next).not.toBeNull(); expect(next).not.toBe(p);
    const retry = f.ledger.acquireDeletion(f.owner, next, physicalStage)!; expect(retry).not.toBeNull();
    await f.ledger.issueMutation(f.owner, retry, dispatch);
    f.ledger.settleMutation(retry, stage === "photo"
      ? { outcome: "committed", scopeConfirmed: true, observedRemovedCount: 1 } : { outcome: "committed", count: 0 });
    expect(dispatch).toHaveBeenCalledTimes(originalDispatches + 1);
    const facts = f.ledger.inspect(f.owner).tickets;
    expect(facts.slice(0, oldFacts.length)).toEqual(oldFacts);
    expect(new Set(facts.map(t => t.operationId + ":" + t.stepId)).size).toBe(facts.length);
  });
test.each(["single-hole", "leading-hole", "trailing-hole"])("R2 %s photo metadata is rejected without consuming the repairable plan", async kind => {
  const f = fixture(), { p, records } = await throughRecords(f, 1);
  const batchCounts = new Array<number>(kind === "single-hole" ? 1 : 2);
  if (kind === "leading-hole") batchCounts[1] = 1;
  if (kind === "trailing-hole") batchCounts[0] = 1;
  expect(f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 1, batchCounts })).toBe(false);
  expect(f.ledger.inspect(f.owner).recordPhotos).toMatchObject({ planState: "unconfirmed", complete: false });
  expect(() => f.ledger.acquireDeletion(f.owner, p, "usage")).not.toThrow();
  expect(f.ledger.acquireDeletion(f.owner, p, "usage")).toBeNull();
  expect(f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 1, batchCounts: [1] })).toBe(true);
  expect(f.ledger.inspect(f.owner).recordPhotos).toMatchObject({ planState: "known-batches", complete: false, expectedBatchCount: 1 });
});

// This is an explicit C3 supervisor fixture, not the unimplemented production adapter.
// Actual A/B, account epoch, pending/authenticated lease and leaf execute; only auth,
// terminal transport and the future supervisor's phase wiring are supplied here.
function operationFixture(write: boolean, onBegin?: (f: Fixture) => void, onRetire?: () => void) {
  const f = fixture(), transport = deferred<number>(), model = jest.fn(), effects = jest.fn();
  let ticket: ContentMutationTicket | null = null, raw: ReturnType<typeof beginAccountSessionLease> | null = null;
  let releaseRequested = false, inFlight = false, released = false, bodyOpen = true;
  const release = jest.fn(() => { raw!.release(); });
  let stopTransition = () => {};
  const maybeRelease = () => { if (releaseRequested && !inFlight && !released) { released = true; stopTransition(); release(); } };
  const deps: ChatSessionDeps = {
    readAdmission: () => ({ ready: true, ordinaryAllowed: true, locale: "en", minor: false, tier: "free", recovery: "legacy",
      errors: { request: "Request", presentation: "Display", consent_required: "Consent", consent_check_unavailable: "Unavailable" } }),
    beginOperation(owner, session, operationId) {
      raw = beginAccountSessionLease(owner.ownerId);
      stopTransition = subscribeAccountTransition(() => {
        if (!owner.isCurrent()) { raw!.abort(); if (ticket) f.ledger.settleMutation(ticket, { outcome: "unknown" }); }
      });
      const send = async (input: CapturedChatInput): Promise<SendMessageOk> => {
        expect(input.session.signal).toBe(raw!.signal); expect(input.session.accessToken).toBe("synthetic-token");
        inFlight = true;
        try {
          let work = transport.promise;
          if (write) {
            ticket = f.ledger.acquireMutation(owner, session.contentGeneration, { operationId, stepId: "quota", kind: "usage" })!;
            work = f.ledger.issueMutation(owner, ticket, () => transport.promise)!;
          }
          const count = await work;
          if (ticket) f.ledger.settleMutation(ticket, { outcome: "committed" });
          raw!.assertCurrent();
          if (!bodyOpen || !f.registry.isCurrent(session)) throw new Error("body closed");
          model();
          return { status: "ok", used: count, limit: 5, remaining: 5 - count,
            reply: { text: "Response", safety: { zone: "green", matched: [], categories: [] }, audit: {} as SendMessageOk["reply"]["audit"] } };
        } finally { inFlight = false; maybeRelease(); }
      };
      const supervisor = { lease: raw, send, auditLocalRed: send,
        retire(reason: string) { bodyOpen = false; onRetire?.(); if (reason !== "content-wipe" || !ticket) raw!.abort(); return true; },
        release() { releaseRequested = true; maybeRelease(); } };
      onBegin?.(f);
      return supervisor;
    },
    publishCrisisNotice: jest.fn(), consentError: () => null, holdThinking: () => () => {},
  };
  const controller = createChatSessionController(f.registry, deps, () => "op-" + ++ids);
  controller.subscribeCompletion(effects); cleanups.push(() => { controller.dispose(); stopTransition(); });
  f.registry.editDraft(f.session, "Hello");
  const send = () => controller.send({ session: f.session, text: "Hello", expectedDraftRevision: f.registry.getDraftSnapshot(f.session)!.revision });
  return { ...f, transport, model, effects, release, controller, send, raw: () => raw!, ticket: () => ticket! };
}
test.each([false, true])("W01/W02/W03 actual A/B + real lease content wipe preserves only an issued mutation signal (write=%s)", async write => {
  const f = operationFixture(write); expect(mockGetSession).not.toHaveBeenCalled();
  expect(f.send().accepted).toBe(true); await flush(); begin(f);
  expect(f.registry.getSessionSnapshot(f.session)).toBeNull(); expect(f.registry.getDraftSnapshot(f.session)).toBeNull();
  expect(f.raw().signal.aborted).toBe(!write);
  if (write) { expect(claim(f)).toBeNull(); expect(f.ledger.inspect(f.owner).ackConfirmed).toBe(true); }
  f.transport.resolve(1); await flush();
  expect(f.model).not.toHaveBeenCalled(); expect(f.effects).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
  if (write) { expect(f.ledger.inspect(f.owner).tickets[0].outcome).toBe("committed"); expect(claim(f)).not.toBeNull(); }
});
test("W09/W11 actual pre-publication hold aborts real transport immediately and preserves unknown before owner publish", async () => {
  const f = operationFixture(true); f.send(); await flush();
  beginAccountOwnerTransition("b"); expect(f.raw().signal.aborted).toBe(true);
  publishOwner("b"); const b = captureAccountOwnerLease("b")!;
  expect(f.ledger.inspect(b).tickets).toEqual([]);
  f.transport.resolve(1); await flush(); expect(f.model).not.toHaveBeenCalled(); expect(f.effects).not.toHaveBeenCalled();
  expect(f.release).toHaveBeenCalledTimes(1); publishOwner("a"); const a = captureAccountOwnerLease("a")!;
  expect(f.ledger.inspect(a).tickets[0].outcome).toBe("committed");
});
test("W05 actual B constructor reentry leaves false ACK sticky even after the returned supervisor retires", async () => {
  const f = operationFixture(false, x => { begin(x); }); f.send(); await flush();
  expect(mockGetSession).not.toHaveBeenCalled(); expect(f.ledger.inspect(f.owner).ackConfirmed).toBe(false);
  expect(claim(f)).toBeNull(); expect(f.release).toHaveBeenCalledTimes(1);
});
test("W05 actual B retire reentry keeps its false ACK after the mutation settles", async () => {
  let reenter = () => {}; const nested: boolean[] = [];
  const f = operationFixture(true, undefined, () => reenter()); f.send(); await flush();
  reenter = () => { reenter = () => {}; nested.push(f.controller.dispose()); };
  begin(f); expect(nested).toEqual([false]); expect(f.ledger.inspect(f.owner).ackConfirmed).toBe(false);
  f.transport.resolve(1); await flush();
  expect(f.release).toHaveBeenCalledTimes(1); expect(claim(f)).toBeNull();
});
test("P05 actual photo ticket and real lease abort on hold; late receipt waits for an explicit new epoch permit", async () => {
  const f = fixture(), { p, records } = await throughRecords(f, 101);
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 101, batchCounts: [100, 1] });
  const batches = f.ledger.inspect(f.owner).recordPhotos!.batches;
  const ticket = f.ledger.acquireDeletion(f.owner, p, batches[0].id)!;
  const raw = beginAccountSessionLease("a"); await raw.authenticate(); cleanups.push(() => raw.release());
  cleanups.push(subscribeAccountTransition(() => {
    if (!f.owner.isCurrent()) { raw.abort(); f.ledger.settleMutation(ticket, { outcome: "unknown" }); }
  }));
  const transport = deferred<number>(), dispatch = jest.fn(() => transport.promise);
  const work = f.ledger.issueMutation(f.owner, ticket, dispatch)!;
  beginAccountOwnerTransition("b"); expect(raw.signal.aborted).toBe(true);
  publishOwner("b"); const b = captureAccountOwnerLease("b")!; expect(f.ledger.inspect(b).tickets).toEqual([]);
  transport.resolve(100); await work;
  f.ledger.settleMutation(ticket, { outcome: "committed", scopeConfirmed: true, observedRemovedCount: 100 });
  publishOwner("a"); const a = captureAccountOwnerLease("a")!, state = f.ledger.read(a);
  expect(dispatch).toHaveBeenCalledTimes(1); expect(f.ledger.acquireDeletion(a, p, batches[1].id)).toBeNull();
  const next = f.ledger.claimDeletionAttempt(a, state.wipeId!, state.generation)!;
  expect(f.ledger.acquireDeletion(a, next, batches[1].id)).not.toBeNull();
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test.each(["not-attempted", "unknown"])("W14 derived %s never allows an explicit fresh start", async status => {
  const f = fixture(), { p, records } = await throughRecords(f);
  f.ledger.registerRecordPhotoPlan(records, { returnedRowCount: 0, batchCounts: [] });
  await committedStep(f, p, "usage");
  if (status === "unknown") {
    const ticket = f.ledger.acquireDeletion(f.owner, p, "self-contexts")!;
    await f.ledger.issueMutation(f.owner, ticket, async () => true); f.ledger.settleMutation(ticket, { outcome: "unknown" });
  }
  f.ledger.finishWipe(f.owner, p); expect(f.ledger.read(f.owner).phase).toBe("blocked");
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(false);
});
