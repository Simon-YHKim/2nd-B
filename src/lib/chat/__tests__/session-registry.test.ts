import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { createChatSessionRegistry } from "../session-registry";
import type { ChatContentBoundary, ChatContentState, ChatContextIntent, ChatSessionSnapshot, SessionTurn } from "../session-types";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, noteResolvedOwner, clearAccountTransition, currentAccountEpoch } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence } from "../../account/local-deletion-fence";

function contentFixture() {
  let state: ChatContentState = { generation: 0, phase: "open", wipeId: null };
  let readFailure = false;
  const listeners = new Set<() => boolean>();
  const boundary: ChatContentBoundary = {
    read: () => { if (readFailure) throw new Error("unavailable"); return state; },
    subscribe: (_owner, listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    startAfterWipe: (_owner, expected, commit) => {
      if (state.phase !== "needs-explicit-start" || state.generation !== expected.generation || state.wipeId !== expected.wipeId) return false;
      state = { ...state, phase: "open", wipeId: null };
      commit(state); return true;
    },
  };
  return {
    boundary,
    change(next: ChatContentState) { state = next; return [...listeners].map(listener => listener()); },
    failRead() { readFailure = true; return [...listeners].map(listener => listener()); },
    listenerCount: () => listeners.size,
  };
}
const context = (label: string): ChatContextIntent => ({ fromNode: label, mode: "analytic", persona: "secondb", seed: `${label} seed` });
const turn = (id = "t1", sequence = 1): SessionTurn => ({ id, sequence, exchangeId: "x1", role: "user", text: "original" });
let sequence = 0;
const registries: ReturnType<typeof createChatSessionRegistry>[] = [];
function fixture() {
  const content = contentFixture();
  const registry = createChatSessionRegistry(content.boundary, () => `id-${++sequence}`);
  registries.push(registry);
  return { registry, content };
}
function opened(registry: ReturnType<typeof createChatSessionRegistry>, entry = "A", intent: ChatContextIntent | null = null) {
  const view = registry.attachView("a", entry, intent);
  expect(view).not.toBeNull();
  const session = registry.getSnapshot(entry)?.session;
  expect(session).not.toBeNull();
  return { view: view!, session: session as ChatSessionSnapshot };
}
function publishOwner(owner: string) {
  noteResolvedOwner(owner);
  clearAccountTransition(currentAccountEpoch());
}
beforeEach(() => { __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); noteResolvedOwner("a"); sequence = 0; });
afterEach(() => { for (const registry of registries.splice(0)) registry.dispose(); });

test("factory is dormant; no boundary subscription until an owned view attaches", () => {
  const { registry, content } = fixture();
  expect(content.listenerCount()).toBe(0);
  expect(registry.getSnapshot("A")).toBeNull();
  expect(registry.attachView("b", "B")).toBeNull();
  expect(content.listenerCount()).toBe(0);
  opened(registry);
  expect(content.listenerCount()).toBe(1);
});

test("same route remount and bare new tab retain text, context, pending work and identity without running again", () => {
  const { registry } = fixture();
  const { view, session } = opened(registry, "A", context("first"));
  registry.editDraft(session, "typed later");
  registry.replaceTurns(session, [turn()]);
  const cancel = jest.fn();
  const work = registry.claimWork(session, "send", "send1", cancel)!;
  registry.detachView(view.viewId);
  const remount = registry.attachView("a", "A", context("must not replay"))!;
  expect(remount.snapshot.session?.sessionId).toBe(session.sessionId);
  const bare = registry.attachView("a", "bare")!;
  expect(bare.snapshot.session).toBe(remount.snapshot.session);
  expect(registry.getDraftSnapshot(session)?.text).toBe("typed later");
  expect(bare.snapshot.session?.turns[0].text).toBe("original");
  expect(bare.snapshot.session?.work).toEqual([work]);
  expect(cancel).not.toHaveBeenCalled();
  expect(registry.claimWork(session, "send", "send2", cancel)).toBeNull();
  expect(registry.settleWork(work)).toBe(true);
});

