// Fail-closed contract for the rewarded seam (2026-07-18). With no ad SDK
// there is no EARNED_REWARD event, so showRewardedAd() must never report a
// completed watch: the previous dev seam resolved completed:true, which paid
// out real usage counts (reasoning/chat +2) with no ad watched. Behavioral
// pins for every SDK-absent branch + a source pin so the fake-true seam
// cannot quietly return.

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { readFileSync } from "node:fs";
import path from "node:path";
import { showRewardedAd, isRewardedAdSdkAvailable } from "../rewarded";

describe("rewarded seam (fail-closed)", () => {
  test("today no SDK is wired: availability reports false", () => {
    expect(isRewardedAdSdkAvailable()).toBe(false);
  });

  test("SDK absent on native: resolves completed:false (no free reward)", async () => {
    await expect(showRewardedAd()).resolves.toEqual({ completed: false });
  });

  test("SDK absent on web: also completed:false", async () => {
    const rn = jest.requireMock("react-native") as { Platform: { OS: string } };
    rn.Platform.OS = "web";
    try {
      await expect(showRewardedAd()).resolves.toEqual({ completed: false });
    } finally {
      rn.Platform.OS = "android";
    }
  });

  test("source pin: reward only on EARNED_REWARD, no fabricated completion", () => {
    const src = readFileSync(path.resolve(__dirname, "../rewarded.ts"), "utf8");
    // The real-SDK contract stays written into the module...
    expect(src).toContain("EARNED_REWARD");
    // ...and no code path returns a completed watch without it.
    expect(src).not.toMatch(/return\s*\{\s*completed:\s*true/);
  });
});
