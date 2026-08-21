/**
 * Usage counters: Supabase-backed reasoning usage + spendable credits.
 * Backs the reasoning caps in ./reasoning-cap.ts.
 *
 * Phase 4 (0089): reasoning usage is counted on KST ISO-WEEK rows
 * ('IYYY-Wnn' in the month_bucket column) — free 주 2회 · plus 주 7회 —
 * while credits are monthly in presentation. The RPC derives both buckets
 * server-side; the strings computed here must match its to_char formats
 * (pinned by the 0089 structural test).
 *
 * ── WHERE THE CREDIT NUMBER COMES FROM (0135 / 0137) ──────────────────────
 *
 * usage_counters.reward_credits / reward_consumed are no longer a source of
 * truth. 0135 moved credits into the credit_ledger and left those two columns
 * as a trigger-maintained MIRROR, and that mirror re-derives reward_credits
 * from ad-earned units only. It is a deliberate UNDER-report: the moment a
 * purchased lot exists, the mirror cannot express it, so a client reading only
 * those columns would show "0 남음" for credits the user paid for — and, worse,
 * the depleted gate in reasoning.tsx would then refuse to spend them.
 *
 * So the spendable balance is read from the ledger via credit_summary_self()
 * (0137), and the mirror is kept only as the fallback when that call fails.
 * Preferring the ledger can never block someone who was previously allowed:
 * the mirror is LEAST(available, ad_earned) by construction, so the ledger
 * value is always >= the mirror value.
 *
 * credit_summary_self() takes NO user id — it resolves auth.uid() itself,
 * which is what makes it safe to expose (0137 closed the cross-user read that
 * the earlier user-id-taking readers allowed). Every caller here passes the
 * signed-in user's id, which is also what RLS scopes the table read to.
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
  /** Credits the user can actually spend right now, from the ledger: ad
   *  rewards + promo + anything purchased, minus spends and expiries. */
  rewardCredits: number;
  /** Credits EARNED FROM ADS this month (vs REWARD_MONTHLY_CAP) — drives the
   *  "이번 달 보상을 모두 받았어요" state of the limit sheet (spec F). Stays
   *  ad-scoped on purpose: a purchase must not make the ad cap look reached. */
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
    const client = getSupabaseClient();
    // Both in flight at once: the ledger read must not cost a round trip on a
    // path that runs on home, the limit sheet and the paywall.
    const [counters, summary] = await Promise.all([
      client
        .from(TABLE)
        .select('month_bucket, reasoning_used, reward_credits, reward_consumed')
        .eq('user_id', userId)
        .in('month_bucket', [week, month]),
      client.rpc('credit_summary_self'),
    ]);
    if (counters.error) {
      console.warn('[usage] getReasoningUsage read failed, failing open:', counters.error.message);
      return zero;
    }
    const data = counters.data;
    const weekRow = data?.find((r) => r.month_bucket === week);
    const monthRow = data?.find((r) => r.month_bucket === month);
    const earned = Number(monthRow?.reward_credits) || 0;
    const consumed = Number(monthRow?.reward_consumed) || 0;

    // The mirror, kept ONLY as the fallback. It cannot represent a purchased
    // lot, so it under-reports the moment one exists.
    let rewardCredits = Math.max(0, earned - consumed);
    let rewardEarned = Math.max(0, earned);

    if (summary.error) {
      console.warn('[usage] credit_summary_self failed, using the counter mirror:', summary.error.message);
    } else {
      const s = summary.data as { available?: number; ad_earned_this_month?: number } | null;
      rewardCredits = Math.max(0, Number(s?.available) || 0);
      rewardEarned = Math.max(0, Number(s?.ad_earned_this_month) || 0);
    }

    return {
      used: Number(weekRow?.reasoning_used) || 0,
      rewardCredits,
      rewardEarned,
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