test("external-store snapshots are stable; draft edits only notify composer and CAS preserves newer input", () => {
  const { registry } = fixture(); const { view, session } = opened(registry);
  const stable = registry.getSnapshot("A");
  expect(view.snapshot).toBe(stable);
  expect(registry.getSnapshot("A")).toBe(stable);
  const list = jest.fn(); const composer = jest.fn();
  const unsubscribe = registry.subscribe(list); registry.subscribeDraft(composer);
  const draft = registry.getDraftSnapshot(session)!;
  registry.editDraft(session, "fresh", draft.revision);
  expect(registry.editDraft(session, "", draft.revision)).toBe(false);
  expect(registry.getSnapshot("A")).toBe(stable);
  expect(list).not.toHaveBeenCalled(); expect(composer).toHaveBeenCalledTimes(1);
  const latest = registry.getDraftSnapshot(session);
  registry.editDraft(session, "fresh");
  expect(registry.getDraftSnapshot(session)).toBe(latest);
  expect(composer).toHaveBeenCalledTimes(1);
  registry.replaceTurns(session, [turn()]);
  expect(list).toHaveBeenCalledTimes(1);
  unsubscribe(); registry.replaceTurns(session, [turn("t1"), turn("t2", 2)]);
  expect(list).toHaveBeenCalledTimes(1);
});

test("reply metadata survives detached immutable snapshots; no array aliases mutate the store", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  const chips = ["source-a"]; const branches = ["next"];
  const reply: SessionTurn = { ...turn(), role: "secondb", citationText: "raw [1]", persona: "twi",
    chips, branches, synthetic: true, consentError: "consent_required", retryText: "retry",
    safetyZone: "red", crisisNotice: true };
  expect(registry.replaceTurns(session, [reply])).toBe(true);
  chips.push("late"); branches[0] = "modified";
  const copied = registry.getSnapshot("A")!.session!.turns[0];
  expect(copied).toEqual({ ...reply, chips: ["source-a"], branches: ["next"] });
  expect(Object.isFrozen(copied)).toBe(true); expect(Object.isFrozen(copied.chips)).toBe(true);
  expect(Object.isFrozen(registry.getSnapshot("A")!.session!.turns)).toBe(true);
});

test("retired entry back shows no old body or current context until explicit structural CAS rebind", () => {
  const { registry } = fixture(); const a = opened(registry, "A", context("first"));
  registry.replaceTurns(a.session, [turn()]);
  const b = opened(registry, "B", context("second"));
  registry.editDraft(b.session, "B private draft");
  const back = registry.attachView("a", "A", context("first"))!;
  expect(back.snapshot.binding.state).toBe("retired"); expect(back.snapshot.session).toBeNull();
  expect(JSON.stringify(back.snapshot)).not.toContain("original");
  expect(registry.isCurrent(a.session)).toBe(false);
  expect(registry.chooseCurrent(back.snapshot.choice)).toBe(true);
  const joined = registry.getSnapshot("A")!;
  expect(joined.session?.context.fromNode).toBe("second");
  expect(registry.getDraftSnapshot(joined.session!)?.text).toBe("B private draft");
});

test.each(["send", "keep", "plan"] as const)("%s work blocks clear and explicit replacement; pending route stays bodyless", kind => {
  const { registry } = fixture(); const { session } = opened(registry, "A", context("first"));
  const work = registry.claimWork(session, kind, "first", jest.fn())!;
  const choice = registry.getSnapshot("A")!.choice;
  expect(registry.clear(choice)).toBe(false);
  const pending = registry.attachView("a", "B", context("second"))!.snapshot;
  expect(pending.binding.state).toBe("replacement-pending"); expect(pending.session).toBeNull();
  expect(registry.chooseNew(pending.choice, context("second"))).toBe(false);
  expect(registry.chooseCurrent(pending.choice)).toBe(true);
  expect(registry.getSnapshot("B")!.session?.sessionId).toBe(session.sessionId);
  expect(registry.settleWork(work)).toBe(true);
  expect(registry.settleWork(work)).toBe(false);
});

test("pending choice becomes stale after another route replaces its expected session", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  const work = registry.claimWork(session, "send", "q", jest.fn())!;
  const pending = registry.attachView("a", "B", context("B"))!.snapshot;
  registry.settleWork(work);
  const c = opened(registry, "C", context("C"));
  expect(registry.getSnapshot("B")!.binding.state).toBe("retired");
  expect(registry.chooseCurrent(pending.choice)).toBe(false);
  expect(registry.chooseNew(pending.choice, context("B"))).toBe(false);
  expect(registry.getSnapshot("C")!.session?.sessionId).toBe(c.session.sessionId);
  expect(registry.getDraftSnapshot(c.session)?.text).toBe("C seed");
});

