// Annual billing was built and then never reachable.
//
// src/lib/billing/paddle-checkout.ts has resolved a distinct Paddle price id per
// tier AND cadence since it was written (EXPO_PUBLIC_PADDLE_PRICE_<TIER>_YEARLY),
// its own tests cover both, and .github/workflows/web-deploy.yml injects both
// vars. But the ONLY consumer in the app - the deep-space paywall - never passed
// a cadence, so `input.cadence ?? "monthly"` won every time and the yearly price
// id could not be reached from any surface. There was no toggle to omit it from
// either: the screen had no billing-period state and ds.plans had no yearly key.
//
// The failure mode this file exists to prevent is not "the toggle disappeared".
// It is the two ways a cadence control goes wrong on a money screen:
//   1. it offers a period that resolves to no price id -> a dead priced CTA,
//      which is the exact App Review 2.1 problem paywall-no-dead-cta covers;
//   2. it shows a yearly price while the rail underneath charges the monthly
//      RevenueCat package -> it succeeds at the wrong amount, which is worse.
//
// Render tests cannot cover this (RN 0.85 + jest 29 leaves StyleSheet undefined
// under the bare preset), so the source and the locale bundles are pinned.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TIER_PRICE_KRW, TIER_PRICE_KRW_YEARLY } from "../../entitlements/tiers";
import { TIER_PRICING } from "../../progression/pricing";

const ROOT = join(__dirname, "..", "..", "..");
const src = readFileSync(join(ROOT, "screens", "deepspace", "dds-plans-screen.tsx"), "utf8");
const checkout = readFileSync(join(ROOT, "lib", "billing", "paddle-checkout.ts"), "utf8");

const LOCALES = ["en", "ko", "es", "id", "pt"] as const;
const plansOf = (locale: string) =>
  JSON.parse(readFileSync(join(ROOT, "..", "locales", locale, "deepspace.json"), "utf8")).ds.plans as Record<
    string,
    string
  >;

describe("the yearly rail exists below the screen", () => {
  test("a price id is resolved per tier AND cadence", () => {
    expect(checkout).toMatch(/export type CheckoutCadence = "monthly" \| "yearly"/);
    expect(checkout).toMatch(/EXPO_PUBLIC_PADDLE_PRICE_\$\{tier\.toUpperCase\(\)\}_\$\{cadence\.toUpperCase\(\)\}/);
  });

  test("an unset cadence still falls back to monthly, so nothing changes until a yearly id exists", () => {
    expect(checkout).toMatch(/const cadence = input\.cadence \?\? "monthly";/);
    expect(checkout).toMatch(/cadence: CheckoutCadence = "monthly"/);
  });
});

