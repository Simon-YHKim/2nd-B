import type { AccountOwnerLease } from "../auth/account-epoch";

export type ContentMutationKind = "usage" | "raw-upload" | "source-insert" | "ingest-drop" | "raw-cleanup";
export type ContentOutcome = "registered" | "issued-pending" | "unknown" | "definitely-not-issued" | "committed" | "definitely-not-committed";
export type ContentBoundaryState = Readonly<{ generation: number; phase: "open" | "blocked" | "needs-explicit-start"; wipeId: string | null }>;
export type DeletionStage = "wiki-pages" | "sources" | "records" | "usage" | "self-contexts" | "clipper-templates";
declare const ticketBrand: unique symbol;
declare const permitBrand: unique symbol;
export type ContentMutationTicket = Readonly<{ [ticketBrand]: true }>;
export type ContentDeletionPermit = Readonly<{ [permitBrand]: true }>;
export type ContentSettlement = Readonly<{
  outcome: "committed" | "definitely-not-committed" | "unknown";
  count?: number;
  /** A private Storage adapter verified the original batch's exact path set. */
  scopeConfirmed?: true;
  observedRemovedCount?: number;
}>;
type Ticket = {
  ownerId: string; ownerEpoch: number; generation: number; operationId: string; stepId: string;
  kind: ContentMutationKind | "delete"; outcome: ContentOutcome; count: number | null;
  observedRemovedCount: number | null; wipe: Wipe | null; stage: string | null; permit: Permit | null;
};
type Permit = { ownerEpoch: number; id: string; wipe: Wipe; active: boolean };
type PhotoBatch = { id: string; ordinal: number; requestedCount: number };
type Wipe = {
  id: string; intentId: string; generation: number; phase: "draining" | "deleting" | "unknown" | "partial" | "completed";
  ackFailed: boolean; ackComplete: boolean; attempt: Permit | null;
  stages: Map<string, ContentMutationTicket>; recordsTicket: ContentMutationTicket | null;
  photoPlan: "unconfirmed" | "known-empty" | "known-batches";
  batches: readonly PhotoBatch[]; manifestAvailable: boolean; planRegistered: boolean;
};
type OwnerState = {
  generation: number; integrity: boolean; wipe: Wipe | null; command: boolean; settling: number;
  intents: Set<string>;
  tickets: Set<ContentMutationTicket>; listeners: Set<() => boolean>; observers: Set<() => void>;
};
const CORE: readonly DeletionStage[] = ["wiki-pages", "sources", "records", "usage"];
const DERIVED: readonly DeletionStage[] = ["self-contexts", "clipper-templates"];
const idValid = (id: string) => typeof id === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(id);
const countValid = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const unresolved = (outcome: ContentOutcome) => outcome === "registered" || outcome === "issued-pending" || outcome === "unknown";
const terminal = (outcome: ContentOutcome | undefined) => outcome === "committed" || outcome === "definitely-not-committed";

/** Inactive, memory-only factory. No subscriptions, transport, bodies or default instance.
 * Opaque tickets retain facts across epochs; they never authorize a new request. */