test("clear rebinds only initiating entry, preserves persona/context, consumes seed and retires back routes", () => {
  const { registry } = fixture(); const { session } = opened(registry, "A", { ...context("star"), mode: "divergent", persona: "twi" });
  registry.attachView("a", "bare"); registry.editDraft(session, "old draft");
  expect(registry.clear(registry.getSnapshot("A")!.choice)).toBe(true);
  const fresh = registry.getSnapshot("A")!.session!;
  expect(fresh.sessionId).not.toBe(session.sessionId); expect(fresh.persona).toBe("twi");
  expect(fresh.context.fromNode).toBe("star"); expect(registry.getDraftSnapshot(fresh)?.text).toBe("");
  expect(registry.getSnapshot("bare")!.session).toBeNull();
  registry.attachView("a", "A", context("old seed"));
  expect(registry.getDraftSnapshot(fresh)?.text).toBe("");
  expect(registry.replaceTurns(session, [turn()])).toBe(false);
});

test("choices ignore typing/reply revisions but compare binding and session structure", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  const choice = registry.getSnapshot("A")!.choice;
  registry.editDraft(session, "new typed"); registry.replaceTurns(session, [turn()]);
  expect(registry.clear(choice)).toBe(true);
  expect(registry.clear(choice)).toBe(false);
});

test("same-label explicit push is a fresh context; detach is not history removal", () => {
  const { registry } = fixture(); const a = opened(registry, "A", context("same"));
  expect(registry.releaseEntry("A")).toBe(false);
  registry.detachView(a.view.viewId); expect(registry.getSnapshot("A")).not.toBeNull();
  const b = opened(registry, "B", context("same"));
  expect(b.session.sessionId).not.toBe(a.session.sessionId);
  expect(registry.releaseEntry("A")).toBe(true); expect(registry.getSnapshot("A")).toBeNull();
  expect(registry.getSnapshot("B")!.session).toBe(b.session);
});

test.each(["hold", "direct", "logout", "aba"])("%s invalidates body/work synchronously and never archives A", kind => {
  const { registry, content } = fixture(); const { session } = opened(registry, "A", context("private"));
  registry.editDraft(session, "A secret"); registry.replaceTurns(session, [turn()]);
  const retired = jest.fn(); const work = registry.claimWork(session, "send", "q", retired)!;
  if (kind === "hold") beginAccountOwnerTransition("b");
  else if (kind === "logout") noteResolvedOwner(null);
  else { publishOwner("b"); if (kind === "aba") publishOwner("a"); }
  expect(registry.getSnapshot("A")).toBeNull(); expect(registry.getDraftSnapshot(session)).toBeNull();
  expect(registry.replaceTurns(session, [turn()])).toBe(false); expect(registry.settleWork(work)).toBe(false);
  expect(retired).toHaveBeenCalledTimes(1); expect(retired).toHaveBeenCalledWith("account");
  expect(content.listenerCount()).toBe(0);
  if (kind === "aba") {
    const fresh = opened(registry); expect(fresh.session.sessionId).not.toBe(session.sessionId);
    expect(fresh.session.turns).toEqual([]); expect(registry.getDraftSnapshot(fresh.session)?.text).toBe("");
  }
});

test("throwing observers cannot stop cleanup or the next retirement callback", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  registry.claimWork(session, "keep", "one", () => { throw new Error("subscriber failed"); });
  const second = jest.fn(); registry.claimWork(session, "plan", "two", second);
  registry.subscribe(() => { throw new Error("render failed"); }); const notify = jest.fn(); registry.subscribe(notify);
  beginAccountOwnerTransition("b");
  expect(second).toHaveBeenCalledWith("account"); expect(notify).toHaveBeenCalledTimes(1);
  expect(registry.getSnapshot("A")).toBeNull();
});

