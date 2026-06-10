// Pricing SoT invariants + locale drift guard. The displayed plan copy in
// locales/{en,ko}/plans.json hardcodes price strings for i18n quality; these
// tests fail the build when copy and TIER_PRICING ever disagree.

import * as fs from "fs";
import * as path from "path";

import { CHAT_DAILY_LIMIT } from "@/lib/chat/limits";
import { TIER_RANK } from "../entitlements";
import { LIFETIME, TIER_PRICING, type PaidTier } from "../pricing";

const PAID_TIERS: PaidTier[] = ["soma", "cortex", "brain"];

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

  test("v2 list prices (Simon-approved 2026-06-10, lifetime repriced same day)", () => {
    expect(TIER_PRICING.soma.krwMonthly).toBe(4900);
    expect(TIER_PRICING.cortex.krwMonthly).toBe(9900);
    expect(TIER_PRICING.brain.krwMonthly).toBe(19900);
    expect(LIFETIME.tier).toBe("soma");
    expect(LIFETIME.krw).toBe(99000);
    expect(LIFETIME.usd).toBe(99);
  });

  test("lifetime cannot cannibalize its tier subscription (>= 2x yearly)", () => {
    expect(LIFETIME.krw).toBeGreaterThanOrEqual(TIER_PRICING[LIFETIME.tier].krwYearly * 2);
    expect(LIFETIME.usd).toBeGreaterThanOrEqual(TIER_PRICING[LIFETIME.tier].usdYearly * 1.9);
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

  test("lifetime note lives on the LIFETIME tier card and carries the one-time price", () => {
    expect(en.tiers[LIFETIME.tier].lifetimeNote).toContain(`$${LIFETIME.usd}`);
    expect(ko.tiers[LIFETIME.tier].lifetimeNote).toContain(`₩${fmt(LIFETIME.krw)}`);
    expect(en.tiers.brain.lifetimeNote).toBeUndefined();
    expect(ko.tiers.brain.lifetimeNote).toBeUndefined();
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
