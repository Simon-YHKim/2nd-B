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
//   2. open the receipt route, unless another account is already visible;
//   3. sign out exactly that owner's session (signOutExpected refuses any other)
//      and leave the receipt route if another account took over meanwhile.
//
// None of it depends on the privacy screen staying mounted: a screen that
// unmounts mid-way no longer drops the sign-out or the receipt.
//
// How the two local results reach the route: through deletion-local-outcome.ts,
// bound to a one-time token in the route, never as URL claims (gates
// DEL2-R1-05 / D2A-06).
import type { AccountDeletionReceipt } from "../records/delete-bulk";
import {
  beginLocalDeletionOutcome,
  discardLocalDeletionOutcome,
  reportLocalDeletionSignOut,
  type LocalDeletionOutcome,
} from "./deletion-local-outcome";
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
  /** Another account owns (or is about to own) the app: A's receipt route is not (or no longer) open. */
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
  /** Dismiss the owned stack and open the receipt route. */
  openReceipt: (href: string) => void;
  /** Leave A's receipt route for the app root (another account took over). */
  leaveReceipt: () => void;
  /** Test seam for the route token; defaults to a random UUID. */
  newToken?: () => string;
}

/** Bookkeeping must never hold up the result (gate DEL-BL-05). */
function detached(task: () => Promise<unknown>): void {
  void Promise.resolve().then(task).catch(() => undefined);
}

function otherOwnerVisible(owner: AccountOwnerSnapshot, deleted: string): boolean {
  const otherPublished = owner.published !== null && owner.published !== deleted;
  const otherPending = owner.pending !== undefined && owner.pending !== null && owner.pending !== deleted;
  return otherPublished || otherPending;
}

function quietly(step: () => void): void {
  try {
    step();
  } catch {
    // Navigation is best-effort here; the server erasure is already final.
  }
}

/**
 * Run the local half of a confirmed erasure and say where it ended.
 * Never throws for a local failure: the server erasure is already final, so a
 * local problem is reported as data, never turned into a retryable failure.
 *
 * The receipt route opens BEFORE the sign-out, on purpose. A sign-out raises an
 * owner-transition hold, and while it is held the root layout resets every
 * route outside the (auth) group to "/", whose signed-out redirect then lands
 * on /sign-in. Opening /account-deleted (an (auth) route) first means that
 * reset never runs, and the route itself shows nothing until no account is
 * signed in (deletion-receipt-view.ts).
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

  // A number whose receipt could not be checked still goes to the route, which
  // asks the server itself; it is never told "no receipt was recorded" while
  // that is unknown (gate D2A-03). It is not used for the purge-retry note
  // above: only a proven receipt may say a retry was recorded.
  const unconfirmedReceiptId = deps.receipt.receiptId === null
    ? deps.receipt.unconfirmedReceiptId ?? null
    : null;
  const routeReceiptId = deps.receipt.receiptId ?? unconfirmedReceiptId;

  // Another account already visible: never open A's receipt. Still try to end
  // A's own session; signOutExpected refuses any session that is not A's.
  const opened = !otherOwnerVisible(deps.readOwner(), deps.owner);
  let token: string | null = null;
  let href = buildAccountDeletedHref({ receiptId: routeReceiptId, op: null });
  if (opened) {
    try {
      token = beginLocalDeletionOutcome(
        {
          owner: deps.owner,
          receiptId: routeReceiptId,
          receiptUnconfirmed: unconfirmedReceiptId !== null,
          localPurge,
        },
        deps.newToken,
      );
    } catch {
      // Without a token the route still shows the server receipt, just no local result.
      token = null;
    }
    href = buildAccountDeletedHref({ receiptId: routeReceiptId, op: token });
    quietly(() => deps.openReceipt(href));
  }

  let localSignOut: LocalSignOutOutcome = "complete";
  let ownerChanged = !opened;
  try {
    await deps.signOut();
  } catch (error) {
    // A's server deletion succeeded, but B now owns local auth. Keep B signed
    // in and never leave B on A's receipt.
    if (deps.isOwnerChangedError(error)) ownerChanged = true;
    else localSignOut = "unconfirmed";
  }
  if (!ownerChanged && otherOwnerVisible(deps.readOwner(), deps.owner)) ownerChanged = true;

  if (ownerChanged) {
    if (token !== null) discardLocalDeletionOutcome(token);
    if (opened) quietly(() => deps.leaveReceipt());
    return { kind: "owner-changed", localPurge };
  }

  if (token !== null) reportLocalDeletionSignOut(token, localSignOut);
  return {
    kind: "show-receipt",
    href,
    localPurge,
    localSignOut,
  };
}

/**
 * Retry, from the receipt route, the sign-out of the account this device just
 * deleted (gate D2A-07: a failed sign-out used to leave that route waiting
 * forever). Only that exact owner is ever signed out: if the session now
 * belongs to anyone else, nothing is touched.
 */
export async function retryDeletedOwnerSignOut<E extends { userId: string | null }>(deps: {
  outcome: LocalDeletionOutcome;
  captureExpectation: () => Promise<E>;
  signOut: (expected: E) => Promise<void>;
}): Promise<LocalSignOutOutcome | "owner-changed"> {
  let expected: E;
  try {
    expected = await deps.captureExpectation();
  } catch {
    return "unconfirmed";
  }
  if (expected.userId !== deps.outcome.owner) return "owner-changed";
  try {
    await deps.signOut(expected);
  } catch {
    return "unconfirmed";
  }
  reportLocalDeletionSignOut(deps.outcome.token, "complete");
  return "complete";
}
