import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createChatSessionController } from "../session-controller";
import { createChatSessionRegistry } from "../session-registry";
import type { ChatContentBoundary, ChatContentState, ChatSessionToken } from "../session-types";
import type { CapturedChatInput, ChatSendAdmission, ChatSessionDeps } from "../session-deps";
import type { SendMessageOk, SendMessageResult } from "../conversation";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence } from "../../account/local-deletion-fence";
import { publishCrisisNotice, getCrisisNotice, dismissCrisisNotice } from "../../safety/crisis-notice";
import { isKeepable } from "../keep-exchange";
import * as sources from "../sources";

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const reply = (text = "A useful answer", zone: "green" | "red" = "green"): SendMessageOk => ({
  status: "ok", used: 2, limit: 5, remaining: 3,
  reply: { text, safety: { zone, matched: [], categories: zone === "red" ? ["crisis"] : [] }, audit: {} as SendMessageOk["reply"]["audit"] },
});
const redReply = (): SendMessageOk => ({ ...reply("Fixed guidance", "red"), used: null, limit: null, remaining: null });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let ids = 0;
const cleanups: (() => void)[] = [];
function fixture() {
  let content: ChatContentState = { generation: 0, phase: "open", wipeId: null };
  const boundaryListeners = new Set<() => boolean>();
  const boundary: ChatContentBoundary = {
    read: () => content,
    subscribe: (_owner, listener) => { boundaryListeners.add(listener); return () => { boundaryListeners.delete(listener); }; },
    startAfterWipe: (_owner, expected, commit) => {
      if (content.phase !== "needs-explicit-start" || content.generation !== expected.generation) return false;
      content = { ...content, phase: "open", wipeId: null }; commit(content); return true;
    },
  };
  const registry = createChatSessionRegistry(boundary, () => `registry-${++ids}`);
  const view = registry.attachView("a", "entry")!;
  const session = view.snapshot.session!;
  let admission: ChatSendAdmission = { ready: true, ordinaryAllowed: true, locale: "en", minor: false, tier: "free", recovery: "legacy",
    errors: { request: "Request failed", presentation: "Display failed", consent_required: "Consent needed", consent_check_unavailable: "Consent unavailable" } };
  const operations: {
    input?: CapturedChatInput; response: ReturnType<typeof deferred<SendMessageResult>>;
    auth: ReturnType<typeof deferred<AuthenticatedAccountSessionLease>>; capability: AuthenticatedAccountSessionLease;
    abort: AbortController; authenticate: jest.Mock; send: jest.Mock; audit: jest.Mock; retire: jest.Mock; release: jest.Mock;
    issued: boolean; unknown: boolean; confirmed: boolean; ack: boolean;
  }[] = [];
  let deferAuth = false;
  const releaseThinking = jest.fn();
  const deps: ChatSessionDeps = {
    readAdmission: jest.fn(() => admission),
    beginOperation: jest.fn((owner) => {
      const abort = new AbortController();
      const assertCurrent = () => { if (!owner.isCurrent() || abort.signal.aborted) throw new Error("aborted"); };
      const release = jest.fn(() => { abort.abort(); });
      const capability: AuthenticatedAccountSessionLease = { userId: owner.ownerId, epoch: owner.epoch, signal: abort.signal,
        accessToken: "private-test-capability", assertCurrent, abort: () => abort.abort(), release };
      const response = deferred<SendMessageResult>(); const auth = deferred<AuthenticatedAccountSessionLease>();
      const op: (typeof operations)[number] = { response, auth, capability, abort, input: undefined as CapturedChatInput | undefined,
        authenticate: jest.fn(() => auth.promise),
        send: jest.fn((input: CapturedChatInput) => { op.input = input; return response.promise; }),
        audit: jest.fn((input: CapturedChatInput) => { op.input = input; return response.promise as Promise<SendMessageOk>; }),
        retire: jest.fn((reason: string) => {
          if (reason !== "content-wipe" || !op.issued) abort.abort();
          if (op.issued && !op.confirmed) op.unknown = true;
          return op.ack;
        }), release, issued: false, unknown: false, confirmed: false, ack: true,
      };
      operations.push(op);
      if (!deferAuth) auth.resolve(capability);
      return { lease: { ...capability, authenticate: op.authenticate }, send: op.send, auditLocalRed: op.audit, retire: op.retire, release };
    }),
    publishCrisisNotice: jest.fn(publishCrisisNotice),
    consentError: jest.fn((error) => error instanceof ConsentError ? error.code : null),
    holdThinking: jest.fn(() => releaseThinking),
  };
  const controller = createChatSessionController(registry, deps, () => `controller-${++ids}`);
  cleanups.push(() => { controller.dispose(); registry.dispose(); });
  function send(text = "Hello", token: ChatSessionToken = session) {
    registry.editDraft(token, text);
    return controller.send({ session: token, text, expectedDraftRevision: registry.getDraftSnapshot(token)!.revision });
  }
  return { registry, session, view, controller, deps, operations, releaseThinking, send,
    admission: (patch: Partial<ChatSendAdmission>) => { admission = { ...admission, ...patch }; },
    deferAuthentication: () => { deferAuth = true; },
    changeContent(next: ChatContentState) { content = next; return [...boundaryListeners].map(listener => listener()); },
    wipe() { content = { generation: content.generation + 1, phase: "blocked", wipeId: "wipe" }; return [...boundaryListeners].map(listener => listener()); },
  };
}
class ConsentError extends Error { constructor(readonly code: "consent_required" | "consent_check_unavailable") { super(code); } }
beforeEach(() => { __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); noteResolvedOwner("a"); ids = 0; });
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); const notice = getCrisisNotice(); if (notice) dismissCrisisNotice(notice.id); jest.restoreAllMocks(); });

