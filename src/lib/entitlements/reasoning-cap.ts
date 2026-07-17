/**
 * Reasoning-cap mapping over the DB-canonical SubscriptionTier model
 * (free / soma / cortex / brain). The tier vocabulary and THE single weekly
 * cap table live in ./tier-map.ts (등급명 단일화, Phase 4) — this module is
 * the SubscriptionTier-facing view of that table plus the pricing labels.
 *
 * Phase 4 (Simon 확정 2026-07-17): reasoning caps are WEEKLY —
 *   free 주 2회 · soma/cortex(=plus) 주 7회 · brain(=pro) 무제한.
 * The 0089 migration derives the same numbers server-side from the EFFECTIVE
 * tier (judge comp + expiry, 0088); its structural test pins SQL ↔ tier-map.
 *
 * Pure module: every export is a deterministic function of its arguments.
 * No I/O, no React, no external dependencies.
 */

import type { SubscriptionTier } from '../progression/entitlements';
import { REASONING_PER_WEEK } from './tier-map';

/**
 * Weekly reasoning-run cap for a tier. null = unlimited.
 *   free -> 2 · soma -> 7 · cortex -> 7 · brain -> null
 */
export function reasoningCapForTier(tier: SubscriptionTier): number | null {
  return REASONING_PER_WEEK[tier];
}

/**
 * Remaining reasoning runs given the tier, how many were used this KST week,
 * and any still-unconsumed rewarded credits (monthly-scoped). A null cap
 * (unlimited) returns Infinity; otherwise the base weekly remainder plus the
 * available credits — credits stretch the allowance only after the weekly
 * base is spent, mirroring the 0089 RPC's consume order.
 */
export function remainingReasoning(
  tier: SubscriptionTier,
  usedThisWeek: number,
  availableCredits = 0,
): number {
  const cap = reasoningCapForTier(tier);
  if (cap === null) return Infinity;
  return Math.max(0, cap - usedThisWeek) + Math.max(0, availableCredits);
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
