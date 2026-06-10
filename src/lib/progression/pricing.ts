// Monetization v2 pricing — the single source of truth for plan prices.
// Approved by Simon 2026-06-10 from the v2 recommendation (deep-research
// verified: Day One / Rosebud benchmarks, RevenueCat + Adapty 2026 reports;
// hub outbox preview/20260607-0406-monetization-recommendation-v2.html).
//
// Display copy lives in locales/{en,ko}/plans.json — pricing.test.ts guards
// the two against drift. Store-level concerns (Apple/Google IAP + Small
// Business Program 15%, PPP per-country price points) are configured at
// store setup time and intentionally NOT modeled here; checkout is not
// wired in-app yet, so nothing in this file triggers billing.

import type { SubscriptionTier } from "./entitlements";

export type PaidTier = Exclude<SubscriptionTier, "free">;

export interface TierPricing {
  /** Monthly list price in KRW (VAT-inclusive). */
  krwMonthly: number;
  /** Yearly list price in KRW. Exactly 10x monthly: two months free. */
  krwYearly: number;
  /** Monthly list price in USD. */
  usdMonthly: number;
  /**
   * Yearly list price in USD. Exactly 10x monthly so the "2 months free"
   * claim is literally true in both currencies. Store price-point grids
   * (e.g. App Store tiers) may force a nearby value at IAP setup time —
   * if so, update here AND soften the locale copy together.
   */
  usdYearly: number;
}

export const TIER_PRICING: Record<PaidTier, TierPricing> = {
  soma: { krwMonthly: 4_900, krwYearly: 49_000, usdMonthly: 4.99, usdYearly: 49.9 },
  cortex: { krwMonthly: 9_900, krwYearly: 99_000, usdMonthly: 9.99, usdYearly: 99.9 },
  brain: { krwMonthly: 19_900, krwYearly: 199_000, usdMonthly: 19.99, usdYearly: 199.9 },
};

// Lifetime (one-time purchase) sits on the ENTRY tier, not Brain
// (repriced 2026-06-10, Simon: 299k was unrealistic for the KR market).
// Two structural reasons beyond the sticker:
// - Cannibalization guard: a lifetime must cost at least ~2x its tier's
//   yearly price (industry 2-3x) or it eats the subscription. 99,000 =
//   2x soma yearly. A "realistic" Brain lifetime would sit BELOW Brain's
//   own yearly (199,000) and break that floor.
// - Unit economics: AI inference recurs forever. Selling forever-250/day
//   (Brain) for one payment is a long-term cost bomb; forever-30/day
//   (soma) is bounded. Subscription-fatigue buyers (one-time = 26% of
//   lifestyle revenue, Adapty 2026) get a real entry option instead.
export const LIFETIME = { tier: "soma", krw: 99_000, usd: 99 } as const;

// The yearly anchor used across plan copy ("2 months free").
export const YEARLY_MONTHS_FREE = 2;
