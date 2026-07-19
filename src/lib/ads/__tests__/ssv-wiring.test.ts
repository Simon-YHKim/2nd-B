// SSV customData wiring pins (0091 contract, dispatch 260719 S1-2).
//
// The rewarded-ssv edge function can only credit a user when the client sent
// the identity along with the ad request: custom_data "<userId>" routes to
// the reasoning grant (0079), "<userId>|chat" to the chat grant (0091), and
// a callback WITHOUT custom_data dies as no_user 400 -- so an unwired
// showRewardedAd() makes SSV mode structurally unable to grant anything.
// These pins keep the two call sites (the only rewarded surfaces) wired.
//
// Source pins by design (component render tests are blocked in this repo);
// the seam-level behavior (customData riding the ad request) is covered in
// rewarded.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

describe("SSV customData wiring (0091)", () => {
  test("ReasoningLimitSheet requests the ad with bare userId (reasoning kind)", () => {
    const src = read("src/components/deep-space/ReasoningLimitSheet.tsx");
    expect(src).toMatch(/showRewardedAd\(\{\s*ssvCustomData:\s*userId\s*\}\)/);
  });

  test("RewardedSheet routes the kind into the customData suffix", () => {
    const src = read("src/components/deepspace/RewardedSheet.tsx");
    // chat gets "<userId>|chat"; reasoning stays bare (0091: bare custom_data
    // must remain the reasoning path so fielded clients keep their behavior).
    expect(src).toMatch(/kind === "chat" \? `\$\{userId\}\|chat` : userId/);
    expect(src).toMatch(/showRewardedAd\(ssvCustomData \? \{ ssvCustomData \} : undefined\)/);
  });

  test("edge contract sanity: suffix routing + transaction_id idempotency stay in place", () => {
    const edge = read("supabase/functions/rewarded-ssv/index.ts");
    expect(edge).toMatch(/custom_data/);
    expect(edge).toMatch(/kindRaw === 'chat'/);
    expect(edge).toMatch(/transaction_id/);
    // Fail-closed switch stays: the callback grants nothing until explicitly
    // enabled (REWARD_SSV_ENABLED=1) alongside EXPO_PUBLIC_REWARD_SSV=true.
    expect(edge).toMatch(/REWARD_SSV_ENABLED/);
  });

  test("grant-authority guard: the reasoning client grant no-ops in SSV mode (D2)", () => {
    const usage = read("src/lib/entitlements/usage.ts");
    expect(usage).toMatch(/EXPO_PUBLIC_REWARD_SSV.*===.*"true"/);
  });
});
