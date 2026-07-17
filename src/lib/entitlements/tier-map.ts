/**
 * Tier vocabulary unification — THE single mapping between the public pricing
 * tiers (free / plus / pro) and the DB-canonical SubscriptionTier set
 * (free / soma / cortex / brain), plus the one reasoning-cap table both the
 * client mirrors and the SQL structural tests pin against.
 *
 * Phase 4 order (Simon, 2026-07-17): "등급명 단일화(free/plus/pro ↔
 * soma/cortex/brain)". Before this module the mapping lived in prose across
 * tiers.ts and reasoning-cap.ts, each with its own copy of the cap numbers —
 * two tables that could drift. Now:
 *
 *   public   DB       라벨(ko/en)              지위
 *   ──────   ──────   ─────────────────────    ─────────────────────────────
 *   free     free     별바라기 / Stargazer      무료
 *   plus     cortex   항해자   / Voyager        ₩9,900/월 — 런칭 유료 티어
 *   pro      brain    북극성   / North Star     ₩19,900/월 — 후속(준비 중)
 *   (plus)   soma     평생     / Lifetime       ₩99,000 일시불 — reasoning은
 *                                               Plus와 동일(주 7회), 채팅은
 *                                               soma 고유 캡(30/일) 유지
 *
 * Reasoning caps are WEEKLY as of Phase 4 (free 주 2회 · plus 주 7회 · pro
 * 무제한 — Simon 확정 2026-07-17, 기존 월 30/60/무제한 대체). The SQL RPC
 * (db/migrations/0089) derives the same numbers server-side from the
 * EFFECTIVE tier (judge comp + expiry, 0088); the structural migration test
 * pins SQL ↔ this table.
 *
 * Pure module: no I/O, no React. Every export is a value or a deterministic
 * function of its arguments.
 */

import type { SubscriptionTier } from '../progression/entitlements';

/** Public-facing tier vocabulary (pricing surfaces, copy, analytics). */
export type PublicTier = 'free' | 'plus' | 'pro';

/** Public tier -> the DB tier a purchase of that plan writes. */
export const DB_TIER_BY_PUBLIC: Record<PublicTier, SubscriptionTier> = {
  free: 'free',
  plus: 'cortex',
  pro: 'brain',
};

/**
 * DB tier -> public tier for display. soma (Lifetime) surfaces as plus:
 * it is sold as a one-time entry purchase and holds plus-level reasoning.
 */
export const PUBLIC_TIER_BY_DB: Record<SubscriptionTier, PublicTier> = {
  free: 'free',
  soma: 'plus',
  cortex: 'plus',
  brain: 'pro',
};

/**
 * Weekly reasoning-run cap per DB tier. null = unlimited.
 * THE single cap table — reasoning-cap.ts and tiers.ts both read this, and
 * the 0089 migration structural test pins the SQL CASE arm to these values.
 */
export const REASONING_PER_WEEK: Record<SubscriptionTier, number | null> = {
  free: 2,
  soma: 7,
  cortex: 7,
  brain: null,
};
