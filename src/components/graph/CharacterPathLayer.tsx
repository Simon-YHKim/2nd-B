// CharacterPathLayer — the pixel residents of the graph village, working.
//
// Each worker walks a CLOSED route between villages (village → center →
// village → …), travelling the real spokes node-to-node, and the motion is
// driven by a GLOBAL monotonic clock + a stable per-worker phase — NOT
// component mount time. So when a village is tapped/focused (which can remount
// this layer), a worker's position and walk frame stay continuous instead of
// snapping back to the start.
//
// Tap a worker (2026-06-01 directive) and a small pixel speech bubble floats
// above it with a personality-fitting bit of self-talk (혼잣말, see
// monologues.ts). The bubble follows the worker as it keeps walking and clears
// itself after a few seconds. The layer is box-none so taps on empty space
// still reach the graph behind.
//
// The layer is mounted INSIDE NavGraph's zoom transform, rendered after the
// nodes, so workers ride above the islands yet below the screen-fixed bottom
// sheet / FAB. Positions arrive in the same screen-fitted coords NavGraph
// renders nodes in. Honours prefers-reduced-motion (workers hold still).

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { getPersona } from "@/lib/chat/personas";
import { fontFamilies } from "@/theme/typography";
import { cosmic } from "@/lib/theme/tokens";
import { walkerRoutePose } from "./walker-path";
import { pickMonologue } from "@/lib/graph/monologues";

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
  /** Locale for the self-talk bubble copy. */
  locale?: "en" | "ko";
  /** Rendered character height in graph pixels. */
  spriteSize?: number;
}

const DEFAULT_SPRITE = 22;
// Constant walking pace (px per ms) — each worker's period is DERIVED from its
// route length, so a worker on a long tour never sprints to hold a fixed period.
const SPEED = 0.032;
const ARC = 4;      // small px hop lifted at each leg's mid-point
const DWELL = 0.08; // brief look-around pause at each stop
const MIN_PERIOD = 7000; // floor so a short route still ambles
const BUBBLE_MS = 3600;  // how long a tapped worker's self-talk lingers
const BUBBLE_W = 156;    // fixed bubble width so it can center over the sprite
// Stable per-worker phase (ms) so the village never steps in lockstep. Keyed by
// worker id so the offset survives remounts (global-clock continuity).
const PHASE: Record<WorkerId, number> = {
  secondb: 0, archi: 1500, gadi: 3000, lulu: 4500, momo: 6000, vela: 7500, lumi: 2200,
};

export function CharacterPathLayer({ commutes, hidden, locale = "ko", spriteSize = DEFAULT_SPRITE }: Props) {
  // Which worker is currently muttering, and the line it's saying. One at a time.
  const [bubble, setBubble] = useState<{ id: WorkerId; line: string } | null>(null);

  // Self-talk clears itself after a beat so the village goes quiet again.
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [bubble]);

  if (hidden) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {commutes.map((c) => (
        <Worker
          key={c.id}
          commute={c}
          locale={locale}
          spriteSize={spriteSize}
          line={bubble?.id === c.id ? bubble.line : null}
          onTap={() => setBubble({ id: c.id, line: pickMonologue(c.id, locale, Math.random()) })}
        />
      ))}
    </View>
  );
}

// A worker walks its closed route at constant speed with a small hop per leg,
// pausing (dwell) at each stop. Pose is a pure function of global time, so it
// stays continuous regardless of mounts. Tapping it raises its self-talk bubble.
function Worker({
  commute,
  locale,
  spriteSize,
  line,
  onTap,
}: {
  commute: Commute;
  locale: "en" | "ko";
  spriteSize: number;
  line: string | null;
  onTap: () => void;
}) {
  const { id, route } = commute;
  const reduced = prefersReducedMotion();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    // Re-render on a shared cadence; the actual pose is recomputed from
    // Date.now() each frame so it never resets (and the bubble follows along).
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
    <View style={[styles.spriteSlot, { width: spriteSize, height: spriteSize, left: pose.x - spriteSize / 2, top: pose.y - spriteSize / 2 }]}>
      <Pressable
        onPress={onTap}
        hitSlop={18}
        accessibilityRole="button"
        accessibilityLabel={locale === "ko" ? `${getPersona(id).name.ko} 혼잣말 듣기` : `Hear ${getPersona(id).name.en} think aloud`}
      >
        <WorkerSprite id={id} size={spriteSize} facing={pose.facing} paused={pose.resting} />
      </Pressable>
      {line ? <SpeechBubble text={line} spriteSize={spriteSize} /> : null}
    </View>
  );
}

// Small pixel speech bubble that floats just above the worker (tail points
// down at it). Non-interactive so it never eats the next tap. Matches the
// village name-plate style (pixel font, mint border on dark).
function SpeechBubble({ text, spriteSize }: { text: string; spriteSize: number }) {
  return (
    <View style={[styles.bubbleWrap, { bottom: spriteSize + 4, left: spriteSize / 2 - BUBBLE_W / 2 }]} pointerEvents="none">
      <View style={styles.bubble}>
        <Text style={styles.bubbleText} numberOfLines={3}>{text}</Text>
      </View>
      <View style={styles.bubbleTail} />
    </View>
  );
}

const styles = StyleSheet.create({
  spriteSlot: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleWrap: {
    position: "absolute",
    width: BUBBLE_W,
    alignItems: "center",
  },
  bubble: {
    maxWidth: BUBBLE_W,
    backgroundColor: "rgba(7,10,24,0.96)",
    borderColor: "rgba(114,242,199,0.5)",
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleText: {
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.pixel,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(7,10,24,0.96)",
    marginTop: -1,
  },
});