test("factory has no I/O; detach preserves one request and response, effects do not replay", async () => {
  const f = fixture(); expect(f.deps.beginOperation).not.toHaveBeenCalled();
  const event = jest.fn(); const stop = f.controller.subscribeCompletion(event);
  expect(f.send().accepted).toBe(true);
  const reserved = f.registry.getSessionSnapshot(f.session)!.turns;
  expect(reserved.map(turn => [turn.role, turn.synthetic, turn.text])).toEqual([["user", undefined, "Hello"], ["secondb", true, ""]]);
  await flush(); expect(f.operations[0].send).toHaveBeenCalledTimes(1);
  f.registry.detachView(f.view.viewId); stop();
  f.operations[0].response.resolve(reply()); await flush();
  expect(event).not.toHaveBeenCalled();
  const restored = f.registry.attachView("a", "entry")!.snapshot.session!;
  expect(restored.turns[1].id).toBe(reserved[1].id);
  expect(restored.turns[1].text).toBe("A useful answer");
  f.controller.subscribeCompletion(event); expect(event).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot(f.session)?.send?.stage).toBe("settled");
  expect(f.controller.getSnapshot(f.session)?.usage?.used).toBe(2);
  expect(f.operations[0].release).toHaveBeenCalledTimes(1); expect(f.releaseThinking).toHaveBeenCalledTimes(1);
});

test("same-render and synchronous claim subscriber reentry run one engine", async () => {
  const f = fixture(); f.registry.editDraft(f.session, "Hello");
  const command = { session: f.session, text: "Hello", expectedDraftRevision: f.registry.getDraftSnapshot(f.session)!.revision };
  const attempts: unknown[] = [];
  const stop = f.registry.subscribe(() => { if (!attempts.length) attempts.push(f.controller.send(command)); });
  expect(f.controller.send(command).accepted).toBe(true); stop();
  expect(attempts).toEqual([{ accepted: false, reason: "busy" }]);
  expect(f.controller.send(command).accepted).toBe(false);
  await flush(); expect(f.operations).toHaveLength(1); expect(f.operations[0].send).toHaveBeenCalledTimes(1);
});

