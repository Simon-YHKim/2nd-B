import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "supabase/functions");
const proxies = ["claude-proxy", "gemini-proxy", "openai-proxy", "xai-proxy"] as const;

describe.each(proxies)("%s mandatory consent and entitlement boundary", (proxy) => {
  const source = readFileSync(join(root, proxy, "index.ts"), "utf8");

  test("uses the canonical effective-consent RPC exactly once with no bypass", () => {
    expect(source.match(/'effective_llm_consent'/g)).toHaveLength(1);
    expect(source).toMatch(/'effective_llm_consent',[\s\S]*?p_user_id: userId/);
    expect(source).not.toContain("LLM_REQUIRE_CONSENT");
    expect(source).not.toMatch(/\.from\(['"]consent_records['"]\)/);
    expect(source).not.toMatch(/consentOk\s*!==\s*false/);
  });

  test("denies false, RPC errors, and thrown/missing RPCs before tier, spend, and egress", () => {
    const gate = source.indexOf("'effective_llm_consent'");
    const tier = source.indexOf("'effective_subscription_tier'", gate);
    const spend = source.indexOf("'bump_gemini_spend'", gate);
    const egress = source.indexOf("await fetch(", gate);
    const consentBlock = source.slice(gate, tier);

    expect(gate).toBeGreaterThan(-1);
    expect(consentBlock).toMatch(/if \(consentErr\)[\s\S]*consent_check_unavailable[\s\S]*503/);
    expect(consentBlock).toMatch(/consentOk !== true[\s\S]*consent_required[\s\S]*403/);
    expect(consentBlock).toMatch(/catch[\s\S]*consent_check_unavailable[\s\S]*503/);
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
