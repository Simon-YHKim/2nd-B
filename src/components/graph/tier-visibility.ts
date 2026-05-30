// Zoom-driven tier visibility for the mobile graph village (UI/UX overhaul
// §5). The graph "unfolds" as the user zooms in: far out shows only the
// center + districts; mid zoom adds the persona outposts (tier 3); close
// in reveals the individual record fragments (tier 4).
//
// Pure + framework-free so the thresholds are a single tested source of
// truth. NavGraph mirrors the live pinch scale into `scaleBucket()` and
// renders tiers per `tierVisibility()`.

export interface TierVisibility {
  tier1: boolean;
  tier2: boolean;
  tier3: boolean;
  tier4: boolean;
}

/** Coarse zoom bucket — 0 (far), 1 (mid), 2 (close). Cheap to compare so
 *  the gesture worklet only pushes a React state update on a real change.
 *
 *  Thresholds tuned so the DEFAULT view (gesture scale = 1) sits in bucket 0
 *  — first screen shows only the center + domain islands (tier 1 + 2). The
 *  user zooms in to unfold persona outposts (tier 3 at ≥1.15) and then the
 *  individual record shards (tier 4 at ≥1.8). (graph-restructure: B1.) */
export function scaleBucket(scale: number): 0 | 1 | 2 {
  if (scale < 1.15) return 0;
  if (scale < 1.8) return 1;
  return 2;
}

export function tierVisibility(scale: number): TierVisibility {
  const bucket = scaleBucket(scale);
  return {
    tier1: true,
    tier2: true,
    tier3: bucket >= 1,
    tier4: bucket >= 2,
  };
}
