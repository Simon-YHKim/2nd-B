// What /account-deleted shows for one render - a pure decision, so it is tested
// directly instead of rendering the screen (render tests are not retried in
// this repo; AccountDeletionReceiptScreen.tsx only wires it).
//
// The rule that matters (설계서 I6; PR #2054 gates DEL-N1-01 / DEL-N2-01): a
// receipt is shown only while NO account is signed in and no owner transition
// is held. A receipt carries no account identifier, so "signed out" is the only
// condition a viewer has to meet; "signed in" - any account, including the one
// being deleted before its sign-out lands - never sees one.
//
// Two more (gates on #2078, 2026-10-05):
//   - an UNKNOWN session (AuthContext `sessionUnavailable`) is not "signed out"
//     and reads nothing (DEL2-R1-01 / D2A-05);
//   - this device's local results come only from the in-memory handoff of the
//     deletion it just ran, never from a URL (DEL2-R1-05 / D2A-06). Without it
//     the screen shows only what the server says for the number.
import type { DeletionReceiptHandoff } from "./deletion-receipt-handoff";
import type { ReceiptLookup } from "./deletion-receipt";

/**
 * What the receipt panel shows. Built by this module from the
 * SERVER's receipt (0217) plus, only on the device that just deleted, its own
 * local results. The panel holds no store and reads nothing itself.
 */
export interface AccountDeletionReceiptNotice {
  /** The receipt number. Null for a deletion that went through the old flow. */
  opId: string | null;
  erasedAtIso: string | null;
  expiresAtIso: string | null;
  /** The server's observations; null when there is none to show. */
  sweeps: {
    profileErased: boolean | null;
    deletionFenced: boolean | null;
    rawClippingsErased: boolean | null;
    rawClippingsEmptyAtCheck: boolean | null;
  } | null;
  /** The server confirmed the erasure but did not record its cleanup results. */
  unrecorded: boolean;
  /** Null unless this device itself just deleted the account. */
  localPurge: "complete" | "retry-scheduled" | "unconfirmed" | null;
  localSignOut: "complete" | "unconfirmed" | null;
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
  | { kind: "receipt"; notice: AccountDeletionReceiptNotice }
  | { kind: "not-found" }
  | { kind: "rate-limited" }
  | { kind: "unavailable" };

export function receiptScreenView(input: {
  authLoading: boolean;
  userId: string | null;
  sessionUnavailable: boolean;
  transitionPending: boolean;
  /** The number this screen is showing: from the handoff, a typed number, or a `#r=` fragment. */
  opId: string | null;
  handoff: DeletionReceiptHandoff | null;
  lookup: ReceiptLookup | null;
}): ReceiptScreenView {
  if (input.authLoading || input.transitionPending) return { kind: "waiting" };
  if (input.sessionUnavailable) return { kind: "session-unknown" };
  const { handoff } = input;
  if (input.userId !== null) {
    // The deletion flow opens this route BEFORE it signs the deleted account
    // out, so that same account waits here for its sign-out and is told
    // plainly when it failed. Any other account only gets a way back.
    if (handoff !== null && handoff.owner === input.userId) {
      return handoff.localSignOut === "unconfirmed" ? { kind: "signout-unconfirmed" } : { kind: "waiting" };
    }
    return { kind: "signed-in" };
  }
  // Local results belong only to the device that just deleted, and only to the
  // request it deleted with.
  const own = handoff !== null && handoff.opId === input.opId ? handoff : null;
  if (input.opId === null) {
    // Only a deletion this device just finished through the old flow (no
    // number) may say "confirmed" without a server receipt. A bare route is a
    // request to look one up.
    if (own === null) return { kind: "lookup" };
    return {
      kind: "receipt",
      notice: {
        opId: null,
        erasedAtIso: null,
        expiresAtIso: null,
        sweeps: own.observed,
        unrecorded: false,
        localPurge: own.localPurge,
        localSignOut: own.localSignOut,
      },
    };
  }
  if (input.lookup === null) return { kind: "loading" };
  if (input.lookup.status === "not-found") return { kind: "not-found" };
  if (input.lookup.status === "rate-limited") return { kind: "rate-limited" };
  if (input.lookup.status === "unavailable") return { kind: "unavailable" };
  const server = input.lookup.receipt;
  return {
    kind: "receipt",
    notice: {
      opId: server.opId,
      erasedAtIso: server.erasedAtIso,
      expiresAtIso: server.expiresAtIso,
      sweeps: server.sweeps,
      unrecorded: server.unrecorded,
      localPurge: own?.localPurge ?? null,
      localSignOut: own?.localSignOut ?? null,
    },
  };
}
