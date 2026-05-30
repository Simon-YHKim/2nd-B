// CharacterPathLayer — the pixel residents of the graph village, working.
//
// Each worker walks a CLOSED route between villages (village → center →
// village → …), travelling the real spokes node-to-node, and the motion is
// driven by a GLOBAL monotonic clock + a stable per-worker phase — NOT
// component mount time. So when a village is tapped/focused (which can remount
// this layer), a worker's position and walk frame stay continuous instead of
// snapping back to the start.
//
// The layer is mounted INSIDE NavGraph's zoom transform, rendered after the
// nodes, so workers ride above the islands yet below the screen-fixed bottom
// sheet / FAB. Positions arrive in the same screen-fitted coords NavGraph
// renders nodes in. Honours prefers-reduced-motion (workers hold still).

import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { walkerRoutePose } from "./walker-path";

/** One worker's patrol: a CLOSED route of waypoints (village → center →
 *  village → …) in the SAME coordinate space NavGraph renders nodes in. The
 *  worker walks the legs in order at constant speed and loops back to the first
 *  waypoint, so it reads as endlessly travelling between villages. */
export interface Commute {
  id: WorkerId;
  route: readonly { x: number; y: number }[];
}

interface Props {
  commutes: readonly Commute[];
  /** Hide the layer (e.g. while a bottom sheet is open). */
  hidden?: boolean;
}

const SPRITE = 24;
// Constant walking pace (px per ms) — each worker's period is DERIVED from its
// route length, so a worker on a long tour never sprints to hold a fixed period.
const SPEED = 0.045;
const ARC = 7;      // px hop lifted at each leg's mid-point
const DWELL = 0.18; // rest at each stop, as a fraction of the average leg
const MIN_PERIOD = 7000; // floor so a short route still ambles
// Stable per-worker phase (ms) so the village never steps in lockstep. Keyed by
// worker id so the offset survives remounts (global-clock continuity).
const PHASE: Record<WorkerId, number> = {
  secondb: 0, archi: 1500, gadi: 3000, lulu: 4500, momo: 6000, vela: 7500, lumi: 2200,
};

export function CharacterPathLayer({ commutes, hidden }: Props) {
  if (hidden) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
      {commutes.map((c) => (
        <Worker key={c.id} commute={c} />
      ))}
    </View>
  );
}

// A worker walks its closed route at constant speed with a small hop per leg,
// pausing (dwell) at each stop. Pose is a pure function of global time, so it
// stays continuous regardless of mounts.
function Worker({ commute }: { commute: Commute }) {
  const { id, route } = commute;
  const reduced = prefersReducedMotion();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    // Re-render on a shared cadence; the actual pose is recomputed from
    // Date.now() each frame so it never resets.
    const t = setInterval(() => setTick((n) => (n + 1) % 1000), 1000 / 20);
    return () => clearInterval(t);
  }, [reduced]);

  // Closed-ring perimeter (incl. the wrap leg back to the first waypoint).
  const routeLen = useMemo(() => {
    let total = 0;
    for (let i = 0; i < route.length; i++) {
      const a = route[i];
      const b = route[(i + 1) % route.length];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }, [route]);

  // Period derived from length so the walking pace is constant across workers;
  // the dwell stretches the cycle by (1 + DWELL). Phase keeps them out of step.
  const phase = PHASE[id];
  const period = Math.max(MIN_PERIOD, (routeLen * (1 + DWELL)) / SPEED);
  const now = reduced ? 0 : Date.now();
  const t = ((now + phase) % period) / period; // 0..1 around the loop
  const pose = walkerRoutePose(t, route, { arc: ARC, dwell: DWELL });

  return (
    <View style={[styles.spriteSlot, { left: pose.x - SPRITE / 2, top: pose.y - SPRITE / 2 }]}>
      <WorkerSprite id={id} size={SPRITE} facing={pose.facing} paused={pose.resting} />
    </View>
  );
}

const styles = StyleSheet.create({
  spriteSlot: {
    position: "absolute",
    width: SPRITE,
    height: SPRITE,
    alignItems: "center",
    justifyContent: "center",
  },
});
