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

/**
 * The tiers we actually SELL. Narrower than PaidTier on purpose.
 *
 * `soma` is a paid DB tier but has no purchase path: it was only ever the
 * lifetime plan's tier, and Simon retired the lifetime plan on 2026-07-29
 * (₩99,000 lifetime collided head-on with 항해자's ₩99,000 yearly — same
 * price, one for a year and one forever, so the yearly would never sell).
 * The monthly ₩4,900 soma price was never sold either: the canon decision of
 * 2026-07-03 defines soma as "평생판" and the Phase 4 boundary of 2026-07-17
 * sells exactly Free / 항해자 / 북극성.
 *
 * soma STAYS in SubscriptionTier. It is load-bearing in four live production
 * RPCs (apply_billing_event, bump_chat_usage_if_under_cap,
 * bump_reasoning_usage_if_under_cap, reserve_reasoning_run) and in the
 * users_subscription_tier_check CHECK constraint. Removing it would mean
 * rewriting the billing and cap functions right before the payment rail opens.
 * The 2026-07-03 canon decision already set this precedent for cortex/brain:
 * "결제 enum·스토어 상품 불변".
 */
export type SellableTier = Extract<PaidTier, "cortex" | "brain">;

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

export const TIER_PRICING: Record<SellableTier, TierPricing> = {
  cortex: { krwMonthly: 9_900, krwYearly: 99_000, usdMonthly: 9.99, usdYearly: 99.9 },
  brain: { krwMonthly: 19_900, krwYearly: 199_000, usdMonthly: 19.99, usdYearly: 199.9 },
};

// The lifetime plan is retired (Simon, 2026-07-29). It used to live here as
// LIFETIME = { tier: "soma", krw: 99_000 }. The cannibalization guard that
// justified it measured the lifetime against soma's own yearly (49,000) and
// concluded 99,000 was a safe 2x — but a buyer never compares it to soma.
// They compare it to 항해자 yearly, which is also 99,000. Same money, one for
// a year and one forever: the yearly subscription could not survive next to
// it. Nothing was ever sold (0 paid users in production, 0 store products in
// Play/ASC/Paddle at the time of the decision), so retiring it costs nothing.

// The yearly anchor used across plan copy ("2 months free").
export const YEARLY_MONTHS_FREE = 2;
