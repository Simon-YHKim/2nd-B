import { randomUUID } from "expo-crypto";
import { captureAccountOwnerLease, subscribeAccountTransition, type AccountOwnerLease } from "../auth/account-epoch";
import { isAccountLocalDeletionFencedInMemory } from "../account/local-deletion-fence";
import type {
  ChatContentBoundary, ChatContentState, ChatContextIntent, ChatDraftSnapshot,
  ChatEntryBinding, ChatEntryChoice, ChatEntrySnapshot, ChatRetirementReason,
  ChatSessionSnapshot, ChatSessionToken, ChatWorkKind, ChatWorkToken, SessionTurn,
} from "./session-types";

type Listener = () => void;
type Retire = (reason: ChatRetirementReason) => void | boolean;
interface Work { token: ChatWorkToken; retire: Retire }
interface Session { snapshot: ChatSessionSnapshot; draft: ChatDraftSnapshot; work: Map<string, Work>; sequences: Map<number, string>; maxSequence: number }
const DEFAULT_INTENT: ChatContextIntent = Object.freeze({ fromNode: null, mode: "analytic", persona: "secondb", seed: "" });

/** Dormant factory. No singleton, screen subscription, network or durable body store.
 * D3/D4 must provide the real content boundary before UI activation. A retirement
 * callback handles its own phase-aware cancel/drain; this registry never calls an
 * abort a server rollback and never owns the mutation quarantine ledger. */
