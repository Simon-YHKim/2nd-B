// D9 writer: persist the current per-star ladder tiers to star_tier_history
// (0045) so detectTierShift can later spot a changed tendency (memo §10). Append-
// only insert, one row per star. Best-effort - a write failure never blocks the
// caller (this runs alongside the persona/brightness read path).

import { getSupabaseClient } from "../supabase/client";
import type { LadderLevel } from "./brightness";
import type { StarId } from "./stars";

export async function recordStarTiers(
  userId: string,
  starLevels: Record<StarId, LadderLevel>,
): Promise<void> {
  const rows = (Object.entries(starLevels) as [StarId, LadderLevel][]).map(([star_id, level]) => ({
    user_id: userId,
    star_id,
    level,
  }));
  if (rows.length === 0) return;
  try {
    await getSupabaseClient().from("star_tier_history").insert(rows);
  } catch {
    // Best-effort history; never block the caller on a write failure.
  }
}
