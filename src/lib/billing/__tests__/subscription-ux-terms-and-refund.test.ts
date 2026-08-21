// REQ-260821-03: two subscription UX gaps, both client-only.
//
// (a) An eligible user used to have to cancel, then notice a separate refund
//     card, then act again. The cancel sheet now offers both at once.
// (b) Money could be reached from a plan card with the renewal terms nowhere
//     on screen. A terms step now sits in front of BOTH rails.
//
// WHY THIS READS SOURCE INSTEAD OF RENDERING. Component render tests are
// blocked in this repo (RN 0.85 + jest 29 leaves StyleSheet undefined under the
// bare preset), so the properties that matter are pinned structurally. That is
// weaker than a render, and the weakness is worth naming: these assertions
// prove the wiring exists and that no SECOND path bypasses it, not that the
// modal looks right. The visual half is a manual QA item.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const SUBSCRIPTION = read("src/app/subscription.tsx");
const PLANS = read("src/screens/deepspace/dds-plans-screen.tsx");

const LOCALES = ["en", "ko", "es", "id", "pt"] as const;

function keyIn(locale: string, ns: string, path: string[]): string | undefined {
  const json = JSON.parse(read(`locales/${locale}/${ns}.json`)) as Record<string, unknown>;
  let node: unknown = json;
  for (const seg of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return typeof node === "string" ? node : undefined;
}

describe("(a) cancel offers the refund to eligible users", () => {
  test("the offer is gated on the SERVER verdict, not a client re-decision", () => {
    // canRequestRefund is the server's answer carried in the eligibility
    // payload. The screen must consume it, never re-derive it from dates or
    // usage counts - a second implementation is a second source of truth.
    expect(SUBSCRIPTION).toContain("const refundEligible = eligibility != null && canRequestRefund(eligibility)");
    expect(SUBSCRIPTION).toMatch(/\{refundEligible \? \(\s*<Pressable/);
    // No local re-derivation of the window.
    expect(SUBSCRIPTION).not.toMatch(/Date\.now\(\)\s*-\s*Date\.parse/);
  });

  test("the pair is opted into, never pre-ticked", () => {
    expect(SUBSCRIPTION).toContain("const [refundToo, setRefundToo] = useState(false);");
    // Opening the sheet resets the choice, so a dismissed sheet cannot leave a
    // ticked refund box waiting for the next cancel.
    expect(SUBSCRIPTION).toMatch(/setImmediate\(false\);\s*\n\s*setRefundToo\(false\);\s*\n\s*setSheet\("cancel"\)/);
  });

  test("the refund claim is filed ONLY after the cancel actually landed", () => {
    // A refund request fired after a rejected or dry-run cancel would file a
    // claim against a subscription the server just refused to touch.
    expect(SUBSCRIPTION).toMatch(
      /if \(alsoRefund && \(result\.outcome === "accepted" \|\| result\.outcome === "duplicate"\)\) \{\s*\n\s*const refund = await requestRefund\(\);/,
    );
  });

  test("the decision is read before the sheet closes", () => {
    const body = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf("const runCancel"));
    const decide = body.indexOf("const alsoRefund =");
    const close = body.indexOf("setSheet(null)");
    expect(decide).toBeGreaterThan(-1);
    expect(decide).toBeLessThan(close);
  });

  test("both halves of the outcome are reported", () => {
    // Letting the refund verdict speak for the cancel would tell a user whose
    // cancel succeeded that nothing happened.
    expect(SUBSCRIPTION).toContain('key: filed ? "cancelledAndRefundRequested" : "cancelledRefundNotAccepted"');
  });

  test("the copy stays on requested, never on completed", () => {
    // Paddle reviews the claim; the app never completes a refund.
    for (const loc of LOCALES) {
      for (const k of ["refundTogether", "refundOfferNote", "confirmWithRefundCta"]) {
        expect(keyIn(loc, "settings", ["subscription", "cancel", k])).toBeTruthy();
      }
      for (const k of ["cancelledAndRefundRequested", "cancelledRefundNotAccepted"]) {
        expect(keyIn(loc, "settings", ["subscription", "notice", k])).toBeTruthy();
      }
    }
    const ko = keyIn("ko", "settings", ["subscription", "notice", "cancelledAndRefundRequested"]) ?? "";
    expect(ko).toContain("접수");
    expect(ko).not.toContain("환불 완료");
    const en = (keyIn("en", "settings", ["subscription", "notice", "cancelledAndRefundRequested"]) ?? "").toLowerCase();
    expect(en).toContain("request");
    expect(en).not.toContain("refunded");
  });

  test("the server is untouched", () => {
    // The order is explicit: subscription-manage and the billing RPCs stay as
    // they are. The screen only calls actions that already existed.
    expect(SUBSCRIPTION).toContain("requestRefund");
    expect(SUBSCRIPTION).not.toMatch(/\.rpc\(/);
    expect(SUBSCRIPTION).not.toContain("functions.invoke");
  });
});

describe("(b) renewal terms are stated before any charge", () => {
  test("the plan CTA opens the terms step, not a checkout", () => {
    const onStart = PLANS.slice(PLANS.indexOf("function onStart("), PLANS.indexOf("function beginPurchase("));
    expect(onStart).toContain("setPendingTier(key);");
    expect(onStart).not.toContain("openPaddleCheckout");
    expect(onStart).not.toContain("buy(");
  });

  test("beginPurchase has exactly one caller and it is the terms confirm", () => {
    // The gate is worth nothing if a second entry point still reaches money.
    // Count call sites rather than trusting the one we just wrote.
    const calls = PLANS.match(/beginPurchase\(/g) ?? [];
    expect(calls).toHaveLength(2); // the declaration plus one call
    expect(PLANS).toMatch(/setPendingTier\(null\);\s*\n\s*if \(key\) beginPurchase\(key\);/);
  });

  test("the confirm button is disabled until the box is ticked", () => {
    expect(PLANS).toMatch(/label=\{t\("ds\.plans\.terms\.cta"\)\}[\s\S]{0,160}?disabled=\{!termsOk\}/);
    expect(PLANS).toContain("const [termsOk, setTermsOk] = useState(false);");
    // Re-opened for a different plan, consent starts over.
    expect(PLANS).toMatch(/setTermsOk\(false\);\s*\n\s*setPendingTier\(key\);/);
  });

  test("cycle, amount and how to stop it are all on the step", () => {
    expect(PLANS).toContain('t("ds.plans.terms.charge"');
    expect(PLANS).toMatch(
      /cadence === "yearly" \? t\("ds\.plans\.terms\.cycleYearly"\) : t\("ds\.plans\.terms\.cycleMonthly"\)/,
    );
    expect(PLANS).toContain('t("ds.plans.terms.cancelHow")');
  });

  test("the amount comes from the existing price source, not a literal", () => {
    // priceFor() is the screen's price path (TIER_PRICE_KRW / _YEARLY via
    // entitlements). A hardcoded number here could disagree with the card
    // directly above it, and with what Paddle actually charges.
    expect(PLANS).toMatch(/price: priceFor\(pendingTier\)/);
    const modal = PLANS.slice(PLANS.indexOf("ds.plans.terms.title"), PLANS.indexOf("<RewardedSheet"));
    expect(modal).not.toMatch(/[0-9]{4,}/); // no bare won amounts
  });

  test("free never reaches the step", () => {
    expect(PLANS).toMatch(/if \(key === "free"\) return;/);
  });

  test("all eight strings exist in every shipped locale", () => {
    for (const loc of LOCALES) {
      for (const k of ["title", "charge", "cycleMonthly", "cycleYearly", "cancelHow", "agree", "cta", "back"]) {
        expect(keyIn(loc, "deepspace", ["ds", "plans", "terms", k])).toBeTruthy();
      }
    }
  });

  test("the terms name automatic renewal in both reviewed locales", () => {
    // Apple 3.1.2 and the Korean e-commerce disclosure both hinge on the
    // renewal being stated, not merely implied by a price.
    expect(keyIn("ko", "deepspace", ["ds", "plans", "terms", "cycleMonthly"])).toContain("자동 갱신");
    expect((keyIn("en", "deepspace", ["ds", "plans", "terms", "cycleMonthly"]) ?? "").toLowerCase()).toContain(
      "automatically",
    );
    expect(keyIn("ko", "deepspace", ["ds", "plans", "terms", "cancelHow"])).toContain("해지");
  });
});
