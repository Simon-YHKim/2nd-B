// D9 writer: persist the current per-star ladder tiers to star_tier_history
// (0045) so detectTierShift can later spot a changed tendency (memo §10). Append-
// only insert, one row per star. Best-effort - a write failure never blocks the
// caller (this runs alongside the persona/brightness read path).
//
// Funnel (persona-sim memo §7): this is the single chokepoint where a star's
// ladder level changes (build.ts persists all seven; review.tsx persists one
// ratified star). After the insert it delta-fires the PII-free activation
// events - star_lit when a star genuinely climbs a level, and
// activation_milestone when the full seven-star set is (re)persisted and the
// lit-count grows. Scalars only: ids, levels, counts. Never any body/chat text.

import { getSupabaseClient } from "../supabase/client";
import { captureEvent, starLit, activationMilestone, type StarLitEventProps } from "../analytics";
import type { LadderLevel } from "./brightness";
import { soulCoreBrightness, type StarId } from "./stars";

// A star counts as "lit" once it crosses the medium-evidence threshold (>= L2),
// matching the all-lit bonus gate in soulCoreBrightness.
const LIT_THRESHOLD = 2;

export async function recordStarTiers(
  userId: string,
  starLevels: Partial<Record<StarId, LadderLevel>>,
  source: StarLitEventProps["source"] = "journal",
): Promise<void> {
  const entries = Object.entries(starLevels) as [StarId, LadderLevel][];
  const rows = entries.map(([star_id, level]) => ({
    user_id: userId,
    star_id,
    level,
  }));
  if (rows.length === 0) return;
  try {
    // Best-effort read of the prior latest level per star (ids + levels only,
    // bounded). Used purely to detect genuine increases for the funnel events;
    // a read failure just means we skip the delta (events stay silent).
    const prior = new Map<string, number>();
    try {
      const { data } = await getSupabaseClient()
        .from("star_tier_history")
        .select("star_id, level, recorded_at")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(100);
      for (const r of (data ?? []) as { star_id: string; level: number }[]) {
        // Rows arrive newest-first, so the first seen per star is its latest.
        if (!prior.has(r.star_id)) prior.set(r.star_id, r.level);
      }
    } catch {
      // No prior history available; treat every star as having the default L1.
    }

    // The existing append-only persist - behavior unchanged.
    await getSupabaseClient().from("star_tier_history").insert(rows);

    // star_lit: one event per star whose level genuinely increased. A star with
    // no prior row is compared against the implicit default (L1), so a fresh
    // star only fires once it is actually lit beyond the default.
    for (const [star_id, level] of entries) {
      const before = prior.get(star_id) ?? 1;
      if (level > before) {
        captureEvent(starLit({ star_id, ladder_level: level, source }));
      }
    }

    // activation_milestone: only when the full seven-star set is (re)persisted
    // (so review.tsx's single-star path never fires it) AND the lit-count grew.
    if (entries.length >= 7) {
      const priorLit = sevenStarLitCount((id) => prior.get(id) ?? 1);
      const nextLit = entries.filter(([, level]) => level >= LIT_THRESHOLD).length;
      if (nextLit > priorLit) {
        captureEvent(
          activationMilestone({
            stars_lit_count: nextLit,
            soul_core_brightness: soulCoreBrightness(starLevels),
          }),
        );
      }
    }
  } catch {
    // Best-effort history + funnel; never block the caller on a failure.
  }
}

// Lit-count across the seven stars from a prior-level lookup (default L1).
function sevenStarLitCount(levelOf: (starId: StarId) => number): number {
  const STARS: StarId[] = ["now", "recall", "seen", "rhythm", "relational", "possible", "values"];
  return STARS.filter((id) => levelOf(id) >= LIT_THRESHOLD).length;
}
