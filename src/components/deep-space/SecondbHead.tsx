/**
 * Deep-space SecondB head from the design canon. Uses the front-facing head
 * asset from design/assets/secondb-head-front.png, with only the mood orb and a
 * calm reduced-motion-aware float layered in RN.
 */
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";

import { deepSpace } from "@/lib/theme/tokens";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";

const HEAD = require("../../../assets/deepspace/secondb-head-front.png");

export type SecondbMood = "positive" | "neutral" | "negative";

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
  const bob = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      pulse.setValue(1);
      return;
    }

    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2250, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2250, useNativeDriver: true }),
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

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const orbOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const orbScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const moodColor = MOOD_COLOR[mood];
  const orb = Math.max(8, Math.round(size * 0.19));

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ translateY }] }, style]}>
      <Image
        source={HEAD}
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
            top: -Math.max(2, Math.round(size * 0.03)),
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
  wrap: {
    position: "relative",
    flexShrink: 0,
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  orb: {
    position: "absolute",
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
});