test("publish edits preserve newer draft and captured persona/mode/history", async () => {
  const f = fixture(); f.admission({ displayName: "Before", personaHint: "Original" });
  let edited = false;
  const stop = f.registry.subscribe(() => { if (!edited && f.registry.getSessionSnapshot(f.session)?.work.length) { edited = true; f.registry.editDraft(f.session, "Typed later"); } });
  expect(f.send().accepted).toBe(true); stop(); f.admission({ displayName: "After", personaHint: "Changed" });
  await flush();
  expect(f.registry.getDraftSnapshot(f.session)?.text).toBe("Typed later");
  expect(f.operations[0].input).toMatchObject({ displayName: "Before", personaHint: "Original", mode: "analytic", history: [] });
  expect(f.operations[0].input?.session).toBe(f.operations[0].capability);
  expect(f.operations[0].input?.signal).toBe(f.operations[0].capability.signal);
});

test("a claim observer replacing turns is not overwritten and starts no transport", async () => {
  const f = fixture(); let edited = false;
  f.registry.subscribe(() => { if (!edited && f.registry.getSessionSnapshot(f.session)?.work.length) { edited = true;
    f.registry.replaceTurns(f.session, [{ role: "user", text: "Observer content", id: "external", exchangeId: "external-pair", sequence: 10 }]); } });
  expect(f.send().accepted).toBe(false); await flush();
  expect(f.deps.beginOperation).not.toHaveBeenCalled();
  expect(f.registry.getSessionSnapshot(f.session)?.turns[0].text).toBe("Observer content");
  expect(f.registry.getSessionSnapshot(f.session)?.work).toHaveLength(0);
});

test("busy local RED owns separate work and reserved sequence, ordinary late reply stays in its slot", async () => {
  const f = fixture(); f.send(); await flush();
  const first = f.registry.getSessionSnapshot(f.session)!.turns[1];
  f.admission({ ordinaryAllowed: false });
  expect(f.send("I want to die").accepted).toBe(true);
  expect(getCrisisNotice()?.hotline).toBe("GLOBAL_988");
  expect(f.operations).toHaveLength(1); // notice before authentication/audit starts
  await flush(); expect(f.operations[1].audit).toHaveBeenCalledTimes(1); expect(f.operations[1].send).not.toHaveBeenCalled();
  expect(f.registry.getSessionSnapshot(f.session)?.work.map(work => work.kind)).toEqual(["send", "safety"]);
  f.operations[1].response.resolve(redReply()); await flush();
  f.operations[0].response.resolve(reply("Ordinary finished")); await flush();
  const turns = f.registry.getSessionSnapshot(f.session)!.turns;
  expect(turns.map(turn => turn.sequence)).toEqual([0, 1, 2, 3]);
  expect(turns[1]).toMatchObject({ id: first.id, text: "Ordinary finished" });
  expect(turns[3]).toMatchObject({ crisisNotice: true, text: "Fixed guidance", safetyZone: "red" });
  expect(turns[3].synthetic).toBeUndefined(); expect(isKeepable(turns[3])).toBe(true);
});

test("local RED duplicate draft is refused, a new input has a new notice identity", async () => {
  const f = fixture(); f.registry.editDraft(f.session, "I want to die");
  const command = { session: f.session, text: "I want to die", expectedDraftRevision: f.registry.getDraftSnapshot(f.session)!.revision };
  expect(f.controller.send(command).accepted).toBe(true); const first = getCrisisNotice()!.id;
  expect(f.controller.send(command).accepted).toBe(false);
  expect(f.send("I want to die again").accepted).toBe(true); expect(getCrisisNotice()!.id).toBeGreaterThan(first);
  await flush(); expect(f.operations).toHaveLength(2); expect(f.operations.every(op => op.send.mock.calls.length === 0)).toBe(true);
});

