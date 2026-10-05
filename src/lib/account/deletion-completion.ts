// What happens on this device after the server confirms an account erasure.
//
// ⚠ This file used to be an in-memory NOTICE STORE: it held the deletion
// receipt between the privacy screen and the sign-in screen and dropped it on
// owner/epoch changes. Five review rounds of fences around that hand-off did
// not converge (PR #2054), and the last one opened a path where A's receipt
// showed on B's sign-in screen during an account switch. Simon decided
// (Q-261004-42 = A, 2026-10-05) that the app must not be responsible for
// delivering the receipt. The server now records it (0217) and the app only
// opens a route carrying the receipt NUMBER (deletion-receipt.ts). The store,
// its epoch fences and its global notice are gone; git history keeps them.
//
// What is left is the order of three local steps, written as a plain function
// so it can be tested without rendering the screen:
//
//   1. purge the deleted owner's local data. purgeDeletedAccountLocalData
//      installs the irreversible terminal fence first - now only AFTER the
//      server confirmed, never before the request (deletion-pending.ts says why);
//   2. sign out exactly that owner's session (signOutExpected refuses any other);
//   3. decide whether to open the receipt route.
//
// None of it depends on the privacy screen staying mounted: a screen that
// unmounts mid-way no longer drops the sign-out or the receipt.
import type { AccountDeletionReceipt } from "../records/delete-bulk";
import {
  buildAccountDeletedHref,
  type LocalPurgeOutcome,
  type LocalSignOutOutcome,
} from "./deletion-receipt";

export type { LocalPurgeOutcome, LocalSignOutOutcome } from "./deletion-receipt";

/** Who owns the app right now, as account-epoch reports it. */
export interface AccountOwnerSnapshot {
  /** The owner AuthContext has published. */
  published: string | null;
  /** The owner a raised publication hold is about to publish; undefined = no hold. */
  pending: string | null | undefined;
}

export type FinishAccountDeletionResult =
  | {
      kind: "show-receipt";
      href: string;
      localPurge: LocalPurgeOutcome;
      localSignOut: LocalSignOutOutcome;
    }
  /** Another account owns (or is about to own) the app: do not show A's receipt. */
  | { kind: "owner-changed"; localPurge: LocalPurgeOutcome };

export interface FinishAccountDeletionDeps {
  owner: string;
  receipt: AccountDeletionReceipt;
  purgeLocal: (owner: string) => Promise<LocalPurgeOutcome>;
  signOut: () => Promise<void>;
  isOwnerChangedError: (error: unknown) => boolean;
  /** Forget the owner's pending requests once nothing is left to resolve. */
  clearPending: (owner: string) => Promise<unknown>;
  /** Remember the server receipt so a later run can retry an unfinished purge. */
  notePending: (owner: string, receiptId: string) => Promise<boolean>;
  readOwner: () => AccountOwnerSnapshot;
}

/** Bookkeeping must never hold up the result (gate DEL-BL-05). */
function detached(task: () => Promise<unknown>): void {
  void Promise.resolve().then(task).catch(() => undefined);
}

/**
 * Run the local half of a confirmed erasure and say where to go next.
 * Never throws for a local failure: the server erasure is already final, so a
 * local problem is reported as data, never turned into a retryable failure.
 */
export async function finishAccountDeletion(deps: FinishAccountDeletionDeps): Promise<FinishAccountDeletionResult> {
  let localPurge: LocalPurgeOutcome = "unconfirmed";
  try {
    localPurge = await deps.purgeLocal(deps.owner);
  } catch {
    localPurge = "unconfirmed";
  }

  if (localPurge === "complete") {
    detached(() => deps.clearPending(deps.owner));
  } else if (deps.receipt.receiptId !== null) {
    // The server receipt lets the next signed-out screen find this erasure and
    // retry the purge (resolveAllPendingAccountDeletions). Only then is it true
    // to tell the user a retry was recorded.
    let noted = false;
    try {
      noted = await deps.notePending(deps.owner, deps.receipt.receiptId);
    } catch {
      noted = false;
    }
    if (noted) localPurge = "retry-scheduled";
  }

  let localSignOut: LocalSignOutOutcome = "complete";
  try {
    await deps.signOut();
  } catch (error) {
    // A's server deletion succeeded, but B now owns local auth. Keep B signed
    // in and never route B to A's receipt.
    if (deps.isOwnerChangedError(error)) return { kind: "owner-changed", localPurge };
    localSignOut = "unconfirmed";
  }

  const owner = deps.readOwner();
  const otherPublished = owner.published !== null && owner.published !== deps.owner;
  const otherPending = owner.pending !== undefined && owner.pending !== null && owner.pending !== deps.owner;
  if (otherPublished || otherPending) return { kind: "owner-changed", localPurge };

  return {
    kind: "show-receipt",
    href: buildAccountDeletedHref({ receiptId: deps.receipt.receiptId, localPurge, localSignOut }),
    localPurge,
    localSignOut,
  };
}
