// Subscription tiers + free-tier usage limits. The "how much" axis.
// Stepped unlock: brain > cortex > soma > free. A higher tier includes
// everything a lower tier grants.

import type { GatedFeature } from "./gates";

export type SubscriptionTier = "free" | "soma" | "cortex" | "brain";

export const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  soma: 1,
  cortex: 2,
  brain: 3,
};

// Free-tier "taste" limit per feature. A feature absent here is not
// usage-limited (e.g. the onboarding audit is always unlimited).
export const FREE_LIMIT: Partial<Record<GatedFeature, number>> = {
  journal: 2,
  note: 2,
  self_context: 2, // counted per individual context
};

// The lowest tier at which a usage-limited feature becomes unlimited.
export const UNLIMITED_AT_TIER: Partial<Record<GatedFeature, SubscriptionTier>> = {
  journal: "soma",
  note: "soma",
  self_context: "cortex",
};

// Brain-only depth features.
export type PremiumFeature = "advisor" | "planner";
export const PREMIUM_MIN_TIER: Record<PremiumFeature, SubscriptionTier> = {
  advisor: "brain",
  planner: "brain",
};

export interface UsageCheck {
  allowed: boolean;
  unlimited: boolean;
  limit: number | null; // null when unlimited
  used: number;
  remaining: number | null; // null when unlimited
  reason: "ok" | "limit_reached";
  upgradeTo: SubscriptionTier | null; // tier that lifts the limit, if blocked
}

export function tierAtLeast(tier: SubscriptionTier, min: SubscriptionTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

// Can the user create one more of `feature`, given their tier and how many
// they have already used? For self_context, pass the per-context count.
export function checkUsage(
  feature: GatedFeature,
  tier: SubscriptionTier,
  usedCount: number,
): UsageCheck {
  const used = Math.max(0, Math.floor(usedCount));
  const limit = FREE_LIMIT[feature];

  // Not a usage-limited feature.
  if (limit === undefined) {
    return {
      allowed: true,
      unlimited: true,
      limit: null,
      used,
      remaining: null,
      reason: "ok",
      upgradeTo: null,
    };
  }

  const unlimitedTier = UNLIMITED_AT_TIER[feature] as SubscriptionTier;
  if (tierAtLeast(tier, unlimitedTier)) {
    return {
      allowed: true,
      unlimited: true,
      limit: null,
      used,
      remaining: null,
      reason: "ok",
      upgradeTo: null,
    };
  }

  const remaining = Math.max(0, limit - used);
  return {
    allowed: remaining > 0,
    unlimited: false,
    limit,
    used,
    remaining,
    reason: remaining > 0 ? "ok" : "limit_reached",
    upgradeTo: unlimitedTier,
  };
}

// Brain-tier depth features (advisor, planner).
export function canUsePremium(feature: PremiumFeature, tier: SubscriptionTier): boolean {
  return tierAtLeast(tier, PREMIUM_MIN_TIER[feature]);
}
