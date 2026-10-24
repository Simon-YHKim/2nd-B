import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createChatSessionAutosave } from "../session-autosave";
import { createChatSessionController } from "../session-controller";
import { createChatSessionRegistry } from "../session-registry";
import { createChatSessionKeep, snapshotKeepExchange } from "../session-keep";
import type { ChatCompletionEvent, ChatSessionDeps } from "../session-deps";
import type { SendMessageOk, SendMessageResult } from "../conversation";
import type { SessionTurn } from "../session-types";
import { createContentWipeLedger } from "../../account/content-wipe";
import { beginAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, captureAccountOwnerLease,
  clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import { beginPrivacyChange, commitPrivacyChange, resetPrivacyChangesForTests } from "../../privacy/changes";
import * as privacyChanges from "../../privacy/changes";
import { defaultPrivacyPrefs } from "../../privacy/prefs";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice } from "../../safety/crisis-notice";
import type { CaptureInput, CaptureResult } from "../../wiki/capture";
import { prepareSavedDataDeletion } from "../../wiki/saved-data-changes";

const mockPrefs = jest.fn(), mockCapture = jest.fn(), mockReadSources = jest.fn();
jest.mock("../../supabase/privacy", () => ({ fetchPrivacyPrefs: (id: string) => mockPrefs(id) }));
jest.mock("../../wiki/capture", () => ({ captureFromMarkdown: (input: CaptureInput) => mockCapture(input) }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: "a" }, access_token: "test-only" } }, error: null }) },
  from: () => {
    const builder = { select: () => builder, eq: () => builder, in: () => builder,
      abortSignal: () => builder, then: (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) => mockReadSources().then(yes, no) };
    return builder;
  },
}) }));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
const prefs = (enabled: boolean) => ({ ...defaultPrivacyPrefs(), chat_autosave: enabled });
const result = (): CaptureResult => ({ source: { id: "source-a", user_id: "a", kind: "self_knowledge", title: "Weekend",
  source_url: null, storage_path: "a/weekend.md", frontmatter: {}, tags: [], simon_relevance: null,
  ingested: false, ingested_at: null, captured_at: "2026-10-24T00:00:00Z" },
  storage_path: "a/weekend.md", hadFrontmatter: false, suggested_slug: "weekend", storagePending: false, deduped: null });
const reply = (): SendMessageOk => ({ status: "ok", used: 1, limit: 5, remaining: 4,
  reply: { text: "A walk could fit your weekend.", safety: { zone: "green", matched: [], categories: [] }, audit: {} as SendMessageOk["reply"]["audit"] } });