test("terminal fence rejects late mutations and reads even before publication changes", async () => {
  const { registry } = fixture(); const { session } = opened(registry);
  await installAccountLocalDeletionFence("a");
  expect(registry.getSnapshot("A")).toBeNull(); expect(registry.editDraft(session, "late")).toBe(false);
  expect(registry.claimWork(session, "send", "late", jest.fn())).toBeNull();
  expect(registry.attachView("a", "A")).toBeNull();
});

test("content wipe retires all bindings and work before ACK; unknown cannot start, success needs explicit CAS", () => {
  const { registry, content } = fixture(); const { session } = opened(registry, "A", context("private"));
  registry.attachView("a", "bare"); registry.replaceTurns(session, [turn()]);
  const retirement = jest.fn(() => { expect(registry.getSnapshot("A")!.session).toBeNull(); });
  const work = registry.claimWork(session, "keep", "x", retirement)!;
  expect(content.change({ generation: 1, phase: "blocked", wipeId: "wipe1" })).toEqual([true]);
  expect(retirement).toHaveBeenCalledWith("content-wipe");
  expect(registry.settleWork(work)).toBe(false); expect(registry.getDraftSnapshot(session)).toBeNull();
  const waiting = registry.getSnapshot("A")!;
  expect(waiting.binding.state).toBe("retired"); expect(registry.startAfterWipe(waiting.choice)).toBe(false);
  expect(registry.attachView("a", "new", context("must not seed"))!.snapshot.session).toBeNull();
  content.change({ generation: 1, phase: "needs-explicit-start", wipeId: "wipe1" });
  expect(registry.startAfterWipe(waiting.choice)).toBe(false);
  const completed = registry.getSnapshot("A")!;
  expect(registry.startAfterWipe(completed.choice)).toBe(true);
  const fresh = registry.getSnapshot("A")!.session!;
  expect(fresh.turns).toEqual([]); expect(fresh.context.fromNode).toBeNull();
  expect(registry.getDraftSnapshot(fresh)?.text).toBe("");
  expect(registry.getSnapshot("bare")!.session).toBeNull();
  expect(registry.startAfterWipe(completed.choice)).toBe(false);
});

test("failed wipe acknowledgement stays blocked; subsequent empty work map is not successful drain proof", () => {
  const { registry, content } = fixture(); const { session } = opened(registry);
  registry.claimWork(session, "send", "q", () => { throw new Error("phase supervisor failed"); });
  expect(content.change({ generation: 1, phase: "blocked", wipeId: "wipe" })).toEqual([false]);
  expect(content.change({ generation: 1, phase: "blocked", wipeId: "wipe" })).toEqual([false]);
  expect(content.change({ generation: 1, phase: "needs-explicit-start", wipeId: "wipe" })).toEqual([false]);
  expect(registry.startAfterWipe(registry.getSnapshot("A")!.choice)).toBe(false);
});

test("failed/unknown boundary cannot silently read as open; bare attach never restarts after a wipe", () => {
  const { registry, content } = fixture(); const { session } = opened(registry);
  expect(content.failRead()).toEqual([false]);
  expect(registry.getSnapshot("A")!.session).toBeNull();
  expect(registry.editDraft(session, "late")).toBe(false);
  expect(registry.attachView("a", "new")).toBeNull();
});

test("work identity prevents late finally and copied tickets from clearing a new send", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  const first = registry.claimWork(session, "send", "q", jest.fn())!;
  expect(registry.settleWork({ ...first })).toBe(false);
  registry.settleWork(first);
  const second = registry.claimWork(session, "send", "next", jest.fn())!;
  expect(registry.settleWork(first)).toBe(false);
  expect(registry.getSnapshot("A")!.session!.work).toEqual([second]);
  expect(registry.claimWork(session, "keep", "same exchange", jest.fn())).not.toBeNull();
  expect(registry.claimWork(session, "keep", "same exchange", jest.fn())).toBeNull();
});

test("turn identities and monotonic sequence survive replacement/removal without reusing a consent position", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  expect(registry.replaceTurns(session, [turn("t1", 1), turn("t2", 2)])).toBe(true);
  expect(registry.replaceTurns(session, [turn("t1", 1), { ...turn("t2", 2), text: "retry result" }])).toBe(true);
  expect(registry.replaceTurns(session, [turn("t1", 1)])).toBe(true);
  expect(registry.replaceTurns(session, [turn("t1", 1), turn("new", 2)])).toBe(false);
  expect(registry.replaceTurns(session, [turn("t1", 1), turn("new", 3)])).toBe(true);
  expect(registry.replaceTurns(session, [turn("duplicate", 4), turn("duplicate", 5)])).toBe(false);
});

