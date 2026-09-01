// Play flagged vc 38 (2026-09-01) for FOREGROUND_SERVICE_MEDIA_PLAYBACK and
// demanded a "media playback" declaration. The app never plays media —
// expo-audio is used for RECORDING only — so declaring it would be a false
// statement to Play. The permission arrives transitively: expo-audio depends on
// androidx.media3:media3-session, and that AAR declares it, so it shows up only
// in the merged manifest (no JS package manifest in the tree contains the
// string).
//
// Two guards, deliberately at different depths:
//   this file   the config still asks for the block (fast, every `npm run verify`)
//   check-apk-target-sdk.js   the built binary actually lacks it (release time)
//
// The second is the one that proves anything; this one catches the edit that
// would silently remove the request months from now.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCKED = "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK";

const appConfig = JSON.parse(readFileSync(join(process.cwd(), "app.json"), "utf8")) as {
  expo: { android?: { permissions?: string[]; blockedPermissions?: string[] } };
};

describe("android.blockedPermissions", () => {
  test("blocks the media-playback foreground-service permission", () => {
    expect(appConfig.expo.android?.blockedPermissions ?? []).toContain(BLOCKED);
  });

  test("does not ALSO request it — blocking and requesting is incoherent", () => {
    expect(appConfig.expo.android?.permissions ?? []).not.toContain(BLOCKED);
  });

  test("the recording permission it must not disturb is still requested", () => {
    // Removing media playback must never cost us microphone recording, which is
    // what expo-audio is actually used for.
    expect(appConfig.expo.android?.permissions ?? []).toContain("android.permission.RECORD_AUDIO");
  });
});
