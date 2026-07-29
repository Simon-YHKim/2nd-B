// Pricing SoT invariants + locale drift guard. The displayed plan copy in
// locales/{en,ko}/plans.json hardcodes price strings for i18n quality; these
// tests fail the build when copy and TIER_PRICING ever disagree.

import * as fs from "fs";
import * as path from "path";

import { CHAT_DAILY_LIMIT } from "@/lib/chat/limits";
import { TIER_RANK } from "../entitlements";
import { TIER_PRICING, type SellableTier } from "../pricing";

const PAID_TIERS: SellableTier[] = ["cortex", "brain"];

function readPlans(locale: "en" | "ko"): any {
  const p = path.join(__dirname, "..", "..", "..", "..", "locales", locale, "plans.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// 4900 -> "4,900" (the thousands-separated form used in the KRW copy).
const fmt = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

describe("TIER_PRICING invariants", () => {
  test("yearly is exactly 10x monthly in both currencies (two months free)", () => {
    for (const tier of PAID_TIERS) {
      expect(TIER_PRICING[tier].krwYearly).toBe(TIER_PRICING[tier].krwMonthly * 10);
      // Compare in cents to dodge float noise (4.99 * 10 = 49.900000...6).
      expect(Math.round(TIER_PRICING[tier].usdYearly * 100)).toBe(
        Math.round(TIER_PRICING[tier].usdMonthly * 100) * 10,
      );
    }
  });

  test("higher tiers cost more on every axis", () => {
    const ordered = [...PAID_TIERS].sort((a, b) => TIER_RANK[a] - TIER_RANK[b]);
    for (let i = 1; i < ordered.length; i++) {
      const lo = TIER_PRICING[ordered[i - 1]];
      const hi = TIER_PRICING[ordered[i]];
      expect(hi.krwMonthly).toBeGreaterThan(lo.krwMonthly);
      expect(hi.krwYearly).toBeGreaterThan(lo.krwYearly);
      expect(hi.usdMonthly).toBeGreaterThan(lo.usdMonthly);
      expect(hi.usdYearly).toBeGreaterThan(lo.usdYearly);
    }
  });

  test("v2 list prices (Simon-approved 2026-06-10, canon names ratified 2026-07-03)", () => {
    expect(TIER_PRICING.cortex.krwMonthly).toBe(9900);
    expect(TIER_PRICING.brain.krwMonthly).toBe(19900);
  });

  // Simon retired the lifetime plan on 2026-07-29: 99,000 forever sat at the
  // exact price of 항해자 yearly, so the yearly could never sell beside it.
  // This pins the retirement so a future edit cannot quietly reintroduce it.
  test("no lifetime plan is exported", () => {
    const pricing = jest.requireActual("../pricing") as Record<string, unknown>;
    expect(pricing.LIFETIME).toBeUndefined();
  });

  // soma stays a DB tier (four live RPCs + the users CHECK constraint depend
  // on it) but must never be merchandised again.
  test("soma is not sellable", () => {
    expect(Object.keys(TIER_PRICING)).toEqual(["cortex", "brain"]);
  });
});

describe("plans.json copy matches the pricing SoT", () => {
  const en = readPlans("en");
  const ko = readPlans("ko");

  test("paid tier price strings carry the SoT numbers", () => {
    for (const tier of PAID_TIERS) {
      const p = TIER_PRICING[tier];
      expect(en.tiers[tier].price).toContain(`$${p.usdMonthly.toFixed(2)}`);
      expect(en.tiers[tier].priceNote).toContain(`$${p.usdYearly.toFixed(2)}`);
      expect(ko.tiers[tier].price).toContain(`₩${fmt(p.krwMonthly)}`);
      expect(ko.tiers[tier].priceNote).toContain(`₩${fmt(p.krwYearly)}`);
    }
  });

  // The lifetime plan is retired (Simon, 2026-07-29). No locale may carry a
  // one-time-purchase note again: the copy would promise a product that has no
  // purchase path and collides with 항해자 yearly at the same price.
  test("no locale advertises a lifetime purchase", () => {
    for (const pack of [en, ko]) {
      for (const tier of Object.keys(pack.tiers)) {
        expect(pack.tiers[tier].lifetimeNote).toBeUndefined();
      }
    }
  });

  test("AI chat counts in copy match CHAT_DAILY_LIMIT", () => {
    expect(en.tiers.free.f3).toContain(`${CHAT_DAILY_LIMIT.free} AI chat`);
    expect(ko.tiers.free.f3).toContain(`${CHAT_DAILY_LIMIT.free}회`);
    for (const tier of PAID_TIERS) {
      expect(en.tiers[tier].f1).toContain(`${CHAT_DAILY_LIMIT[tier]} AI chat`);
      expect(ko.tiers[tier].f1).toContain(`${CHAT_DAILY_LIMIT[tier]}회`);
    }
  });
});
