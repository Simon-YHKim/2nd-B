/**
 * Usage counters: Supabase-backed reasoning usage + rewarded credits in
 * usage_counters. Backs the reasoning caps in ./reasoning-cap.ts.
 *
 * Phase 4 (0089): reasoning usage is counted on KST ISO-WEEK rows
 * ('IYYY-Wnn' in the month_bucket column) — free 주 2회 · plus 주 7회 —
 * while rewarded credits stay MONTHLY ('YYYY-MM'). Once the weekly base is
 * spent, each run consumes one monthly credit (reward_consumed), so
 * `rewardCredits` here reports the AVAILABLE remainder (earned − consumed).
 * The RPC derives both buckets server-side; the strings computed here must
 * match its to_char formats (pinned by the 0089 structural test).
 *
 * Reads FAIL OPEN: on any error (including the table being absent) the read
 * returns a zeroed counter so a user is never wrongly blocked. Writes fail
 * gracefully (warn, no throw) so a transient counter failure never breaks the
 * surrounding flow.
 */

import { getSupabaseClient } from '../supabase/client';

const TABLE = 'usage_counters';

export interface ReasoningUsage {
  /** Reasoning runs used this KST ISO week. */
  used: number;
  /** Rewarded credits still available this month (earned − consumed). */
  rewardCredits: number;
  /** Rewarded credits EARNED this month (vs REWARD_MONTHLY_CAP) — drives the
   *  "이번 달 보상을 모두 받았어요" state of the limit sheet (spec F). */
  rewardEarned: number;
  weekBucket: string;
  monthBucket: string;
}

/**
 * KST 'YYYY-MM' for the given instant (defaults to now). Pure: derives the KST
 * wall-clock month by shifting the UTC instant +9h, so it is independent of the
 * host machine's timezone.
 */
export function monthBucket(now: Date = new Date()): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * KST ISO-8601 week bucket 'IYYY-Wnn' for the given instant (defaults to now),
 * e.g. '2026-W29'. Must render the exact string Postgres produces for
 * to_char(now() AT TIME ZONE 'Asia/Seoul', 'IYYY-"W"IW') in the 0089 RPC:
 * ISO week-year (the year of the week's Thursday) + zero-padded ISO week.
 * Pure: shifts the UTC instant +9h and reads UTC parts, so it is independent
 * of the host machine's timezone.
 */
export function weekBucket(now: Date = new Date()): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the week's Thursday fixes the ISO year
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Read the current-month counter for a user. FAIL OPEN: on any error returns
 * { used: 0, rewardCredits: 0, monthBucket } so the user is never blocked by a
 * read failure or an absent table.
 */
export async function getReasoningUsage(userId: string): Promise<ReasoningUsage> {
  const week = weekBucket();
  const month = monthBucket();
  const zero: ReasoningUsage = { used: 0, rewardCredits: 0, rewardEarned: 0, weekBucket: week, monthBucket: month };
  try {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select('month_bucket, reasoning_used, reward_credits, reward_consumed')
      .eq('user_id', userId)
      .in('month_bucket', [week, month]);
    if (error) {
      console.warn('[usage] getReasoningUsage read failed, failing open:', error.message);
      return zero;
    }
    const weekRow = data?.find((r) => r.month_bucket === week);
    const monthRow = data?.find((r) => r.month_bucket === month);
    const earned = Number(monthRow?.reward_credits) || 0;
    const consumed = Number(monthRow?.reward_consumed) || 0;
    return {
      used: Number(weekRow?.reasoning_used) || 0,
      rewardCredits: Math.max(0, earned - consumed),
      rewardEarned: Math.max(0, earned),
      weekBucket: week,
      monthBucket: month,
    };
  } catch (e) {
    console.warn('[usage] getReasoningUsage threw, failing open:', e);
    return zero;
  }
}

/**
 * Increment this week's reasoning_used by 1 via the atomic SECURITY DEFINER
 * RPC (0089). The weekly cap AND both bucket strings are derived server-side
 * from the effective tier / KST clock — the p_month and p_cap arguments are
 * ignored back-compat placeholders, so the honest client path cannot spoof
 * its cap, rotate buckets, or fail open on a read error. A returned error
 * (P0001 = reasoning_limit_exceeded) means the atomic gate rejected an
 * over-cap run after the weekly base AND monthly credits were exhausted; the
 * client already checks remaining before calling, so that is a race/backstop.
 * Fails gracefully (warn, no throw).
 */
export async function incrementReasoningUsage(userId: string): Promise<void> {
  const bucket = weekBucket();
  try {
    const { error } = await getSupabaseClient().rpc('bump_reasoning_usage_if_under_cap', {
      p_user_id: userId,
      p_month: bucket, // ignored server-side (0089 derives KST buckets itself)
      p_cap: 0, // ignored server-side; the RPC derives the cap from the effective tier
    });
    if (error) {
      console.warn('[usage] incrementReasoningUsage RPC failed:', error.message);
    }
  } catch (e) {
    console.warn('[usage] incrementReasoningUsage threw:', e);
  }
}

/**
 * Add rewarded watch-to-earn credits to the current-month counter, via the
 * atomic SECURITY DEFINER RPC (0075). The monthly cap + per-call max are enforced
 * SERVER-SIDE inside the RPC (not passed by the client), so the grant cannot be
 * raced or self-granted past the ceiling even by a tampered client (audit M4).
 * Fails gracefully (warn, no throw). Signature unchanged for callers.
 */
export async function addRewardCredits(userId: string, credits: number): Promise<void> {
  // D2: when AdMob SSV is the grant authority (EXPO_PUBLIC_REWARD_SSV=true), the
  // server grants reward credits from the verified SSV callback (rewarded-ssv +
  // grant_reward_credits_ssv). The client must NOT also grant here, or a single
  // watch double-counts. The UI refetches the counter after the watch, which
  // reflects the server grant once the callback lands. Off by default (direct
  // process.env read so babel inlines it) -> unchanged dev-seam behavior.
  if (process.env.EXPO_PUBLIC_REWARD_SSV === "true") return;
  const bucket = monthBucket();
  try {
    const { error } = await getSupabaseClient().rpc('bump_reward_credits_if_under_cap', {
      p_user_id: userId,
      p_month: bucket,
      p_credits: credits,
    });
    if (error) {
      console.warn('[usage] addRewardCredits RPC failed:', error.message);
    }
  } catch (e) {
    console.warn('[usage] addRewardCredits threw:', e);
  }
}
