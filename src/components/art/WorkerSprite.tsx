// Worker sprite (closeout-v3 #5/#6). Six pixel companions plus Lumi, each a
// 6-frame walk strip (576x96 = 6 x 96). The walk cycle is driven by a GLOBAL
// monotonic clock + stable worker id, NOT component mount time, so a worker's
// animation phase is continuous across remounts and never resets when a
// village is tapped/focused. Honours prefers-reduced-motion (holds frame 0).

import { useEffect, useState } from "react";
import { Image, View, type ViewStyle, type ImageStyle, type StyleProp } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";

// imageRendering pixelated keeps the strip crisp; web-only, ignored native.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export type WorkerId = "secondb" | "momo" | "lulu" | "archi" | "vela" | "gadi" | "lumi";

const STRIPS: Record<WorkerId, number> = {
  secondb: require("../../../public/assets/2ndb-closeout-v3/workers/secondb_walk_strip_6f.png"),
  momo: require("../../../public/assets/2ndb-closeout-v3/workers/momo_walk_strip_6f.png"),
  lulu: require("../../../public/assets/2ndb-closeout-v3/workers/lulu_walk_strip_6f.png"),
  archi: require("../../../public/assets/2ndb-closeout-v3/workers/archi_walk_strip_6f.png"),
  vela: require("../../../public/assets/2ndb-closeout-v3/workers/vela_walk_strip_6f.png"),
  gadi: require("../../../public/assets/2ndb-closeout-v3/workers/gadi_walk_strip_6f.png"),
  lumi: require("../../../public/assets/2ndb-closeout-v3/workers/lumi_walk_strip_6f.png"),
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

/** Renders one worker's current walk frame, advanced by the global clock. */
export function WorkerSprite({ id, size = 26, style }: { id: WorkerId; size?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = prefersReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduced) return;
    return subscribe((now) => {
      // Global-time driven frame index + stable per-worker phase offset.
      const f = (Math.floor(now / FRAME_MS) + PHASE_OFFSET[id]) % FRAMES;
      setFrame(f);
    });
  }, [id, reduced]);

  const f = reduced ? 0 : frame;
  return (
    <View style={[{ width: size, height: size, overflow: "hidden" }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={STRIPS[id]}
        style={[
          PIXELATED,
          { width: size * FRAMES, height: size, transform: [{ translateX: -size * f }] },
        ]}
        resizeMode="cover"
      />
    </View>
  );
}

