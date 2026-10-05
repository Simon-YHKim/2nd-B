// What /account-deleted shows for one render - a pure decision, so it is tested
// directly instead of rendering the screen (render tests are not retried in
// this repo; see AccountDeletionReceiptScreen.tsx for the wiring).
//
// The one rule that matters (Simon decision Q-261004-42 = A, PR #2054 gates
// DEL-N1-01 / DEL-N2-01): a receipt is shown only while NO account is signed in
// and no owner transition is held. A receipt carries no account identifier, so
// "signed out" is the only condition a viewer has to meet; "signed in" - any
// account, including the one being deleted before its sign-out lands - never
// sees one.
//
// Two more rules (gates on PR "deletion2", 2026-10-05):
//   - an UNKNOWN session (AuthContext `sessionUnavailable`) is not "signed out"
//     and reads nothing (DEL2-R1-01 / D2A-05);
//   - this device's local results come only from the one-time outcome bound to
//     the route token and receipt number, never from URL values (DEL2-R1-05 /
//     D2A-06). Without that outcome the route makes no deletion claim of its own.
import { accountDeletionReceiptFromServer } from "../records/delete-bulk";
import type { LocalDeletionOutcome } from "./deletion-local-outcome";
import type {
  AccountDeletedParams,
  LocalPurgeOutcome,
  LocalSignOutOutcome,
  ReceiptLookup,
} from "./deletion-receipt";

/** What the receipt panel renders. Built from the server receipt plus this device's outcome. */
export interface AccountDeletionNotice {
  /** Null when the server confirmed the erasure but recorded no receipt. */
  receiptId: string | null;
  erasedAtIso: string | null;
  expiresAtIso: string | null;
  /** The server's observations; null when there is no server receipt. */
  receipt: {
    profileErased: boolean | null;
    deletionFenced: boolean | null;
    rawClippingsErased: boolean | null;
    rawClippingsEmptyAtCheck: boolean | null;
  } | null;
  /** Null when this view was not opened by the deletion flow on this device. */
  localPurge: LocalPurgeOutcome | null;
  localSignOut: LocalSignOutOutcome | null;
}

export type ReceiptScreenView =
  | { kind: "waiting" }
  /** The session state is unknown: neither a receipt nor the lookup form. */
  | { kind: "session-unknown" }
  | { kind: "signed-in" }
  /** The account this device just deleted is still signed in here: its sign-out failed. */
  | { kind: "signout-unconfirmed" }
  | { kind: "lookup" }
  | { kind: "loading" }
  | { kind: "receipt"; notice: AccountDeletionNotice }
  | { kind: "not-found" }
  | { kind: "unavailable" };

export function receiptScreenView(input: {
  authLoading: boolean;
  userId: string | null;
  /** AuthContext AUTH-01: startup never learned whether a session exists. */
  sessionUnavailable: boolean;
  transitionPending: boolean;
  params: AccountDeletedParams;
  /** This device's outcome for exactly this route (localDeletionOutcomeFor), or null. */
  local: LocalDeletionOutcome | null;
  lookup: ReceiptLookup | null;
}): ReceiptScreenView {
  if (input.authLoading || input.transitionPending) return { kind: "waiting" };
  if (input.sessionUnavailable) return { kind: "session-unknown" };
  const { local } = input;
  if (input.userId !== null) {
    // The deletion flow opens this route BEFORE it signs the deleted account
    // out (deletion-completion.ts), so that same account waits here for its
    // sign-out, and is told plainly when the sign-out failed. Any other
    // account only gets a way back into the app.
    if (local !== null && local.owner === input.userId) {
      return local.localSignOut === "unconfirmed" ? { kind: "signout-unconfirmed" } : { kind: "waiting" };
    }
    return { kind: "signed-in" };
  }
  const { params } = input;
  if (params.receiptId === null) {
    // Only a deletion this device just finished may say "confirmed, but no
    // receipt was recorded". A bare link is a request to look one up.
    if (local === null) return { kind: "lookup" };
    return {
      kind: "receipt",
      notice: {
        receiptId: null,
        erasedAtIso: null,
        expiresAtIso: null,
        receipt: null,
        localPurge: local.localPurge,
        localSignOut: local.localSignOut,
      },
    };
  }
  if (input.lookup === null) return { kind: "loading" };
  if (input.lookup.status === "not-found") return { kind: "not-found" };
  if (input.lookup.status === "unavailable") return { kind: "unavailable" };
  const server = input.lookup.receipt;
  const observed = accountDeletionReceiptFromServer(server);
  return {
    kind: "receipt",
    notice: {
      receiptId: server.id,
      erasedAtIso: server.erasedAtIso,
      expiresAtIso: server.expiresAtIso,
      receipt: {
        profileErased: observed.profileErased,
        deletionFenced: observed.deletionFenced,
        rawClippingsErased: observed.rawClippingsErased,
        rawClippingsEmptyAtCheck: observed.rawClippingsEmptyAtCheck,
      },
      // Local results belong only to the device that just deleted.
      localPurge: local?.localPurge ?? null,
      localSignOut: local?.localSignOut ?? null,
    },
  };
}
