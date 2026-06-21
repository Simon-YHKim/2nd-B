// SecondB character head (Claude Design deep-space).
// Bob (둥둥) + mood orb (표정/감정 디밍) on every head. A BIG head also follows the
// user's touch when it's under a <SecondbHeadTrackProvider> — it leans/parallax-
// shifts toward the touch point, eases in on touch-start and eases back to center
// on release. Tracking is AUTO by size: heads >= 80 track, smaller heads only bob,
// so one provider mount extends tracking to every screen. Override with `track`.
//
//   <SecondbHead size={120} mood="positive" />        // big: auto track + bob + mood
//   <SecondbHead size={26} mood="neutral" />           // small: bob + mood only
//   <SecondbHead size={120} track={false} />           // big but opt out of tracking
//
// Driver layout (avoids native/JS driver conflicts on one node):
//   static measure node  ->  tracking node (JS driver)  ->  bob node (native)  ->  image + orb

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";
import { useSecondbTracking } from "./SecondbHeadTrack";

export type SecondbMood = "positive" | "neutral" | "negative";

interface SecondbHeadProps {
  mood?: SecondbMood;
  size?: number;
  /**
   * Follow the user's touch (needs SecondbHeadTrackProvider above).
   * Omit to AUTO-decide by size: big heads (>= 80) track, small heads don't —
   * so mounting the provider once extends tracking to every screen with no
   * per-call-site edits. Pass an explicit boolean to override.
   */
  track?: boolean;
}

const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-front.png");

/** Heads at or above this size are "big" and track by default. */
const BIG_HEAD_MIN = 80;

const MOOD_COLOR: Record<SecondbMood, string> = {
  positive: colors.mint,
  neutral: colors.soul,
  negative: colors.clay,
};

export function SecondbHead({ mood = "neutral", size = 48, track }: SecondbHeadProps) {
  const bob = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const moodColor = MOOD_COLOR[mood];

  const tracking = useSecondbTracking();
  // Auto by size when `track` is omitted: big heads follow touch, small heads don't.
  const wantsTrack = track ?? size >= BIG_HEAD_MIN;
  const enabled = wantsTrack && !!tracking;
  const rootRef = useRef<View>(null);
  const [center, setCenter] = useState<{ x: number; y: number; ready: boolean }>({ x: 0, y: 0, ready: false });

  useEffect(() => {
    const mk = (v: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const bobLoop = mk(bob, 2000);
    const pulseLoop = mk(pulse, 1300);
    bobLoop.start();
    pulseLoop.start();
    return () => {
      bobLoop.stop();
      pulseLoop.stop();
    };
  }, [bob, pulse]);

  // Measure the static root's window center so touch offsets are accurate.
  const measure = () => {
    if (!enabled) return;
    rootRef.current?.measureInWindow((x, y, w, h) => {
      if (w && h) setCenter({ x: x + w / 2, y: y + h / 2, ready: true });
    });
  };

  const bobStyle = useMemo(
    () => ({ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }),
    [bob],
  );

  // Tracking transforms (JS driver): lean + parallax toward the touch, scaled by engage.
  const trackStyle = useMemo(() => {
    if (!enabled || !center.ready || !tracking) return null;
    const { touch, engage } = tracking;
    const reach = 220; // px from head center mapped to full deflection
    const maxShift = size * 0.16;
    const dx = Animated.subtract(touch.x, center.x);
    const dy = Animated.subtract(touch.y, center.y);
    const shift = (d: Animated.AnimatedSubtraction<number>) =>
      Animated.multiply(
        engage,
        d.interpolate({ inputRange: [-reach, reach], outputRange: [-maxShift, maxShift], extrapolate: "clamp" }),
      );
    const tilt = Animated.multiply(
      engage,
      dx.interpolate({ inputRange: [-reach, reach], outputRange: [-9, 9], extrapolate: "clamp" }),
    );
    const rotate = tilt.interpolate({ inputRange: [-9, 9], outputRange: ["-9deg", "9deg"], extrapolate: "clamp" });
    const scale = engage.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }); // attentive lean
    return { transform: [{ translateX: shift(dx) }, { translateY: shift(dy) }, { rotate }, { scale }] };
  }, [enabled, center.x, center.y, center.ready, size, tracking]);

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
    <View ref={rootRef} onLayout={measure} collapsable={false} style={styles.root}>
      <Animated.View style={trackStyle}>
        <Animated.View style={[styles.wrap, bobStyle]}>
          <Image source={HEAD_IMAGE} style={[styles.image, { width: size, height: size }]} resizeMode="contain" />
          <Animated.View
            style={[
              styles.orb,
              { width: orbSize, height: orbSize, borderRadius: orbSize / 2, top: -1, marginLeft: -orbSize / 2 },
              orbStyle,
            ]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
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
