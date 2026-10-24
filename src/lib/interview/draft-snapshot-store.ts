import { captureAccountOwnerLease } from "../auth/account-epoch";
import { isAccountLocalDeletionFencedInMemory, runAccountLocalMutation } from "../account/local-deletion-fence";
import { getEncryptedNativeStorage, type StringStorage } from "../storage/encrypted-native-storage";
import { INTERVIEW_DRAFT_TTL_MS, validInterviewDraftOwner, type InterviewDraftVersion } from "./draft-codec";
import { decodeInterviewDraftSnapshot, encodeInterviewDraftSnapshot, type InterviewDraftSnapshot } from "./draft-snapshot";

export const INTERVIEW_SNAPSHOT_KEY_PREFIX = "interview.drafts.v2.";
export function interviewSnapshotKey(owner: string): string {
  if (!validInterviewDraftOwner(owner)) throw new Error("interview_draft_invalid_owner");
  return `${INTERVIEW_SNAPSHOT_KEY_PREFIX}${owner}`;
}

/** A trusted provider must bind this ticket to durable content-generation evidence.
 * Its check is synchronous, monotonic after invalidation, and never reacquires a ticket.
 * Neither an owner lease nor the in-memory content-wipe guard supplies that evidence. */
export interface InterviewContentLease {
  readonly generation: string;
  check(): "current" | "stale" | "unconfirmed";
}
export type InterviewSnapshotContent = Pick<InterviewDraftSnapshot,
  "period" | "uiLanguage" | "conversationLocale" | "growthOrigin" | "state"> & {
  pending: Exclude<InterviewDraftSnapshot["pending"], { kind: "save" }>;
};
export type InterviewSnapshotResult =
  | { status: "stored" | "loaded" | "quarantined"; draft: InterviewDraftSnapshot }
  | { status: "empty" | "expired" | "discarded" | "conflict" | "stale" | "unsupported" | "unconfirmed" };
interface Dependencies {
  storage(): StringStorage | null;
  now(): number;
  newId(): string;
  contentLease(owner: string): InterviewContentLease | null;
}
type Guard = "current" | "stale" | "unconfirmed";
type Read = { raw: string | null; draft: InterviewDraftSnapshot | null; expired: boolean };
const expired = (draft: InterviewDraftSnapshot, now: number) =>
  !Number.isSafeInteger(now) || now < draft.createdAt || now >= draft.expiresAt;

