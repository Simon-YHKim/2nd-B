import { captureAccountOwnerLease } from "../auth/account-epoch";
import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import { getEncryptedNativeStorage, type StringStorage } from "../storage/encrypted-native-storage";
import {
  copyInterviewDraftContent, decodeInterviewDraft, encodeInterviewDraft,
  interviewDraftExpired, interviewDraftKey, INTERVIEW_DRAFT_TTL_MS,
  validInterviewDraftOwner,
  type InterviewDraft, type InterviewDraftContent, type InterviewDraftVersion,
} from "./draft-codec";

export type InterviewDraftResult =
  | { status: "ready"; draft: InterviewDraft }
  | { status: "empty" | "expired" | "discarded" | "conflict" | "stale" | "unsupported" | "unconfirmed" };

interface Dependencies {
  storage(): StringStorage | null;
  now(): number;
  newId(): string;
}

/** One instance owns the native queue. Dependencies also allow real-crypto disk-failure tests. */
export function createInterviewDraftStore(dependencies: Dependencies) {
  const tails = new Map<string, Promise<void>>();
  // A failed write/rollback is not an empty draft or an acknowledged save.
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
    const key = interviewDraftKey(owner);
    if (raw !== null && !interviewDraftExpired(decodeInterviewDraft(raw, owner), dependencies.now())) {
      await storage.setItem(key, raw);
    } else {
      await storage.removeItem(key);
    }
    rollbacks.delete(owner);
  }

  /** Capture once per mounted owner. Reusing this access after A -> B -> A stays stale. */
  function forOwner(owner: string) {
    const lease = validInterviewDraftOwner(owner) ? captureAccountOwnerLease(owner) : null;
    const current = () => lease?.isCurrent() === true && !isAccountLocalDeletionFencedInMemory(owner);
    let creation: { draftId: string; createdAt: number } | undefined;
    let creationConsumed = false;

    function run(operation: (storage: StringStorage) => Promise<InterviewDraftResult>): Promise<InterviewDraftResult> {
      if (!current()) return Promise.resolve({ status: "stale" });
      return queue<InterviewDraftResult>(owner, async () => {
        if (!current()) return { status: "stale" };
        let storage: StringStorage | null;
        try { storage = dependencies.storage(); } catch { return { status: "unconfirmed" }; }
        if (!storage) return { status: "unsupported" };
        const guarded = await runAccountLocalMutation(owner, async (): Promise<InterviewDraftResult> => {
          if (!current()) return { status: "stale" };
          try {
            await restore(owner, storage);
            if (!current()) return { status: "stale" };
            return await operation(storage);
          } catch {
            // Never forward exception text: native errors can include input values.
            return { status: "unconfirmed" };
          }
        }).catch(() => ({ executed: true, value: { status: "unconfirmed" } } as const));
        return guarded.executed ? guarded.value : { status: "stale" };
      }).then((result): InterviewDraftResult => {
        // The mutation and owner queues add async return boundaries after the
        // operation's own checks. Gate the public Promise's final settlement,
        // not only its disk read/write. No await follows this ownership check.
        // A failure contains no body/success ACK and must remain distinguishable
        // when an attempted rollback could not confirm storage cleanup.
        return current() || result.status === "unconfirmed" ? result : { status: "stale" };
      });
    }

    async function read(storage: StringStorage): Promise<{ raw: string | null; draft: InterviewDraft | null; expired: boolean }> {
      const key = interviewDraftKey(owner);
      const raw = await storage.getItem(key);
      const draft = raw === null ? null : decodeInterviewDraft(raw, owner);
      if (draft && interviewDraftExpired(draft, dependencies.now())) {
        // The queue serializes this removal with a newer save/discard for this owner.
        await storage.removeItem(key);
        return { raw: null, draft: null, expired: true };
      }
      return { raw, draft, expired: false };
    }

    async function write(storage: StringStorage, previous: string | null, draft: InterviewDraft): Promise<InterviewDraftResult> {
      if (!current()) return { status: "stale" };
      if (interviewDraftExpired(draft, dependencies.now())) return { status: "expired" };
      const raw = encodeInterviewDraft(draft);
      rollbacks.set(owner, previous);
      try {
        await storage.setItem(interviewDraftKey(owner), raw);
        if (!current() || interviewDraftExpired(draft, dependencies.now())) {
          await restore(owner, storage);
          return { status: current() ? "expired" : "stale" };
        }
        rollbacks.delete(owner);
        return { status: "ready", draft };
      } catch {
        // Keep the pending restoration if the disk cannot confirm either operation.
        try { await restore(owner, storage); } catch { /* next guarded operation retries */ }
        return { status: "unconfirmed" };
      }
    }

    function save(content: InterviewDraftContent, expected: InterviewDraftVersion | null): Promise<InterviewDraftResult> {
      if (!current()) return Promise.resolve({ status: "stale" });
      if (expected === null && creationConsumed) return Promise.resolve({ status: "conflict" });
      // Snapshot before any await; later caller edits must not change a queued write.
      let snapshot: InterviewDraftContent;
      try { snapshot = copyInterviewDraftContent(content); } catch { return Promise.resolve({ status: "unconfirmed" }); }
      const version = expected ? { draftId: expected.draftId, revision: expected.revision } : null;
      // Fixed at the first create attempt. Retrying this access never rolls its deadline forward.
      if (version === null && !creation) {
        try { creation = { draftId: dependencies.newId(), createdAt: dependencies.now() }; }
        catch { return Promise.resolve({ status: "unconfirmed" }); }
      }
      return run(async (storage) => {
        const before = await read(storage);
        if (!current()) return { status: "stale" };
        if (version === null && creationConsumed) return { status: "conflict" };
        if (version === null && before.draft) return { status: "conflict" };
        if (version !== null && (!before.draft || before.draft.draftId !== version.draftId
          || before.draft.revision !== version.revision)) return { status: before.expired ? "expired" : "conflict" };
        const draft: InterviewDraft = {
          ...snapshot, v: 1, ownerId: owner,
          draftId: before.draft?.draftId ?? creation!.draftId,
          revision: (before.draft?.revision ?? 0) + 1,
          createdAt: before.draft?.createdAt ?? creation!.createdAt,
          expiresAt: before.draft?.expiresAt ?? creation!.createdAt + INTERVIEW_DRAFT_TTL_MS,
        };
        const result = await write(storage, before.raw, draft);
        if (version === null && result.status === "ready") creationConsumed = true;
        return result;
      });
    }

    return {
      load: () => run(async (storage) => {
        const result = await read(storage);
        if (!current()) return { status: "stale" };
        return result.draft ? { status: "ready", draft: result.draft }
          : { status: result.expired ? "expired" : "empty" };
      }),
      create: (content: InterviewDraftContent) => save(content, null),
      replace: (expected: InterviewDraftVersion, content: InterviewDraftContent) => save(content, expected),
      discard: (expected: InterviewDraftVersion) => {
        const version = { draftId: expected.draftId, revision: expected.revision };
        return run(async (storage) => {
          const result = await read(storage);
          if (!current()) return { status: "stale" };
          if (!result.draft) return { status: result.expired ? "expired" : "empty" };
          if (result.draft.draftId !== version.draftId || result.draft.revision !== version.revision) {
            return { status: "conflict" };
          }
          await storage.removeItem(interviewDraftKey(owner));
          return { status: current() ? "discarded" : "stale" };
        });
      },
    };
  }

  async function purgeDeletedOwner(owner: string): Promise<boolean> {
    if (!validInterviewDraftOwner(owner) || !isAccountLocalDeletionFencedInMemory(owner)) return false;
    return queue(owner, async () => {
      // This first unit has never persisted a web draft. Web support/its logout purge follows separately.
      try {
        const storage = dependencies.storage();
        if (!storage) return true;
        await storage.removeItem(interviewDraftKey(owner));
        rollbacks.delete(owner);
        return true;
      } catch { return false; }
    });
  }

  return { forOwner, purgeDeletedOwner };
}

const nativeDrafts = createInterviewDraftStore({
  storage: () => {
    if ((globalThis.navigator as { product?: string } | undefined)?.product !== "ReactNative") return null;
    return getEncryptedNativeStorage();
  },
  now: () => Date.now(),
  newId: () => (require("expo-crypto") as { randomUUID(): string }).randomUUID(),
});

export const interviewDraftsForOwner = nativeDrafts.forOwner;
// Only called by terminal local-purge after installing its durable deletion fence.
export const purgeInterviewDraftsForDeletedAccount = nativeDrafts.purgeDeletedOwner;
