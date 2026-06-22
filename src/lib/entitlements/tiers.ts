/**
 * Entitlements — launch pricing strategy as a pure, tested library.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAME-QUALITY PRINCIPLE (HARD INVARIANT — do not violate)
 * ──────────────────────────────────────────────────────────────────────────
 * Tiers differ by COUNTS, FEATURES, and HISTORY only — NEVER by output
 * quality, model, or effort.
 *
 *   - Every tier (free / plus / pro) receives the SAME model and the SAME
 *     effort on every request. A free user's reasoning output is identical in
 *     quality to a pro user's; the only difference is HOW MANY they get, WHICH
 *     features unlock, and HOW MUCH history is retained.
 *   - This file therefore encodes only quantities and boolean feature gates.
 *     There is intentionally no "model", "quality", "tier-X prompt", or
 *     "effort" field anywhere in TierLimits — adding one would break the
 *     invariant.
 *   - Rewarded watch-to-earn (below) grants additional reasoning COUNTS, never
 *     a quality bump. Earned credits are full-quality reasoning, available to
 *     ALL tiers — most importantly Free, so the free experience can partly
 *     self-fund without ever feeling degraded.
 *
 * Pure module: no I/O, no React, no external dependencies. Every export is a
 * value or a deterministic function of its arguments.
 */

export type Tier = 'free' | 'plus' | 'pro';

/**
 * Per-tier quantitative limits and feature gates.
 *
 * A `null` numeric limit means UNLIMITED.
 * `lenses: 'all'` means every self-understanding lens is unlocked.
 */
export interface TierLimits {
  /** Reasoning runs allowed per calendar month. null = unlimited. */
  reasoningPerMonth: number | null;
  /** Number of lenses unlocked, or 'all' for every lens. */
  lenses: number | 'all';
  /** How many days of history are retained/visible. null = unlimited. */
  historyDays: number | null;
  /** Whether data export is available. */
  exportEnabled: boolean;
  /** Whether third-party integrations are available. */
  integrations: boolean;
  /** Number of Imagine (공상 → 구체화) projects. null = unlimited. */
  imagineProjects: number | null;
}

export const TIERS: Record<Tier, TierLimits> = {
  free: {
    reasoningPerMonth: 8,
    lenses: 3,
    historyDays: 30,
    exportEnabled: false,
    integrations: false,
    imagineProjects: 1,
  },
  plus: {
    reasoningPerMonth: 60,
    lenses: 'all',
    historyDays: null,
    exportEnabled: true,
    integrations: true,
    imagineProjects: null,
  },
  pro: {
    reasoningPerMonth: null,
    lenses: 'all',
    historyDays: null,
    exportEnabled: true,
    integrations: true,
    imagineProjects: null,
  },
};

/** Monthly price per tier in KRW (₩). free is always 0. */
export const TIER_PRICE_KRW: Record<Tier, number> = {
  free: 0,
  plus: 6900,
  pro: 11900,
};

// ──────────────────────────────────────────────────────────────────────────
// Rewarded watch-to-earn — earns COUNTS, never quality.
// ──────────────────────────────────────────────────────────────────────────
// A rewarded video grants additional full-quality reasoning runs. This applies
// to ALL tiers' reasoning count, most importantly Free (self-funding). The
// monthly cap exists so ads can never fully replace a Plus subscription.

/** Reasoning credits earned per rewarded video watched. */
export const REWARD_PER_WATCH = 2;

/** Maximum reasoning credits earnable per month via rewarded videos. */
export const REWARD_MONTHLY_CAP = 20;

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers — deterministic functions of their arguments, no I/O.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Remaining reasoning runs for the month.
 * null limit (unlimited) → Infinity. Otherwise
 * max(0, limit + earnedCredits − usedThisMonth).
 */
export function remainingReasoning(
  tier: Tier,
  usedThisMonth: number,
  earnedCredits = 0,
): number {
  const limit = TIERS[tier].reasoningPerMonth;
  if (limit === null) return Infinity;
  return Math.max(0, limit + earnedCredits - usedThisMonth);
}

/** Whether the user may run reasoning given usage and earned credits. */
export function canUseReasoning(
  tier: Tier,
  usedThisMonth: number,
  earnedCredits = 0,
): boolean {
  return remainingReasoning(tier, usedThisMonth, earnedCredits) > 0;
}

/**
 * Whether a given lens index is unlocked for the tier.
 * 'all' → always true; otherwise the index must be < the unlocked count.
 */
export function lensAllowed(tier: Tier, lensIndex: number): boolean {
  const lenses = TIERS[tier].lenses;
  if (lenses === 'all') return true;
  return lensIndex < lenses;
}

/** History retention horizon in days. null = unlimited. */
export function historyHorizonDays(tier: Tier): number | null {
  return TIERS[tier].historyDays;
}

/** Whether export is available for the tier. */
export function canExport(tier: Tier): boolean {
  return TIERS[tier].exportEnabled;
}

/** Whether integrations are available for the tier. */
export function canUseIntegrations(tier: Tier): boolean {
  return TIERS[tier].integrations;
}

/**
 * New earned-credits total after watching `watches` rewarded videos.
 * Each watch grants REWARD_PER_WATCH credits; the total is capped at
 * REWARD_MONTHLY_CAP so ads can never fully replace a paid tier.
 */
export function earnRewardCredits(currentEarned: number, watches = 1): number {
  const total = currentEarned + watches * REWARD_PER_WATCH;
  return Math.min(REWARD_MONTHLY_CAP, total);
}
