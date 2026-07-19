// Regression guard for the P0-1 web-export crash class (web-deploy runs
// 29642324523 / 29643931576 / 29645075631): Metro walks the module graph
// STATICALLY, so any reference to the native ads SDK reachable from a
// web-resolved module drags react-native internals (codegenNativeComponent
// via BannerAd) into the web bundle and kills `expo export --platform web`
// at build time -- on green CI, because jest and tsc cannot see it.
//
// The contract this file pins: the SDK may be referenced ONLY from
// *.native.ts variants; the web/default variants stay reference-free and
// fail closed with the exact same surface. The ci.yml web-export-smoke job
// is the end-to-end guard for the whole class; this test is the fast local
// tripwire inside `npm run verify`.

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { readFileSync } from "node:fs";
import path from "node:path";
import * as consentWeb from "../consent";
import * as consentNative from "../consent.native";
import * as rewardedWeb from "../rewarded";
import * as rewardedNative from "../rewarded.native";

// Compile-time parity: each side must satisfy the other's export types, so a
// signature drift between stub and native impl fails type-check (and ts-jest).
const _rewardedNativeCoversWeb: typeof rewardedWeb = rewardedNative;
const _rewardedWebCoversNative: typeof rewardedNative = rewardedWeb;
const _consentNativeCoversWeb: typeof consentWeb = consentNative;
const _consentWebCoversNative: typeof consentNative = consentWeb;
void _rewardedNativeCoversWeb;
void _rewardedWebCoversNative;
void _consentNativeCoversWeb;
void _consentWebCoversNative;

// import "...", from "...", require("..."), import("..."), typeof import("...")
// -- every form Metro (or a future refactor) could follow.
const SDK_REF = /(from\s*["']|require\(\s*["']|import\(\s*["']|import\s+["'])react-native-google-mobile-ads/;

const read = (f: string) => readFileSync(path.resolve(__dirname, "..", f), "utf8");

describe("ads platform split (web bundle safety)", () => {
  test("web-resolved variants never reference the native SDK in any importable form", () => {
    for (const f of ["rewarded.ts", "consent.ts", "types.ts", "policy.ts"]) {
      expect(read(f)).not.toMatch(SDK_REF);
    }
  });

  test("the native SDK reference lives only in the .native variants (sanity of the guard itself)", () => {
    // If the SDK ever moves elsewhere, this fails and forces the guard list
    // above to be revisited instead of silently guarding nothing.
    expect(read("rewarded.native.ts")).toMatch(SDK_REF);
    expect(read("consent.native.ts")).toMatch(SDK_REF);
  });

  test("export surfaces match between web and native variants", () => {
    expect(Object.keys(rewardedNative).sort()).toEqual(Object.keys(rewardedWeb).sort());
    expect(Object.keys(consentNative).sort()).toEqual(Object.keys(consentWeb).sort());
  });

  test("web stubs fail closed (same posture the lazy guard gave web at runtime)", async () => {
    expect(rewardedWeb.isRewardedAdSdkAvailable()).toBe(false);
    await expect(rewardedWeb.showRewardedAd()).resolves.toEqual({ completed: false });
    await expect(rewardedWeb.showRewardedAd({ ssvCustomData: "uid|chat" })).resolves.toEqual({
      completed: false,
    });
    await expect(consentWeb.ensureUmpConsent()).resolves.toEqual({ canRequestAds: false });
    await expect(consentWeb.ensureAdsInitialized()).resolves.toBe(false);
  });
});
