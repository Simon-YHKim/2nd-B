// First-day TTFV ("첫날 자기이해 한 컷") gate. The first-day review opens by
// itself at most ONCE PER ACCOUNT, on the account's first day after the welcome
// (Q-261004-40, strict variant, migration 0219).
//
// Whether it opens is no longer decided here or on the device. The home asks the
// server for the one grant before it opens /ttfv (account-first-run.ts
// claim_first_run), so a second tab, a new browser or a reinstall cannot open it
// again (QA-LEGACY W-12, gate CDA-01). Until 0219, a device key here
// (onboarding.ttfv.v1.seenAt) decided it; nothing reads or writes that key now.
//
// What stays here is what /ttfv tells the server about the visit it was opened
// for (design 5.3):
//   - content was on screen (a record, or the honest empty state): shown;
//   - the review could not load anything: the grant goes back (#1530: a screen
//     that showed nothing does not use the one chance), only with the grant's
//     receipt, so a visit the home did not open has nothing to hand back.

import {
  FIRST_DAY_MS,
  finishFirstRun,
  firstRunTTFVToken,
  isWithinFirstDay,
} from "./account-first-run";

export { FIRST_DAY_MS, isWithinFirstDay };

/** The receipt of the grant the home opened /ttfv with, or null for any other visit. */
export function ttfvClaimToken(ownerId: string | null): string | null {
  return firstRunTTFVToken(ownerId);
}

/**
 * The review showed content to this owner. Uses up the first-day chance on the
 * server (first value wins). Fire and forget: if it never arrives, the grant the
 * screen opened with already keeps it from opening again (design 5.4). Never throws.
 */
export function markTTFVSeen(ownerId: string | null, token: string | null): void {
  if (!ownerId) return;
  void finishFirstRun(ownerId, "ttfv", "shown", token);
}

/**
 * The review the home opened could not show anything: hand the grant back so a
 * later visit can open it. Without a receipt (a visit the home did not open)
 * there is nothing to hand back. Never throws.
 */
export function releaseTTFVClaim(ownerId: string | null, token: string | null): void {
  if (!ownerId || !token) return;
  void finishFirstRun(ownerId, "ttfv", "not_shown", token);
}
