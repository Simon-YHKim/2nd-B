// Play flagged vc 38 (2026-09-01) for FOREGROUND_SERVICE_MEDIA_PLAYBACK and
// demanded a "media playback" declaration. The app never plays media —
// expo-audio is used for RECORDING only — so declaring it would be false.
//
// The source is expo-audio's own config plugin, not a transitive AAR:
// node_modules/expo-audio/plugin/build/withAudio.js defaults
// `enableBackgroundPlayback = true`, and that default BOTH pushes the
// permission AND declares AudioControlsService with
// android:foregroundServiceType="mediaPlayback". Turning the option off
// removes both; blocking the permission alone would have left the service —
// which is the part Play actually scans for.
//
// Three guards at different depths, on purpose:
//   here (a)  the plugin option is off        — removes it at the source
//   here (b)  blockedPermissions still lists it — a net if a default flips back
//   check-apk-target-sdk.js  the built binary really lacks it — the only proof
//
// The first two are config. Only the third is evidence.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const { FORBIDDEN_PERMISSIONS } = require("../../../../scripts/check-apk-target-sdk") as {
  FORBIDDEN_PERMISSIONS: { name: string; why: string }[];
};

const MEDIA_PLAYBACK = "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK";

type PluginEntry = string | [string, Record<string, unknown>];
const appConfig = JSON.parse(readFileSync(join(process.cwd(), "app.json"), "utf8")) as {
  expo: {
    plugins?: PluginEntry[];
    android?: { permissions?: string[]; blockedPermissions?: string[] };
  };
};

const pluginProps = (name: string): Record<string, unknown> | undefined => {
  const entry = (appConfig.expo.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === name,
  ) as [string, Record<string, unknown>] | undefined;
  return entry?.[1];
};

describe("expo-audio is configured for recording, not playback", () => {
  test("background playback is turned off at the plugin", () => {
    // This is the fix. Without it the plugin adds both the permission and the
    // mediaPlayback foreground service, and Play asks us to declare a feature
    // the app does not have.
    expect(pluginProps("expo-audio")?.enableBackgroundPlayback).toBe(false);
  });

  test("the microphone permission the app actually uses is still configured", () => {
    // Removing playback must never cost us recording.
    expect(pluginProps("expo-audio")?.microphonePermission).toEqual(expect.any(String));
    expect(appConfig.expo.android?.permissions ?? []).toContain("android.permission.RECORD_AUDIO");
  });
});

describe("android.blockedPermissions", () => {
  test("every permission the release gate forbids is also blocked in the config", () => {
    // Tied to the gate's own list rather than a second literal, so the two
    // halves cannot drift apart silently.
    const blocked = appConfig.expo.android?.blockedPermissions ?? [];
    for (const entry of FORBIDDEN_PERMISSIONS) {
      expect(blocked).toContain(entry.name);
    }
  });

  test("the gate still forbids the permission this fix is about", () => {
    expect(FORBIDDEN_PERMISSIONS.map((p) => p.name)).toContain(MEDIA_PLAYBACK);
  });

  test("nothing is both requested and blocked — that would be incoherent", () => {
    const requested = appConfig.expo.android?.permissions ?? [];
    for (const entry of FORBIDDEN_PERMISSIONS) {
      expect(requested).not.toContain(entry.name);
    }
  });
});
