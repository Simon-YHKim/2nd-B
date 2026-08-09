// Compose the two notice sources into the single view the UI consumes.
//
// This is the whole behavioural contract of the notice centre expressed as one
// pure function, because that is the only way it can be tested here: jest runs
// node + `.test.ts` only, `__mocks__/react-native.js` is a 10-line Platform
// stub, and component render tests do not work on RN 0.85 + jest 29. Keeping
// the rules out of the hook means "does a minor notice pop up?" is a unit test
// rather than a manual QA pass.
//
// SOURCE PRECEDENCE, and why it is not simply "newest wins":
//
//   remote major  - an operator published it after the release. It can be an
//                   incident or a maintenance window, so it outranks everything.
//   bundled       - release notes baked into the binary. They already popped up
//                   once per release before this feature existed, and that
//                   behaviour is kept: the popup after an update is how a user
//                   finds out what changed.
//   remote minor  - inbox and badge only. Never interrupts, by definition.
//
// Only ONE of them is ever returned as popupNotice. One message per screen is a
// standing rule, and stacked modals are exactly the overlap the touch rule
// forbids.

import { adaptRemoteNotice } from "./adapt";
import { pickPopupNotice, visibleNotices } from "./select";
import type { ProductNotice, RemoteNotice } from "./types";

export interface NoticeCenterInput {
  /** Rows from the notices table. */
  remote: readonly RemoteNotice[];
  /** Ids present in user_notice_reads for this user. */
  remoteReadIds: ReadonlySet<string>;
  /** PRODUCT_NOTICES, newest first. */
  bundled: readonly ProductNotice[];
  /** The local "last seen bundled notice id" cursor. */
  bundledSeenId: string | null;
  /** app.json expo.version, or null when it cannot be read. */
  appVersion: string | null;
  now?: Date;
}

export interface NoticeCenterState {
  /** Everything the inbox lists, newest first: published remote notices, then
   *  the bundled release notes. Remote rows are always newer than the bundled
   *  ones, which ship with the binary and therefore predate any row an operator
   *  can insert into a running database. */
  notices: ProductNotice[];
  unreadIds: ReadonlySet<string>;
  unreadCount: number;
  /** The single notice allowed to open on home entry, or null. */
  popupNotice: ProductNotice | null;
  /** Ids that belong to the remote source. markSeen() routes on this: remote
   *  ids write a user_notice_reads row, bundled ids move the local cursor. */
  remoteIds: ReadonlySet<string>;
}

export function composeNoticeCenter(input: NoticeCenterInput): NoticeCenterState {
  const visible = visibleNotices(input.remote, { appVersion: input.appVersion, now: input.now });
  const adapted = visible.map(adaptRemoteNotice);

  // The bundled cursor is a single "last seen id", not a set, so only the newest
  // bundled notice can be unread. Reading an older history entry must not clear
  // a newer one, which is why the existing cursor works this way.
  const bundledLatest = input.bundled[0] ?? null;
  const bundledUnread = bundledLatest !== null && input.bundledSeenId !== bundledLatest.id;

  const unreadIds = new Set<string>();
  for (const notice of visible) {
    if (!input.remoteReadIds.has(notice.id)) unreadIds.add(notice.id);
  }
  if (bundledUnread && bundledLatest) unreadIds.add(bundledLatest.id);

  const popupRemote = pickPopupNotice(visible, input.remoteReadIds);
  const popupNotice = popupRemote
    ? adaptRemoteNotice(popupRemote)
    : bundledUnread
      ? bundledLatest
      : null;

  return {
    notices: [...adapted, ...input.bundled],
    unreadIds,
    unreadCount: unreadIds.size,
    popupNotice,
    remoteIds: new Set(visible.map((notice) => notice.id)),
  };
}