describe("the paywall reaches the yearly rail", () => {
  test("the screen owns a cadence and hands it to BOTH checkout entry points", () => {
    expect(src).toMatch(/useState<CheckoutCadence>\("monthly"\)/);
    // the availability gate...
    expect(src).toMatch(/paddleCheckoutAvailable\(paddleTier, cadence\)/);
    // ...and the purchase itself.
    expect(src).toMatch(/openPaddleCheckout\(\{ tier: paddleTier, cadence, locale:/);
  });

  test("no call site silently keeps the monthly default", () => {
    // Comments are stripped first: this screen's prose names the function
    // ("paddleCheckoutAvailable() is false off-web..."), and counting that as a
    // call site would make the assertion fail on documentation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    const calls = code.match(/paddleCheckoutAvailable\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/,/);
  });
});

describe("the control cannot become a dead priced CTA", () => {
  test("it renders only when a yearly price id is actually configured", () => {
    expect(src).toMatch(/const yearlyOffered =\s*\n?\s*paddleCheckoutAvailable\("cortex", "yearly"\)/);
    expect(src).toMatch(/\{yearlyOffered \? \(/);
  });

  test("a coming-soon tier cannot make the segment live on its own", () => {
    expect(src).toMatch(/!PRO_COMING_SOON && paddleCheckoutAvailable\("brain", "yearly"\)/);
  });

  test("the segmented control is the shared M3 primitive, not a new one", () => {
    expect(src).toMatch(/import \{ MdButton, MdCard, SegBtn \} from "@\/components\/m3";/);
    expect(src).toMatch(/<SegBtn/);
  });
});

describe("the native rail is never charged under a yearly price", () => {
  test("canPurchase refuses RevenueCat for the yearly segment", () => {
    const body = src.slice(src.indexOf("function canPurchase"), src.indexOf("const showStoreNotice"));
    // The refusal sits BEFORE the RevenueCat package check, so the package can
    // never answer for a yearly selection.
    const refuseAt = body.indexOf('if (cadence !== "monthly") return false;');
    const pkgAt = body.indexOf("plusPkg");
    expect(refuseAt).toBeGreaterThan(-1);
    expect(pkgAt).toBeGreaterThan(refuseAt);
  });

  test("onStart repeats the refusal at the money path", () => {
    const body = src.slice(src.indexOf("function onStart"), src.indexOf("return (\n    <DockShell"));
    expect(body).toMatch(/if \(cadence !== "monthly"\) \{\s*\n\s*setError\(t\("ds\.plans\.purchaseError"\)\);\s*\n\s*return;/);
    expect(body.indexOf('cadence !== "monthly"')).toBeLessThan(body.indexOf("void buy(plusPkg)"));
  });
});

describe("the price on the card and the price Paddle charges share one source", () => {
  test("the yearly figure comes from the pricing SoT, not a literal", () => {
    expect(src).toMatch(/TIER_PRICE_KRW_YEARLY\[key\]/);
    expect(src).not.toMatch(/99[,_]?000/);
    expect(src).not.toMatch(/199[,_]?000/);
  });

  test("TIER_PRICE_KRW_YEARLY mirrors pricing.ts through the same fixed mapping", () => {
    expect(TIER_PRICE_KRW_YEARLY.plus).toBe(TIER_PRICING.cortex.krwYearly);
    expect(TIER_PRICE_KRW_YEARLY.pro).toBe(TIER_PRICING.brain.krwYearly);
    expect(TIER_PRICE_KRW_YEARLY.free).toBe(0);
  });

  test("yearly is exactly ten months, which is what the saving line claims", () => {
    // pricing.ts documents "exactly 10x monthly: two months free". The copy says
    // two months; if the numbers ever stop agreeing, the copy becomes a false
    // price claim, so they are pinned together rather than separately.
    expect(TIER_PRICE_KRW_YEARLY.plus).toBe(TIER_PRICE_KRW.plus * 10);
    expect(TIER_PRICE_KRW_YEARLY.pro).toBe(TIER_PRICE_KRW.pro * 10);
  });
});

describe("the price disclosure follows the selected period", () => {
  test("the screen swaps the disclosure instead of always claiming monthly renewal", () => {
    expect(src).toMatch(/cadence === "yearly" \? t\("ds\.plans\.disclosureYearly"\) : t\("ds\.plans\.disclosure"\)/);
  });

  test.each(LOCALES)("%s carries every new key", (locale) => {
    const p = plansOf(locale);
    for (const k of ["perYear", "cadenceMonthly", "cadenceYearly", "cadenceSaving", "disclosureYearly"]) {
      expect(typeof p[k]).toBe("string");
      expect(p[k].length).toBeGreaterThan(0);
    }
  });

  test("the yearly disclosure states an annual renewal, not a monthly one", () => {
    // Korean e-commerce disclosure has to name the cadence being agreed to. A
    // copy-paste of the monthly text would state the wrong contract at the price.
    const ko = plansOf("ko");
    expect(ko.disclosureYearly).toContain("연 단위로 자동 갱신");
    expect(ko.disclosureYearly).not.toContain("월 단위로 자동 갱신");
    const en = plansOf("en");
    expect(en.disclosureYearly).toContain("each year");
    expect(en.disclosureYearly).not.toContain("each month");
  });

  test("both disclosures still carry VAT and the refund window", () => {
    for (const locale of LOCALES) {
      const p = plansOf(locale);
      expect(p.disclosureYearly).toMatch(/7/);
      expect(p.disclosureYearly.length).toBeGreaterThan(80);
    }
  });
});
