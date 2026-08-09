// Which notices are visible, and which single one is allowed to interrupt.
//
// Pure functions over plain data so the popup rules are testable without a
// Supabase connection or a React renderer (jest here is node + .test.ts only;
// component render tests do not work on RN 0.85 + jest 29).

import type { RemoteNotice } from "./types";
import { meetsMinAppVersion } from "./version";

/**
 * Published, version-appropriate notices, newest first.
 *
 * `published_at <= now()` is already enforced by the RLS policy in
 * db/migrations/0113_notices.sql, so this repeats the server's rule rather than
 * replacing it. Repeating it keeps the ordering deterministic for tests and
 * covers the window where a device clock runs ahead of the database.
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
      if (publishedMs > nowMs) return false;
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