const display = { speaker: "HustleK", locale: "en" as const, minor: false };
const cleanups: (() => void)[] = [];
function consent(enabled: boolean, ownerId = "a") {
  const revision = beginPrivacyChange(ownerId, { chat_autosave: enabled });
  commitPrivacyChange(ownerId, revision, { chat_autosave: enabled });
}
function pair(exchangeId: string, sequence: number): SessionTurn[] {
  return [{ id: `${exchangeId}-prompt`, exchangeId, sequence, role: "user", text: "My weekend plan" },
    { id: `${exchangeId}-reply`, exchangeId, sequence: sequence + 1, role: "secondb", text: "A walk could fit." }];
}
function fixture() {
  const ledger = createContentWipeLedger(), registry = createChatSessionRegistry(ledger);
  const view = registry.attachView("a", "entry")!, session = view.snapshot.session!;
  const responses: ReturnType<typeof deferred<SendMessageResult>>[] = [];
  const deps: ChatSessionDeps = {
    readAdmission: () => ({ ready: true, ordinaryAllowed: true, recovery: "legacy", locale: "en", minor: false, tier: "free",
      errors: { request: "Failed", presentation: "Display failed", consent_required: "Consent needed", consent_check_unavailable: "Unavailable" } }),
    beginOperation: owner => {
      const lease = beginAccountSessionLease(owner.ownerId), response = deferred<SendMessageResult>();
      responses.push(response);
      return { lease, send: () => response.promise, auditLocalRed: async () => ({ ...reply(), used: null, limit: null, remaining: null,
        reply: { ...reply().reply, text: "Call 988.", safety: { zone: "red", matched: [], categories: ["crisis"] } } }),
        retire: () => { lease.abort(); return true; }, release: () => lease.release() };
    },
    holdThinking: () => () => {}, publishCrisisNotice, consentError: () => null,
  };
  const controller = createChatSessionController(registry, deps);
  const keep = createChatSessionKeep(registry, session, { ledger });
  const completions = new Set<(event: ChatCompletionEvent) => void>();
  const source = { subscribeCompletion(listener: (event: ChatCompletionEvent) => void) {
    completions.add(listener); const stop = controller.subscribeCompletion(listener);
    return () => { completions.delete(listener); stop(); };
  } };
  const auto = createChatSessionAutosave(registry, session, source, keep, display);
  const notices = jest.fn(); keep.subscribeCompletion(notices);
  function event(exchangeId: string): ChatCompletionEvent {
    const turns = registry.getSessionSnapshot(session)!.turns.filter(t => t.exchangeId === exchangeId);
    return { session, operation: { id: `op-${exchangeId}`, exchangeId, promptTurnId: turns[0].id, responseTurnId: turns[1].id,
      kind: "send", stage: "answered", outcome: "reply", retry: "none", redNoticeEmitted: false } };
  }
  const emit = (value: ChatCompletionEvent) => { for (const listener of completions) listener(value); };
  function add(exchangeId = "e", sequence = registry.getNextSequence(session)!) {
    expect(registry.replaceTurns(session, [...registry.getSessionSnapshot(session)!.turns, ...pair(exchangeId, sequence)])).toBe(true);
    return event(exchangeId);
  }
  const manual = (exchangeId = "e") => keep.keepExchange(snapshotKeepExchange(registry.getSessionSnapshot(session)!, exchangeId, display)!, { reason: "manual" });
  function send(text = "My weekend plan") {
    registry.editDraft(session, text);
    return controller.send({ session, text, expectedDraftRevision: registry.getDraftSnapshot(session)!.revision });
  }
  cleanups.push(() => { auto.dispose(); keep.dispose(); controller.dispose(); registry.dispose(); });
  return { ledger, registry, view, session, controller, keep, auto, notices, responses, completions, add, event, emit, manual, send };
}
beforeEach(() => {
  __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); resetPrivacyChangesForTests(); noteResolvedOwner("a");
  mockPrefs.mockReset().mockResolvedValue(prefs(true)); mockCapture.mockReset().mockResolvedValue(result());
  mockReadSources.mockReset().mockResolvedValue({ data: [{ id: "source-a" }], error: null });
});
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup());
  const notice = getCrisisNotice(); if (notice) dismissCrisisNotice(notice.id);
  jest.restoreAllMocks();
});

test("one hydration and real controller completion survive detach; reattach causes no I/O or replay", async () => {
  const f = fixture(); expect(mockPrefs).not.toHaveBeenCalled();
  const hydrated = f.auto.hydrate(); expect(f.auto.hydrate()).toBe(hydrated); await hydrated;
  expect(f.send().accepted).toBe(true); await flush();
  f.registry.detachView(f.view.viewId);
  f.responses[0].resolve(reply()); await flush();
  expect(mockCapture).toHaveBeenCalledTimes(1); expect(f.notices).toHaveBeenCalledTimes(1);
  expect(f.keep.receipts.get(f.registry.getSessionSnapshot(f.session)!.turns[0].exchangeId)?.state).toBe("present");
  f.registry.attachView("a", "entry"); await f.auto.hydrate(); await flush();
  expect(mockPrefs).toHaveBeenCalledTimes(2); expect(mockCapture).toHaveBeenCalledTimes(1);
});

test.each(["unknown", "off"])("%s completion and an older pending prompt never become a grant backlog", async mode => {
  mockPrefs.mockResolvedValue(prefs(false)); const f = fixture();
  if (mode === "off") await f.auto.hydrate();
  const old = f.add("old"); f.emit(old);
  expect(f.send().accepted).toBe(true); await flush();
  mockPrefs.mockResolvedValue(prefs(true)); consent(true);
  f.emit(old); f.responses[0].resolve(reply()); await flush();
  expect(mockCapture).not.toHaveBeenCalled();
  f.emit(f.add("new")); await flush(); expect(mockCapture).toHaveBeenCalledTimes(1);
});

test("late hydration skips a prompt reserved during the read", async () => {
  const held = deferred<ReturnType<typeof prefs>>(); mockPrefs.mockReturnValueOnce(held.promise);
  const f = fixture(), hydration = f.auto.hydrate();
  expect(f.send().accepted).toBe(true); await flush(); held.resolve(prefs(true)); await hydration;
  f.responses[0].resolve(reply()); await flush(); expect(mockCapture).not.toHaveBeenCalled();
});

