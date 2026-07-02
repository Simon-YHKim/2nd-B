// ProgressLinear - Material 3 linear progress indicator (rev2 migration, P1b).
// Determinate when `value` (0..1) is given; indeterminate (looping bar) when
// omitted. 4dp track with fully-rounded ends. Consumes m3.* tokens only.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";

export interface ProgressLinearProps {
  /** 0..1 progress. Omit for an indeterminate (looping) indicator. */
  value?: number;
  color?: string;
  trackColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressLinear({ value, color, trackColor, accessibilityLabel, style }: ProgressLinearProps) {
  const indeterminate = value == null;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: m3.motion.duration.long2 * 2,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, anim]);

  const pct = Math.max(0, Math.min(1, value ?? 0));
  const barColor = color ?? m3.color.primary;
  const track = trackColor ?? m3.color.surfaceContainerHighest;

  return (
    <View
      style={[styles.track, { backgroundColor: track }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 1, now: pct }}
      accessibilityLabel={accessibilityLabel}
    >
      {indeterminate ? (
        <Animated.View
          style={[
            styles.indicator,
            styles.indeterminate,
            { backgroundColor: barColor, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] }) }] },
          ]}
        />
      ) : (
        <View style={[styles.indicator, { backgroundColor: barColor, width: `${pct * 100}%` }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 2 = height/2: Android mis-clips children when borderRadius exceeds the view
  // size under overflow:hidden (same trap fixed in SegBtn, device QA 2026-07-02).
  track: { height: 4, borderRadius: 2, overflow: "hidden", width: "100%" },
  indicator: { height: 4, borderRadius: 2 },
  indeterminate: { width: "40%" },
});
