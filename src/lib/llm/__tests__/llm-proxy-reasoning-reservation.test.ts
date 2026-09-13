import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "supabase/functions");
const proxies = ["claude-proxy", "gemini-proxy", "openai-proxy", "xai-proxy"] as const;

describe.each(proxies)("%s reasoning reservation boundary", (proxy) => {
  const source = readFileSync(join(root, proxy, "index.ts"), "utf8");

  test("accepts only a bounded run id and one of the two server-known slots", () => {
    expect(source).toContain("reasoningRunId?: unknown");
    expect(source).toContain("reasoningSlot?: unknown");
    expect(source).toMatch(/REASONING_RUN_ID_RE\.test\(reasoningRunId\)/);
    expect(source).toMatch(
      /body\?\.reasoningSlot === 'records'[\s\S]*body\?\.reasoningSlot === 'sources'/,
    );
    expect(source).toMatch(/!REASONING_RUN_ID_RE\.test\(reasoningRunId\) \|\| !reasoningSlot/);
  });

  test("claims once with the JWT subject after spend and capacity but before egress", () => {
    expect(source.match(/'claim_reasoning_proxy_call'/g)).toHaveLength(1);
    const claim = source.indexOf("'claim_reasoning_proxy_call'");
    const spend = source.lastIndexOf("'bump_gemini_spend'", claim);
    const capacity = source.lastIndexOf("reserveLlmProxyCapacity(", claim);
    const egress = source.indexOf("await fetch(", claim);
    const claimBlock = source.slice(claim, egress);

    expect(spend).toBeGreaterThan(-1);
    expect(capacity).toBeGreaterThan(spend);
    expect(claim).toBeGreaterThan(capacity);
    expect(egress).toBeGreaterThan(claim);
    expect(claimBlock).toMatch(/p_user_id: userId/);
    expect(claimBlock).toMatch(/p_run_id: reasoningRunId/);
    expect(claimBlock).toMatch(/p_slot: reasoningSlot/);
    expect(claimBlock).not.toMatch(/body\?\.userId|body\.userId/);
  });

  test("releases capacity, refunds daily spend, and fails closed on every pre-egress denial", () => {
    const claim = source.indexOf("'claim_reasoning_proxy_call'");
    const egress = source.indexOf("await fetch(", claim);
    const start = source.lastIndexOf("if (purpose === 'reasoning_connect')", claim);
    const gate = source.slice(start, egress);

    expect(start).toBeGreaterThan(-1);
    expect(gate.match(/await releaseCapacity\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(gate.match(/await refundBeforeDispatch\(\);/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(4);
    expect(gate).toMatch(/if \(claimErr\)[\s\S]*reasoning_reservation_unavailable[\s\S]*503/);
    expect(gate).toMatch(/claimOk !== true[\s\S]*reasoning_reservation_required[\s\S]*403/);
    expect(gate).toMatch(/catch[\s\S]*reasoning_reservation_unavailable[\s\S]*503/);
  });

  test("does not echo reservation identifiers or invent a free-credit refund contract", () => {
    const claim = source.indexOf("'claim_reasoning_proxy_call'");
    const egress = source.indexOf("await fetch(", claim);
    const gate = source.slice(source.lastIndexOf("if (purpose === 'reasoning_connect')", claim), egress);

    expect(gate).not.toMatch(/jsonResponse\(req,\s*\{[^}]*reasoningRunId/);
    expect(source).not.toContain("refund_reasoning_run_spend");
    expect(source).not.toContain("release_reasoning_proxy_call");
    expect(source).not.toContain("cancel_reasoning_run");
  });
});