test("disposal releases subscriptions and retains no route snapshot; it cannot be reactivated", () => {
  const { registry, content } = fixture(); const { session } = opened(registry);
  const retire = jest.fn(); registry.claimWork(session, "send", "q", retire);
  registry.dispose(); registry.dispose();
  expect(retire).toHaveBeenCalledTimes(1); expect(retire).toHaveBeenCalledWith("disposed");
  expect(content.listenerCount()).toBe(0); expect(registry.getSnapshot("A")).toBeNull();
  expect(registry.attachView("a", "A")).toBeNull();
});

test("shipping screen imports only the shared types; the dormant registry has no I/O dependency", () => {
  const source = readFileSync(join(__dirname, "../../../app/secondb.tsx"), "utf8");
  const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  expect(imports.filter(node => node.moduleSpecifier.getText(ast).includes("chat/session-types"))).toHaveLength(1);
  expect(imports.find(node => node.moduleSpecifier.getText(ast).includes("chat/session-types"))!.importClause!.isTypeOnly).toBe(true);
  expect(source).not.toContain("session-registry");
  const registry = readFileSync(join(__dirname, "../session-registry.ts"), "utf8");
  const module = ts.createSourceFile("session-registry.ts", registry, ts.ScriptTarget.Latest, true);
  expect(module.statements.filter(ts.isImportDeclaration).filter(node => !node.importClause?.isTypeOnly)
    .map(node => (node.moduleSpecifier as ts.StringLiteral).text)).toEqual([
      "expo-crypto", "../auth/account-epoch", "../account/local-deletion-fence",
    ]);
});

test("explicit negative retirement ACK blocks wipe progress just like a thrown supervisor", () => {
  const { registry, content } = fixture(); const { session } = opened(registry);
  registry.claimWork(session, "keep", "source", () => false);
  expect(content.change({ generation: 1, phase: "blocked", wipeId: "wipe" })).toEqual([false]);
  expect(content.change({ generation: 1, phase: "needs-explicit-start", wipeId: "wipe" })).toEqual([false]);
  expect(registry.startAfterWipe(registry.getSnapshot("A")!.choice)).toBe(false);
});

test("unsubscribing a view does not drop other views or route tombstones", () => {
  const { registry } = fixture(); const first = opened(registry);
  const second = registry.attachView("a", "A")!;
  registry.detachView(first.view.viewId);
  expect(registry.releaseEntry("A")).toBe(false);
  registry.detachView(second.viewId);
  expect(registry.getSnapshot("A")!.session?.sessionId).toBe(first.session.sessionId);
  expect(registry.releaseEntry("A")).toBe(true);
  expect(registry.getSessionSnapshot(first.session)?.sessionId).toBe(first.session.sessionId);
  expect(registry.attachView("a", "bare")!.snapshot.session?.sessionId).toBe(first.session.sessionId);
});

test("an unannounced reopen cannot auto-resume old seeds; producer must authorize explicit restart", () => {
  const { registry, content } = fixture(); opened(registry, "A", context("old"));
  content.change({ generation: 1, phase: "blocked", wipeId: "wipe" });
  content.change({ generation: 1, phase: "open", wipeId: null });
  expect(registry.attachView("a", "bare", context("do not replay"))!.snapshot.session).toBeNull();
  expect(registry.startAfterWipe(registry.getSnapshot("bare")!.choice)).toBe(false);
});

test("subscription setup failure leaves no live owner or partially owned session", () => {
  const failing: ChatContentBoundary = {
    read: () => ({ generation: 0, phase: "open", wipeId: null }),
    subscribe: () => { throw new Error("no synchronous barrier available"); },
    startAfterWipe: () => false,
  };
  const registry = createChatSessionRegistry(failing); registries.push(registry);
  expect(registry.attachView("a", "A")).toBeNull();
  expect(registry.getSnapshot("A")).toBeNull();
  beginAccountOwnerTransition("b"); expect(registry.getSnapshot("A")).toBeNull();
});

