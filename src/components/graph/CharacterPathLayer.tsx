// CharacterPathLayer — the pixel residents of the graph village, working.
//
// graph-ux-overhaul #2: each companion is tied to a village (domain node) and
// walks the road between the center (나의 중심) and its village — like a
// little worker commuting along the neural edge that connects them. SecondB
// roams the inner ring near the center. The layer lives INSIDE the graph's
// zoom/pan transform (mounted by NavGraph), so residents pan and scale with
// the village and naturally sit *below* the screen-fixed bottom sheet / FAB
// (fixes #1: characters no longer float above popups).
//
// Positions come in graph (screen-fitted world) coordinates from NavGraph,
// so a resident literally walks its parent→center edge. Honours
// prefers-reduced-motion: residents rest at their village end.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import type { CharacterId } from "@/lib/characters";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { CompanionSprite, type CompanionName } from "@/components/art/CompanionSprite";

/** One worker's commute: from `home` (their village) to `target` (usually the
 *  center), in the SAME coordinate space NavGraph renders nodes in. */
export interface Commute {
  id: CharacterId;
  home: { x: number; y: number };
  target: { x: number; y: number };
}

interface Props {
  commutes: readonly Commute[];
  /** Hide the layer (e.g. when zoomed past tier 4 / reduced clutter). */
  hidden?: boolean;
}

const SPRITE = 24;

export function CharacterPathLayer({ commutes, hidden }: Props) {
  if (hidden) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
      {commutes.map((c, i) => (
        <Worker key={c.id} commute={c} seed={i} />
      ))}
    </View>
  );
}

// A resident walks home→target→home along the connecting edge, with a gentle
// hop and (for SecondB) a 2-frame walk cycle. The walk is phase-spread per
// resident so the village feels busy but not synchronized.
function Worker({ commute, seed }: { commute: Commute; seed: number }) {
  const { id, home, target } = commute;
  const t = useRef(new Animated.Value(0)).current;
  const [frame, setFrame] = useState(0);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const duration = 9000 + (seed % 5) * 1400; // 9.0–14.6s round trip
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    );
    loop.start();
    const frameTimer = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 460);
    return () => {
      loop.stop();
      clearInterval(frameTimer);
    };
  }, [t, seed, reduced]);

  // Walk only part-way (0.15→0.85 of the edge) so the worker doesn't sit on
  // top of the node art at either end.
  const ax = home.x + (target.x - home.x) * 0.15;
  const ay = home.y + (target.y - home.y) * 0.15;
  const bx = home.x + (target.x - home.x) * 0.85;
  const by = home.y + (target.y - home.y) * 0.85;
  const dx = bx - ax;
  const dy = by - ay;
  const arc = 5 + (seed % 3);

  const tx = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, dx * 0.5, dx, dx * 0.5, 0] });
  const ty = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, dy * 0.5 - arc, dy, dy * 0.5 - arc, 0] });

  return (
    <Animated.View
      style={[
        styles.spriteSlot,
        { left: ax - SPRITE / 2, top: ay - SPRITE / 2, transform: [{ translateX: tx }, { translateY: ty }] },
      ]}
    >
      {id === "secondb" ? (
        <SecondBSprite state={reduced ? "idle" : frame === 0 ? "walk_1" : "walk_2"} size={SPRITE} />
      ) : (
        <CompanionSprite companion={id as CompanionName} state="idle" size={SPRITE} />
      )}
    </Animated.View>
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