test.each(["KR_119", "KR_112", "KR_1388", "KR_109", "GLOBAL_988"] as const)("early %s is once through close/final/remount and marks both reserved turns", async hotline => {
  const f = fixture(); const event = jest.fn(); f.controller.subscribeCompletion(event);
  f.send(); await flush(); f.operations[0].input!.onCrisisDetected(hotline);
  expect(getCrisisNotice()?.hotline).toBe(hotline);
  expect(f.registry.getSessionSnapshot(f.session)?.turns.every(turn => turn.safetyZone === "red")).toBe(true);
  expect(event).not.toHaveBeenCalled();
  dismissCrisisNotice(getCrisisNotice()!.id);
  f.registry.detachView(f.view.viewId);
  f.operations[0].response.resolve(reply("Fixed guidance", "red")); await flush(); f.registry.attachView("a", "entry");
  expect(getCrisisNotice()).toBeNull(); expect(f.deps.publishCrisisNotice).toHaveBeenCalledTimes(1); expect(event).toHaveBeenCalledTimes(1);
  expect(isKeepable(f.registry.getSessionSnapshot(f.session)!.turns[1])).toBe(true);
});

test("new ordinary history excludes both RED turns and synthetic hints", async () => {
  const f = fixture(); f.send("I want to die"); await flush(); f.operations[0].response.resolve(redReply()); await flush();
  f.send("Today was calm"); await flush(); expect(f.operations[1].input?.history).toEqual([]);
});

test("local audit failure retains immediate notice without error bubble or retry", async () => {
  const f = fixture(); f.send("I want to die"); await flush(); f.operations[0].response.reject(new Error("audit unavailable")); await flush();
  expect(getCrisisNotice()).not.toBeNull(); const turns = f.registry.getSessionSnapshot(f.session)!.turns;
  expect(turns[1]).toMatchObject({ text: "", synthetic: true, safetyZone: "red", crisisNotice: true }); expect(turns[1].retryText).toBeUndefined();
});

test("blocked response stores facts and hint without retry eligibility", async () => {
  const f = fixture(); f.send(); await flush(); f.operations[0].response.resolve({ status: "blocked", reason: "limit_reached", hint: "Limit", used: 5, limit: 5, upgradeTo: "brain" }); await flush();
  expect(f.controller.getSnapshot(f.session)).toMatchObject({ limitRefused: true, upgradeTo: "brain", usage: { used: 5 }, send: { outcome: "blocked", retry: "none" } });
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1]).toMatchObject({ synthetic: true, text: "Limit" });
});

test("explicit retry reuses pair IDs/sequence, preserves draft, and captures a new operation", async () => {
  const f = fixture(); const accepted = f.send(); expect(accepted.accepted).toBe(true); await flush();
  f.operations[0].response.reject(new Error("offline")); await flush();
  const before = f.registry.getSessionSnapshot(f.session)!.turns;
  expect(f.controller.getSnapshot(f.session)?.send?.retry).toBe("legacy-explicit");
  f.registry.editDraft(f.session, "Keep my new input");
  const result = f.controller.send({ session: f.session, text: "Hello", expectedDraftRevision: f.registry.getDraftSnapshot(f.session)!.revision, retryExchangeId: before[0].exchangeId });
  expect(result.accepted).toBe(true); if (accepted.accepted && result.accepted) expect(result.operationId).not.toBe(accepted.operationId);
  expect(f.registry.getDraftSnapshot(f.session)?.text).toBe("Keep my new input");
  expect(f.registry.getSessionSnapshot(f.session)?.turns.map(turn => [turn.id, turn.sequence])).toEqual(before.map(turn => [turn.id, turn.sequence]));
  await flush(); f.operations[1].response.resolve(reply()); await flush(); expect(f.operations).toHaveLength(2);
});

test.each(["consent_required", "consent_check_unavailable"] as const)("%s is never retryable", async code => {
  const f = fixture(); f.send(); await flush(); f.operations[0].response.reject(new ConsentError(code)); await flush();
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1]).toMatchObject({ consentError: code, synthetic: true });
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1].retryText).toBeUndefined();
});

