// CharacterPathLayer — the pixel residents of the graph village, working.
//
// closeout-v3 #5/#6: each worker walks the road between its village and the
// center continuously, and the motion is driven by a GLOBAL monotonic clock +
// a stable per-worker phase — NOT component mount time. So when a village is
// tapped/focused (which can remount this layer), a worker's position and walk
// frame stay continuous instead of snapping back to the start.
//
// The layer is mounted INSIDE NavGraph's zoom transform, rendered after the
// nodes, so workers ride above the islands yet below the screen-fixed bottom
// sheet / FAB. Positions arrive in the same screen-fitted coords NavGraph
// renders nodes in. Honours prefers-reduced-motion (workers hold still).

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";

/** One worker's commute: from `home` (their village) to `target` (the center),
 *  in the SAME coordinate space NavGraph renders nodes in. */
export interface Commute {
  id: WorkerId;
  home: { x: number; y: number };
  target: { x: number; y: number };
}

interface Props {
  commutes: readonly Commute[];
  /** Hide the layer (e.g. while a bottom sheet is open). */
  hidden?: boolean;
}

const SPRITE = 24;
// Per-worker round-trip period (ms). Co-prime-ish so the village never looks
// synchronized. Keyed by worker id for a STABLE phase across remounts.
const PERIOD: Record<WorkerId, number> = {
  secondb: 10000, archi: 11000, gadi: 12000, lulu: 9000, momo: 13000, vela: 10500, lumi: 11500,
};
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

// A worker shuttles along its edge (15%→85%) with a small hop. Position is a
// pure function of global time, so it's continuous regardless of mounts.
function Worker({ commute }: { commute: Commute }) {
  const { id, home, target } = commute;
  const reduced = prefersReducedMotion();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    // Re-render on a shared cadence; the actual position is recomputed from
    // Date.now() each frame so it never resets.
    const t = setInterval(() => setTick((n) => (n + 1) % 1000), 1000 / 20);
    return () => clearInterval(t);
  }, [reduced]);

  // Triangle-wave 0→1→0 over the worker's period, offset by its stable phase.
  const period = PERIOD[id];
  const phase = PHASE[id];
  const now = reduced ? 0 : Date.now();
  const cyc = (((now + phase) % period) / period); // 0..1
  const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;     // 0..1..0

  const ax = home.x + (target.x - home.x) * 0.15;
  const ay = home.y + (target.y - home.y) * 0.15;
  const bx = home.x + (target.x - home.x) * 0.85;
  const by = home.y + (target.y - home.y) * 0.85;
  const arc = 6;
  const x = ax + (bx - ax) * tri;
  const y = ay + (by - ay) * tri - Math.sin(tri * Math.PI) * arc;

  return (
    <View style={[styles.spriteSlot, { left: x - SPRITE / 2, top: y - SPRITE / 2 }]}>
      <WorkerSprite id={id} size={SPRITE} />
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
