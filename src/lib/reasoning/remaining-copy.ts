/**
 * Split remaining-runs display (스펙 docs/reasoning-ux-spec_260718.html 결정 5 +
 * 인계 계약 13, PR-B): the weekly BASE remainder and the monthly REWARD credit
 * remainder are separate ledgers with separate reset instants, so the merged
 * "N회 남음 · 월요일 초기화" line was dishonest — reward credits do not reset
 * on Monday. Every surface now renders:
 *   이번 주 2회 중 1회 남음 · 월요일 초기화        (weekly base)
 *   보상 6회 남음 · 7월 말까지                      (monthly reward, when > 0)
 *
 * Pure module: deterministic functions of their arguments, no I/O, no React.
 * The RUN gate stays remainingReasoning() (base + credits) — this module only
 * changes how the numbers are SHOWN, never how they are spent.
 */

import type { SubscriptionTier } from "../progression/entitlements";
import { reasoningCapForTier } from "../entitlements/reasoning-cap";

/**
 * Weekly BASE runs left (rewarded credits excluded). null = unlimited tier.
 * Clamped to [0, cap] so an over-counted row can never show a negative.
 */
export function weeklyBaseRemaining(tier: SubscriptionTier, usedThisWeek: number): number | null {
  const cap = reasoningCapForTier(tier);
  if (cap === null) return null;
  return Math.max(0, cap - Math.max(0, usedThisWeek));
}

/**
 * Localized full month name for a KST 'YYYY-MM' bucket ("2026-07" → 7월 /
 * July / julio …). Intl when available (Hermes ships it), numeric fallback so
 * the string never becomes "Invalid Date" on an exotic runtime.
 */
export function monthLabelFor(localeTag: string, monthBucketValue: string): string {
  const month = Number.parseInt(monthBucketValue.slice(5, 7), 10);
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
  if (safeMonth === null) return monthBucketValue;
  try {
    // Any year works — only the month renders. UTC pins the day so no timezone
    // can shift it across a month boundary.
    const date = new Date(Date.UTC(2026, safeMonth - 1, 15));
    const label = new Intl.DateTimeFormat(localeTag, { month: "long", timeZone: "UTC" }).format(date);
    if (label && !/Invalid/i.test(label)) return label;
  } catch {
    // fall through to the numeric fallback
  }
  return localeTag.toLowerCase().startsWith("ko") ? `${safeMonth}월` : `month ${safeMonth}`;
}

/** "이번 주 2회 중 1회 남음 · 월요일 초기화" / "1 of 2 runs left this week · resets Monday" */
export function formatWeeklyRemaining(ko: boolean, cap: number, usedThisWeek: number): string {
  const left = Math.max(0, cap - Math.max(0, usedThisWeek));
  return ko
    ? `이번 주 ${cap}회 중 ${left}회 남음 · 월요일 초기화`
    : `${left} of ${cap} runs left this week · resets Monday`;
}

/** "보상 6회 남음 · 7월 말까지" / "6 reward runs left · through the end of July" */
export function formatRewardRemaining(ko: boolean, credits: number, monthBucketValue: string): string {
  const month = monthLabelFor(ko ? "ko" : "en", monthBucketValue);
  return ko
    ? `보상 ${Math.max(0, credits)}회 남음 · ${month} 말까지`
    : `${Math.max(0, credits)} reward runs left · through the end of ${month}`;
}
