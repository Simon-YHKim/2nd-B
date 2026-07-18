// Fail-closed contract for the UMP seam (session X, docs/admob-ump-plan_260718.html).
// The SDK is absent under jest, so these pin the exact posture the app ships
// with until the native module is present: no consent signal, no ad request.

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { readFileSync } from "node:fs";
import path from "node:path";
import { ensureUmpConsent, ensureAdsInitialized } from "../consent";

describe("UMP consent seam (fail-closed)", () => {
  test("SDK absent: consent resolves canRequestAds:false", async () => {
    await expect(ensureUmpConsent()).resolves.toEqual({ canRequestAds: false });
  });

  test("SDK absent: initialize reports false, never throws", async () => {
    await expect(ensureAdsInitialized()).resolves.toBe(false);
  });

  test("web platform: consent fails closed without touching the SDK", async () => {
    const rn = jest.requireMock("react-native") as { Platform: { OS: string } };
    rn.Platform.OS = "web";
    try {
      await expect(ensureUmpConsent()).resolves.toEqual({ canRequestAds: false });
    } finally {
      rn.Platform.OS = "android";
    }
  });

  test("source pins: strict canRequestAds check, no eager native import", () => {
    const src = readFileSync(path.resolve(__dirname, "../consent.ts"), "utf8");
    // The gate must demand an explicit true (undefined/null fail closed)...
    expect(src).toContain("info.canRequestAds === true");
    // ...and the native SDK may only be pulled lazily inside functions.
    expect(src).not.toMatch(/^import .*react-native-google-mobile-ads/m);
    // The app-level gate stays in policy.ts; this module must not import it
    // (composition happens in the caller, in gate order: policy -> UMP).
    expect(src).not.toMatch(/from "\.\/policy"/);
  });

  test("app.json carries the AdMob plugin with both app ids (decision (a): public literals)", () => {
    const appJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../app.json"), "utf8")) as {
      expo: { plugins: Array<string | [string, Record<string, unknown>]> };
    };
    const entry = appJson.expo.plugins.find(
      (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === "react-native-google-mobile-ads",
    );
    expect(entry).toBeDefined();
    const cfg = entry?.[1] ?? {};
    expect(String(cfg.androidAppId)).toMatch(/^ca-app-pub-\d{16}~\d{10}$/);
    expect(String(cfg.iosAppId)).toMatch(/^ca-app-pub-\d{16}~\d{10}$/);
    expect(cfg.delayAppMeasurementInit).toBe(true);
  });
});