test("late hydration cannot undo immediate OFF even when its write never commits", async () => {
  const held = deferred<ReturnType<typeof prefs>>(); mockPrefs.mockReturnValueOnce(held.promise);
  const f = fixture(), hydration = f.auto.hydrate(); beginPrivacyChange("a", { chat_autosave: false });
  held.resolve(prefs(true)); await hydration; f.emit(f.add()); await flush();
  expect(mockCapture).not.toHaveBeenCalled(); expect(mockPrefs).toHaveBeenCalledTimes(1);
});

test("failed hydration stays disabled and is not retried by reattach", async () => {
  mockPrefs.mockRejectedValueOnce(new Error("offline")); const f = fixture(); await f.auto.hydrate();
  f.emit(f.add()); await f.auto.hydrate(); await flush(); expect(mockCapture).not.toHaveBeenCalled();
  expect(mockPrefs).toHaveBeenCalledTimes(1); consent(true); f.emit(f.add("later")); await flush();
  expect(mockCapture).toHaveBeenCalledTimes(1);
});

test("fresh remote OFF closes the grant before keep", async () => {
  const f = fixture(); await f.auto.hydrate(); mockPrefs.mockResolvedValue(prefs(false));
  f.emit(f.add()); await flush(); expect(mockCapture).not.toHaveBeenCalled();
  mockPrefs.mockResolvedValue(prefs(true)); f.emit(f.add("later")); await flush(); expect(mockCapture).not.toHaveBeenCalled();
});

test.each(["off", "aba", "wipe", "dispose"])("consent read cannot start a keep after %s", async action => {
  const f = fixture(); await f.auto.hydrate(); const held = deferred<ReturnType<typeof prefs>>();
  mockPrefs.mockReturnValueOnce(held.promise); const event = f.add(); f.emit(event);
  if (action === "off") { consent(false); consent(true); }
  if (action === "aba") {
    beginAccountOwnerTransition("b"); noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch());
    beginAccountOwnerTransition("a"); noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch());
  }
  if (action === "wipe") f.ledger.beginWipe(captureAccountOwnerLease("a")!, 0, "wipe");
  if (action === "dispose") f.auto.dispose();
  held.resolve(prefs(true)); await flush(); f.emit(event); await flush(); expect(mockCapture).not.toHaveBeenCalled();
});

test.each(["off", "account"])("an issued auto keep aborts immediately on %s", async action => {
  const held = deferred<CaptureResult>(); mockCapture.mockReturnValueOnce(held.promise);
  const f = fixture(); await f.auto.hydrate(); f.emit(f.add()); await flush();
  const input = mockCapture.mock.calls[0][0] as CaptureInput; expect(input.signal?.aborted).toBe(false);
  if (action === "off") consent(false); else beginAccountOwnerTransition("b");
  expect(input.signal?.aborted).toBe(true); held.resolve(result()); await flush(); expect(f.notices).not.toHaveBeenCalled();
});

test.each(["read", "capture"])("a failed %s is not replayed by duplicate completion, reattach or OFF/ON", async failure => {
  const f = fixture(); await f.auto.hydrate();
  if (failure === "read") mockPrefs.mockRejectedValueOnce(new Error("offline"));
  else mockCapture.mockRejectedValueOnce(new Error("unconfirmed"));
  const event = f.add(); f.emit(event); await flush(); const calls = mockCapture.mock.calls.length;
  f.emit(event); f.registry.detachView(f.view.viewId); f.registry.attachView("a", "entry"); consent(false); consent(true); f.emit(event);
  await flush(); expect(mockCapture).toHaveBeenCalledTimes(calls); expect(mockPrefs).toHaveBeenCalledTimes(2);
});

test("sequence grant uses the retained high-water mark after turns are removed", async () => {
  mockPrefs.mockResolvedValue(prefs(false)); const f = fixture(); await f.auto.hydrate();
  const old = f.add("old", 10); const turns = f.registry.getSessionSnapshot(f.session)!.turns;
  expect(f.registry.replaceTurns(f.session, [])).toBe(true); expect(f.registry.getNextSequence(f.session)).toBe(12);
  mockPrefs.mockResolvedValue(prefs(true)); consent(true); expect(f.registry.replaceTurns(f.session, turns)).toBe(true);
  f.emit(old); await flush(); expect(mockCapture).not.toHaveBeenCalled();
  f.emit(f.add("new", 12)); await flush(); expect(mockCapture).toHaveBeenCalledTimes(1);
});

