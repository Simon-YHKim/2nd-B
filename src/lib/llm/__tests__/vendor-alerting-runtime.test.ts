// REQ-260824-01 ③: a seat that starts failing has to leave a trace.
//
// Until 2026-08-24 it left none. Every proxy returns early on an upstream
// failure - before its audit insert - so ai_audit_log held only the calls that
// WORKED. A vendor could reject every request for a week and the ledger would
// look like a quiet week, which is indistinguishable from an actual quiet week.
// That is why the xai 403 took two days and a manual dashboard check to find.
//
// The fix reuses the suffix convention the proxies already have (+refusal,
// +truncated) rather than adding a table, so nothing needs a migration.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const SHARED = read("supabase/functions/_shared/llm-proxy-common.ts");
const PROXIES = ["openai", "claude", "xai"] as const;
const TRIPWIRE = read(".github/workflows/billing-tripwires.yml");

describe("every seat vendor records its failures", () => {
  test.each([...PROXIES])("%s-proxy audits both failure exits", (name) => {
    const src = read(`supabase/functions/${name}-proxy/index.ts`);
    // Both exits: the fetch throwing, and a non-2xx reply. Covering only one
    // would leave the more common half of an outage invisible.
    expect(src).toContain("outcome: 'upstream_unreachable'");
    expect(src).toContain("outcome: `upstream_${upstream.status}`");
    expect((src.match(/await auditUpstreamFailure\(/g) ?? []).length).toBe(2);
  });

  test.each([...PROXIES])("%s-proxy still refunds before it audits", (name) => {
    const src = read(`supabase/functions/${name}-proxy/index.ts`);
    // The spend refund is the user-facing half and must not be displaced by
    // the logging half. A failure that ate a user's daily allowance AND told
    // nobody is worse than one that only told nobody.
    const i = src.indexOf("outcome: 'upstream_unreachable'");
    const refundBefore = src.lastIndexOf("await refundOnFailure();", i);
    expect(refundBefore).toBeGreaterThan(-1);
    expect(refundBefore).toBeLessThan(i);
  });
});

describe("the helper cannot make a failing path worse", () => {
  test("it swallows its own errors", () => {
    // It runs on a path that is ALREADY failing. Throwing here would turn a
    // useful 502 into a confusing 500.
    const fn = SHARED.slice(SHARED.indexOf("export async function auditUpstreamFailure"));
    expect(fn).toMatch(/\} catch \{/);
    expect(fn).not.toMatch(/throw /);
  });

  test("a failure row is distinguishable from an empty success", () => {
    const fn = SHARED.slice(SHARED.indexOf("export async function auditUpstreamFailure"));
    expect(fn).toContain("output_hash: '0'");
    expect(fn).toContain("model_used: `${opts.model}+${opts.outcome}`");
  });

  test("it records the vendor, so the ledger can be grouped by it", () => {
    const fn = SHARED.slice(SHARED.indexOf("export async function auditUpstreamFailure"));
    expect(fn).toContain("reasoning_vendor: opts.vendor");
    expect(fn).toContain("purpose: opts.purpose");
  });
});

describe("something reads the rows", () => {
  test("the daily tripwire counts failing seats", () => {
    // A trace nobody reads is the same as no trace - the lesson this very
    // workflow file was written for.
    expect(TRIPWIRE).toContain("vendor_seat_failing");
    // The underscore is LIKE-escaped in the SQL so it matches a literal "_",
    // not any character - otherwise '+upstreamX' would count too.
    expect(TRIPWIRE).toMatch(/like '%\+upstream\\_%'/);
  });

  test("it needs 3+ failures, so a transient 502 is not an alarm", () => {
    // Alert fatigue is the failure mode of a daily check. One blip must not
    // train anyone to ignore the row.
    expect(TRIPWIRE).toMatch(/having count\(\*\) >= 3/);
  });

  test("and it counts into the total that decides whether to raise an issue", () => {
    expect(TRIPWIRE).toMatch(/TOTAL=\$\(\( CONFLICT \+ STUCK \+ REVIEW \+ STALE \+ UNHANDLED \+ CDRIFT \+ BDRIFT \+ VENDORFAIL \)\)/);
  });
});