test("a failing producer unsubscribe still retires pending work on account hold", () => {
  const boundary = contentFixture().boundary;
  const registry = createChatSessionRegistry({ ...boundary, subscribe: () => () => { throw new Error("unsubscribe failed"); } });
  registries.push(registry);
  const { session } = opened(registry); const retire = jest.fn();
  registry.claimWork(session, "send", "q", retire);
  beginAccountOwnerTransition("b");
  expect(retire).toHaveBeenCalledWith("account"); expect(registry.getSnapshot("A")).toBeNull();
});

test("account hold during a wipe callback still clears route bindings synchronously", () => {
  const { registry, content } = fixture(); const { session } = opened(registry);
  registry.claimWork(session, "keep", "source", () => { beginAccountOwnerTransition("b"); });
  content.change({ generation: 1, phase: "blocked", wipeId: "wipe" });
  expect(registry.getSnapshot("A")).toBeNull();
  publishOwner("b"); publishOwner("a");
  content.change({ generation: 1, phase: "open", wipeId: null });
  const fresh = opened(registry, "A");
  expect(fresh.session.sessionId).not.toBe(session.sessionId); expect(fresh.session.turns).toEqual([]);
});

function onNextChange(registry: ReturnType<typeof createChatSessionRegistry>, run: () => void, draft = false) {
  let armed = true;
  const listener = () => { if (armed) { armed = false; run(); } };
  return draft ? registry.subscribeDraft(listener) : registry.subscribe(listener);
}

test.each(["hold", "direct", "ABA", "wipe", "dispose", "clear", "replace"])(
  "attach does not return a private snapshot invalidated by a %s subscriber", change => {
    const { registry, content } = fixture(); const { session } = opened(registry);
    registry.replaceTurns(session, [{ ...turn(), text: "A private body" }]);
    onNextChange(registry, () => {
      if (change === "hold") beginAccountOwnerTransition("b");
      if (change === "direct") publishOwner("b");
      if (change === "ABA") { publishOwner("b"); publishOwner("a"); opened(registry, "fresh"); }
      if (change === "wipe") content.change({ generation: 1, phase: "blocked", wipeId: "wipe" });
      if (change === "dispose") registry.dispose();
      if (change === "clear") expect(registry.clear(registry.getSnapshot("A")!.choice)).toBe(true);
      if (change === "replace") opened(registry, "replacement", context("new"));
    });
    expect(registry.attachView("a", "bare")).toBeNull();
    expect(registry.isCurrent(session)).toBe(false);
    // A rejected attachment must not leave an inaccessible view handle behind.
    if (registry.getSnapshot("bare")) expect(registry.releaseEntry("bare")).toBe(true);
  },
);

test("attach rejects a snapshot superseded within the same live session and leaves no view handle", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  registry.replaceTurns(session, [turn()]);
  onNextChange(registry, () => { registry.replaceTurns(session, [{ ...turn(), text: "newer text" }]); });
  expect(registry.attachView("a", "bare")).toBeNull();
  expect(registry.getSessionSnapshot(session)?.turns[0].text).toBe("newer text");
  expect(registry.releaseEntry("bare")).toBe(true);
});

test.each(["hold", "direct", "ABA", "wipe", "dispose", "settled", "replace"])(
  "claim does not return a capability invalidated by a %s subscriber", change => {
    const { registry, content } = fixture(); const { session } = opened(registry);
    const retire = jest.fn();
    onNextChange(registry, () => {
      if (change === "hold") beginAccountOwnerTransition("b");
      if (change === "direct") publishOwner("b");
      if (change === "ABA") { publishOwner("b"); publishOwner("a"); opened(registry, "fresh"); }
      if (change === "wipe") content.change({ generation: 1, phase: "blocked", wipeId: "wipe" });
      if (change === "dispose") registry.dispose();
      if (change === "settled" || change === "replace") {
        const work = registry.getSessionSnapshot(session)!.work[0];
        expect(registry.settleWork(work)).toBe(true);
        if (change === "replace") opened(registry, "replacement", context("new"));
      }
    });
    expect(registry.claimWork(session, "send", "q", retire)).toBeNull();
    if (change === "settled" || change === "replace") expect(retire).not.toHaveBeenCalled();
    else expect(retire).toHaveBeenCalledTimes(1);
  },
);

