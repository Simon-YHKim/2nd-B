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
//   - the visit takes the grant's receipt once, when it starts, so only the
//     visit the home opened can ever hand that grant back (gate BA-02);
//   - content was on screen (a record, or the honest empty state): shown;
//   - the visit ended without showing anything after a load error: the grant
//     goes back (#1530: a screen that showed nothing does not use the one
//     chance), only with the grant's receipt, and only once the visit is over,
//     so it cannot still show content beside a newer grant (gate FR-01).

import {
  FIRST_DAY_MS,
  finishFirstRun,
  isWithinFirstDay,
  takeFirstRunTTFVToken,
} from "./account-first-run";

export { FIRST_DAY_MS, isWithinFirstDay };

/**
 * Takes the receipt of the grant the home opened /ttfv with. Only the first
 * visit after the home opened it gets it; every other visit gets null.
 */
export function takeTTFVClaimToken(ownerId: string | null): string | null {
  return takeFirstRunTTFVToken(ownerId);
}

/**
 * The review showed content to this owner. Uses up the first-day chance on the
 * server (first value wins). Fire and forget: if it never arrives, the grant the
 * screen opened with already keeps it from opening again (design 5.4), and no
 * other visit holds its receipt. Never throws.
 */
export function markTTFVSeen(ownerId: string | null, token: string | null): void {
  if (!ownerId) return;
  void finishFirstRun(ownerId, "ttfv", "shown", token);
}

/**
 * The visit the home opened ended without showing anything after a load error:
 * hand the grant back so a later home visit can open it. Without a receipt (a
 * visit the home did not open) there is nothing to hand back. Never throws.
 */
export function releaseTTFVClaim(ownerId: string | null, token: string | null): void {
  if (!ownerId || !token) return;
  void finishFirstRun(ownerId, "ttfv", "not_shown", token);
}
