// Worker sprite (production-premium-v1). Six pixel companions plus Lumi, each a
// 6-frame walk strip (768x128 = 6 x 128). The walk cycle is driven by a GLOBAL
// monotonic clock + stable worker id, NOT component mount time, so a worker's
// animation phase is continuous across remounts and never resets when a
// village is tapped/focused. Under prefers-reduced-motion it swaps the strip
// for the dedicated idle pose (a standing frame, not a frozen mid-stride).

import { useEffect, useState } from "react";
import { Image, View, type ViewStyle, type ImageStyle, type StyleProp } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";

// imageRendering pixelated keeps the strip crisp; web-only, ignored native.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export type WorkerId = "secondb" | "momo" | "lulu" | "archi" | "vela" | "gadi" | "lumi";

const STRIPS: Record<WorkerId, number> = {
  secondb: require("../../../public/assets/2ndb-production-premium-v1/workers/secondb_premium_walk_strip_6f.png"),
  momo: require("../../../public/assets/2ndb-production-premium-v1/workers/momo_premium_walk_strip_6f.png"),
  lulu: require("../../../public/assets/2ndb-production-premium-v1/workers/lulu_premium_walk_strip_6f.png"),
  archi: require("../../../public/assets/2ndb-production-premium-v1/workers/archi_premium_walk_strip_6f.png"),
  vela: require("../../../public/assets/2ndb-production-premium-v1/workers/vela_premium_walk_strip_6f.png"),
  gadi: require("../../../public/assets/2ndb-production-premium-v1/workers/gadi_premium_walk_strip_6f.png"),
  lumi: require("../../../public/assets/2ndb-production-premium-v1/workers/lumi_premium_walk_strip_6f.png"),
};

// Single-frame standing poses (128x128), shown instead of the walk strip when
// motion is reduced so a held worker reads as "idle" rather than mid-step.
const IDLES: Record<WorkerId, number> = {
  secondb: require("../../../public/assets/2ndb-production-premium-v1/workers/secondb_premium_idle.png"),
  momo: require("../../../public/assets/2ndb-production-premium-v1/workers/momo_premium_idle.png"),
  lulu: require("../../../public/assets/2ndb-production-premium-v1/workers/lulu_premium_idle.png"),
  archi: require("../../../public/assets/2ndb-production-premium-v1/workers/archi_premium_idle.png"),
  vela: require("../../../public/assets/2ndb-production-premium-v1/workers/vela_premium_idle.png"),
  gadi: require("../../../public/assets/2ndb-production-premium-v1/workers/gadi_premium_idle.png"),
  lumi: require("../../../public/assets/2ndb-production-premium-v1/workers/lumi_premium_idle.png"),
};

const FRAMES = 6;
const FRAME_MS = 150; // ~6.6fps walk cadence

// A single shared ticker so every worker reads the same global clock — one
// interval for the whole graph, not one per sprite.
let listeners = new Set<(t: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function ensureTicker() {
  if (timer) return;
  timer = setInterval(() => {
    const now = Date.now();
    listeners.forEach((l) => l(now));
  }, FRAME_MS);
}
function subscribe(fn: (t: number) => void): () => void {
  listeners.add(fn);
  ensureTicker();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Per-worker phase offset so they don't all step in lockstep.
const PHASE_OFFSET: Record<WorkerId, number> = {
  secondb: 0, momo: 1, lulu: 2, archi: 3, vela: 4, gadi: 5, lumi: 2,
};

/** Renders one worker's current walk frame, advanced by the global clock.
 *  `facing` mirrors the sprite so it looks toward its direction of travel
 *  (+1 = artwork's native facing, -1 = flipped). `paused` swaps in the idle
 *  pose while the worker is parked at a village ("working"), so a resting
 *  resident reads as standing rather than moonwalking in place. */
export function WorkerSprite({
  id,
  size = 26,
  style,
  facing = 1,
  paused = false,
}: {
  id: WorkerId;
  size?: number;
  style?: StyleProp<ViewStyle>;
  facing?: 1 | -1;
  paused?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const [frame, setFrame] = useState(0);

  // Walk frames only advance when actually walking — frozen under reduced
  // motion or while parked at a stop.
  const animate = !reduced && !paused;
  useEffect(() => {
    if (!animate) return;
    return subscribe((now) => {
      // Global-time driven frame index + stable per-worker phase offset.
      const f = (Math.floor(now / FRAME_MS) + PHASE_OFFSET[id]) % FRAMES;
      setFrame(f);
    });
  }, [id, animate]);

  // scaleX flip mirrors the whole clipped frame (including the strip's
  // translateX), so flipping the outer box is correct.
  const flip: ViewStyle["transform"] = facing === -1 ? [{ scaleX: -1 }] : [];

  // Reduced motion OR parked: render the dedicated idle pose instead of
  // freezing on a mid-stride walk frame.
  if (reduced || paused) {
    return (
      <View style={[{ width: size, height: size, transform: flip }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={IDLES[id]} style={[PIXELATED, { width: size, height: size }]} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, overflow: "hidden", transform: flip }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={STRIPS[id]}
        style={[
          PIXELATED,
          { width: size * FRAMES, height: size, transform: [{ translateX: -size * frame }] },
        ]}
        resizeMode="cover"
      />
    </View>
  );
}

