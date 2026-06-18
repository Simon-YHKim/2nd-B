import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, StyleSheet } from "react-native";

import { colors } from "@/theme/tokens";

export type SecondbMood = "positive" | "neutral" | "negative";

interface SecondbHeadProps {
  mood?: SecondbMood;
  size?: number;
}

const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-front.png");

const MOOD_COLOR: Record<SecondbMood, string> = {
  positive: colors.mint,
  neutral: colors.soul,
  negative: colors.clay,
};

export function SecondbHead({ mood = "neutral", size = 48 }: SecondbHeadProps) {
  const bob = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const moodColor = MOOD_COLOR[mood];

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    bobLoop.start();
    pulseLoop.start();

    return () => {
      bobLoop.stop();
      pulseLoop.stop();
    };
  }, [bob, pulse]);

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
        },
      ],
    }),
    [bob],
  );

  const orbStyle = useMemo(
    () => ({
      backgroundColor: moodColor,
      shadowColor: moodColor,
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
    }),
    [moodColor, pulse],
  );

  const orbSize = Math.max(8, Math.round(size * 0.1875));

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <Image source={HEAD_IMAGE} style={[styles.image, { width: size, height: size }]} resizeMode="contain" />
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            borderRadius: orbSize / 2,
            top: -1,
            marginLeft: -orbSize / 2,
          },
          orbStyle,
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  image: {
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  orb: {
    position: "absolute",
    left: "50%",
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
