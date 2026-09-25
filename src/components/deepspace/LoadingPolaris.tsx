import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg from "react-native-svg";

import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { m3 } from "@/lib/theme/m3";

const POLARIS_VIEWBOX = 112;
const POLARIS_FILL_MS = 960;
const POLARIS_TWINKLE_MS = 480;

function PolarisLayer({ radius, fill, size }: { radius: number; fill: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${POLARIS_VIEWBOX} ${POLARIS_VIEWBOX}`}>
      <PixelStarSvg cx={56} cy={56} r={radius} fill={fill} />
    </Svg>
  );
}

/** Shared loading mark for auth, route transitions, data waits, and processing. */
export function LoadingPolaris({
  size = 72,
  accessibilityLabel,
}: {
  size?: number;
  accessibilityLabel?: string;
}) {
  const reducedMotion = useReducedMotionPref();
  const fillProgress = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fillProgress.setValue(reducedMotion ? 1 : 0);
    twinkle.setValue(0);
    if (reducedMotion) return;

    const fillAnimation = Animated.timing(fillProgress, {
      toValue: 1,
      duration: POLARIS_FILL_MS,
      easing: pixelStepsFor(POLARIS_FILL_MS),
      useNativeDriver: true,
    });
    const twinkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, {
          toValue: 1,
          duration: POLARIS_TWINKLE_MS,
          easing: pixelStepsFor(POLARIS_TWINKLE_MS),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0,
          duration: POLARIS_TWINKLE_MS,
          easing: pixelStepsFor(POLARIS_TWINKLE_MS),
          useNativeDriver: true,
        }),
      ]),
    );

    fillAnimation.start(({ finished }) => {
      if (finished) twinkleLoop.start();
    });
    return () => {
      fillAnimation.stop();
      twinkleLoop.stop();
    };
  }, [fillProgress, reducedMotion, twinkle]);

  const centerScale = fillProgress.interpolate({
    inputRange: [0, 0.3],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const coreScale = fillProgress.interpolate({
    inputRange: [0.2, 0.7],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const edgeScale = fillProgress.interpolate({
    inputRange: [0.5, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const twinkleScale = twinkle.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.graphic, { width: size, height: size }]}
    >
      <View style={styles.layer}>
        <PolarisLayer radius={44} fill={m3.color.outlineVariant} size={size} />
      </View>
      <Animated.View style={[styles.layer, { transform: [{ scale: twinkleScale }] }]}>
        <Animated.View style={[styles.layer, { transform: [{ scale: edgeScale }] }]}>
          <PolarisLayer radius={44} fill={m3.accent.polarisEdge} size={size} />
        </Animated.View>
        <Animated.View style={[styles.layer, { transform: [{ scale: coreScale }] }]}>
          <PolarisLayer radius={28} fill={m3.accent.polaris} size={size} />
        </Animated.View>
        <Animated.View style={[styles.layer, { transform: [{ scale: centerScale }] }]}>
          <PolarisLayer radius={10} fill={m3.accent.skyStarWhite} size={size} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  graphic: { alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  layer: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
