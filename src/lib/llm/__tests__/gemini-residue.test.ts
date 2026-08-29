// The Gemini residue ratchet (T1 preparation, 2026-08-30).
//
// Every deployed posture already routes every LLM seat away from Gemini (repo
// Variables + eas.json), so Gemini survives in this library ONLY as unset
// defaults, the gemini-proxy name, model ids, and the direct @google/genai
// client path. Google stops accepting Standard keys in September; the
// retirement PR must touch every one of those sites in one go, and the ledger
// says the last real Gemini call was 2026-08-24 07:31 KST (interview_probe,
// from an old installed build).
//
// This file pins the MEASURED count of residue per file. Two things it does:
//   1. residue cannot grow silently before the retirement — a new `?? "gemini"`
//      fails here and has to be added to the table with a reason;
//   2. the retirement PR gets a checklist it cannot skip — when it removes a
//      default, the count drops and the table has to be updated to say so.
// It is a ratchet in both directions on purpose (the parity test's lesson).
//
// NOT counted: bump_gemini_spend / gemini_spend_daily (the shared spend cap,
// all four proxies, explicitly not renamed), comments, and tests.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n?/g, "\n");

// Strip block comments and // comments (whole-line and trailing) so that
// prose about Gemini does not count as residue. Same function the counts in
// the table were measured with.
export const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/.*$/, ""))
    .join("\n");

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

// Measured 2026-08-30 on origin/main afeb0718. `why` says what each number is
// made of so the retirement PR knows what it is looking for.
const RESIDUE: Record<string, { gemini: number; proxy: number; why: string }> = {
  "src/lib/llm/routing.ts": {
    gemini: 17,
    proxy: 2,
    why:
      "LlmVendor union · normalizeVendor · the unset defaults of backboneVendor/" +
      "safetyVendor/failoverVendor/embedVendor/multimodalVendor/legacyReasoningProvider/" +
      "chatVendorOverride · resolveTextVendor's phase fallbacks · the reasoningTier seam; " +
      "proxy: the LlmProxyFn union and proxyFnForVendor's default branch",
  },
  "src/lib/llm/boundary.ts": {
    gemini: 5,
    proxy: 0,
    why:
      "audit parity (`reasoningProvider` recorded as gemini on the pro tier) and the " +
      "direct-client branch guards; the proxy is only ever named via proxyFnForVendor",
  },
  "src/lib/llm/safety.ts": { gemini: 1, proxy: 0, why: "safetyVendor branch picks MODELS.flash for gemini" },
  "src/lib/llm/types.ts": { gemini: 1, proxy: 0, why: "reasoningProvider union" },
  "src/lib/llm/crosscheck.ts": { gemini: 2, proxy: 0, why: "vendor comparison for the challenger/defender pairing" },
};

// The eleven places in routing.ts where an UNSET environment resolves to
// Gemini. These are the retirement PR's primary targets: after gemini-proxy is
// gone, an unset switch must resolve to a live vendor or refuse, never to a
// dead proxy.
const UNSET_DEFAULT_SITES = 11;

describe("gemini residue is pinned per file (ratchet, both directions)", () => {
  test.each(Object.entries(RESIDUE))("%s carries exactly the measured residue", (rel, want) => {
    const code = codeOnly(read(rel));
    const got = { gemini: count(code, /"gemini"/g), proxy: count(code, /"gemini-proxy"/g) };
    expect(`${rel} "gemini"=${got.gemini} "gemini-proxy"=${got.proxy}`).toBe(
      `${rel} "gemini"=${want.gemini} "gemini-proxy"=${want.proxy}`,
    );
  });

  test("routing.ts has exactly the measured number of unset→gemini defaults", () => {
    const code = codeOnly(read("src/lib/llm/routing.ts"));
    const sites = code
      .split("\n")
      .filter((l) => /\?\? "gemini"|return "gemini";|\?\? "gemini"\)\.trim/.test(l));
    expect(sites).toHaveLength(UNSET_DEFAULT_SITES);
  });

  test("no file outside the table imports the vendor SDK or names the proxy", () => {
    // C1 already blocks vendor SDK imports outside boundary.ts via ESLint; this
    // pins the proxy NAME the same way, because a stray "gemini-proxy" string
    // in a screen would survive the retirement unnoticed and 404 at runtime.
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) return d.name === "__tests__" || d.name === "node_modules" ? [] : walk(p);
        return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
      });
    const offenders = walk(path.join(root, "src"))
      .map((p) => path.relative(root, p).replace(/\\/g, "/"))
      .filter((rel) => !(rel in RESIDUE))
      .filter((rel) => /"gemini-proxy"/.test(codeOnly(read(rel))));
    expect(offenders).toEqual([]);
  });
});

describe("the retirement checklist exists and names the ledger fact", () => {
  test("docs/LLM-VENDOR-PLACEMENT.md carries the T1 checklist with the last-call date", () => {
    const doc = read("docs/LLM-VENDOR-PLACEMENT.md");
    expect(doc).toMatch(/9월 폐기 체크리스트/);
    expect(doc).toMatch(/2026-08-24 07:31 KST/);
    expect(doc).toMatch(/gemini-residue\.test\.ts/);
  });
});
