// SSV server boundary pins. Runtime helper behavior is unit-tested beside the
// Edge Function; these source pins prevent a later edit from bypassing the
// provider signature or dropping a DB-owned authorization dimension.
//
// Existing UI callers pass a UUID-shaped local placement hint. The native
// adapter must validate it against the authenticated session, exchange it for
// an opaque ticket, and send only server-issued values to Google.
//
// Source pins by design (component render tests are blocked in this repo);
// the seam-level ordering and failure behavior are covered in rewarded.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

describe("SSV callback wiring", () => {
  test("ReasoningLimitSheet supplies the exact reasoning placement hint", () => {
    const src = read("src/components/deep-space/ReasoningLimitSheet.tsx");
    expect(src).toMatch(/showRewardedAd\(\{\s*ssvCustomData:\s*userId\s*\}\)/);
  });

  test("RewardedSheet supplies one of the two exact placement hints", () => {
    const src = read("src/components/deepspace/RewardedSheet.tsx");
    // These values are local compatibility hints, never provider custom data.
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

  test("native exchanges the authenticated placement hint for server SSV values", () => {
    const native = read("src/lib/ads/rewarded.native.ts");
    const ticketAt = native.indexOf('functions.invoke("rewarded-ssv"');
    const adAt = native.indexOf("RewardedAd.createForAdRequest");
    expect(native).toMatch(/auth\.getSession\(\)/);
    expect(native).toMatch(/Authorization:\s*`Bearer \$\{accessToken\}`/);
    expect(native).toMatch(/body:\s*\{ kind \}/);
    expect(ticketAt).toBeGreaterThan(0);
    expect(ticketAt).toBeLessThan(adAt);
    expect(native).toMatch(/serverSideVerificationOptions:\s*\{\s*userId:\s*ticket\.userId,\s*customData:\s*ticket\.customData/);
    expect(native).not.toMatch(/customData:\s*opts\??\.ssvCustomData/);
    expect(native).not.toMatch(/\.rpc\(/);
  });

  test("native capability is SSV-only and the web/native export surfaces match", () => {
    const native = read("src/lib/ads/rewarded.native.ts");
    const web = read("src/lib/ads/rewarded.ts");
    expect(native).toMatch(/EXPO_PUBLIC_REWARD_SSV\s*!==\s*"true"/);
    const exportedFunctions = (source: string) =>
      [...source.matchAll(/export (?:async )?function (\w+)/g)].map((match) => match[1]).sort();
    expect(exportedFunctions(native)).toEqual(exportedFunctions(web));
  });

  test("native reward path does not log identity, bearer, or ticket material", () => {
    const native = read("src/lib/ads/rewarded.native.ts");
    expect(native).not.toMatch(/console\.(?:error|warn|log)/);
    expect(native).not.toMatch(/JSON\.stringify\([^)]*(?:session|ticket|accessToken|userId)/);
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