test("repeated ON and another owner's OFF do not cancel a valid ticket or move the grant", async () => {
  const f = fixture(); await f.auto.hydrate(); const held = deferred<ReturnType<typeof prefs>>();
  mockPrefs.mockReturnValueOnce(held.promise); f.emit(f.add()); consent(true); consent(false, "b");
  held.resolve(prefs(true)); await flush(); expect(mockCapture).toHaveBeenCalledTimes(1);
});

test.each(["owner", "epoch", "content", "session", "generation", "prompt", "reply", "blocked", "pending"])("rejects a mismatched %s completion", async mismatch => {
  const f = fixture(); await f.auto.hydrate(); const event = f.add();
  const changed = { ...event, session: { ...event.session }, operation: { ...event.operation } };
  if (mismatch === "owner") changed.session.ownerId = "b";
  if (mismatch === "epoch") changed.session.ownerEpoch += 1;
  if (mismatch === "content") changed.session.contentGeneration += 1;
  if (mismatch === "session") changed.session.sessionId = "other";
  if (mismatch === "generation") changed.session.sessionGeneration += 1;
  if (mismatch === "prompt") changed.operation.promptTurnId = "other";
  if (mismatch === "reply") changed.operation.responseTurnId = "other";
  if (mismatch === "blocked") changed.operation.outcome = "blocked";
  if (mismatch === "pending") changed.operation.stage = "requesting";
  f.emit(changed); await flush(); expect(mockCapture).not.toHaveBeenCalled();
});

test("local RED final completion keeps the existing opt-in fixed-guidance meaning", async () => {
  const f = fixture(); await f.auto.hydrate(); expect(f.send("I want to kill myself").accepted).toBe(true);
  await flush(); expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(f.keep.receipts.get(f.registry.getSessionSnapshot(f.session)!.turns[0].exchangeId)?.aiReuse.state).toBe("hold-required");
});

test("manual cancels a pending consent check and saves explicitly without an auto claim", async () => {
  const f = fixture(); await f.auto.hydrate(); const held = deferred<ReturnType<typeof prefs>>();
  const keepCalls = jest.spyOn(f.keep, "keepExchange");
  mockPrefs.mockReturnValueOnce(held.promise); const event = f.add(); f.emit(event);
  expect(f.registry.getSessionSnapshot(f.session)!.work).toHaveLength(0);
  expect(f.auto.cancelPendingConsent("e")).toBe(true);
  expect((await f.manual()).status).toBe("settled"); held.resolve(prefs(true)); await flush();
  expect(mockCapture).toHaveBeenCalledTimes(1); expect(f.keep.receipts.get("e")?.reason).toBe("manual");
  expect(keepCalls).toHaveBeenCalledTimes(1);
  expect(f.auto.cancelPendingConsent("missing")).toBe(false);
});

test("auto joins manual flight; OFF neither aborts it nor overwrites its success", async () => {
  const held = deferred<CaptureResult>(); mockCapture.mockReturnValueOnce(held.promise);
  const f = fixture(); await f.auto.hydrate(); const event = f.add(), manual = f.manual(); await flush();
  f.emit(event); await flush(); expect(f.auto.cancelPendingConsent("e")).toBe(false); consent(false);
  expect((mockCapture.mock.calls[0][0] as CaptureInput).signal?.aborted).toBe(false);
  held.resolve(result()); await manual; await flush();
  expect(mockCapture).toHaveBeenCalledTimes(1); expect(f.keep.receipts.get("e")).toMatchObject({ state: "present", reason: "manual" });
  expect(f.notices).toHaveBeenCalledTimes(1);
});

test("manual joining an auto flight does not promote its authority after OFF", async () => {
  const held = deferred<CaptureResult>(); mockCapture.mockReturnValueOnce(held.promise);
  const f = fixture(); await f.auto.hydrate(); f.emit(f.add()); await flush(); const manual = f.manual();
  consent(false); expect((mockCapture.mock.calls[0][0] as CaptureInput).signal?.aborted).toBe(true);
  held.resolve(result()); await manual; await flush();
  expect(mockCapture).toHaveBeenCalledTimes(1); expect(f.keep.receipts.get("e")?.state).toBe("unknown");
});

test("source deletion tombstone and a later manual save do not replay auto completion", async () => {
  const f = fixture(); await f.auto.hydrate(); const event = f.add(); f.emit(event); await flush();
  mockReadSources.mockResolvedValue({ data: [], error: null });
  prepareSavedDataDeletion({ ownerId: "a", kind: "source", ids: ["source-a"] })(1); await flush();
  expect(f.keep.receipts.get("e")?.state).toBe("missing");
  f.emit(event); consent(false); consent(true); f.emit(event); await flush(); expect(mockCapture).toHaveBeenCalledTimes(1);
  await f.manual(); f.emit(event); await flush(); expect(mockCapture).toHaveBeenCalledTimes(2);
});

