/**
 * STEP 3 — <SecondbHead /> : the SecondB character head with a mood orb and a
 * calm breathing/float animation, translated from design/prototype.dc.html
 * (.sb-bob 4s float + .sb-pulse 2.6s mood glow).
 *
 * The handoff asset `secondb-head-front.png` was not shipped in the design zip,
 * so this reuses the existing deep-space character sprite
 * (assets/deep-space/character-front.png) at a small size. Swap the require if a
 * dedicated head asset lands.
 *
 * Animation uses RN's built-in Animated (native driver) — not Reanimated — and
 * stops the loops on unmount (ANDROID_QA §3 worklet/animation leak rule), and
 * freezes when the user prefers reduced motion.
 */
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";

import { deepSpace } from "@/lib/theme/tokens";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";

const CHARACTER = require("../../../assets/deep-space/character-front.png");

export type SecondbMood = "positive" | "neutral" | "negative";

// Mood → orb color (prototype: 긍정=민트 / 중간=보라 / 부정=핑크). The negative
// tone reuses the system guard tone via the token, not a mascot color.
const MOOD_COLOR: Record<SecondbMood, string> = {
  positive: deepSpace.mint,
  neutral: deepSpace.soul,
  negative: deepSpace.danger,
};

export function SecondbHead({
  size = 48,
  mood = "neutral",
  accessibilityLabel,
  style,
}: {
  size?: number;
  mood?: SecondbMood;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotionPref();
  const bob = useRef(new Animated.Value(0)).current; // vertical float
  const pulse = useRef(new Animated.Value(0)).current; // mood orb breathing

  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      pulse.setValue(1);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, useNativeDriver: true }),
      ]),
    );
    bobLoop.start();
    pulseLoop.start();
    return () => {
      bobLoop.stop();
      pulseLoop.stop();
    };
  }, [reduce, bob, pulse]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const orbOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const orbScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const moodColor = MOOD_COLOR[mood];
  const orb = Math.max(7, Math.round(size * 0.19));

  return (
    <Animated.View
      style={[{ width: size, height: size, transform: [{ translateY }] }, style]}
    >
      <Image
        source={CHARACTER}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="memory-disk"
        accessibilityLabel={accessibilityLabel}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          {
            width: orb,
            height: orb,
            borderRadius: orb / 2,
            left: size / 2 - orb / 2,
            backgroundColor: moodColor,
            shadowColor: moodColor,
            opacity: orbOpacity,
            transform: [{ scale: orbScale }],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    top: -2,
    // iOS glow + Android elevation must be paired (ANDROID_QA §1 shine-through).
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
