// Daily AI chat limits per monetization v2 (Simon-approved 2026-06-10).
// The free tier is a deliberate taste (5/day, raised from 2 per Simon 2026-07-11) — journaling
// stays unlimited; the conversion gate sits on AI usage only. Limits reset
// at KST midnight via the `day` column stored in chat_usage — callers
// compute the KST date with kstDateToday(). Prices live in
// src/lib/progression/pricing.ts.

import { kstDayKey } from "@/lib/journal/streak";
import type { SubscriptionTier } from "@/lib/progression/entitlements";

// Phase 4 (Simon 2026-07-17): the free daily cap is env-adjustable for
// experimentation — default 5. The SERVER cap lives in the bump_chat RPC SQL
// (0088/0090) and does NOT read this env: changing the knob without shipping a
// matching migration makes the structural migration tests fail loudly, which
// is the intended drift alarm (a client-only change would just lie to users).
const FREE_CHAT_DAILY_DEFAULT = 5;
function freeChatDaily(): number {
  const raw = Number(process.env.EXPO_PUBLIC_CHAT_FREE_DAILY);
  return Number.isInteger(raw) && raw > 0 ? raw : FREE_CHAT_DAILY_DEFAULT;
}

export const CHAT_DAILY_LIMIT: Record<SubscriptionTier, number> = {
  free: freeChatDaily(),
  soma: 30,
  cortex: 80,
  brain: 250,
};

/**
 * Today's date in KST as `YYYY-MM-DD`. The whole app uses Asia/Seoul as the
 * canonical "day" boundary — limits reset at KST midnight, so a user in
 * another timezone still sees the same cutoff.
 *
 * Delegates to journal/streak.ts kstDayKey (absolute epoch + fixed +9h, read via
 * UTC parts) so the two "same KST day" helpers can never disagree. The previous
 * getTimezoneOffset() + dayjs-local-format approach read the device offset at two
 * different instants and drifted by ~1h across a DST transition, flipping the KST
 * day for non-KST users right at the reset boundary.
 */
export function kstDateToday(now: Date = new Date()): string {
  return kstDayKey(now.toISOString());
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
