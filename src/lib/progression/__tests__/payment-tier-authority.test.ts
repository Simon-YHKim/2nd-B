// R3 guard: the subscription tier the whole app gates on MUST come from the DB
// (users.subscription_tier, written only by the store->revenue_events webhook),
// NEVER from RevenueCat's local `isPro`. RevenueCat is a purchase UI signal; if it
// ever leaked into gating, a store purchase would flip local isPro while the DB
// tier stayed 'free' -> "shows pro / features locked" (or the inverse). This test
// pins DB-as-authority so that class of bug can't spread past the plans screen's
// clearly-labelled optimistic display (dds-plans-screen.tsx).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LIB = join(__dirname, "..", "..");
const PURCHASES_IMPORT = /from\s+["'][^"']*payments\/purchases["']/;

function read(rel: string): string {
  return readFileSync(join(LIB, rel), "utf8");
}

describe("R3: subscription-tier gating authority is the DB, not RevenueCat", () => {
  test("useProgression reads tier from users.subscription_tier", () => {
    const src = read("progression/useProgression.ts");
    expect(src).toMatch(/subscription_tier/);
    expect(src).toMatch(/\.from\(["']users["']\)/);
  });

  test("useProgression never imports the RevenueCat purchases module", () => {
    expect(read("progression/useProgression.ts")).not.toMatch(PURCHASES_IMPORT);
  });

  test("no progression/entitlements gating module imports payments/purchases", () => {
    const gatingDirs = ["progression", "entitlements"];
    const offenders: string[] = [];
    for (const dir of gatingDirs) {
      for (const f of readdirSync(join(LIB, dir))) {
        if (!f.endsWith(".ts") || f.endsWith(".d.ts")) continue;
        const src = readFileSync(join(LIB, dir, f), "utf8");
        if (PURCHASES_IMPORT.test(src)) offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
