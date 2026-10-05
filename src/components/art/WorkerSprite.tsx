import { Image } from "expo-image";
// Worker sprite (production-premium-v1, redrawn readability pass). SecondB's
// 6-frame walk strip (768x128 = 6 x 128) plus its idle pose. The
// walk cycle is driven by a GLOBAL
// monotonic clock + stable worker id, NOT component mount time, so a worker's
// animation phase is continuous across remounts and never resets when a
// village is tapped/focused. Under prefers-reduced-motion it swaps the strip
// for the dedicated idle pose (a standing frame, not a frozen mid-stride).
//
// 옛 캐릭터 다섯(아치·가디·루루·모모·루미)의 띠 · 서 있는 자세와 v3 정지 자세 분기
// (EXPO_PUBLIC_USE_V3_ART)는 2026-10-05 에 뺐다(Simon 결정 Q-261004-15 A). 그 그림
// 열 장은 E:/Legacy/2ndB 에 있다(MANIFEST batch qa261004-chars). 세컨비만 남는다.

import { useEffect, useState } from "react";
import { StyleSheet, View, type ViewStyle, type ImageStyle, type StyleProp, AppState } from "react-native";

import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { semantic } from "@/lib/theme/tokens";

// imageRendering pixelated keeps the strip crisp; web-only, ignored native.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export type WorkerId = "secondb";

const STRIPS: Record<WorkerId, number> = {
  secondb: require("../../../assets/legacy-art/2ndb-production-premium-v1/workers-redraw-v1/secondb_premium_walk_strip_6f.png"),
};

// Single-frame standing poses (128x128), shown instead of the walk strip when
// motion is reduced so a held worker reads as "idle" rather than mid-step.
const IDLES: Record<WorkerId, number> = {
  secondb: require("../../../assets/legacy-art/2ndb-production-premium-v1/workers-redraw-v1/secondb_premium_idle.png"),
};

const FRAMES = 6;
const FRAME_MS = 150; // ~6.6fps walk cadence

// A single shared ticker so every worker reads the same global clock — one
// interval for the whole graph, not one per sprite.
let listeners = new Set<(t: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function ensureTicker() {
  if (timer) return;
  // Don't spin up the interval while backgrounded; the AppState listener
  // below restarts it on the next "active" transition. Treat unknown/null
  // (cold-start before the first AppState event) as runnable so workers are
  // not frozen on the first landing render.
  if (AppState.currentState === "background" || AppState.currentState === "inactive") return;
  timer = setInterval(() => {
    if (AppState.currentState === "background" || AppState.currentState === "inactive") return; // belt-and-suspenders
    const now = Date.now();
    listeners.forEach((l) => l(now));
  }, FRAME_MS);
}
function stopTicker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
// Module-level AppState listener (set up once, since the ticker is global and
// shared by every sprite): kill the setInterval timer entirely while
// backgrounded/inactive so it stops draining CPU/battery, and rebuild it when
// the app returns to foreground — but only if any sprite is still subscribed.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    if (listeners.size > 0) ensureTicker();
  } else {
    stopTicker();
  }
});
function subscribe(fn: (t: number) => void): () => void {
  listeners.add(fn);
  ensureTicker();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      stopTicker();
    }
  };
}

// Per-worker phase offset so they don't all step in lockstep.
const PHASE_OFFSET: Record<WorkerId, number> = {
  secondb: 0,
};

function ContactShadow({ size }: { size: number }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.contactShadow,
        {
          left: size * 0.22,
          right: size * 0.22,
          bottom: Math.max(1, size * 0.04),
          height: Math.max(3, size * 0.12),
          borderRadius: size,
        },
      ]}
    />
  );
}

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
  const reduced = useReducedMotionPref();
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
        <ContactShadow size={size} />
        <Image source={IDLES[id]} style={[PIXELATED, { width: size, height: size }]} contentFit="contain" />
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, overflow: "hidden", transform: flip }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ContactShadow size={size} />
      <Image
        source={STRIPS[id]}
        style={[
          PIXELATED,
          { width: size * FRAMES, height: size, transform: [{ translateX: -size * frame }] },
        ]}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contactShadow: {
    position: "absolute",
    backgroundColor: semantic.background,
    opacity: 0.42,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.border,
    shadowColor: semantic.background,
    shadowOpacity: 0.42,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
  },
});
