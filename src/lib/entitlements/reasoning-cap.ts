/**
 * Reasoning-cap mapping: reconciles the new pricing labels
 * (별바라기 / 항해자 / 북극성) with the internal SubscriptionTier model
 * (free / soma / cortex / brain).
 *
 * Tier mapping (FIXED):
 *   별바라기 (Stargazer)  = free
 *   항해자  (Voyager)    = cortex
 *   북극성  (North Star) = brain
 *   soma is the lifetime tier (no public pricing label of its own).
 *
 * Pure module: every export is a deterministic function of its arguments.
 * No I/O, no React, no external dependencies.
 */

import type { SubscriptionTier } from '../progression/entitlements';

/**
 * Monthly reasoning-run cap for a tier. null = unlimited.
 *   free   -> 30
 *   soma   -> 60
 *   cortex -> 60
 *   brain  -> null (unlimited)
 */
export function reasoningCapForTier(tier: SubscriptionTier): number | null {
  switch (tier) {
    case 'free':
      return 30;
    case 'soma':
      return 60;
    case 'cortex':
      return 60;
    case 'brain':
      return null;
  }
}

/**
 * Remaining reasoning runs given the tier, how many were used this month, and
 * any rewarded watch-to-earn credits. A null cap (unlimited) returns Infinity;
 * otherwise max(0, cap + rewardCredits - used).
 */
export function remainingReasoning(
  tier: SubscriptionTier,
  used: number,
  rewardCredits = 0,
): number {
  const cap = reasoningCapForTier(tier);
  if (cap === null) return Infinity;
  return Math.max(0, cap + rewardCredits - used);
}

/**
 * Human-facing pricing label for a tier in the requested locale.
 *   free   -> 별바라기 / Stargazer
 *   cortex -> 항해자  / Voyager
 *   brain  -> 북극성  / North Star
 *   soma   -> 평생    / Lifetime
 */
export function pricingLabel(
  tier: SubscriptionTier,
  locale: 'ko' | 'en',
): string {
  switch (tier) {
    case 'free':
      return locale === 'ko' ? '별바라기' : 'Stargazer';
    case 'cortex':
      return locale === 'ko' ? '항해자' : 'Voyager';
    case 'brain':
      return locale === 'ko' ? '북극성' : 'North Star';
    case 'soma':
      return locale === 'ko' ? '평생' : 'Lifetime';
  }
}