test("parser error after answer preserves usage and cannot resend", async () => {
  const f = fixture(); jest.spyOn(sources, "parseSourceCitations").mockImplementation(() => { throw new Error("format"); });
  f.send(); await flush(); f.operations[0].response.resolve(reply()); await flush();
  expect(f.controller.getSnapshot(f.session)).toMatchObject({ usage: { used: 2 }, send: { outcome: "presentation-error", retry: "none" } });
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1]).toMatchObject({ synthetic: true, text: "Display failed" });
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1].retryText).toBeUndefined(); expect(f.operations).toHaveLength(1);
});

test("throwing completion/thinking/subscriber effects cannot turn a received reply into retry", async () => {
  const f = fixture(); f.controller.subscribe(() => { throw new Error("observer"); });
  f.controller.subscribeCompletion(() => { throw new Error("sound or analytics"); }); f.releaseThinking.mockImplementation(() => { throw new Error("effect"); });
  f.send(); await flush(); f.operations[0].response.resolve(reply()); await flush();
  expect(f.controller.getSnapshot(f.session)?.send).toMatchObject({ outcome: "reply", retry: "none", stage: "settled" });
  expect(f.operations[0].send).toHaveBeenCalledTimes(1); expect(f.operations[0].release).toHaveBeenCalledTimes(1); expect(f.releaseThinking).toHaveBeenCalledTimes(1);
});

test.each(["claim", "body", "metadata"])("owner hold during %s publication returns refusal and no I/O", async phase => {
  const f = fixture(); let held = false;
  const hold = () => { if (held) return; held = true; beginAccountOwnerTransition("b"); };
  if (phase === "metadata") f.controller.subscribe(hold);
  else f.registry.subscribe(() => { const s = f.registry.getSessionSnapshot(f.session); if (s && (phase === "claim" ? s.work.length : s.turns.length)) hold(); });
  expect(f.send().accepted).toBe(false); await flush();
  expect(f.deps.beginOperation).not.toHaveBeenCalled(); expect(f.controller.getSnapshot(f.session)).toBeNull(); expect(f.registry.getSessionSnapshot(f.session)).toBeNull();
});

test.each(["hold", "ABA", "terminal", "wipe", "dispose"])("%s after authentication rejects late body, RED and completion", async fence => {
  const f = fixture(); const event = jest.fn(); f.controller.subscribeCompletion(event); f.send(); await flush();
  if (fence === "hold" || fence === "ABA") beginAccountOwnerTransition("b");
  if (fence === "ABA") { noteResolvedOwner("b"); clearAccountTransition(currentAccountEpoch()); noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch()); }
  if (fence === "terminal") installAccountLocalDeletionFence("a");
  if (fence === "wipe") expect(f.wipe()).toEqual([true]);
  if (fence === "dispose") expect(f.controller.dispose()).toBe(true);
  f.operations[0].input!.onCrisisDetected("KR_119"); f.operations[0].response.resolve(reply("Old body", "red")); await flush();
  expect(getCrisisNotice()).toBeNull(); expect(event).not.toHaveBeenCalled(); expect(f.controller.getSnapshot(f.session)).toBeNull();
  expect(f.operations[0].release).toHaveBeenCalledTimes(1);
});

test("owner hold while auth is pending prevents the engine", async () => {
  const f = fixture(); f.deferAuthentication(); f.send(); await flush(); beginAccountOwnerTransition("b");
  f.operations[0].auth.resolve(f.operations[0].capability); await flush();
  expect(f.operations[0].send).not.toHaveBeenCalled(); expect(f.operations[0].release).toHaveBeenCalledTimes(1);
});

test("content wipe cancels read/model but ACK for issued write only hands off drain", async () => {
  const f = fixture(); f.send(); await flush(); f.operations[0].issued = true;
  expect(f.wipe()).toEqual([true]);
  expect(f.operations[0].retire).toHaveBeenCalledWith("content-wipe"); expect(f.operations[0].abort.signal.aborted).toBe(false);
  expect(f.operations[0].unknown).toBe(true); expect(f.operations[0].release).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot(f.session)).toBeNull();
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(false);
  f.operations[0].confirmed = true; f.operations[0].unknown = false; f.operations[0].response.resolve(reply()); await flush();
  expect(f.operations[0].release).toHaveBeenCalledTimes(1); expect(f.registry.getSnapshot("entry")!.session).toBeNull();
  // A confirmed outcome still does not automatically run deletion or open the session.
});

