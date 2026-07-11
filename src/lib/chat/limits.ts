// Daily AI chat limits per monetization v2 (Simon-approved 2026-06-10).
// The free tier is a deliberate taste (5/day, raised from 2 per Simon 2026-07-11) — journaling
// stays unlimited; the conversion gate sits on AI usage only. Limits reset
// at KST midnight via the `day` column stored in chat_usage — callers
// compute the KST date with kstDateToday(). Prices live in
// src/lib/progression/pricing.ts.

import dayjs from "dayjs";

import type { SubscriptionTier } from "@/lib/progression/entitlements";

export const CHAT_DAILY_LIMIT: Record<SubscriptionTier, number> = {
  free: 5,
  soma: 30,
  cortex: 80,
  brain: 250,
};

/**
 * Today's date in KST as `YYYY-MM-DD`. The whole app uses Asia/Seoul as the
 * canonical "day" boundary — limits reset at KST midnight, so a user in
 * another timezone still sees the same cutoff.
 *
 * Implementation: dayjs UTC + a fixed +9h offset. We don't pull dayjs's
 * timezone plugin to keep the bundle small.
 */
export function kstDateToday(now: Date = new Date()): string {
  const KST_OFFSET_MIN = 9 * 60;
  const utcMillis = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utcMillis + KST_OFFSET_MIN * 60_000);
  return dayjs(kst).format("YYYY-MM-DD");
}

export interface ChatLimitCheck {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  upgradeTo: SubscriptionTier | null;
}

// Monetization v2 (2026-06-10): soma sells again as the entry tier, so the
// upgrade ladder walks every paid step — free -> soma -> cortex -> brain.
// (D-09 had retired soma; v2 supersedes that with the entry price point.)
const NEXT_TIER: Record<SubscriptionTier, SubscriptionTier | null> = {
  free: "soma",
  soma: "cortex",
  cortex: "brain",
  brain: null,
};

export function checkChatLimit(tier: SubscriptionTier, used: number): ChatLimitCheck {
  const limit = CHAT_DAILY_LIMIT[tier];
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;
  return {
    allowed,
    limit,
    used,
    remaining,
    upgradeTo: allowed ? null : NEXT_TIER[tier],
  };
}
