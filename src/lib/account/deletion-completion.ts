// What this device does after the SERVER confirmed an account deletion (0217,
// docs/design/deletion-receipt-server-261006.md 5절), and the pass that finishes
// a request whose answer was lost.
//
// The order is the design's invariant I7: the irreversible local fence goes up
// only after the server confirmed the deletion. purgeDeletedAccountLocalData
// installs that fence first and then wipes the owner's namespaces, so anything
// written while the server was deleting is wiped too.
//
// This module no longer carries the receipt between screens. It used to hold it
// in memory for the sign-in screen, and five review rounds of owner/epoch fences
// later the sign-in screen could still show A's receipt to B (PR #2054 gates
// DEL-N1-01 / DEL-N2-01). Now the receipt is the server's record; this flow only
// opens /account-deleted with the request NUMBER (deletion-receipt-handoff.ts),
// and that screen shows the server's answer only while nobody is signed in.
import { currentAccountOwner } from "../auth/account-epoch";
import type { AccountDeletionReceipt } from "../records/delete-bulk";
import {
  PENDING_DELETION_OP_STALE_MS,
  clearDeletionOpMemo,
  listDeletionOpMemos,
  writeDeletionOpMemo,
  type DeletionOpMemo,
} from "./deletion-op-memo";
import {
  fetchAccountDeletionOpStatus,
  type LocalSignOutOutcome,
  type OpStatusLookup,
  type ReceiptSweeps,
} from "./deletion-receipt";
import {
  noteDeletionReceiptSignOut,
  setDeletionReceiptHandoff,
} from "./deletion-receipt-handoff";

export type LocalPurgeOutcome = "complete" | "retry-scheduled" | "unconfirmed";

/** Local cleanups started for one deleted account before the device stops retrying. */
export const MAX_LOCAL_CLEANUP_TRIES = 3;

function observedOf(receipt: AccountDeletionReceipt): ReceiptSweeps {
  return {
    profileErased: receipt.profileErased,
    deletionFenced: receipt.deletionFenced,
    rawClippingsErased: receipt.rawClippingsErased,
    rawClippingsEmptyAtCheck: receipt.rawClippingsEmptyAtCheck,
  };
}

/**
 * Wipe this owner's local data and settle the memo. The terminal memo is written
 * FIRST so a crash in the middle leaves an instruction to run the cleanup again;
 * it is removed only when the cleanup is confirmed. "retry-scheduled" means the
 * cleanup was not confirmed but the next pass will run it again.
 */
export async function settleDeletedAccountLocally(input: {
  owner: string;
  opId: string | null;
  purgeLocal: (owner: string) => Promise<LocalPurgeOutcome>;
  /** Cleanups already started for this deletion (from its terminal memo). */
  tries?: number;
  now?: () => number;
}): Promise<LocalPurgeOutcome> {
  const now = input.now ?? Date.now;
  const tries = (input.tries ?? 0) + 1;
  const terminal: DeletionOpMemo = { v: 1, phase: "terminal", owner: input.owner, opId: input.opId, at: now(), tries };
  const remembered = await writeDeletionOpMemo(terminal);
  let outcome: LocalPurgeOutcome = "unconfirmed";
  try {
    outcome = await input.purgeLocal(input.owner);
  } catch {
    outcome = "unconfirmed";
  }
  if (outcome === "complete") {
    await clearDeletionOpMemo(input.owner, input.opId);
    return "complete";
  }
  if (tries >= MAX_LOCAL_CLEANUP_TRIES) {
    // Bounded: the fence is up and the wipe ran this many times; stop asking.
    await clearDeletionOpMemo(input.owner, input.opId);
    return "unconfirmed";
  }
  return remembered ? "retry-scheduled" : "unconfirmed";
}

export type FinishAccountDeletionResult =
  | { kind: "owner-changed" }
  | { kind: "done"; localPurge: LocalPurgeOutcome; localSignOut: LocalSignOutOutcome };

/**
 * After the server confirmed the deletion of `owner`: wipe this device's data
 * for that owner, open the receipt route, then sign that owner out. The receipt
 * route is opened BEFORE the sign-out so the (auth) group carries the screen
 * through the owner -> null transition; the screen itself waits until nobody is
 * signed in before it shows anything.
 *
 * Nothing here depends on the calling screen staying mounted. A sign-out that
 * finds another account already active (owner changed) keeps that account and
 * drops the note, so no receipt is opened for it.
 */
