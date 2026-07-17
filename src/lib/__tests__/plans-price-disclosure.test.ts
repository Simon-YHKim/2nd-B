// U6 price disclosure: the plans surface must state auto-renewal, VAT-included
// pricing, and the 30-day refund window AT the price, and link the documents
// that back them (/terms, /refund). pricing.test.ts guards only the legacy
// `plans` namespace; the LIVE copy is deepspace ds.plans.* -- guarded here.

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("plans price disclosure (live ds.plans namespace)", () => {
  test("every locale carries the disclosure and both legal-link labels", () => {
    for (const locale of LOCALES) {
      const bundle = JSON.parse(read(`locales/${locale}/deepspace.json`)) as {
        ds: { plans: { disclosure?: string; legalTerms?: string; legalRefund?: string } };
      };
      const plans = bundle.ds.plans;
      expect(plans.disclosure ?? "").not.toHaveLength(0);
      expect(plans.legalTerms ?? "").not.toHaveLength(0);
      expect(plans.legalRefund ?? "").not.toHaveLength(0);
      // The three commitments: renewal cadence, VAT-included, 30-day window.
      expect(plans.disclosure).toMatch(/30/);
      expect(plans.disclosure).not.toMatch(/—/);
    }
  });

  test("ko/en disclosures name auto-renewal, VAT, and the refund guarantee", () => {
    const ko = JSON.parse(read("locales/ko/deepspace.json")).ds.plans.disclosure as string;
    const en = JSON.parse(read("locales/en/deepspace.json")).ds.plans.disclosure as string;
    expect(ko).toMatch(/자동 갱신/);
    expect(ko).toMatch(/부가세|VAT/);
    expect(ko).toMatch(/환불/);
    expect(en).toMatch(/renew automatically|auto-renew/i);
    expect(en).toMatch(/VAT/);
    expect(en).toMatch(/refund/i);
  });

  test("the live plans screen renders the disclosure and links /terms + /refund", () => {
    const screen = read("src/screens/deepspace/dds-plans-screen.tsx");
    expect(screen).toContain('t("ds.plans.disclosure")');
    expect(screen).toContain('t("ds.plans.legalTerms")');
    expect(screen).toContain('t("ds.plans.legalRefund")');
    expect(screen).toContain('router.push("/terms")');
    expect(screen).toContain('router.push("/refund")');
  });
});