export function createChatSessionRegistry(content: ChatContentBoundary, newId = randomUUID) {
  let owner: AccountOwnerLease | null = null;
  let boundary: ChatContentState | null = null;
  let active: Session | null = null;
  let generation = 0;
  let bindingRevision = 0;
  let needsExplicitStart = false;
  let contentAckFailed = false;
  let changing = false;
  let dirty = false;
  let draftDirty = false;
  let stopped = false;
  let stopAccount: (() => void) | null = null;
  let stopContent: (() => void) | null = null;
  const entries = new Map<string, ChatEntryBinding>();
  const snapshots = new Map<string, ChatEntrySnapshot>();
  const views = new Map<string, string>();
  const listeners = new Set<Listener>();
  const draftListeners = new Set<Listener>();

  function notify(list: Set<Listener>) {
    for (const listener of [...list]) {
      try { listener(); } catch { /* One observer cannot prevent ownership cleanup. */ }
    }
  }
  function markChanged() { dirty = true; snapshots.clear(); }
  function publish() {
    const changed = dirty; const typed = draftDirty;
    dirty = false; draftDirty = false;
    if (changed) notify(listeners);
    if (typed) notify(draftListeners);
  }
  function transaction<T>(fallback: T, command: () => T, valid: (result: T) => boolean = () => true): T {
    if (changing || stopped) return fallback;
    changing = true;
    let result = fallback;
    let stillOwned = () => false;
    try {
      result = command();
      const completed = { owner, boundary, active, needsExplicitStart, contentAckFailed };
      // publish can synchronously change owner, wipe or replace the session.
      // Check after every observer has returned, before handing a value to the caller.
      stillOwned = () => !stopped && currentOwner() && owner === completed.owner
        && active === completed.active && needsExplicitStart === completed.needsExplicitStart
        && contentAckFailed === completed.contentAckFailed
        && boundary?.generation === completed.boundary?.generation
        && boundary?.phase === completed.boundary?.phase && boundary?.wipeId === completed.boundary?.wipeId;
    }
    finally { changing = false; publish(); }
    return stillOwned() && valid(result) ? result : fallback;
  }
  function entryTransaction(entryId: string, command: () => boolean): boolean {
    let committed: ChatEntryBinding | undefined;
    return transaction(false, () => {
      const result = command();
      committed = entries.get(entryId);
      return result;
    }, () => entries.get(entryId) === committed);
  }
  function currentOwner() {
    return owner !== null && owner.isCurrent() && !isAccountLocalDeletionFencedInMemory(owner.ownerId);
  }
  function retireSession(reason: ChatRetirementReason): boolean {
    const old = active; active = null;
    markChanged(); draftDirty = true;
    if (!old) return true;
    const pending = [...old.work.values()]; old.work.clear();
    let acknowledged = true;
    for (const work of pending) {
      try { if (work.retire(reason) === false) acknowledged = false; } catch { acknowledged = false; }
    }
    return acknowledged;
  }
  function forgetOwner(reason: "account" | "disposed") {
    // Clear public access before callbacks, including callbacks which throw/reenter.
    entries.clear(); snapshots.clear(); views.clear();
    owner = null; boundary = null; needsExplicitStart = false; contentAckFailed = false;
    const accountCleanup = stopAccount; stopAccount = null;
    const contentCleanup = stopContent; stopContent = null;
    try { accountCleanup?.(); } catch { /* Cleanup must still retire owned work. */ }
    try { contentCleanup?.(); } catch { /* An adapter failure cannot retain the body. */ }
    retireSession(reason);
  }
  function retireEntries(reason: "replaced" | "cleared" | "content-wipe") {
    for (const [id, entry] of entries) {
      entries.set(id, Object.freeze({
        entryId: id, ownerEpoch: entry.ownerEpoch,
        contentGeneration: boundary?.generation ?? entry.contentGeneration,
        bindingRevision: ++bindingRevision, state: "retired", reason, intentConsumed: true,
        retiredSessionId: entry.state === "active" ? entry.sessionId
          : entry.state === "replacement-pending" ? entry.expectedSessionId : entry.retiredSessionId,
      }));
    }
    markChanged();
  }
  function syncContent(): boolean {
    if (!currentOwner()) { forgetOwner("account"); return false; }
    let next: ChatContentState;
    try { next = content.read(owner!); }
    catch {
      needsExplicitStart = true;
      retireEntries("content-wipe"); if (!retireSession("content-wipe")) contentAckFailed = true;
      boundary = null;
      return false;
    }
    if (!Number.isSafeInteger(next.generation) || next.generation < 0
      || (boundary !== null && next.generation < boundary.generation)) {
      needsExplicitStart = true; retireEntries("content-wipe"); if (!retireSession("content-wipe")) contentAckFailed = true;
      boundary = null; return false;
    }
    const changed = boundary === null || next.generation !== boundary.generation
      || next.phase !== boundary.phase || next.wipeId !== boundary.wipeId;
    boundary = Object.freeze({ ...next });
    if (changed && (active !== null || next.phase !== "open" || needsExplicitStart)) {
      needsExplicitStart = true;
      retireEntries("content-wipe");
      if (!retireSession("content-wipe")) contentAckFailed = true;
      return !contentAckFailed;
    }
    return !contentAckFailed;
  }
  function ensureOwner(ownerId: string): boolean {
    if (owner && !currentOwner()) forgetOwner("account");
    if (owner) return owner.ownerId === ownerId && syncContent();
    const lease = captureAccountOwnerLease(ownerId);
    if (!lease || isAccountLocalDeletionFencedInMemory(ownerId)) return false;
    owner = lease;
    stopAccount = subscribeAccountTransition(() => {
      if (!currentOwner()) {
        // A phase supervisor can synchronously observe an auth transition while
        // a wipe retirement is already running. Security cleanup cannot queue
        // behind the ordinary command reentrancy guard.
        if (changing) forgetOwner("account");
        else transaction(false, () => { forgetOwner("account"); return true; });
      }
    });
    try { stopContent = content.subscribe(lease, () => transaction(false, syncContent)); }
    catch { forgetOwner("account"); return false; }
    return syncContent();
  }
  function owns(token: ChatSessionToken): boolean {
    if (!currentOwner() || !active || !boundary || boundary.phase !== "open" || needsExplicitStart) return false;
    const live = active.snapshot;
    return token.ownerId === live.ownerId && token.ownerEpoch === live.ownerEpoch
      && token.contentGeneration === live.contentGeneration && token.sessionId === live.sessionId
      && token.sessionGeneration === live.sessionGeneration;
  }
  function bind(entryId: string) {
    entries.set(entryId, Object.freeze({
      entryId, ownerEpoch: owner!.epoch, contentGeneration: boundary!.generation,
      bindingRevision: ++bindingRevision, state: "active", sessionId: active!.snapshot.sessionId, intentConsumed: true,
    }));
    markChanged();
  }
  function createSession(entryId: string, intent: ChatContextIntent, reason: "replaced" | "cleared") {
    retireEntries(reason); retireSession(reason);
    const sessionId = newId();
    active = {
      snapshot: Object.freeze({ ownerId: owner!.ownerId, ownerEpoch: owner!.epoch,
        contentGeneration: boundary!.generation, sessionId, sessionGeneration: ++generation,
        revision: 0, turns: Object.freeze([]), mode: intent.mode, persona: intent.persona,
        context: Object.freeze({ fromNode: intent.fromNode }), work: Object.freeze([]),
      }),
      draft: Object.freeze({ text: intent.seed, revision: 0 }), work: new Map(), sequences: new Map(), maxSequence: -1,
    };
    bind(entryId);
  }
  function entryChoice(entry: ChatEntryBinding): ChatEntryChoice {
    return Object.freeze({ ownerId: owner!.ownerId, ownerEpoch: owner!.epoch,
      contentGeneration: boundary?.generation ?? entry.contentGeneration,
      entryId: entry.entryId, bindingRevision: entry.bindingRevision,
      expectedSessionId: active?.snapshot.sessionId ?? null, expectedGeneration: generation,
    });
  }
  function matches(choice: ChatEntryChoice): boolean {
    const entry = entries.get(choice.entryId);
    return currentOwner() && boundary !== null && entry !== undefined
      && owner!.ownerId === choice.ownerId && owner!.epoch === choice.ownerEpoch
      && boundary.generation === choice.contentGeneration && entry.bindingRevision === choice.bindingRevision
      && (active?.snapshot.sessionId ?? null) === choice.expectedSessionId && generation === choice.expectedGeneration;
  }
  function snapshot(entryId: string): ChatEntrySnapshot | null {
    if (!currentOwner()) return null;
    const entry = entries.get(entryId);
    if (!entry) return null;
    const cached = snapshots.get(entryId);
    if (cached) return cached;
    const value = Object.freeze({ binding: entry,
      session: entry.state === "active" && active?.snapshot.sessionId === entry.sessionId ? active.snapshot : null,
      choice: entryChoice(entry),
    });
    snapshots.set(entryId, value); return value;
  }
  function reviseWork() {
    active!.snapshot = Object.freeze({ ...active!.snapshot, revision: active!.snapshot.revision + 1,
      work: Object.freeze([...active!.work.values()].map(work => work.token)),
    });
    markChanged();
  }

  return {
    usesContentBoundary: (candidate: ChatContentBoundary): boolean => candidate === content,
    subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeDraft(listener: Listener) { draftListeners.add(listener); return () => { draftListeners.delete(listener); }; },
    getSnapshot: snapshot,
    /** Controllers read by session ownership, including after the last route was popped. */
    getSessionSnapshot(token: ChatSessionToken): ChatSessionSnapshot | null { return owns(token) ? active!.snapshot : null; },
    /** Consent grants use the high-water mark, including removed/replaced turns. */
    getNextSequence(token: ChatSessionToken): number | null { return owns(token) ? active!.maxSequence + 1 : null; },
    getDraftSnapshot(token: ChatSessionToken): ChatDraftSnapshot | null { return owns(token) ? active!.draft : null; },
    isCurrent: owns,
    attachView(ownerId: string, entryId: string, intent: ChatContextIntent | null = null) {
      let attachedView: string | null = null;
      const result = transaction<{ viewId: string; snapshot: ChatEntrySnapshot } | null>(null, () => {
        if (!entryId || !ensureOwner(ownerId) || !boundary) return null;
        if (!entries.has(entryId)) {
          if (needsExplicitStart || boundary.phase !== "open") {
            entries.set(entryId, Object.freeze({ entryId, ownerEpoch: owner!.epoch,
              contentGeneration: boundary.generation, bindingRevision: ++bindingRevision,
              state: "retired", retiredSessionId: null, reason: "content-wipe", intentConsumed: true,
            })); markChanged();
          } else if (!active || (intent && active.work.size === 0)) {
            createSession(entryId, intent ?? DEFAULT_INTENT, "replaced");
          } else if (intent) {
            entries.set(entryId, Object.freeze({ entryId, ownerEpoch: owner!.epoch,
              contentGeneration: boundary.generation, bindingRevision: ++bindingRevision,
              state: "replacement-pending", expectedSessionId: active.snapshot.sessionId,
              expectedGeneration: generation, intent: Object.freeze({ ...intent }),
            })); markChanged();
          } else bind(entryId);
        }
        // Return the same settled external-store object subsequently read by React.
        if (dirty) snapshots.clear();
        const value = snapshot(entryId)!;
        const viewId = newId(); views.set(viewId, entryId);
        attachedView = viewId;
        return { viewId, snapshot: value };
      }, value => {
        const current = snapshot(entryId);
        return value !== null && views.get(value.viewId) === entryId
          && current?.binding === value.snapshot.binding && current.session === value.snapshot.session;
      });
      // A rejected attachment gives the caller no handle with which to detach.
      if (!result && attachedView !== null) views.delete(attachedView);
      // Another entry can invalidate the shared snapshot cache without changing
      // this binding or session. Return its settled external-store reference.
      return result ? { viewId: result.viewId, snapshot: snapshot(entryId)! } : null;
    },
    detachView(viewId: string) { views.delete(viewId); },
    /** Only the navigation host can assert removal from its history. Detach is not pop. */
    releaseEntry(entryId: string): boolean {
      return entryTransaction(entryId, () => {
        if ([...views.values()].includes(entryId)) return false;
        snapshots.delete(entryId); const removed = entries.delete(entryId); if (removed) markChanged(); return removed;
      });
    },
    chooseCurrent(choice: ChatEntryChoice): boolean {
      return entryTransaction(choice.entryId, () => {
        if (!matches(choice) || !active || !owns(active.snapshot)) return false;
        bind(choice.entryId); return true;
      });
    },
    chooseNew(choice: ChatEntryChoice, intent: ChatContextIntent): boolean {
      return entryTransaction(choice.entryId, () => {
        if (!matches(choice) || !boundary || boundary.phase !== "open" || needsExplicitStart || active?.work.size) return false;
        createSession(choice.entryId, intent, "replaced"); return true;
      });
    },
    clear(choice: ChatEntryChoice): boolean {
      return entryTransaction(choice.entryId, () => {
        if (!matches(choice) || !active || !owns(active.snapshot) || active.work.size
          || entries.get(choice.entryId)?.state !== "active") return false;
        const intent = { fromNode: active.snapshot.context.fromNode, mode: active.snapshot.mode,
          persona: active.snapshot.persona, seed: "" };
        createSession(choice.entryId, intent, "cleared"); return true;
      });
    },
    startAfterWipe(choice: ChatEntryChoice): boolean {
      return entryTransaction(choice.entryId, () => {
        if (contentAckFailed || !matches(choice) || !boundary || boundary.phase !== "needs-explicit-start" || !needsExplicitStart || active) return false;
        let committed = false;
        let candidate: Session | null = null;
        const expected = boundary;
        const expectedOwner = owner;
        let accepted = false;
        try {
          accepted = content.startAfterWipe(owner!, expected, opened => {
            if (committed || contentAckFailed || !matches(choice) || opened.phase !== "open"
              || opened.wipeId !== null || opened.generation !== expected.generation) return false;
            boundary = Object.freeze({ ...opened }); needsExplicitStart = false;
            try { createSession(choice.entryId, DEFAULT_INTENT, "replaced"); }
            catch { return false; }
            candidate = active;
            if (!currentOwner() || owner !== expectedOwner || !candidate
              || candidate.snapshot.ownerEpoch !== expectedOwner!.epoch
              || candidate.snapshot.contentGeneration !== opened.generation
              || entries.get(choice.entryId)?.state !== "active") return false;
            committed = true;
            return true;
          });
        } catch { accepted = false; }
        if (!accepted || !committed) {
          // A failed start must not make the next bare attach silently open.
          // Never remove a session installed for a different owner.
          if (owner === expectedOwner && currentOwner()) {
            boundary = expected; needsExplicitStart = true;
            if (active === candidate) retireSession("content-wipe");
            retireEntries("content-wipe");
          }
          return false;
        }
        return true;
      });
    },
    editDraft(token: ChatSessionToken, text: string, expectedRevision?: number): boolean {
      return transaction(false, () => {
        if (!owns(token) || (expectedRevision !== undefined && active!.draft.revision !== expectedRevision)) return false;
        if (active!.draft.text !== text) {
          active!.draft = Object.freeze({ text, revision: active!.draft.revision + 1 }); draftDirty = true;
        }
        return true;
      });
    },
    replaceTurns(token: ChatSessionToken, turns: readonly SessionTurn[]): boolean {
      return transaction(false, () => {
        if (!owns(token)) return false;
        const ids = new Set<string>(); let previous = -1;
        for (const turn of turns) {
          if (!turn.id || ids.has(turn.id) || !turn.exchangeId || !Number.isSafeInteger(turn.sequence) || turn.sequence <= previous) return false;
          const seenId = active!.sequences.get(turn.sequence);
          if (seenId !== undefined ? seenId !== turn.id : turn.sequence <= active!.maxSequence) return false;
          ids.add(turn.id); previous = turn.sequence;
        }
        const copied = turns.map(turn => Object.freeze({ ...turn,
          ...(turn.chips ? { chips: Object.freeze([...turn.chips]) } : {}),
          ...(turn.branches ? { branches: Object.freeze([...turn.branches]) } : {}),
        }));
        for (const turn of copied) active!.sequences.set(turn.sequence, turn.id);
        active!.maxSequence = Math.max(active!.maxSequence, previous);
        active!.snapshot = Object.freeze({ ...active!.snapshot, revision: active!.snapshot.revision + 1, turns: Object.freeze(copied) });
        markChanged(); return true;
      });
    },
    claimWork(token: ChatSessionToken, kind: ChatWorkKind, key: string, retire: Retire): ChatWorkToken | null {
      return transaction<ChatWorkToken | null>(null, () => {
        if (!owns(token) || !key || [...active!.work.values()].some(work => work.token.kind === kind && (kind === "send" || work.token.key === key))) return null;
        const work = Object.freeze({ ownerId: token.ownerId, ownerEpoch: token.ownerEpoch,
          contentGeneration: token.contentGeneration, sessionId: token.sessionId,
          sessionGeneration: token.sessionGeneration, kind, key, operationId: newId(),
        });
        active!.work.set(work.operationId, { token: work, retire }); reviseWork(); return work;
      }, work => work !== null && owns(work) && active!.work.get(work.operationId)?.token === work);
    },
    settleWork(work: ChatWorkToken): boolean {
      return transaction(false, () => {
        if (!owns(work) || active!.work.get(work.operationId)?.token !== work) return false;
        active!.work.delete(work.operationId); reviseWork(); return true;
      });
    },
    dispose() {
      transaction(false, () => { stopped = true; forgetOwner("disposed"); return true; });
      listeners.clear(); draftListeners.clear();
    },
  };
}
