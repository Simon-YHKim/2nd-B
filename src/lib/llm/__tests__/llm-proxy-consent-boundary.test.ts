import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "supabase/functions");
const proxies = ["claude-proxy", "gemini-proxy", "openai-proxy", "xai-proxy"] as const;
const consentHelper = readFileSync(join(root, "_shared/llm-consent.ts"), "utf8");

describe.each(proxies)("%s staged consent and entitlement boundary", (proxy) => {
  const source = readFileSync(join(root, proxy, "index.ts"), "utf8");

  test("validates gateway-authenticated claims before config checks or body reads", () => {
    const bearer = source.indexOf("startsWith('bearer ')");
    const claims = source.indexOf("const userId = userIdFromJwt(authHeader)");
    const apiKey = source.indexOf("const apiKey =");
    const body = source.indexOf("readLlmProxyJsonObject(req)");

    expect(bearer).toBeGreaterThan(-1);
    expect(claims).toBeGreaterThan(bearer);
    expect(apiKey).toBeGreaterThan(claims);
    expect(body).toBeGreaterThan(apiKey);
  });

  test("uses only the provenance-backed snapshot behind an explicit rollout flag", () => {
    const rollout = source.indexOf("Deno.env.get('LLM_REQUIRE_VERIFIED_CONSENT') === 'true'");

    expect(rollout).toBeGreaterThan(-1);
    expect(source).toContain("captureLlmConsent(capacityRpc, userId, Deno.env.get('LLM_REQUIRE_VERIFIED_CONSENT') === 'true')");
    expect(consentHelper.match(/'effective_llm_consent_snapshot_v2'/g)).toHaveLength(1);
    expect(source).not.toContain("'effective_llm_consent_v2'");
    expect(source.match(/'effective_llm_consent'/g)).toBeNull();
    expect(consentHelper).toMatch(/'effective_llm_consent_snapshot_v2',[\s\S]*?p_user_id: userId/);
    expect(source).not.toContain("LLM_REQUIRE_CONSENT");
    expect(source).not.toMatch(/\.from\(['"]consent_records['"]\)/);
    expect(source).toContain("await recheckLlmConsent(capacityRpc, consentLease)");
  });

  test("honors the shared denial before tier, spend, and egress", () => {
    const gate = source.indexOf("const consent =");
    const tier = source.indexOf("'effective_subscription_tier'", gate);
    const spend = source.indexOf("'bump_gemini_spend'", gate);
    const egress = source.indexOf("await fetch(", gate);
    const consentBlock = source.slice(gate, tier);

    expect(gate).toBeGreaterThan(-1);
    expect(consentBlock).toContain("if (consent.denial) return jsonResponse(req, { error: consent.denial.error }, consent.denial.status)");
    expect(tier).toBeGreaterThan(gate);
    expect(spend).toBeGreaterThan(tier);
    expect(egress).toBeGreaterThan(spend);
  });

  test("fails closed when effective-tier authorization rejects or drifts", () => {
    const tierLookups = source.match(/'effective_subscription_tier'/g)?.length ?? 0;
    const denials = source.match(/entitlement_check_unavailable/g)?.length ?? 0;
    const firstTier = source.indexOf("'effective_subscription_tier'");
    const firstQuota = source.indexOf("consumeLlmPurposeQuota(", firstTier);
    const firstSpend = source.indexOf("'bump_gemini_spend'", firstTier);
    const tierBlock = source.slice(firstTier, firstQuota);

    expect(tierLookups).toBeGreaterThan(0);
    expect(denials).toBeGreaterThanOrEqual(tierLookups);
    expect(tierBlock).toMatch(/tierErr|tierLookupFailed/);
    expect(tierBlock).toMatch(/catch/);
    expect(tierBlock).toContain("entitlement_check_unavailable");
    expect(firstQuota).toBeGreaterThan(firstTier);
    expect(firstSpend).toBeGreaterThan(firstQuota);
  });

  test("treats shared user/day spend RPC errors and exceptions as unavailable", () => {
    const firstSpend = source.indexOf("'bump_gemini_spend'");
    const firstCapacity = source.indexOf("reserveLlmProxyCapacity(", firstSpend);
    const spendBlock = source.slice(firstSpend, firstCapacity);

    expect(firstSpend).toBeGreaterThan(-1);
    expect(spendBlock).toMatch(/catch[\s\S]*spend_check_unavailable[\s\S]*503/);
    expect(spendBlock).toMatch(/spendErr|embedSpendErr/);
    expect(spendBlock).toContain("spend_check_unavailable");
    expect(source).not.toContain("GEMINI_SPEND_FAILOPEN");
    expect(source).not.toMatch(/PGRST202[\s\S]*break-glass|42883[\s\S]*break-glass/);
  });
});
