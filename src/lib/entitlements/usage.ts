/**
 * Usage counters: Supabase-backed reasoning usage + rewarded credits, keyed by
 * (user_id, month_bucket). Backs the reasoning caps in ./reasoning-cap.ts.
 *
 * Reads FAIL OPEN: on any error (including the table being absent) the read
 * returns a zeroed counter so a user is never wrongly blocked. Writes fail
 * gracefully (warn, no throw) so a transient counter failure never breaks the
 * surrounding flow.
 *
 * month_bucket is a KST 'YYYY-MM' string so the monthly reset boundary follows
 * KST month rollover, matching the SQL table column of the same name.
 */

import { getSupabaseClient } from '../supabase/client';

const TABLE = 'usage_counters';

export interface ReasoningUsage {
  used: number;
  rewardCredits: number;
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
 * Read the current-month counter for a user. FAIL OPEN: on any error returns
 * { used: 0, rewardCredits: 0, monthBucket } so the user is never blocked by a
 * read failure or an absent table.
 */
export async function getReasoningUsage(userId: string): Promise<ReasoningUsage> {
  const bucket = monthBucket();
  const zero: ReasoningUsage = { used: 0, rewardCredits: 0, monthBucket: bucket };
  try {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select('reasoning_used, reward_credits')
      .eq('user_id', userId)
      .eq('month_bucket', bucket)
      .maybeSingle();
    if (error) {
      console.warn('[usage] getReasoningUsage read failed, failing open:', error.message);
      return zero;
    }
    if (!data) return zero;
    return {
      used: Number(data.reasoning_used) || 0,
      rewardCredits: Number(data.reward_credits) || 0,
      monthBucket: bucket,
    };
  } catch (e) {
    console.warn('[usage] getReasoningUsage threw, failing open:', e);
    return zero;
  }
}

/**
 * Increment the current-month reasoning_used by 1 via the atomic SECURITY DEFINER
 * RPC (0077). The cap is derived server-side from the user's tier and the bump is
 * atomic + cap-gated, so the honest client path can no longer spoof its own cap or
 * fail open on a read error (audit M1). A returned error (P0001 =
 * reasoning_limit_exceeded) means the atomic gate rejected an over-cap run; the
 * client already checks remaining before calling, so that is a race/backstop.
 * Fails gracefully (warn, no throw).
 */
export async function incrementReasoningUsage(userId: string): Promise<void> {
  const bucket = monthBucket();
  try {
    const { error } = await getSupabaseClient().rpc('bump_reasoning_usage_if_under_cap', {
      p_user_id: userId,
      p_month: bucket,
      p_cap: 0, // ignored server-side; the RPC derives the cap from the user's tier
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
