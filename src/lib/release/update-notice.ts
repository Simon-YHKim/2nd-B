// Which copy a `major` notice shows, given the build that is reading it.
//
// A major notice published by the release pipeline carries min_app_version =
// the version it announces. That single number splits the audience in two, and
// the two halves need opposite messages:
//
//   running >= min_app_version   the user already has the release. The notice is
//                                a feature introduction: here is what changed.
//   running <  min_app_version   the user does not have it yet. Telling them
//                                about a feature they cannot find is worse than
//                                saying nothing; they need "update to get this".
//
// This is only a COPY decision. Whether the row is visible at all is
// src/lib/notices/select.ts, and for `major` rows both cohorts are visible on
// purpose - see the kind split documented there and in
// docs/OPERATIONS-NOTICES.md section N4.
//
// Pure and platform-free so it is testable in the node jest environment: the
// caller passes Platform.OS in rather than this module importing react-native.

import { compareSemver } from "./semver";

export type UpdateNoticeMode = "feature-intro" | "update-prompt";

/**
 * Pick the copy variant for a major notice.
 *
 * FAILS TOWARDS "feature-intro" on every uncertainty: no floor recorded, the
 * running version unreadable, either side unparseable. The reasoning matches
 * the gate in src/lib/notices/version.ts - when in doubt show the calm message,
 * because wrongly telling somebody their app is out of date sends them to a
 * store listing that has nothing new on it.
 */
export function updateNoticeMode(
  runningVersion: string | null | undefined,
  minAppVersion: string | null | undefined,
): UpdateNoticeMode {
  if (!minAppVersion) return "feature-intro";
  if (!runningVersion) return "feature-intro";
  const order = compareSemver(runningVersion, minAppVersion);
  if (order === null) return "feature-intro";
  return order >= 0 ? "feature-intro" : "update-prompt";
}

/** Where an out-of-date user has to go to get the release. */
export type UpdateChannel = "store" | "reload";

/**
 * On web there is no store: the build is whatever GitHub Pages last served, so
 * a hard reload is the update. On native the JS bundle can move by itself via
 * EAS Update, but a user who is behind after an OTA has usually missed it
 * because the binary is too old to accept the update (runtimeVersion is a
 * fingerprint), so the store is the honest destination. See
 * docs/RELEASE-PROCESS.md.
 */
export function updateChannel(platformOS: string): UpdateChannel {
  return platformOS === "web" ? "reload" : "store";
}

const ANDROID_PACKAGE = "com.simonk.secondbrain";
const IOS_APP_ID = "6792266942";

/**
 * The store listing for a platform, or null when there is no store to send the
 * user to (web, or an unrecognised platform).
 *
 * Deliberately the https form rather than market:// or itms-apps://. Both
 * stores intercept their https listing and open the app, so the scheme buys
 * nothing, and a custom scheme with no handler installed throws on Linking
 * rather than degrading. Values are pinned to app.json (`android.package`,
 * `ios.bundleIdentifier`) and eas.json (`ascAppId`).
 */
export function storeUrl(platformOS: string): string | null {
  if (platformOS === "android") {
    return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  }
  if (platformOS === "ios") {
    return `https://apps.apple.com/app/id${IOS_APP_ID}`;
  }
  return null;
}