test.each(["clear", "replace"])("%s retires the grant; the next session hydrates independently", async action => {
  const f = fixture(); await f.auto.hydrate();
  if (action === "clear") expect(f.registry.clear(f.registry.getSnapshot("entry")!.choice)).toBe(true);
  else f.registry.attachView("a", "explicit", { fromNode: "work", mode: "analytic", persona: "secondb", seed: "" });
  expect(f.completions.size).toBe(0); expect(f.registry.getNextSequence(f.session)).toBeNull();
  const next = f.registry.getSnapshot(action === "clear" ? "entry" : "explicit")!.session!;
  const keep = createChatSessionKeep(f.registry, next, { ledger: f.ledger });
  const auto = createChatSessionAutosave(f.registry, next, f.controller, keep, display);
  cleanups.push(() => { auto.dispose(); keep.dispose(); }); await auto.hydrate();
  expect(mockPrefs).toHaveBeenCalledTimes(2); expect(f.registry.getNextSequence(next)).toBe(0);
});

test.each(["off", "account", "settle"])("wipe preserves issued mutation drain, then %s has its own meaning", async action => {
  const held = deferred<CaptureResult>(); let input!: CaptureInput;
  mockCapture.mockImplementationOnce(async (value: CaptureInput) => {
    input = value; const observer = value.mutationObserver!;
    const ticket = observer.ledger.acquireMutation(observer.owner, observer.generation,
      { operationId: observer.operationId, stepId: "source-insert", kind: "source-insert" })!;
    const operation = observer.ledger.issueMutation(observer.owner, ticket, () => held.promise)!;
    const saved = await operation; observer.ledger.settleMutation(ticket, { outcome: "committed" }); return saved;
  });
  const f = fixture(); await f.auto.hydrate(); f.emit(f.add()); await flush();
  f.ledger.beginWipe(captureAccountOwnerLease("a")!, 0, "wipe"); await flush();
  f.auto.dispose(); expect(input.signal?.aborted).toBe(false); expect(f.notices).not.toHaveBeenCalled();
  if (action === "off") { consent(false); expect(input.signal?.aborted).toBe(true); }
  if (action === "account") { beginAccountOwnerTransition("b"); expect(input.signal?.aborted).toBe(true); }
  held.resolve(result()); await flush(); expect(mockCapture).toHaveBeenCalledTimes(1); expect(f.notices).not.toHaveBeenCalled();
});

test("retired auto releases its withdrawal listener only after the real keep settles", async () => {
  const subscribe = privacyChanges.subscribePrivacyChanges, stops: jest.Mock[] = [];
  jest.spyOn(privacyChanges, "subscribePrivacyChanges").mockImplementation(listener => {
    const stop = jest.fn(subscribe(listener)); stops.push(stop); return stop;
  });
  const held = deferred<CaptureResult>();
  mockCapture.mockImplementationOnce(async (input: CaptureInput) => {
    const observer = input.mutationObserver!;
    const ticket = observer.ledger.acquireMutation(observer.owner, observer.generation,
      { operationId: observer.operationId, stepId: "source-insert", kind: "source-insert" })!;
    const operation = observer.ledger.issueMutation(observer.owner, ticket, () => held.promise)!;
    const saved = await operation; observer.ledger.settleMutation(ticket, { outcome: "committed" }); return saved;
  });
  const f = fixture(); await f.auto.hydrate(); f.emit(f.add()); await flush();
  f.ledger.beginWipe(captureAccountOwnerLease("a")!, 0, "wipe"); await flush();
  expect(stops).toHaveLength(1); expect(stops[0]).not.toHaveBeenCalled();
  held.resolve(result()); await flush(); expect(stops[0]).toHaveBeenCalledTimes(1);
});

test("F leaves the shipping screen and mount-scoped helper byte-identical as Git blobs", () => {
  // Canonical Git bytes: CRLF checkout and Linux CI have the same LF blob.
  const blobs = { "src/app/secondb.tsx": "9b4cc2c82e79987d9922e285dbc2f5125edadb2a",
    "src/lib/chat/autosave-session.ts": "f13cc97761b781da7c1588933592bb76b5caad68" };
  for (const [path, hash] of Object.entries(blobs)) {
    const bytes = Buffer.from(readFileSync(resolve(__dirname, "../../../..", path), "utf8").replace(/\r\n/g, "\n"));
    expect(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")).toBe(hash);
  }
});
