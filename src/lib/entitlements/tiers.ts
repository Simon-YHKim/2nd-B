/**
 * Entitlements — Phase 4 paywall boundary as a pure, tested library.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAME-QUALITY PRINCIPLE (HARD INVARIANT — do not violate)
 * ──────────────────────────────────────────────────────────────────────────
 * Tiers differ by COUNTS and PERSONAS only — NEVER by output quality, model,
 * or effort. A free user's reasoning output is identical in quality to a pro
 * user's; the only difference is HOW MANY runs they get and WHICH personas
 * unlock. There is intentionally no "model", "quality", or "effort" field
 * anywhere in TierLimits — adding one would break the invariant.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * PHASE 4 BOUNDARY (Simon 확정 2026-07-17)
 * ──────────────────────────────────────────────────────────────────────────
 * FREE FOR EVERYONE (no gate exists — deliberately absent from TierLimits):
 *   렌즈 전체(7 도메인) · 기록 보관 무제한(기기 로컬) · export · 연동.
 *   The pre-Phase-4 library modeled lens/history/export/integration gates;
 *   they were never wired to any UI and are now REMOVED, not just widened —
 *   dead gates invite accidental re-arming.
 *
 * PAID BOUNDARY (the only three levers):
 *   - reasoning:  free 주 2회 · plus 주 7회 · pro 무제한 (weekly, was monthly)
 *   - chat/day:   src/lib/chat/limits.ts CHAT_DAILY_LIMIT (server-derived SQL twin)
 *   - personas:   메타비 = plus+ · 트위비 = pro (2nd-B is free for everyone)
 *
 * Rewarded watch-to-earn grants additional COUNTS, never a quality bump —
 * available to ALL tiers, most importantly Free (self-funding). Reasoning
 * credits (this module) and chat bonuses (chat ad bonus, Phase 4) each keep
 * their own monthly earn cap so ads can never fully replace a subscription.
 *
 * Tier vocabulary and the weekly cap table live in ./tier-map.ts (등급명
 * 단일화). Prices derive from the single pricing SoT (progression/pricing.ts).
 * Pure module: no I/O, no React, no npm dependencies.
 */

import { TIER_PRICING } from '../progression/pricing';
import { DB_TIER_BY_PUBLIC, REASONING_PER_WEEK, type PublicTier } from './tier-map';

export type Tier = PublicTier;

/** Per-tier quantitative limits and persona gates. */
export interface TierLimits {
  /** Reasoning runs allowed per KST week. null = unlimited. */
  reasoningPerWeek: number | null;
  /** 메타비 persona unlocked. */
  metabPersona: boolean;
  /** 트위비 persona unlocked. */
  twibPersona: boolean;
}

export const TIERS: Record<Tier, TierLimits> = {
  free: {
    reasoningPerWeek: REASONING_PER_WEEK[DB_TIER_BY_PUBLIC.free],
    metabPersona: false,
    twibPersona: false,
  },
  plus: {
    reasoningPerWeek: REASONING_PER_WEEK[DB_TIER_BY_PUBLIC.plus],
    metabPersona: true,
    twibPersona: false,
  },
  pro: {
    reasoningPerWeek: REASONING_PER_WEEK[DB_TIER_BY_PUBLIC.pro],
    metabPersona: true,
    twibPersona: true,
  },
};

/**
 * Monthly price per tier in KRW (₩). free is always 0. Derived from the pricing
 * SoT via the FIXED mapping in tier-map.ts (plus=cortex, pro=brain), so a wrong
 * price can only be introduced in one place (pricing.ts). (audit M2, D3)
 */
export const TIER_PRICE_KRW: Record<Tier, number> = {
  free: 0,
  plus: TIER_PRICING.cortex.krwMonthly,
  pro: TIER_PRICING.brain.krwMonthly,
};

// ──────────────────────────────────────────────────────────────────────────
// Rewarded watch-to-earn — earns COUNTS, never quality.
// ──────────────────────────────────────────────────────────────────────────

/** Credits earned per rewarded video watched (reasoning runs / chat sends). */
export const REWARD_PER_WATCH = 2;

/** Maximum credits earnable per month via rewarded videos, per credit kind. */
export const REWARD_MONTHLY_CAP = 20;

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers — deterministic functions of their arguments, no I/O.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Remaining reasoning runs for the KST week.
 * null limit (unlimited) → Infinity. Otherwise the base weekly remainder plus
 * whatever monthly reward credits are still unconsumed (credits stretch the
 * allowance; they are consumed only once the weekly base is spent — mirrors
 * the 0089 RPC).
 */
export function remainingReasoning(
  tier: Tier,
  usedThisWeek: number,
  availableCredits = 0,
): number {
  const limit = TIERS[tier].reasoningPerWeek;
  if (limit === null) return Infinity;
  return Math.max(0, limit - usedThisWeek) + Math.max(0, availableCredits);
}

/** Whether the user may run reasoning given weekly usage and earned credits. */
export function canUseReasoning(
  tier: Tier,
  usedThisWeek: number,
  availableCredits = 0,
): boolean {
  return remainingReasoning(tier, usedThisWeek, availableCredits) > 0;
}

/** Whether a persona is unlocked for the tier. 2nd-B itself is always free. */
export function personaAllowed(tier: Tier, persona: 'metab' | 'twib'): boolean {
  return persona === 'metab' ? TIERS[tier].metabPersona : TIERS[tier].twibPersona;
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