/** One production coordinator owns local revision CAS; this is not cross-process CAS. */
export function createInterviewSnapshotStore(dependencies: Dependencies) {
  const tails = new Map<string, Promise<void>>();
  const rollbacks = new Map<string, string | null>();
  function queue<T>(owner: string, operation: () => Promise<T>): Promise<T> {
    const previous = tails.get(owner) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(() => undefined, () => undefined);
    tails.set(owner, tail);
    void tail.then(() => { if (tails.get(owner) === tail) tails.delete(owner); });
    return result;
  }
  async function restore(owner: string, storage: StringStorage): Promise<void> {
    if (!rollbacks.has(owner)) return;
    const raw = rollbacks.get(owner) ?? null;
    if (raw !== null && !expired(decodeInterviewDraftSnapshot(raw, owner), dependencies.now())) {
      // A restored pre-wipe value still carries its OLD generation; never relabel it.
      await storage.setItem(interviewSnapshotKey(owner), raw);
    } else await storage.removeItem(interviewSnapshotKey(owner));
    rollbacks.delete(owner);
  }

  function forOwner(owner: string) {
    const lease = validInterviewDraftOwner(owner) ? captureAccountOwnerLease(owner) : null;
    let ticket: InterviewContentLease | null = null;
    let generation = "";
    try {
      ticket = lease ? dependencies.contentLease(owner) : null;
      generation = ticket?.generation ?? "";
      if (!validInterviewDraftOwner(generation)) ticket = null;
    } catch { ticket = null; }
    const ownerCurrent = () => lease?.isCurrent() === true && !isAccountLocalDeletionFencedInMemory(owner);
    function guard(): Guard {
      if (!ownerCurrent()) return "stale";
      if (!ticket) return "unconfirmed";
      let result: Guard;
      try { result = ticket.check(); if (ticket.generation !== generation) result = "stale"; }
      catch { result = "unconfirmed"; }
      // A provider can synchronously publish an owner transition while checking.
      if (!ownerCurrent()) return "stale";
      return result === "current" || result === "stale" ? result : "unconfirmed";
    }
    let creation: { draftId: string; createdAt: number } | undefined;
    let creationConsumed = false;

    function run(operation: (storage: StringStorage) => Promise<InterviewSnapshotResult>): Promise<InterviewSnapshotResult> {
      const early = guard();
      if (early !== "current") return Promise.resolve({ status: early });
      return queue<InterviewSnapshotResult>(owner, async () => {
        const queued = guard();
        if (queued !== "current") return { status: queued };
        let storage: StringStorage | null;
        try { storage = dependencies.storage(); } catch { return { status: "unconfirmed" }; }
        if (!storage) return { status: "unsupported" };
        const guarded = await runAccountLocalMutation(owner, async (): Promise<InterviewSnapshotResult> => {
          const before = guard();
          if (before !== "current") return { status: before };
          try {
            await restore(owner, storage);
            const after = guard();
            return after === "current" ? await operation(storage) : { status: after };
          } catch { return { status: "unconfirmed" }; }
        }).catch(() => ({ executed: true, value: { status: "unconfirmed" } } as const));
        return guarded.executed ? guarded.value : { status: "stale" };
      }).then((result): InterviewSnapshotResult => {
        // No await after this check: queue/fence Promise adoption is also an owner boundary.
        const settled = guard();
        if (settled !== "current" && result.status !== "unconfirmed") return { status: settled };
        if ("draft" in result) {
          // Read/write checks precede Promise adoption. Time can cross the fixed
          // deadline there too. No removal ACK exists at this final boundary:
          // hide the body/success, leave cleanup to the next serialized access.
          try { if (expired(result.draft, dependencies.now())) return { status: "unconfirmed" }; }
          catch { return { status: "unconfirmed" }; }
          if (!ownerCurrent()) return { status: "stale" };
        }
        return result;
      });
    }

    async function read(storage: StringStorage): Promise<Read> {
      const raw = await storage.getItem(interviewSnapshotKey(owner));
      const draft = raw === null ? null : decodeInterviewDraftSnapshot(raw, owner);
      if (draft) creationConsumed = true;
      if (draft && expired(draft, dependencies.now()) && guard() === "current") {
        await storage.removeItem(interviewSnapshotKey(owner));
        return { raw: null, draft: null, expired: true };
      }
      return { raw, draft, expired: false };
    }
    async function write(storage: StringStorage, previous: string | null, draft: InterviewDraftSnapshot): Promise<InterviewSnapshotResult> {
      const before = guard();
      if (before !== "current") return { status: before };
      if (expired(draft, dependencies.now())) return { status: "expired" };
      const raw = encodeInterviewDraftSnapshot(draft);
      rollbacks.set(owner, previous);
      try {
        await storage.setItem(interviewSnapshotKey(owner), raw);
        const after = guard();
        if (after !== "current" || expired(draft, dependencies.now())) {
          await restore(owner, storage);
          return { status: after === "current" ? "expired" : after };
        }
        rollbacks.delete(owner);
        // Never share a returned object with a queued input or retained internal snapshot.
        return { status: "stored", draft: decodeInterviewDraftSnapshot(raw, owner) };
      } catch {
        try { await restore(owner, storage); } catch { /* next guarded operation retries */ }
        return { status: "unconfirmed" };
      }
    }
    function copyContent(content: InterviewSnapshotContent): InterviewSnapshotContent {
      const copy = decodeInterviewDraftSnapshot(encodeInterviewDraftSnapshot({
        ...content, v: 2, ownerId: owner, draftId: "copy", revision: 1, createdAt: 0,
        expiresAt: INTERVIEW_DRAFT_TTL_MS, contentGeneration: "copy",
      }), owner);
      if (copy.pending?.kind === "save") throw new Error("interview_draft_invalid");
      return { period: copy.period, uiLanguage: copy.uiLanguage, conversationLocale: copy.conversationLocale,
        growthOrigin: copy.growthOrigin, state: copy.state, pending: copy.pending };
    }
    function mutate(expected: InterviewDraftVersion,
      update: (before: InterviewDraftSnapshot) => InterviewDraftSnapshot | null,
    ): Promise<InterviewSnapshotResult> {
      const version = { draftId: expected.draftId, revision: expected.revision };
      return run(async (storage) => {
        const before = await read(storage);
        const checked = guard();
        if (checked !== "current") return { status: checked };
        if (!before.draft || before.draft.draftId !== version.draftId || before.draft.revision !== version.revision
          || before.draft.contentGeneration !== generation) return { status: before.expired ? "expired" : "conflict" };
        const next = update(before.draft);
        if (!next || !Number.isSafeInteger(before.draft.revision + 1)) return { status: "conflict" };
        return write(storage, before.raw, { ...next, revision: before.draft.revision + 1 });
      });
    }

    return {
      load: () => run(async (storage) => {
        const result = await read(storage);
        const checked = guard();
        if (checked !== "current") return { status: checked };
        return result.draft ? { status: result.draft.contentGeneration === generation ? "loaded" : "quarantined", draft: result.draft }
          : { status: result.expired ? "expired" : "empty" };
      }),
      create: (content: InterviewSnapshotContent): Promise<InterviewSnapshotResult> => {
        let snapshot: InterviewSnapshotContent;
        try { snapshot = copyContent(content); } catch { return Promise.resolve({ status: "unconfirmed" }); }
        if (creationConsumed) return Promise.resolve({ status: "conflict" });
        const checked = guard();
        if (checked !== "current") return Promise.resolve({ status: checked });
        if (!creation) {
          try { creation = { draftId: dependencies.newId(), createdAt: dependencies.now() }; }
          catch { return Promise.resolve({ status: "unconfirmed" }); }
        }
        return run(async (storage) => {
          const before = await read(storage);
          const current = guard();
          if (current !== "current") return { status: current };
          if (before.draft || creationConsumed) return { status: "conflict" };
          const result = await write(storage, before.raw, { ...snapshot, v: 2, ownerId: owner,
            ...creation!, revision: 1, expiresAt: creation!.createdAt + INTERVIEW_DRAFT_TTL_MS, contentGeneration: generation });
          if (result.status === "stored") creationConsumed = true;
          return result;
        });
      },
      replace: (expected: InterviewDraftVersion, content: InterviewSnapshotContent): Promise<InterviewSnapshotResult> => {
        const version = { draftId: expected.draftId, revision: expected.revision };
        let snapshot: InterviewSnapshotContent;
        try { snapshot = copyContent(content); } catch { return Promise.resolve({ status: "unconfirmed" }); }
        return mutate(version, (before) => {
          if (before.pending?.kind === "save") return null;
          if (before.state.phase !== "active" && JSON.stringify(before.state) !== JSON.stringify(snapshot.state)) return null;
          if (before.pending?.kind === "request" && snapshot.pending !== null
            && JSON.stringify(before.pending) !== JSON.stringify(snapshot.pending)) return null;
          return { ...before, ...snapshot };
        });
      },
      beginSave: (expected: InterviewDraftVersion, identity: { requestId: string; sessionId: string }) => {
        const version = { draftId: expected.draftId, revision: expected.revision };
        const keys = { requestId: identity.requestId, sessionId: identity.sessionId };
        return mutate(version, (before) => before.pending !== null ? null : {
          ...before, pending: { kind: "save", status: "pending", intent: { ...keys,
            draftId: before.draftId, revision: before.revision, contentGeneration: before.contentGeneration, snapshot: before.state } },
        });
      },
      markSaveUnknown: (expected: InterviewDraftVersion, requestId: string) => mutate(expected, (before) =>
        before.pending?.kind !== "save" || before.pending.intent.requestId !== requestId ? null : {
          ...before, pending: { ...before.pending, status: "unknown" },
        }),
      discard: (expected: InterviewDraftVersion) => {
        const version = { draftId: expected.draftId, revision: expected.revision };
        return run(async (storage) => {
          const before = await read(storage);
          const checked = guard();
          if (checked !== "current") return { status: checked };
          if (!before.draft) return { status: before.expired ? "expired" : "empty" };
          if (before.draft.draftId !== version.draftId || before.draft.revision !== version.revision
            || before.draft.contentGeneration !== generation || before.draft.pending?.kind === "save") return { status: "conflict" };
          await storage.removeItem(interviewSnapshotKey(owner));
          creationConsumed = true;
          const after = guard();
          return { status: after === "current" ? "discarded" : after };
        });
      },
    };
  }
  async function purgeDeletedOwner(owner: string): Promise<boolean> {
    if (!validInterviewDraftOwner(owner) || !isAccountLocalDeletionFencedInMemory(owner)) return false;
    return queue(owner, async () => {
      try {
        const storage = dependencies.storage();
        if (!storage) return true; // This native-only adapter has never persisted a web body.
        await storage.removeItem(interviewSnapshotKey(owner));
        rollbacks.delete(owner);
        return true;
      } catch { return false; }
    });
  }
  return { forOwner, purgeDeletedOwner };
}

const nativeSnapshots = createInterviewSnapshotStore({
  storage: () => (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative"
    ? getEncryptedNativeStorage() : null,
  now: () => Date.now(),
  newId: () => (require("expo-crypto") as { randomUUID(): string }).randomUUID(),
  // Deliberately unavailable until the durable server generation/wipe contract exists.
  contentLease: () => null,
});
export const interviewSnapshotsForOwner = nativeSnapshots.forOwner;
export const purgeInterviewSnapshotsForDeletedAccount = nativeSnapshots.purgeDeletedOwner;
