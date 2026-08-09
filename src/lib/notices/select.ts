// Which notices are visible, and which single one is allowed to interrupt.
//
// Pure functions over plain data so the popup rules are testable without a
// Supabase connection or a React renderer (jest here is node + .test.ts only;
// component render tests do not work on RN 0.85 + jest 29).

import type { RemoteNotice } from "./types";
import { meetsMinAppVersion } from "./version";

/**
 * How far a row's published_at may sit in the future, per the DEVICE clock,
 * before this module drops it.
 *
 * Seven days is deliberate on both sides. Anything larger stops catching a
 * genuinely misconfigured environment; anything smaller starts suppressing real
 * notices on phones whose clock has drifted. A device off by more than a few
 * days cannot complete a TLS handshake against a valid certificate in the first
 * place, so it never reaches this code with rows in hand - bounded drift is the
 * only case that actually arrives here.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Published, version-appropriate notices, newest first.
 *
 * `published_at <= now()` is enforced by the RLS policy in
 * db/migrations/0113_notices.sql, and the SERVER clock is the one that decides.
 * Every row that reaches this function was already published as far as the
 * database is concerned.
 *
 * So the repeat here cannot do what an earlier comment claimed. A device clock
 * running AHEAD is a no-op (the server withheld the row regardless), and the
 * only clock state that changes the outcome is a device running BEHIND, which
 * would hide a genuinely published notice - the opposite of the intent, and the
 * worst possible failure for an incident notice.
 *
 * What the check IS worth keeping for is defence in depth: fetchNotices() sends
 * no published_at filter of its own and leans entirely on the policy, so an
 * environment where RLS was never applied would serve scheduled rows. Hence the
 * tolerance - absurd timestamps still drop, a merely-wrong clock no longer
 * suppresses an announcement the server has published.
 *
 * The id tie-break exists so two notices published in the same transaction do
 * not swap places between renders, which would make "the newest one" ambiguous
 * for the popup.
 */
export function visibleNotices(
  notices: readonly RemoteNotice[],
  options: { appVersion: string | null; now?: Date },
): RemoteNotice[] {
  const nowMs = (options.now ?? new Date()).getTime();
  return notices
    .filter((notice) => {
      const publishedMs = Date.parse(notice.publishedAt);
      if (Number.isNaN(publishedMs)) return false;
      if (publishedMs - nowMs > CLOCK_SKEW_TOLERANCE_MS) return false;
      return meetsMinAppVersion(options.appVersion, notice.minAppVersion);
    })
    .sort((a, b) => {
      const diff = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      if (diff !== 0) return diff;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
}

/** Ids of `notices` the user has not read yet. */
export function unreadNotices(
  notices: readonly RemoteNotice[],
  readIds: ReadonlySet<string>,
): RemoteNotice[] {
  return notices.filter((notice) => !readIds.has(notice.id));
}

/**
 * The one notice allowed to open a popup on home entry, or null.
 *
 * Rules, in order:
 *   1. `minor` never interrupts. It appears in the inbox and contributes to the
 *      unread badge, and that is all.
 *   2. Only the newest unread `major` is returned. If three majors are unread,
 *      the user sees one, not a queue - one message per screen (the standing
 *      information-density rule), and a stack of modals is the exact overlap the
 *      touch rule forbids. The rest stay unread in the inbox.
 *
 * `notices` is expected to already be visibleNotices() output (published,
 * version-filtered, newest first).
 */
export function pickPopupNotice(
  notices: readonly RemoteNotice[],
  readIds: ReadonlySet<string>,
): RemoteNotice | null {
  for (const notice of notices) {
    if (notice.kind !== "major") continue;
    if (readIds.has(notice.id)) continue;
    return notice;
  }
  return null;
}
