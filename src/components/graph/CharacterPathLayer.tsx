// CharacterPathLayer — the six pixel residents of the graph village
// (handoff §5 / §10 "small pixel robot residents walking along edges").
//
// Phase E upgrades the residents from "drift around one anchor" to a gentle
// *patrol*: each walks back and forth along a short path between two anchors
// with a slight hop arc, and the placeholder colored block is replaced with
// the real v2 sprites (SecondB has a 2-frame walk cycle; the companions
// hover in their idle pose). Motion math lives in ./walker-path (pure +
// tested). Honours prefers-reduced-motion: residents hold at their home
// anchor with a static frame.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { CHARACTER_ORDER, type CharacterId } from "@/lib/characters";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { CompanionSprite, type CompanionName } from "@/components/art/CompanionSprite";

interface Props {
  /** Bounding box of the parent graph viewport — provides the coordinate frame. */
  width: number;
  height: number;
  /** Hide the layer entirely (e.g., when the user pinches in past tier 4). */
  hidden?: boolean;
}

// Patrol paths per resident, as fractions of the viewport: a home anchor and
// a nearby waypoint the resident walks out to and back from. Kept short so
// each stays inside its district (handoff §7-1 walker positions).
const PATROLS: Record<CharacterId, { from: { x: number; y: number }; to: { x: number; y: number } }> = {
  secondb: { from: { x: 0.56, y: 0.35 }, to: { x: 0.64, y: 0.40 } },
  momo: { from: { x: 0.34, y: 0.30 }, to: { x: 0.42, y: 0.34 } },
  lulu: { from: { x: 0.28, y: 0.62 }, to: { x: 0.36, y: 0.58 } },
  archi: { from: { x: 0.64, y: 0.48 }, to: { x: 0.70, y: 0.52 } },
  vela: { from: { x: 0.38, y: 0.76 }, to: { x: 0.46, y: 0.72 } },
  gadi: { from: { x: 0.50, y: 0.58 }, to: { x: 0.55, y: 0.62 } },
};

const SPRITE = 26;

export function CharacterPathLayer({ width, height, hidden }: Props) {
  if (hidden) return null;
  return (
    <View
      style={[styles.layer, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      {CHARACTER_ORDER.map((id, i) => {
        const patrol = PATROLS[id];
        return (
          <Walker
            key={id}
            id={id}
            from={{ x: patrol.from.x * width, y: patrol.from.y * height }}
            to={{ x: patrol.to.x * width, y: patrol.to.y * height }}
            seed={i}
          />
        );
      })}
    </View>
  );
}

// One resident: patrols along its path with a slight hop. SecondB cycles its
// two walk frames while moving; the companions hover in their idle pose.
function Walker({
  id,
  from,
  to,
  seed,
}: {
  id: CharacterId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  seed: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  const [frame, setFrame] = useState(0);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const duration = 7000 + (seed % 5) * 1100; // 7.0–11.4s round trip, phase-spread
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.sin), // ease near the turn-arounds
        useNativeDriver: true,
      }),
    );
    loop.start();
    // SecondB has real walk frames; toggle them at a calm ~2.3fps cadence.
    const frameTimer =
      id === "secondb"
        ? setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 430)
        : null;
    return () => {
      loop.stop();
      if (frameTimer) clearInterval(frameTimer);
    };
  }, [t, seed, id, reduced]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const arc = 4 + (seed % 3); // 4–6px hop at mid-trip

  // Ping-pong interpolation (mirrors walker-path.walkerPosition at these
  // sample points): out to `to` at t=0.5, back to `from` at t=1.
  const tx = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, dx * 0.5, dx, dx * 0.5, 0],
  });
  const ty = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, dy * 0.5 - arc, dy, dy * 0.5 - arc, 0],
  });

  return (
    <Animated.View
      style={[
        styles.spriteSlot,
        { left: from.x - SPRITE / 2, top: from.y - SPRITE / 2, transform: [{ translateX: tx }, { translateY: ty }] },
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
  layer: { position: "absolute", left: 0, top: 0 },
  spriteSlot: {
    position: "absolute",
    width: SPRITE,
    height: SPRITE,
    alignItems: "center",
    justifyContent: "center",
  },
});
