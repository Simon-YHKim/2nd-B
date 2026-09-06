// SSV server boundary pins. Runtime helper behavior is unit-tested beside the
// Edge Function; these source pins prevent a later edit from bypassing the
// provider signature or dropping a DB-owned authorization dimension.
//
// Existing UI callers still pass a UUID-shaped local kind hint. The native
// ticket adapter lands separately; the server callback implemented here only
// accepts an opaque ticket plus the JWT-derived user id signed by Google.
// These pins keep the two call sites (the only rewarded surfaces) wired.
//
// Source pins by design (component render tests are blocked in this repo);
// the seam-level behavior (customData riding the ad request) is covered in
// rewarded.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

describe("SSV callback wiring", () => {
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

  test("verify_jwt=false is paired with a provider-signature-first callback", () => {
    const edge = read("supabase/functions/rewarded-ssv/index.ts");
    const config = read("supabase/config.toml");
    expect(config).toMatch(/\[functions\.rewarded-ssv\][\s\S]*?verify_jwt = false/);
    expect(edge).toMatch(/REWARD_SSV_ENABLED/);
    expect(edge).toMatch(/parseSignedSsvQuery/);
    expect(edge).toMatch(/crypto\.subtle\.verify/);
    const handlerAt = edge.indexOf("Deno.serve");
    expect(edge.indexOf("await signatureValid", handlerAt)).toBeLessThan(
      edge.indexOf("consume_reward_ssv_ticket", handlerAt),
    );
  });

  test("issues a JWT-owned ticket with the complete expected reward contract", () => {
    const edge = read("supabase/functions/rewarded-ssv/index.ts");
    expect(edge).toMatch(/admin\.auth\.getUser\(accessToken\)/);
    expect(edge).toMatch(/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
    const issueAt = edge.indexOf("rpc('issue_reward_ssv_ticket'");
    const issueArgs = edge.slice(issueAt, edge.indexOf("});", issueAt));
    expect(issueAt).toBeGreaterThan(0);
    for (const arg of [
      "p_user_id", "p_reward_kind", "p_token_hash", "p_ad_unit_id",
      "p_reward_amount", "p_reward_item",
    ]) expect(issueArgs).toContain(arg);
  });

  test("atomically consumes all six signed authorization dimensions before grant", () => {
    const edge = read("supabase/functions/rewarded-ssv/index.ts");
    const consumeAt = edge.indexOf("consume_reward_ssv_ticket");
    const consumeArgs = edge.slice(consumeAt, edge.indexOf("});", consumeAt));
    expect(consumeAt).toBeGreaterThan(0);
    for (const arg of [
      "p_token_hash", "p_callback_user_id", "p_txn_id", "p_ad_unit_id",
      "p_reward_amount", "p_reward_item",
    ]) expect(consumeArgs).toContain(arg);
    expect(consumeAt).toBeLessThan(edge.indexOf("grant_chat_ad_bonus_ssv"));
    expect(consumeAt).toBeLessThan(edge.indexOf("grant_reward_credits_ssv"));
  });

  test("pins Google key retrieval to bounded HTTPS with no redirects", () => {
    const edge = read("supabase/functions/rewarded-ssv/index.ts");
    expect(edge).toContain("https://www.gstatic.com/admob/reward/verifier-keys.json");
    expect(edge).toMatch(/redirect:\s*'error'/);
    expect(edge).toMatch(/content-type/);
    expect(edge).toMatch(/MAX_VERIFIER_KEY_BYTES/);
    expect(edge).toMatch(/MAX_SSV_QUERY_BYTES/);
  });

  test("does not log callback values, tickets, tokens, or exception text", () => {
    const edge = read("supabase/functions/rewarded-ssv/index.ts");
    expect(edge).not.toMatch(/console\.(?:error|warn|log)\([^\n]*(?:rawQuery|ticket|signature|accessToken|userId|callbackUserId|\.message|String\()/);
  });

  test("grant-authority guard: the reasoning client grant no-ops in SSV mode (D2)", () => {
    const usage = read("src/lib/entitlements/usage.ts");
    expect(usage).toMatch(/EXPO_PUBLIC_REWARD_SSV.*===.*"true"/);
  });
});
