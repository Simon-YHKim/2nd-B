// Fail-closed contract for the UMP seam (session X, docs/admob-ump-plan_260718.html).
// The legal publication gate is currently closed, so these pin the posture
// even when a native SDK is available: no consent signal, no ad request.

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
// The real UMP flow lives in the .native variant since the P0-1 platform
// split (web resolves the fail-closed stub; see platform-split.test.ts).
import { ensureUmpConsent, ensureAdsInitialized } from "../consent.native";

describe("UMP consent seam (fail-closed)", () => {
  test("legal hold: consent resolves canRequestAds:false", async () => {
    await expect(ensureUmpConsent()).resolves.toEqual({ canRequestAds: false });
  });

  test("legal hold: initialize reports false, never throws", async () => {
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
    const src = readFileSync(path.resolve(__dirname, "../consent.native.ts"), "utf8");
    // The gate must demand an explicit true (undefined/null fail closed)...
    expect(src).toContain("info.canRequestAds === true");
    // ...and the native SDK may only be pulled lazily inside functions.
    expect(src).not.toMatch(/^import .*react-native-google-mobile-ads/m);
    // The caller's policy gate and this module's defense gate share only the
    // legal-readiness leaf; neither consent module imports policy.ts.
    expect(src).not.toMatch(/from "\.\/policy"/);
  });

  test("source pins: ATT is requested before the ad flow, iOS-only, and fail-open", () => {
    const src = readFileSync(path.resolve(__dirname, "../consent.native.ts"), "utf8");
    // ATT authorization must be requested (IDFA would otherwise stay zeroed and
    // AdMob would serve non-personalized despite the tracking declaration).
    expect(src).toContain("requestTrackingPermissionsAsync");
    // iOS-only: Android/web must no-op, never prompt.
    expect(src).toMatch(/Platform\.OS !== "ios"/);
    // ensureUmpConsent must invoke it before returning a consent result.
    expect(src).toContain("await ensureTrackingAuthorization()");
    // Static require so Metro can bundle the optional native module on device.
    expect(src).toContain('require("expo-tracking-transparency")');
  });

  test("legal hold excludes the native AdMob SDK on Android and iOS", () => {
    const root = path.resolve(__dirname, "../../../..");
    const appJson = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")) as {
      expo: { plugins: Array<string | [string, Record<string, unknown>]> };
    };
    expect(appJson.expo.plugins.some(
      (p) => p === "react-native-google-mobile-ads" ||
        (Array.isArray(p) && p[0] === "react-native-google-mobile-ads"),
    )).toBe(false);

    const nativeConfig = require("../../../../react-native.config.js") as {
      dependencies: Record<string, { platforms?: { android?: null; ios?: null } }>;
    };
    expect(nativeConfig.dependencies["react-native-google-mobile-ads"]?.platforms).toEqual({
      android: null,
      ios: null,
    });

    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      expo?: { autolinking?: { exclude?: string[] } };
    };
    expect(packageJson.expo?.autolinking?.exclude).toContain("react-native-google-mobile-ads");

    // Check the build tool's resolved output: a null RN CLI override alone
    // does not exclude this library from Expo 56 autolinking.
    const autolinkingCli = path.join(
      root, "node_modules", "expo-modules-autolinking", "bin", "expo-modules-autolinking.js",
    );
    for (const platform of ["android", "ios"]) {
      const output = execFileSync(
        process.execPath,
        [autolinkingCli, "react-native-config", "--platform", platform, "--json"],
        { cwd: root, encoding: "utf8" },
      );
      const resolved = JSON.parse(output) as { dependencies: Record<string, unknown> };
      expect(resolved.dependencies).not.toHaveProperty("react-native-google-mobile-ads");
    }
  });

  test("missing native module fails closed even if the legal gate later opens", async () => {
    jest.doMock("../legal-readiness", () => ({ adNetworkPublicationReady: () => true }));
    jest.doMock("react-native-google-mobile-ads", () => {
      throw new Error("native module excluded from this build");
    });
    try {
      await jest.isolateModulesAsync(async () => {
        const consent = await import("../consent.native");
        const rewarded = await import("../rewarded.native");
        await expect(consent.ensureUmpConsent()).resolves.toEqual({ canRequestAds: false });
        await expect(consent.ensureAdsInitialized()).resolves.toBe(false);
        expect(rewarded.isRewardedAdSdkAvailable()).toBe(false);
        expect(rewarded.canCompleteRewardedWatch()).toBe(false);
        await expect(rewarded.showRewardedAd({
          ssvCustomData: "00000000-0000-4000-8000-000000000001",
        })).resolves.toEqual({ completed: false });
      });
    } finally {
      jest.dontMock("react-native-google-mobile-ads");
      jest.dontMock("../legal-readiness");
    }
  });
});