test.each([false, "throw", true])("installed supervisor handoff %s determines wipe acknowledgement", async result => {
  const f = fixture(); f.send(); await flush();
  if (result === false) f.operations[0].ack = false;
  else if (result === "throw") f.operations[0].retire.mockImplementation(() => { throw new Error("handoff"); });
  expect(f.wipe()).toEqual([result === true]);
  f.changeContent({ generation: 1, phase: "needs-explicit-start", wipeId: "wipe" });
  expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(result === true);
  expect(f.controller.dispose()).toBe(result === true); expect(f.controller.dispose()).toBe(result === true);
  f.operations[0].response.resolve(reply("Retired result")); await flush();
  expect(f.operations[0].retire).toHaveBeenCalledTimes(1); expect(f.operations[0].release).toHaveBeenCalledTimes(1);
});

describe.each(["wipe", "account", "dispose"] as const)("%s while the supervisor is being created", fence => {
  test.each([false, "throw", true])("never acknowledges an unconfirmed handoff even if the late result is %s", async result => {
    const f = fixture(); const event = jest.fn(); f.controller.subscribeCompletion(event);
    const begin = jest.mocked(f.deps.beginOperation).getMockImplementation()!;
    let synchronousAck: boolean | undefined; let deletionStarts = 0;
    jest.mocked(f.deps.beginOperation).mockImplementation((...args) => {
      const supervisor = begin(...args);
      f.operations[0].retire.mockImplementation(() => {
        if (result === "throw") throw new Error("late handoff refused");
        return result;
      });
      if (fence === "wipe") synchronousAck = f.wipe()[0];
      else {
        if (fence === "account") beginAccountOwnerTransition("b");
        synchronousAck = f.controller.dispose();
      }
      if (synchronousAck) deletionStarts += 1;
      return supervisor;
    });
    expect(f.send().accepted).toBe(true); await flush();
    expect(synchronousAck).toBe(false); expect(deletionStarts).toBe(0);
    expect(f.operations).toHaveLength(1);
    const op = f.operations[0];
    expect(op.authenticate).not.toHaveBeenCalled(); expect(op.send).not.toHaveBeenCalled(); expect(op.audit).not.toHaveBeenCalled();
    expect(op.retire).toHaveBeenCalledTimes(1);
    expect(op.retire).toHaveBeenCalledWith(fence === "wipe" ? "content-wipe" : fence === "account" ? "account" : "disposed");
    expect(op.release).toHaveBeenCalledTimes(1); expect(f.releaseThinking).toHaveBeenCalledTimes(1);
    expect(event).not.toHaveBeenCalled(); expect(f.controller.getSnapshot(f.session)).toBeNull();
    if (fence === "wipe") {
      f.changeContent({ generation: 1, phase: "needs-explicit-start", wipeId: "wipe" });
      expect(f.registry.startAfterWipe(f.registry.getSnapshot("entry")!.choice)).toBe(false);
    }
    expect(f.controller.dispose()).toBe(false); expect(f.controller.dispose()).toBe(false);
  });
});

test.each([false, "throw", true])("dispose reentry during retire keeps the pending ACK false when the outer result is %s", async result => {
  const f = fixture(); const event = jest.fn(); f.controller.subscribeCompletion(event); f.send(); await flush();
  let synchronousAck: boolean | undefined;
  f.operations[0].retire.mockImplementation(() => {
    synchronousAck = f.controller.dispose();
    if (result === "throw") throw new Error("handoff refused");
    return result;
  });
  expect(f.wipe()).toEqual([false]); expect(synchronousAck).toBe(false);
  expect(f.controller.dispose()).toBe(false);
  f.operations[0].response.resolve(reply("Retired result")); await flush();
  expect(event).not.toHaveBeenCalled(); expect(f.operations[0].retire).toHaveBeenCalledTimes(1);
  expect(f.operations[0].release).toHaveBeenCalledTimes(1); expect(f.releaseThinking).toHaveBeenCalledTimes(1);
});