export function createContentWipeLedger() {
  const owners = new Map<string, OwnerState>();
  const tickets = new Map<ContentMutationTicket, Ticket>();
  const permits = new Map<ContentDeletionPermit, Permit>();
  let sequence = 0;
  const nextId = () => {
    if (!Number.isSafeInteger(sequence + 1)) throw new Error("content_identity_exhausted");
    return "content:" + ++sequence;
  };
  const current = (owner: AccountOwnerLease) => {
    try { return !!owner.ownerId && Number.isSafeInteger(owner.epoch) && owner.epoch >= 0 && owner.isCurrent() === true; }
    catch { return false; }
  };
  function state(owner: AccountOwnerLease): OwnerState {
    if (!current(owner)) throw new Error("content_owner_changed");
    let value = owners.get(owner.ownerId);
    if (!value) {
      value = { generation: 0, integrity: false, wipe: null, command: false, settling: 0, intents: new Set(),
        tickets: new Set(), listeners: new Set(), observers: new Set() };
      owners.set(owner.ownerId, value);
    }
    return value;
  }
  const pending = (s: OwnerState, except?: ContentMutationTicket) =>
    [...s.tickets].some(key => key !== except && unresolved(tickets.get(key)!.outcome));
  const unknown = (s: OwnerState) => [...s.tickets].some(key => tickets.get(key)!.outcome === "unknown");
  const stageTicket = (w: Wipe, stage: string) => { const key = w.stages.get(stage); return key ? tickets.get(key) : undefined; };
  const stageDone = (w: Wipe, stage: string) => stageTicket(w, stage)?.outcome === "committed";
  function photosDone(w: Wipe): boolean {
    return w.photoPlan === "known-empty" || (w.photoPlan === "known-batches" && w.batches.every(b => stageDone(w, b.id)));
  }
  const coreDone = (w: Wipe) => CORE.every(stage => stageDone(w, stage)) && photosDone(w);
  const eligible = (s: OwnerState, w: Wipe) => w.ackComplete && !w.ackFailed && !s.integrity && !pending(s)
    && w.attempt === null && coreDone(w) && DERIVED.every(stage => terminal(stageTicket(w, stage)?.outcome));
  function boundary(s: OwnerState): ContentBoundaryState {
    return Object.freeze({ generation: s.generation, wipeId: s.wipe?.id ?? null,
      phase: !s.wipe ? "open" : eligible(s, s.wipe) ? "needs-explicit-start" : "blocked" });
  }
  function publish(s: OwnerState) {
    for (const listener of [...s.observers]) { try { listener(); } catch { /* An observer cannot erase a fact. */ } }
  }
  function notifyBoundary(s: OwnerState, w: Wipe) {
    for (const listener of [...s.listeners]) {
      try { if (listener() !== true) w.ackFailed = true; } catch { w.ackFailed = true; }
    }
  }
  function inspect(owner: AccountOwnerLease) {
    const s = state(owner), w = s.wipe;
    return Object.freeze({
      ...boundary(s), detail: w?.phase ?? "open", integrityBlocked: s.integrity,
      ackConfirmed: w ? w.ackComplete && !w.ackFailed : true,
      tickets: Object.freeze([...s.tickets].map(key => {
        const t = tickets.get(key)!;
        return Object.freeze({ ownerId: t.ownerId, ownerEpoch: t.ownerEpoch, generation: t.generation,
          operationId: t.operationId, stepId: t.stepId, kind: t.kind, outcome: t.outcome,
          count: t.count, observedRemovedCount: t.observedRemovedCount });
      })),
      recordPhotos: w ? Object.freeze({ planState: w.photoPlan, complete: photosDone(w),
        manifestAvailable: w.manifestAvailable, expectedBatchCount: w.planRegistered ? w.batches.length : null,
        batches: Object.freeze(w.batches.map(b => Object.freeze({ ...b, outcome: stageTicket(w, b.id)?.outcome ?? "not-attempted",
          observedRemovedCount: stageTicket(w, b.id)?.observedRemovedCount ?? null }))) }) : null,
    });
  }
  function mutationCurrent(owner: AccountOwnerLease, t: Ticket): boolean {
    const s = owners.get(t.ownerId);
    return !!s && current(owner) && owner.ownerId === t.ownerId && owner.epoch === t.ownerEpoch
      && s.generation === t.generation && !s.wipe && !s.command && !s.settling && !s.integrity && !unknown(s);
  }
  function permitCurrent(owner: AccountOwnerLease, p: Permit): boolean {
    const s = owners.get(owner.ownerId);
    return !!s && current(owner) && owner.epoch === p.ownerEpoch && s.wipe === p.wipe
      && s.generation === p.wipe.generation && p.active && p.wipe.attempt === p
      && !s.command && !s.settling && !s.integrity && p.wipe.ackComplete && !p.wipe.ackFailed;
  }
  function stageAllowed(w: Wipe, stage: string): boolean {
    if (stage === "wiki-pages") return true;
    if (stage === "sources") return stageDone(w, "wiki-pages");
    if (stage === "records") return stageDone(w, "sources");
    const photo = w.batches.findIndex(b => b.id === stage);
    if (photo >= 0) return stageDone(w, "records") && w.manifestAvailable
      && w.batches.slice(0, photo).every(b => stageDone(w, b.id));
    if (stage === "usage") return stageDone(w, "records") && photosDone(w);
    if (stage === "self-contexts") return coreDone(w);
    if (stage === "clipper-templates") return coreDone(w) && terminal(stageTicket(w, "self-contexts")?.outcome);
    return false;
  }
  function ownsIssue(owner: AccountOwnerLease, key: ContentMutationTicket, t: Ticket): boolean {
    if (t.outcome !== "registered") return false;
    if (t.kind !== "delete") return mutationCurrent(owner, t);
    const s = owners.get(t.ownerId)!;
    return owner.ownerId === t.ownerId && !!t.permit && permitCurrent(owner, t.permit)
      && t.wipe?.phase === "deleting" && stageAllowed(t.wipe, t.stage!)
      && t.wipe.stages.get(t.stage!) === key && !pending(s, key);
  }
  function closeUnissued(key: ContentMutationTicket): boolean {
    const t = tickets.get(key);
    if (!t || t.outcome !== "registered") return false;
    t.outcome = "definitely-not-issued"; publish(owners.get(t.ownerId)!); return true;
  }
  function settleMutation(key: ContentMutationTicket, proof: ContentSettlement): boolean {
    const t = tickets.get(key); if (!t || t.outcome === "registered" || t.outcome === "definitely-not-issued") return false;
    const s = owners.get(t.ownerId)!;
    let outcome = proof?.outcome;
    let count: number | null = null, removed: number | null = null;
    if (outcome !== "committed" && outcome !== "definitely-not-committed" && outcome !== "unknown") outcome = "unknown";
    if (outcome === "committed" && t.kind === "delete") {
      const batch = t.wipe!.batches.find(b => b.id === t.stage);
      if (batch) {
        removed = countValid(proof.observedRemovedCount) ? proof.observedRemovedCount : null;
        if (proof.scopeConfirmed !== true || removed !== batch.requestedCount) outcome = "unknown";
      } else {
        count = countValid(proof.count) ? proof.count : null;
        if (count === null) outcome = "unknown";
      }
    }
    if (terminal(t.outcome)) {
      if (outcome === "unknown") return true; // Lost later observation cannot erase a prior receipt.
      if (outcome !== t.outcome || (outcome === "committed" && (t.count !== count || t.observedRemovedCount !== removed))) {
        s.integrity = true;
        s.settling++; try { publish(s); } finally { s.settling--; }
        return false;
      }
      return true;
    }
    t.outcome = outcome; t.count = count; t.observedRemovedCount = removed;
    if (outcome === "unknown" && t.wipe) t.wipe.phase = "unknown";
    if (outcome === "definitely-not-committed" && t.wipe && !DERIVED.includes(t.stage as DeletionStage)) {
      t.wipe.phase = "partial"; // A required-stage retry needs a new explicit attempt.
    }
    s.settling++; try { publish(s); } finally { s.settling--; }
    return true;
  }
  function issueMutation<T>(owner: AccountOwnerLease, key: ContentMutationTicket,
    dispatch: () => Promise<T>, callerGate: () => boolean = () => true): Promise<T> | null {
    const t = tickets.get(key);
    if (!t || !ownsIssue(owner, key, t)) { if (t) closeUnissued(key); return null; }
    let allowed = false;
    try { allowed = callerGate() === true; } catch { /* A throwing gate has not issued anything. */ }
    if (!allowed || !ownsIssue(owner, key, t)) { closeUnissued(key); return null; }
    t.outcome = "issued-pending";
    // No callback/publication/await between marking pending and dispatch.
    let operation: Promise<T>;
    try { operation = Promise.resolve(dispatch()); }
    catch (error) { operation = Promise.reject(error); }
    void operation.then(undefined, () => { settleMutation(key, { outcome: "unknown" }); });
    publish(owners.get(t.ownerId)!);
    return operation;
  }
  function acquireMutation(owner: AccountOwnerLease, generation: number,
    input: Readonly<{ operationId: string; stepId: string; kind: ContentMutationKind }>): ContentMutationTicket | null {
    const s = state(owner);
    if (!idValid(input.operationId) || !idValid(input.stepId)
      || !["usage", "raw-upload", "source-insert", "ingest-drop", "raw-cleanup"].includes(input.kind)) return null;
    const t: Ticket = { ownerId: owner.ownerId, ownerEpoch: owner.epoch, generation,
      operationId: input.operationId, stepId: input.stepId, kind: input.kind, outcome: "registered",
      count: null, observedRemovedCount: null, wipe: null, stage: null, permit: null };
    if (!mutationCurrent(owner, t) || [...s.tickets].some(k => {
      const old = tickets.get(k)!;
      return old.operationId === t.operationId && old.stepId === t.stepId;
    })) return null;
    const key = Object.freeze({}) as ContentMutationTicket;
    tickets.set(key, t); s.tickets.add(key); publish(s);
    if (!mutationCurrent(owner, t) || t.outcome !== "registered") { closeUnissued(key); return null; }
    return key;
  }
  function beginWipe(owner: AccountOwnerLease, expectedGeneration: number, intentId: string) {
    const s = state(owner);
    if (s.command || s.settling || !idValid(intentId)) return null;
    if (s.wipe) return s.wipe.intentId === intentId && s.generation === expectedGeneration ? inspect(owner) : null;
    if (s.generation !== expectedGeneration || s.intents.has(intentId) || !Number.isSafeInteger(s.generation + 1)) return null;
    const w: Wipe = { id: nextId(), intentId, generation: ++s.generation, phase: "draining",
      ackFailed: false, ackComplete: false, attempt: null, stages: new Map(), recordsTicket: null,
      photoPlan: "unconfirmed", batches: [], manifestAvailable: false, planRegistered: false };
    s.intents.add(intentId); s.wipe = w; s.command = true;
    try {
      for (const key of s.tickets) { const t = tickets.get(key)!; if (t.outcome === "registered") t.outcome = "definitely-not-issued"; }
      notifyBoundary(s, w); w.ackComplete = true; publish(s);
    } finally { s.command = false; }
    return current(owner) && s.wipe === w ? inspect(owner) : null;
  }
  function claimDeletionAttempt(owner: AccountOwnerLease, wipeId: string, generation: number): ContentDeletionPermit | null {
    const s = state(owner), w = s.wipe;
    if (!w || w.id !== wipeId || generation !== s.generation || s.command || s.settling
      || !w.ackComplete || w.ackFailed || s.integrity || pending(s)) return null;
    // A stale epoch permit loses execution authority, never its issued facts.
    if (w.attempt && w.attempt.ownerEpoch !== owner.epoch) { w.attempt.active = false; w.attempt = null; }
    if (w.attempt || w.phase === "completed") return null;
    const p: Permit = { ownerEpoch: owner.epoch, id: nextId(), wipe: w, active: true };
    const key = Object.freeze({}) as ContentDeletionPermit;
    permits.set(key, p); w.attempt = p; w.phase = "deleting"; publish(s);
    if (!permitCurrent(owner, p) || pending(s)) { p.active = false; if (w.attempt === p) w.attempt = null; return null; }
    return key;
  }
  function acquireDeletion(owner: AccountOwnerLease, key: ContentDeletionPermit, stage: DeletionStage | string): ContentMutationTicket | null {
    const p = permits.get(key), s = state(owner);
    if (!p || !permitCurrent(owner, p) || p.wipe.phase !== "deleting" || pending(s) || !stageAllowed(p.wipe, stage)) return null;
    const w = p.wipe, previous = stageTicket(w, stage);
    // One physical request per stage and attempt, including a gate refusal.
    // A retry must close this drained attempt and explicitly claim a new one.
    if (previous && (previous.permit === p
      || (previous.outcome !== "definitely-not-issued" && previous.outcome !== "definitely-not-committed"))) return null;
    const ticket = Object.freeze({}) as ContentMutationTicket;
    const t: Ticket = { ownerId: owner.ownerId, ownerEpoch: owner.epoch, generation: s.generation,
      operationId: w.id, stepId: p.id + ":" + stage, kind: "delete", outcome: "registered",
      count: null, observedRemovedCount: null, wipe: w, stage, permit: p };
    tickets.set(ticket, t); s.tickets.add(ticket); w.stages.set(stage, ticket);
    if (stage === "records") { w.recordsTicket = ticket; w.photoPlan = "unconfirmed"; }
    publish(s);
    if (!ownsIssue(owner, ticket, t)) { closeUnissued(ticket); return null; }
    return ticket;
  }
  function registerRecordPhotoPlan(key: ContentMutationTicket,
    plan: Readonly<{ returnedRowCount: number; batchCounts: readonly number[] }>): boolean {
    const t = tickets.get(key), w = t?.wipe;
    if (!t || !w || t.stage !== "records" || t.outcome !== "committed" || w.recordsTicket !== key || w.planRegistered
      || !countValid(plan.returnedRowCount) || t.count !== plan.returnedRowCount || !Array.isArray(plan.batchCounts)
      || (plan.returnedRowCount === 0 && plan.batchCounts.length !== 0)) return false;
    // Copy densely before validation: Array.every/map skip holes in sparse input.
    const counts = Array.from(plan.batchCounts);
    if (!counts.every(n => Number.isInteger(n) && n > 0 && n <= 100)) return false;
    w.batches = Object.freeze(counts.map((requestedCount, ordinal) => Object.freeze({ id: nextId(), ordinal, requestedCount })));
    w.photoPlan = w.batches.length ? "known-batches" : "known-empty"; w.planRegistered = true; w.manifestAvailable = true;
    const s = owners.get(t.ownerId)!;
    s.settling++; try { publish(s); } finally { s.settling--; }
    return true;
  }
  function loseRecordPhotoManifest(key: ContentMutationTicket): boolean {
    const t = tickets.get(key);
    if (!t?.wipe || t.stage !== "records" || t.wipe.recordsTicket !== key) return false;
    t.wipe.manifestAvailable = false;
    return true;
  }
  function finishWipe(owner: AccountOwnerLease, key: ContentDeletionPermit) {
    const p = permits.get(key), s = state(owner);
    if (!p || !permitCurrent(owner, p) || pending(s)) return null;
    const w = p.wipe;
    p.active = false; w.attempt = null; w.phase = "partial";
    if (eligible(s, w) && DERIVED.every(stage => stageDone(w, stage))) w.phase = "completed";
    s.command = true;
    try { notifyBoundary(s, w); publish(s); } finally { s.command = false; }
    return current(owner) && s.wipe === w ? inspect(owner) : null;
  }
  function startAfterWipe(owner: AccountOwnerLease, expected: ContentBoundaryState,
    commit: (opened: ContentBoundaryState) => boolean): boolean {
    const s = state(owner), w = s.wipe;
    if (!w || s.command || s.settling || expected.phase !== "needs-explicit-start"
      || expected.wipeId !== w.id || expected.generation !== s.generation || !eligible(s, w)) return false;
    s.command = true;
    let acknowledged = false;
    try {
      const opened = Object.freeze({ generation: s.generation, phase: "open" as const, wipeId: null });
      try { acknowledged = commit(opened) === true; } catch { acknowledged = false; }
      if (!acknowledged || !current(owner) || s.wipe !== w || !eligible(s, w)) return false;
      s.wipe = null;
      // Opening does not synchronously call boundary listeners; the A transaction publishes.
      return true;
    } finally { s.command = false; }
  }
  return {
    read: (owner: AccountOwnerLease) => boundary(state(owner)), inspect,
    subscribe(owner: AccountOwnerLease, listener: () => boolean) {
      const s = state(owner); s.listeners.add(listener); return () => { s.listeners.delete(listener); };
    },
    observe(owner: AccountOwnerLease, listener: () => void) {
      const s = state(owner); const owned = () => { if (current(owner)) listener(); };
      s.observers.add(owned); return () => { s.observers.delete(owned); };
    },
    acquireMutation, issueMutation, settleMutation, closeUnissued, beginWipe, claimDeletionAttempt,
    acquireDeletion, registerRecordPhotoPlan, loseRecordPhotoManifest, finishWipe, startAfterWipe,
  };
}