export async function finishAccountDeletion(input: {
  owner: string;
  receipt: AccountDeletionReceipt;
  purgeLocal: (owner: string) => Promise<LocalPurgeOutcome>;
  signOut: () => Promise<void>;
  isOwnerChangedError: (error: unknown) => boolean;
  openReceipt: () => void;
  leaveReceipt: () => void;
  /** The account the app currently publishes (null = signed out). */
  currentOwner?: () => string | null;
}): Promise<FinishAccountDeletionResult> {
  const { owner, receipt } = input;
  const currentOwner = input.currentOwner ?? currentAccountOwner;
  // The wipe touches only the deleted owner's namespaces, so it runs whoever is
  // signed in now; the device must not keep that account's data either way.
  const localPurge = await settleDeletedAccountLocally({ owner, opId: receipt.opId, purgeLocal: input.purgeLocal });
  const active = currentOwner();
  if (active !== null && active !== owner) {
    // Another account already owns local auth: no receipt route, no sign-out.
    return { kind: "owner-changed" };
  }
  setDeletionReceiptHandoff({
    owner,
    opId: receipt.opId,
    observed: receipt.opId === null ? observedOf(receipt) : null,
    localPurge,
    localSignOut: null,
  });
  input.openReceipt();
  try {
    await input.signOut();
    noteDeletionReceiptSignOut(owner, receipt.opId, "complete");
    return { kind: "done", localPurge, localSignOut: "complete" };
  } catch (error) {
    if (input.isOwnerChangedError(error)) {
      // B owns local auth now. Keep B, and never leave B on A's receipt route.
      input.leaveReceipt();
      return { kind: "owner-changed" };
    }
    noteDeletionReceiptSignOut(owner, receipt.opId, "unconfirmed");
    return { kind: "done", localPurge, localSignOut: "unconfirmed" };
  }
}

export interface PendingDeletionResolution {
  /** The first request this pass found completed, for the receipt screen. */
  completed: { owner: string; opId: string; localPurge: LocalPurgeOutcome } | null;
}

/**
 * The pass the sign-in screen runs once the device is KNOWN to be signed out
 * (deletion-receipt.ts knownSignedOut): every remembered request is asked about
 * with its token, and only definite server answers change anything.
 *   completed            -> wipe that owner's local data (fence first), keep a
 *                           terminal memo until the wipe is confirmed
 *   failed / abandoned   -> forget it; the account is alive
 *   anything else        -> keep it and ask again next time (I5)
 * `stillSignedOut` is checked before every step: a sign-in or an unknown
 * session stops the pass and leaves the rest for later.
 */
export async function resolvePendingAccountDeletionOps(deps: {
  stillSignedOut: () => boolean;
  purgeLocal: (owner: string) => Promise<LocalPurgeOutcome>;
  lookup?: (input: { opId: string; token: string; owner: string }) => Promise<OpStatusLookup>;
  now?: () => number;
}): Promise<PendingDeletionResolution> {
  const lookup = deps.lookup ?? ((input) => fetchAccountDeletionOpStatus(input));
  const now = deps.now ?? Date.now;
  let completed: PendingDeletionResolution["completed"] = null;
  for (const memo of await listDeletionOpMemos()) {
    if (!deps.stillSignedOut()) break;
    if (memo.phase === "pending") {
      if (now() - memo.at >= PENDING_DELETION_OP_STALE_MS) await clearDeletionOpMemo(memo.owner, memo.opId);
      continue;
    }
    if (memo.phase === "terminal") {
      await settleDeletedAccountLocally({
        owner: memo.owner,
        opId: memo.opId,
        purgeLocal: deps.purgeLocal,
        tries: memo.tries,
        now,
      });
      continue;
    }
    const answer = await lookup({ opId: memo.opId, token: memo.token, owner: memo.owner });
    if (!deps.stillSignedOut()) break;
    if (answer.status !== "known") continue;
    if (answer.op === "failed" || answer.op === "abandoned") {
      await clearDeletionOpMemo(memo.owner, memo.opId);
    } else if (answer.op === "completed") {
      const localPurge = await settleDeletedAccountLocally({
        owner: memo.owner,
        opId: memo.opId,
        purgeLocal: deps.purgeLocal,
        now,
      });
      completed ??= { owner: memo.owner, opId: memo.opId, localPurge };
    }
  }
  return { completed };
}

let inFlight: Promise<PendingDeletionResolution> | null = null;

/** One pass at a time per runtime; a second caller shares the running one. */
export function resolvePendingAccountDeletionOpsOnce(
  deps: Parameters<typeof resolvePendingAccountDeletionOps>[0],
): Promise<PendingDeletionResolution> {
  if (inFlight) return inFlight;
  const run = resolvePendingAccountDeletionOps(deps).catch(() => ({ completed: null }));
  inFlight = run;
  void run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
  return run;
}
