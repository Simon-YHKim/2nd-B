// Behavioral contract for the REAL rewarded path (session Y). The #1068
// fail-closed law is unchanged -- completed:true exists ONLY via Google's
// EARNED_REWARD event -- but the seam now drives a real (mocked here) AdMob
// RewardedAd behind the UMP gate, so the pins moved from "no SDK ever
// completes" to "every gate and every non-earned outcome fails closed, and a
// full earned watch completes".

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

jest.mock("../consent", () => ({
  ensureUmpConsent: jest.fn(async () => ({ canRequestAds: true })),
  ensureAdsInitialized: jest.fn(async () => true),
}));

type Listener = (...args: unknown[]) => void;
const listeners: Record<string, Listener[]> = {};
const fire = (type: string, ...args: unknown[]) => {
  for (const cb of listeners[type] ?? []) cb(...args);
};
const fakeAd = {
  addAdEventListener: jest.fn((type: string, cb: Listener) => {
    (listeners[type] ??= []).push(cb);
    return () => {};
  }),
  load: jest.fn(),
  show: jest.fn(),
};
const createForAdRequest = jest.fn(() => fakeAd);

jest.mock("react-native-google-mobile-ads", () => ({
  RewardedAd: { createForAdRequest: (...a: unknown[]) => createForAdRequest(...(a as [])) },
  RewardedAdEventType: { LOADED: "loaded", EARNED_REWARD: "earned" },
  AdEventType: { CLOSED: "closed", ERROR: "error" },
  TestIds: { REWARDED: "google-official-test-rewarded" },
}));

import { readFileSync } from "node:fs";
import path from "node:path";
// The real path lives in the .native variant since the P0-1 platform split
// (web resolves the fail-closed stub; see platform-split.test.ts).
import { canCompleteRewardedWatch, showRewardedAd } from "../rewarded.native";
import { ensureAdsInitialized, ensureUmpConsent } from "../consent";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// React Native defines __DEV__ at runtime; ts-jest does not. Default to the
// dev posture so the earned path is exercisable; the production-guard test
// flips it to false explicitly.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

beforeEach(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  for (const k of Object.keys(listeners)) delete listeners[k];
  jest.clearAllMocks();
  (ensureUmpConsent as jest.Mock).mockResolvedValue({ canRequestAds: true });
  (ensureAdsInitialized as jest.Mock).mockResolvedValue(true);
});

describe("showRewardedAd (real path, fail-closed)", () => {
  test("full watch: LOADED -> show(), EARNED_REWARD then CLOSED -> completed:true", async () => {
    const p = showRewardedAd();
    await flush();
    expect(fakeAd.load).toHaveBeenCalled();
    fire("loaded");
    expect(fakeAd.show).toHaveBeenCalled();
    fire("earned");
    fire("closed");
    await expect(p).resolves.toEqual({ completed: true });
  });

  test("dismiss before the reward: CLOSED without EARNED_REWARD -> completed:false", async () => {
    const p = showRewardedAd();
    await flush();
    fire("loaded");
    fire("closed");
    await expect(p).resolves.toEqual({ completed: false });
  });

  test("load/show error without a reward -> completed:false", async () => {
    const p = showRewardedAd();
    await flush();
    fire("error", new Error("no fill"));
    await expect(p).resolves.toEqual({ completed: false });
  });

  test("UMP denies: no ad request is ever created", async () => {
    (ensureUmpConsent as jest.Mock).mockResolvedValue({ canRequestAds: false });
    await expect(showRewardedAd()).resolves.toEqual({ completed: false });
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("SDK initialize fails -> completed:false, no ad request", async () => {
    (ensureAdsInitialized as jest.Mock).mockResolvedValue(false);
    await expect(showRewardedAd()).resolves.toEqual({ completed: false });
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("web platform: fails closed without touching UMP", async () => {
    const rn = jest.requireMock("react-native") as { Platform: { OS: string } };
    rn.Platform.OS = "web";
    try {
      await expect(showRewardedAd()).resolves.toEqual({ completed: false });
      expect(ensureUmpConsent).not.toHaveBeenCalled();
    } finally {
      rn.Platform.OS = "android";
    }
  });

  test("SSV customData rides the ad request (0091 contract)", async () => {
    const p = showRewardedAd({ ssvCustomData: "uid-123|chat" });
    await flush();
    expect(createForAdRequest).toHaveBeenCalledWith(
      "google-official-test-rewarded",
      { serverSideVerificationOptions: { customData: "uid-123|chat" } },
    );
    fire("loaded");
    fire("earned");
    fire("closed");
    await expect(p).resolves.toEqual({ completed: true });
  });

  test("production guard: non-dev builds fail closed until a real ad unit exists", async () => {
    const g = globalThis as { __DEV__?: boolean };
    const prev = g.__DEV__;
    g.__DEV__ = false;
    try {
      await expect(showRewardedAd()).resolves.toEqual({ completed: false });
      expect(createForAdRequest).not.toHaveBeenCalled();
      // P0-2 (Simon B-decision 2026-07-21): the capability gate runs BEFORE
      // UMP -- consent is never collected on a path that cannot fulfil it.
      expect(ensureUmpConsent).not.toHaveBeenCalled();
      // And the surfaces' CTA gate answers false for the same build.
      expect(canCompleteRewardedWatch()).toBe(false);
    } finally {
      g.__DEV__ = prev;
    }
  });

  test("capability gate: dev build with the SDK present can complete a watch", () => {
    expect(canCompleteRewardedWatch()).toBe(true);
  });

  test("source pins: EARNED_REWARD is the only completion source; gates stay in order", () => {
    const src = readFileSync(path.resolve(__dirname, "../rewarded.native.ts"), "utf8");
    expect(src).toContain("RewardedAdEventType.EARNED_REWARD");
    // No unconditional completed:true return anywhere.
    expect(src).not.toMatch(/return\s*\{\s*completed:\s*true/);
    // UMP gate is consulted before any ad request is constructed.
    expect(src.indexOf("ensureUmpConsent(")).toBeLessThan(src.indexOf("createForAdRequest"));
    // The caller-side eligibility gate is not re-implemented here.
    expect(src).not.toMatch(/from "\.\/policy"/);
  });
});
