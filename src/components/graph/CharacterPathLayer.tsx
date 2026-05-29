// CharacterPathLayer — the six pixel residents of the graph village
// (handoff §5 / §10 "small pixel robot residents walking along edges").
//
// Phase 3 adds the *motion*: each resident gently drifts around its home
// anchor with a slow core blink, so the village reads as "alive" without
// performing. Real sprites still arrive later as <Image> — the slot
// layout / hit area / z-index are unchanged, so that swap is a one-liner
// per character. Motion honours prefers-reduced-motion (web): residents
// hold still with a steady core.
//
// Each resident renders as a 22×22 colored block centered on a fixed
// graph anchor (their "home" node on the village map).

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { cosmic } from "@/lib/theme/tokens";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { CHARACTER_ORDER, CHARACTERS, type CharacterId } from "@/lib/characters";

interface Props {
  /** Bounding box of the parent graph viewport — provides the coordinate frame. */
  width: number;
  height: number;
  /** Hide the layer entirely (e.g., when the user pinches in past tier 4). */
  hidden?: boolean;
}

// Home anchors per character, as fractions of the viewport. Picked to
// loosely align with the handoff §7-1 walker positions:
//   - SecondB drifts near the core (top-right of center)
//   - Momo sits on the 기록 동네 path (upper-left)
//   - Lulu wanders the 공상 동네 path (lower-left)
//   - Archi watches the 일 동네 path (upper-right)
//   - Vela hovers near the 공상 corner (lower-left edge)
//   - Gadi stays close to center but slightly lower (guard radius)
const ANCHORS: Record<CharacterId, { x: number; y: number }> = {
  secondb: { x: 0.58, y: 0.35 },
  momo: { x: 0.36, y: 0.30 },
  lulu: { x: 0.30, y: 0.62 },
  archi: { x: 0.66, y: 0.48 },
  vela: { x: 0.40, y: 0.76 },
  gadi: { x: 0.52, y: 0.58 },
};

export function CharacterPathLayer({ width, height, hidden }: Props) {
  if (hidden) return null;
  return (
    <View
      style={[styles.layer, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      {CHARACTER_ORDER.map((id, i) => {
        const c = CHARACTERS[id];
        const anchor = ANCHORS[id];
        return (
          <Walker
            key={id}
            label={c.name.en}
            accent={c.accent}
            left={anchor.x * width - 11}
            top={anchor.y * height - 11}
            seed={i}
          />
        );
      })}
    </View>
  );
}

// One resident: a gently drifting pixel block with a blinking mint core.
// Drift uses a seamless looping sinusoid whose endpoints both map to 0, so
// the rest position (and reduced-motion state) has no offset.
function Walker({
  label,
  accent,
  left,
  top,
  seed,
}: {
  label: string;
  accent: string;
  left: number;
  top: number;
  seed: number;
}) {
  const drift = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const driftLoop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 6000 + (seed % 5) * 900, // 6.0–9.6s, phase-spread per resident
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1600 + (seed % 4) * 700),
        Animated.timing(blink, { toValue: 0.35, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    driftLoop.start();
    blinkLoop.start();
    return () => {
      driftLoop.stop();
      blinkLoop.stop();
    };
  }, [drift, blink, seed]);

  const amp = 3 + (seed % 3); // 3–5 px sway
  const tx = drift.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, amp, 0, -amp, 0],
  });
  const ty = drift.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -amp * 0.6, 0, amp * 0.6, 0],
  });

  return (
    <Animated.View
      style={[
        styles.spriteSlot,
        { left, top, shadowColor: accent, transform: [{ translateX: tx }, { translateY: ty }] },
      ]}
      accessibilityLabel={label}
    >
      {/* Placeholder pixel body. Replace with <Image source={...} />
          when assets/characters/{id}-idle.png lands. */}
      <View style={[styles.body, { backgroundColor: accent }]} />
      {/* Mint signal core — a slow blink, like a heartbeat */}
      <Animated.View style={[styles.core, { opacity: blink }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0 },
  spriteSlot: {
    position: "absolute",
    width: 22, height: 22,
    alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  body: {
    position: "absolute",
    width: 16, height: 14,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: cosmic.space950,
  },
  core: {
    width: 3, height: 3,
    backgroundColor: cosmic.signalMint,
    marginTop: 6,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.9, shadowRadius: 3, shadowOffset: { width: 0, height: 0 },
  },
});
