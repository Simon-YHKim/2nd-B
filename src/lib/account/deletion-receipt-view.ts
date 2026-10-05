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
import { accountDeletionReceiptFromServer } from "../records/delete-bulk";
import type {
  AccountDeletedParams,
  LocalPurgeOutcome,
  LocalSignOutOutcome,
  ReceiptLookup,
} from "./deletion-receipt";

/** What the receipt panel renders. Built from the server receipt plus URL observations. */
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
  | { kind: "signed-in" }
  | { kind: "lookup" }
  | { kind: "loading" }
  | { kind: "receipt"; notice: AccountDeletionNotice }
  | { kind: "not-found" }
  | { kind: "unavailable" };

export function receiptScreenView(input: {
  authLoading: boolean;
  userId: string | null;
  transitionPending: boolean;
  params: AccountDeletedParams;
  lookup: ReceiptLookup | null;
}): ReceiptScreenView {
  if (input.authLoading || input.transitionPending) return { kind: "waiting" };
  if (input.userId !== null) return { kind: "signed-in" };
  const { params } = input;
  if (params.receiptId === null) {
    if (!params.fromDeletion) return { kind: "lookup" };
    return {
      kind: "receipt",
      notice: {
        receiptId: null,
        erasedAtIso: null,
        expiresAtIso: null,
        receipt: null,
        localPurge: params.localPurge,
        localSignOut: params.localSignOut,
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
      // Local observations belong only to the device that just deleted.
      localPurge: params.fromDeletion ? params.localPurge : null,
      localSignOut: params.fromDeletion ? params.localSignOut : null,
    },
  };
}