test.each(["chooseCurrent", "chooseNew", "clear", "startAfterWipe", "releaseEntry"] as const)(
  "%s rejects its acknowledgement after a subscriber changes owner", method => {
    const { registry, content } = fixture(); const { view } = opened(registry);
    if (method === "startAfterWipe") content.change({ generation: 1, phase: "needs-explicit-start", wipeId: "wipe" });
    if (method === "releaseEntry") registry.detachView(view.viewId);
    const choice = registry.getSnapshot("A")!.choice;
    onNextChange(registry, () => { beginAccountOwnerTransition("b"); });
    const result = method === "chooseNew" ? registry.chooseNew(choice, context("new"))
      : method === "releaseEntry" ? registry.releaseEntry("A") : registry[method](choice);
    expect(result).toBe(false); expect(registry.getSnapshot("A")).toBeNull();
  },
);

test("entry acknowledgement rejects a same-session binding replacement during notification", () => {
  const { registry } = fixture(); opened(registry);
  onNextChange(registry, () => { registry.chooseCurrent(registry.getSnapshot("A")!.choice); });
  expect(registry.chooseCurrent(registry.getSnapshot("A")!.choice)).toBe(false);
  expect(registry.getSnapshot("A")!.binding.state).toBe("active");
});

test.each(["editDraft", "replaceTurns", "settleWork"] as const)(
  "%s rejects its acknowledgement after a subscriber changes owner", method => {
    const { registry } = fixture(); const { session } = opened(registry);
    const work = method === "settleWork" ? registry.claimWork(session, "send", "q", jest.fn()) : null;
    onNextChange(registry, () => { beginAccountOwnerTransition("b"); }, method === "editDraft");
    const result = method === "editDraft" ? registry.editDraft(session, "new input")
      : method === "replaceTurns" ? registry.replaceTurns(session, [turn()]) : registry.settleWork(work!);
    expect(result).toBe(false); expect(registry.getSessionSnapshot(session)).toBeNull();
  },
);

test("read-only and unrelated-view subscribers retain successful returns", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  const read = jest.fn(() => { registry.getSnapshot("A"); registry.getSessionSnapshot(session); });
  registry.subscribe(read);
  const attached = registry.attachView("a", "bare")!;
  expect(attached.snapshot).toBe(registry.getSnapshot("bare"));
  onNextChange(registry, () => { registry.attachView("a", "A"); });
  const work = registry.claimWork(session, "send", "q", jest.fn());
  expect(work).not.toBeNull(); expect(registry.settleWork(work!)).toBe(true);
  expect(read).toHaveBeenCalled();
});

test("a subscriber attaching another bare route does not reject the still-owned attachment", () => {
  const { registry } = fixture(); opened(registry);
  onNextChange(registry, () => { opened(registry, "other-bare"); });
  const attached = registry.attachView("a", "bare");
  expect(attached).not.toBeNull();
  expect(attached!.snapshot).toBe(registry.getSnapshot("bare"));
  expect(attached!.snapshot.session).toBe(registry.getSnapshot("other-bare")!.session);
  expect(registry.releaseEntry("bare")).toBe(false);
  registry.detachView(attached!.viewId);
  expect(registry.releaseEntry("bare")).toBe(true);
});

test("a subscriber replacing a settled work token cannot return the old capability or unset the new work", () => {
  const { registry } = fixture(); const { session } = opened(registry);
  let oldWork: ReturnType<typeof registry.claimWork> = null;
  let newWork: ReturnType<typeof registry.claimWork> = null;
  onNextChange(registry, () => {
    oldWork = registry.getSessionSnapshot(session)!.work[0];
    expect(registry.settleWork(oldWork)).toBe(true);
    newWork = registry.claimWork(session, "send", "q", jest.fn());
  });
  expect(registry.claimWork(session, "send", "q", jest.fn())).toBeNull();
  expect(newWork).not.toBeNull();
  expect(newWork).not.toBe(oldWork);
  expect(registry.settleWork(oldWork!)).toBe(false);
  expect(registry.getSessionSnapshot(session)!.work).toEqual([newWork]);
  expect(registry.settleWork(newWork!)).toBe(true);
});