test("old finally cannot clear a new work claimed by settle publication", async () => {
  const f = fixture(); f.send(); await flush(); let result: unknown;
  const stop = f.registry.subscribe(() => { const s = f.registry.getSessionSnapshot(f.session); if (s && s.turns.length === 2 && s.work.length === 0 && !result) { result = "starting"; result = f.send("Next question"); } });
  f.operations[0].response.resolve(reply()); await flush(); stop();
  expect(result).toMatchObject({ accepted: true }); expect(f.operations).toHaveLength(2);
  expect(f.registry.getSessionSnapshot(f.session)?.work).toHaveLength(1);
  expect(f.controller.getSnapshot(f.session)?.send?.stage).toBe("requesting");
});

test("snapshots are stable, frozen and metadata-only; no default transport or UI consumer", async () => {
  const f = fixture(); f.send(); await flush(); const first = f.controller.getSnapshot(f.session)!;
  expect(f.controller.getSnapshot(f.session)).toBe(first); expect(Object.isFrozen(first)).toBe(true); expect(Object.isFrozen(first.send)).toBe(true); expect(Object.isFrozen(first.safety)).toBe(true);
  expect(JSON.stringify(first)).not.toMatch(/Hello|accessToken|private-test|AbortController|Promise/);
  const source = readFileSync(resolve(__dirname, "../session-controller.ts"), "utf8");
  expect(source).not.toMatch(/import\s*\{[^}]*sendChatMessage|from ["'][^"']*(?:components|supabase\/client)["']/);
  expect(source).not.toMatch(/AsyncStorage|localStorage|SecureStore|captureFromMarkdown/);
});

test.each([{ ready: false }, { ordinaryAllowed: false }, { recovery: "unavailable" as const }])("ordinary admission %j refuses before auth or input mutation", async admission => {
  const f = fixture(); f.admission(admission); expect(f.send().accepted).toBe(false); await flush();
  expect(f.deps.beginOperation).not.toHaveBeenCalled(); expect(f.registry.getSessionSnapshot(f.session)?.turns).toHaveLength(0);
  expect(f.registry.getDraftSnapshot(f.session)?.text).toBe("Hello");
});

test("pending and nonlatest failed pair cannot be retried", async () => {
  const f = fixture(); f.send(); await flush(); const oldPair = f.registry.getSessionSnapshot(f.session)!.turns[0].exchangeId;
  const retry = () => f.controller.send({ session: f.session, text: "Hello", expectedDraftRevision: f.registry.getDraftSnapshot(f.session)!.revision, retryExchangeId: oldPair });
  expect(retry().accepted).toBe(false); f.operations[0].response.reject(new Error("network")); await flush();
  f.send("Next"); await flush(); expect(retry().accepted).toBe(false); expect(f.operations).toHaveLength(2);
});

test("error mapper failure cannot reclassify an unknown refusal into a retry", async () => {
  const f = fixture(); jest.mocked(f.deps.consentError).mockImplementation(() => { throw new Error("mapper"); });
  f.send(); await flush(); f.operations[0].response.reject(new Error("unknown")); await flush();
  expect(f.controller.getSnapshot(f.session)?.send?.retry).toBe("none"); expect(f.registry.getSessionSnapshot(f.session)?.turns[1].retryText).toBeUndefined();
});

test("thinking acquisition failure leaves no stuck work or started transport", async () => {
  const f = fixture(); jest.mocked(f.deps.holdThinking).mockImplementation(() => { throw new Error("effect"); });
  f.send(); await flush(); expect(f.deps.beginOperation).not.toHaveBeenCalled();
  expect(f.registry.getSessionSnapshot(f.session)?.work).toHaveLength(0); expect(f.controller.getSnapshot(f.session)?.send?.stage).toBe("settled");
});

