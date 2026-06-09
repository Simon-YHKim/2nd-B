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
import { Pressable, StyleSheet, Text, View, AppState } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { getPersona } from "@/lib/chat/personas";
import { fontFamilies } from "@/theme/typography";
import { semantic } from "@/lib/theme/tokens";
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
const ARC = 2;      // slight px body bob; keep feet visually tied to the ground
const DWELL = 0.08; // brief look-around pause at each stop
const MIN_PERIOD = 7000; // floor so a short route still ambles
const BUBBLE_MS = 3600;  // how long a tapped worker's self-talk lingers
const BUBBLE_W = 156;    // fixed bubble width so it can center over the sprite
const ACTIVE_SPEECH_LAYER = 60;
const WORKER_LAYER = 2;
const FOOT_INSET_RATIO = 0.13;
const SHADOW_WIDTH_RATIO = 0.78;
const SHADOW_HEIGHT_RATIO = 0.18;
const CONTACT_WIDTH_RATIO = 0.42;
// Stable per-worker phase (ms) so the village never steps in lockstep. Keyed by
// worker id so the offset survives remounts (global-clock continuity).
const PHASE: Record<WorkerId, number> = {
  secondb: 0, archi: 1500, gadi: 3000, lulu: 4500, momo: 6000, lumi: 2200,
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
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
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
    // Only run the timer while the app is foregrounded — stop it outright on
    // background/inactive so it stops draining the battery, and restart it on
    // resume (pose is time-based, so it picks up continuous on the next tick).
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (t) return;
      t = setInterval(() => setTick((n) => (n + 1) % 1000), 1000 / 20);
    };
    const stop = () => {
      if (!t) return;
      clearInterval(t);
      t = null;
    };
    // Treat unknown/null (cold-start before the first AppState event) as
    // runnable so residents are not frozen on the first graph render.
    if (AppState.currentState !== "background" && AppState.currentState !== "inactive") start();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
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
  const ground = walkerRoutePose(t, route, { arc: 0, dwell: DWELL });
  const lift = Math.max(0, ground.y - pose.y);
  const footInset = Math.max(1, Math.round(spriteSize * FOOT_INSET_RATIO));
  const shadowWidth = Math.max(10, Math.round(spriteSize * SHADOW_WIDTH_RATIO));
  const shadowHeight = Math.max(3, Math.round(spriteSize * SHADOW_HEIGHT_RATIO));
  const contactWidth = Math.max(6, Math.round(spriteSize * CONTACT_WIDTH_RATIO));
  const contactHeight = 2;
  const slotWidth = Math.round(spriteSize * 1.28);
  const slotHeight = spriteSize + ARC + shadowHeight + footInset + 4;
  const groundY = slotHeight - 1;
  const spriteTop = Math.max(0, groundY - spriteSize - lift + footInset);
  const spriteLeft = (slotWidth - spriteSize) / 2;
  const shadowLeft = (slotWidth - shadowWidth) / 2;
  const contactLeft = (slotWidth - contactWidth) / 2;
  const bubbleBottom = slotHeight - spriteTop + 4;

  return (
    <View
      style={[
        styles.spriteSlot,
        {
          width: slotWidth,
          height: slotHeight,
          left: ground.x - slotWidth / 2,
          top: ground.y - slotHeight,
          zIndex: line ? ACTIVE_SPEECH_LAYER : WORKER_LAYER,
          elevation: line ? ACTIVE_SPEECH_LAYER : WORKER_LAYER,
        },
      ]}
    >
      <View
        style={[
          styles.groundShadow,
          {
            width: shadowWidth,
            height: shadowHeight,
            borderRadius: shadowHeight / 2,
            left: shadowLeft,
            top: groundY - shadowHeight,
            opacity: pose.resting ? 0.7 : Math.max(0.46, 0.62 - lift * 0.05),
          },
        ]}
      />
      <View
        style={[
          styles.footContact,
          {
            width: contactWidth,
            height: contactHeight,
            left: contactLeft,
            top: groundY - Math.max(1, Math.round(shadowHeight * 0.46)),
            opacity: pose.resting ? 0.72 : Math.max(0.42, 0.62 - lift * 0.06),
          },
        ]}
      />
      <Pressable
        onPress={onTap}
        hitSlop={18}
        style={[styles.spritePressable, { left: spriteLeft, top: spriteTop, width: spriteSize, height: spriteSize }]}
        accessibilityRole="button"
        accessibilityLabel={locale === "ko" ? `${getPersona(id).name.ko} 혼잣말 듣기` : `Hear ${getPersona(id).name.en} think aloud`}
        accessibilityHint={locale === "ko" ? "짧은 혼잣말 말풍선을 엽니다." : "Opens this resident's short self-talk bubble."}
        accessibilityState={{ expanded: line != null }}
      >
        <WorkerSprite id={id} size={spriteSize} facing={pose.facing} paused={pose.resting} />
      </Pressable>
      {line ? <SpeechBubble text={line} bottom={bubbleBottom} slotWidth={slotWidth} /> : null}
    </View>
  );
}

// Small pixel speech bubble that floats just above the worker (tail points
// down at it). Non-interactive so it never eats the next tap. Matches the
// village name-plate style (pixel font, mint border on dark).
function SpeechBubble({ text, bottom, slotWidth }: { text: string; bottom: number; slotWidth: number }) {
  return (
    <View
      style={[styles.bubbleWrap, { bottom, left: slotWidth / 2 - BUBBLE_W / 2 }]}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
    >
      <View style={styles.bubble}>
        <Text style={styles.bubbleText} numberOfLines={3}>{text}</Text>
      </View>
      <View style={styles.bubbleTail} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: ACTIVE_SPEECH_LAYER,
    elevation: ACTIVE_SPEECH_LAYER,
  },
  spriteSlot: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  spritePressable: {
    position: "absolute",
    zIndex: 2,
    elevation: 2,
  },
  groundShadow: {
    position: "absolute",
    backgroundColor: semantic.background,
    opacity: 0.76,
    borderWidth: 1,
    borderColor: semantic.border,
    shadowColor: semantic.background,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  footContact: {
    position: "absolute",
    borderRadius: 2,
    backgroundColor: semantic.brand,
    opacity: 0.34,
    zIndex: 1,
  },
  bubbleWrap: {
    position: "absolute",
    width: BUBBLE_W,
    alignItems: "center",
    zIndex: ACTIVE_SPEECH_LAYER,
    elevation: ACTIVE_SPEECH_LAYER,
  },
  bubble: {
    maxWidth: BUBBLE_W,
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
    shadowColor: semantic.brand,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleText: {
    color: semantic.text,
    fontFamily: fontFamilies.pixel,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
    textAlign: "center",
  },
  bubbleTail: {
    width: 0,
    height: 0,
    borderStartWidth: 5,
    borderEndWidth: 5,
    borderTopWidth: 6,
    borderStartColor: "transparent",
    borderEndColor: "transparent",
    borderTopColor: semantic.surface,
    marginTop: -1,
  },
});
