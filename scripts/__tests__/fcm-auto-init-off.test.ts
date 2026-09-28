// FCM must not register the install before the user has agreed to anything.
//
// expo-notifications pulls in firebase-messaging, whose auto-init asks Google
// for an install id and an FCM token at process start. The app only schedules
// local notifications, so config-plugins/withFcmAutoInitOff.js turns that off
// in the Android manifest (finding: .bots/analytics/outbox/vb-fcm-autoinit-vc56).
//
// Three assertions, each guarding a different way this quietly comes undone:
//   1. the plugin really writes the documented meta-data, and only once;
//   2. app.json still loads the plugin (dropping the line is an easy tidy-up);
//   3. the premise holds: nothing in src asks for a push token. If remote push
//      is added, this fails on purpose - re-enable auto-init in code after
//      consent (setAutoInitEnabled) instead of deleting the plugin.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const plugin = require(path.join(ROOT, "config-plugins", "withFcmAutoInitOff.js")) as {
  setFcmAutoInitOff: (manifest: unknown) => unknown;
  FCM_AUTO_INIT: string;
};

type MetaData = { $: { "android:name": string; "android:value"?: string } };
type Manifest = { manifest: { application: { $: Record<string, string>; "meta-data"?: MetaData[] }[] } };

function minimalManifest(): Manifest {
  return { manifest: { application: [{ $: { "android:name": ".MainApplication" } }] } };
}

function metaNamed(manifest: Manifest, name: string): MetaData[] {
  return (manifest.manifest.application[0]["meta-data"] ?? []).filter((m) => m.$["android:name"] === name);
}

describe("FCM auto-init stays off", () => {
  test("the plugin writes firebase_messaging_auto_init_enabled=false once", () => {
    expect(plugin.FCM_AUTO_INIT).toBe("firebase_messaging_auto_init_enabled");
    const manifest = minimalManifest();
    plugin.setFcmAutoInitOff(manifest);
    plugin.setFcmAutoInitOff(manifest);
    const items = metaNamed(manifest, plugin.FCM_AUTO_INIT);
    expect(items).toHaveLength(1);
    expect(items[0].$["android:value"]).toBe("false");
  });

  test("app.json loads the plugin", () => {
    const appJson = JSON.parse(readFileSync(path.join(ROOT, "app.json"), "utf8")) as {
      expo: { plugins: (string | [string, unknown])[] };
    };
    const names = appJson.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toContain("./config-plugins/withFcmAutoInitOff");
  });

  test("the app never asks for a push token", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__") walk(full);
        } else if (/\.(ts|tsx|js)$/.test(name)) {
          const text = readFileSync(full, "utf8");
          if (/getExpoPushTokenAsync|getDevicePushTokenAsync|setAutoInitEnabled/.test(text)) {
            hits.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(hits).toEqual([]);
  });
});