test("local notice listener exception does not prevent audit or cause a second notice", async () => {
  const f = fixture(); jest.mocked(f.deps.publishCrisisNotice).mockImplementation((owner, hotline) => { publishCrisisNotice(owner, hotline); throw new Error("notice observer"); });
  expect(f.send("I want to die").accepted).toBe(true); expect(getCrisisNotice()).not.toBeNull(); await flush();
  f.operations[0].response.resolve(redReply()); await flush(); expect(f.operations[0].audit).toHaveBeenCalledTimes(1); expect(f.deps.publishCrisisNotice).toHaveBeenCalledTimes(1);
});

test("an early RED followed by an inconsistent ordinary payload cannot display or complete it", async () => {
  const f = fixture(); const event = jest.fn(); f.controller.subscribeCompletion(event); f.send(); await flush();
  f.operations[0].input!.onCrisisDetected("KR_119"); f.operations[0].response.resolve(reply("Unconfirmed raw output")); await flush();
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1].text).toBe(""); expect(event).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot(f.session)?.send).toMatchObject({ outcome: "red", retry: "none" });
});

test("owner hold during answered publication blocks formatting and completion", async () => {
  const f = fixture(); const parser = jest.spyOn(sources, "parseSourceCitations"); const event = jest.fn(); f.controller.subscribeCompletion(event);
  f.send(); await flush(); f.controller.subscribe(() => { if (f.controller.getSnapshot(f.session)?.send?.stage === "answered") beginAccountOwnerTransition("b"); });
  f.operations[0].response.resolve(reply()); await flush(); expect(parser).not.toHaveBeenCalled(); expect(event).not.toHaveBeenCalled(); expect(f.controller.getSnapshot(f.session)).toBeNull();
});

test("wipe aborts model/read, while rejected issued-write result stays unknown after release", async () => {
  const f = fixture(); f.send(); await flush(); expect(f.wipe()).toEqual([true]); expect(f.operations[0].abort.signal.aborted).toBe(true);
  f.operations[0].response.reject(new Error("aborted")); await flush();
  const g = fixture(); g.send(); await flush(); g.operations[0].issued = true; expect(g.wipe()).toEqual([true]);
  g.operations[0].response.reject(new Error("lost reply")); await flush();
  expect(g.operations[0].unknown).toBe(true); expect(g.operations[0].release).toHaveBeenCalledTimes(1);
  expect(g.registry.startAfterWipe(g.registry.getSnapshot("entry")!.choice)).toBe(false);
});

test("controller dispose before its microtask performs no I/O and repeated dispose is stable", async () => {
  const f = fixture(); f.send(); expect(f.controller.dispose()).toBe(true); expect(f.controller.dispose()).toBe(true); await flush();
  expect(f.deps.beginOperation).not.toHaveBeenCalled(); expect(f.controller.getSnapshot(f.session)).toBeNull(); expect(f.registry.getSessionSnapshot(f.session)?.work).toHaveLength(0);
});

test("clear/replacement waits for safety audit, then invalidates retained metadata", async () => {
  const f = fixture(); f.send("I want to die"); await flush();
  expect(f.registry.clear(f.registry.getSnapshot("entry")!.choice)).toBe(false);
  f.operations[0].response.resolve(redReply()); await flush(); expect(f.registry.clear(f.registry.getSnapshot("entry")!.choice)).toBe(true);
  expect(f.controller.getSnapshot(f.session)).toBeNull(); expect(getCrisisNotice()).not.toBeNull();
});


test("a capability assertion failing after receipt cannot create a charged retry", async () => {
  const f = fixture(); f.send(); await flush();
  f.operations[0].capability.assertCurrent = () => { throw new Error("capability closed after response"); };
  f.operations[0].response.resolve(reply()); await flush();
  expect(f.controller.getSnapshot(f.session)?.send).toMatchObject({ outcome: "presentation-error", retry: "none" });
  expect(f.registry.getSessionSnapshot(f.session)?.turns[1].retryText).toBeUndefined();
  expect(f.operations[0].send).toHaveBeenCalledTimes(1);
});
