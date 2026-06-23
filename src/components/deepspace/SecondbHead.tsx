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

  // Tracking transforms (JS driver): a 2.5D "look-at" turn toward the touch, scaled
  // by engage. The flat head sprite is rotated in 3D so it appears to FACE the touch
  // point rather than just tipping over sideways:
  //   perspective FIRST (without it rotateX/rotateY collapse to flat shear),
  //   rotateY  <- horizontal offset dx: turn the face left/right toward the touch,
  //   rotateX  <- vertical offset dy:   tip the face up/down toward the touch,
  //   translateX/Y: a small lean so the head also drifts into the look,
  //   scale: a subtle attentive grow on engage.
  // engage (0 idle .. 1 tracking) gates everything, so it eases in on touch and
  // springs back to a centered, face-forward rest on release.
  const trackStyle = useMemo(() => {
    if (!enabled || !center.ready || !tracking) return null;
    const { touch, engage } = tracking;
    const reach = 200; // px from head center mapped to full deflection
    const maxShift = size * 0.12;
    const dx = Animated.subtract(touch.x, center.x);
    const dy = Animated.subtract(touch.y, center.y);

    // Small positional lean toward the touch (drifts into the look).
    const shift = (d: Animated.AnimatedSubtraction<number>) =>
      Animated.multiply(
        engage,
        d.interpolate({ inputRange: [-reach, reach], outputRange: [-maxShift, maxShift], extrapolate: "clamp" }),
      );

    // rotateY from dx: touch to the RIGHT (dx > 0) turns the face to look right.
    // A right-hand-y axis means positive dx maps to a positive Y rotation, so the
    // sprite's left edge recedes and the face presents toward the touch side.
    const turnY = Animated.multiply(
      engage,
      dx.interpolate({ inputRange: [-reach, reach], outputRange: [-20, 20], extrapolate: "clamp" }),
    );
    const rotateY = turnY.interpolate({
      inputRange: [-20, 20],
      outputRange: ["-20deg", "20deg"],
      extrapolate: "clamp",
    });

    // rotateX from dy: touch ABOVE center (dy < 0) tips the face UP to look up.
    // Tipping up about the X axis is a positive rotation, so negative dy must map to
    // a positive angle, which is why the output range is inverted (+16 .. -16).
    const turnX = Animated.multiply(
      engage,
      dy.interpolate({ inputRange: [-reach, reach], outputRange: [16, -16], extrapolate: "clamp" }),
    );
    const rotateX = turnX.interpolate({
      inputRange: [-16, 16],
      outputRange: ["-16deg", "16deg"],
      extrapolate: "clamp",
    });

    const scale = engage.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }); // attentive grow
    // perspective scales gently with size so big and small heads turn convincingly.
    const perspective = 600 + size * 1.5;
    return {
      transform: [
        { perspective },
        { translateX: shift(dx) },
        { translateY: shift(dy) },
        { rotateX },
        { rotateY },
        { scale },
      ],
    };
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
          <Image source={HEAD_IMAGE} style={{ width: size, height: size }} resizeMode="contain" />
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
  // No rectangular shadow/elevation on the head: on web it renders as a square
  // box-shadow halo, and on Android elevation casts a rectangular outline, both
  // around the transparent head PNG. The mood orb keeps its own (circular) glow.
  wrap: {
    position: "relative",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
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
