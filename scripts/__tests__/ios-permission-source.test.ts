// One source of truth per iOS usage-description string.
//
// An iOS permission prompt's text can be set from two places in this repo, and
// until 2026-09-06 two of them were set from BOTH with DIFFERENT wording:
//
//   app.json  ios.infoPlist.NSCameraUsageDescription
//     = "The app needs camera access to capture documents for OCR and memory storage."
//   app.json  plugins ["expo-image-picker", { cameraPermission: ... }]
//     = "The app needs camera access to take a photo for OCR capture."
//
// Only one of those ships, and nothing in the repo said which. That matters
// more than a normal duplicate: this string is what a user reads when the OS
// asks for the camera, and Apple reviews it.
//
// The resolution is decided by @expo/config-plugins:
//
//   ios/Permissions.js
//     infoPlist[permission] = permissions[permission] || infoPlist[permission] || description;
//
// so the order is: plugin OPTION wins, else the existing infoPlist value, else
// the plugin's own hardcoded default. Because app.json passes explicit options
// to expo-image-picker, the plugin option wins and the two ios.infoPlist lines
// were dead text. They are now removed.
//
// ⚠ The trap this file exists to hold shut: the plugin only wins BECAUSE the
// options are spelled out. Rewrite `["expo-image-picker", {...}]` as the bare
// string "expo-image-picker" -- which looks like a harmless tidy-up -- and
// `permissions[permission]` becomes undefined, so ios.infoPlist would win
// again and the shipped permission text would silently change. Keeping each
// string in exactly one place makes that impossible rather than merely
// unlikely.
//
// Two assertions, deliberately of different kinds: one reads the upstream
// resolution rule so an Expo upgrade that flips the precedence fails here
// rather than in review, and one reads our own app.json so a re-introduced
// duplicate fails here rather than shipping.

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const appConfig = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")) as {
  expo: {
    ios?: { infoPlist?: Record<string, unknown> };
    plugins?: (string | [string, Record<string, unknown>])[];
  };
};

/**
 * Plugin option name -> the Info.plist key it writes.
 *
 * Only the plugins this app actually configures with permission options. Add a
 * row when a new plugin starts carrying permission copy; the second test then
 * covers it automatically.
 */
const OPTION_TO_PLIST_KEY: Record<string, string> = {
  photosPermission: "NSPhotoLibraryUsageDescription",
  cameraPermission: "NSCameraUsageDescription",
  microphonePermission: "NSMicrophoneUsageDescription",
  calendarPermission: "NSCalendarsUsageDescription",
  remindersPermission: "NSRemindersUsageDescription",
};

describe("iOS permission copy has exactly one source", () => {
  it("still resolves plugin option over ios.infoPlist upstream", () => {
    // Read the rule itself, not our belief about it. An Expo upgrade that
    // reversed this precedence would silently swap every permission string.
    const permissionsMod = readFileSync(
      path.join(root, "node_modules/@expo/config-plugins/build/ios/Permissions.js"),
      "utf8",
    );
    expect(permissionsMod).toContain(
      "infoPlist[permission] = permissions[permission] || infoPlist[permission] || description;",
    );
  });

  it("declares no permission string in both ios.infoPlist and a plugin option", () => {
    const infoPlist = appConfig.expo.ios?.infoPlist ?? {};
    const plugins = appConfig.expo.plugins ?? [];

    const duplicated: string[] = [];
    for (const entry of plugins) {
      if (!Array.isArray(entry)) continue;
      const [name, options] = entry;
      if (!options || typeof options !== "object") continue;
      for (const [option, value] of Object.entries(options)) {
        if (typeof value !== "string") continue;
        // Some plugins take the plist key verbatim (healthkit); others take a
        // friendly option name. Cover both shapes.
        const key = OPTION_TO_PLIST_KEY[option] ?? (option.startsWith("NS") ? option : null);
        if (key && key in infoPlist) duplicated.push(`${key} (ios.infoPlist and ${name}.${option})`);
      }
    }

    expect(duplicated).toEqual([]);
  });

  it("keeps the plist entries that no plugin sets", () => {
    // Removing the duplicated pair must not have taken the standalone ones
    // with it: nothing else declares these, so ios.infoPlist is their only home.
    const infoPlist = appConfig.expo.ios?.infoPlist ?? {};
    expect(infoPlist).toHaveProperty("NSUserTrackingUsageDescription");
    expect(infoPlist).toHaveProperty("ITSAppUsesNonExemptEncryption", false);
  });
});
