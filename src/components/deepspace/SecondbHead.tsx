// SecondB character head (deep-space canon — design/2nd-Brain 화면설계.dc.html).
//
// The head asset is a flat PNG; the LIFE is layered over it in RN exactly like the
// canon .dc.html: a dark face "screen", two glowing cyan eyes, and a mouth. The
// eyes BLINK on a random cadence and the whole face TRACKS the user's touch — the
// head does a 2.5D look-at turn toward the touch while the eyes/mouth shift a few
// px the same way. There is NO floating orb above the head (the canon has none;
// emotion is read from the live face, not a dot).
//
// Tracking is AUTO by size: heads >= 80 ("big") follow touch when under a
// <SecondbHeadTrackProvider>; smaller header heads only bob + blink (canon §0.1:
// the status-bar head does not track). Override with `track`.
//
//   <SecondbHead size={158} mood="positive" />   // big: track + bob + blink + face
//   <SecondbHead size={48}  mood="neutral" />     // small: bob + blink + face only
//   <SecondbHead size={158} track={false} />      // big but opt out of tracking
//
// Driver layout (avoids native/JS driver conflicts on one node):
//   static measure node  ->  tracking node (JS)  ->  bob node (native)  ->  face

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { useSecondbTracking } from "./SecondbHeadTrack";

export type SecondbMood = "positive" | "neutral" | "negative";

interface SecondbHeadProps {
  mood?: SecondbMood;
  size?: number;
  /**
   * Follow the user's touch (needs SecondbHeadTrackProvider above). Omit to AUTO-
   * decide by size: big heads (>= 80) track, small heads don't, so one provider
   * mount extends tracking to every screen. Pass a boolean to override.
   */
  track?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-front.png");

/** Heads at or above this size are "big" and track by default. */
const BIG_HEAD_MIN = 80;

// Per-mood mouth shape — the only mood tell on the face itself (cyan, never a
// colored orb). Positive widens into a faint smile, negative narrows. Neutral is
// the canon flat bar.
const MOUTH_SCALE_X: Record<SecondbMood, number> = { positive: 1.18, neutral: 1, negative: 0.78 };
const MOUTH_LIFT: Record<SecondbMood, number> = { positive: -0.6, neutral: 0, negative: 0.5 };

export function SecondbHead({ mood = "neutral", size = 48, track, accessibilityLabel, style }: SecondbHeadProps) {
  const reduce = useReducedMotionPref();
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current; // 1 = eyes open, ~0.08 = shut

  const tracking = useSecondbTracking();
  // Auto by size when `track` is omitted: big heads follow touch, small heads don't.
  const wantsTrack = track ?? size >= BIG_HEAD_MIN;
  const enabled = wantsTrack && !!tracking && !reduce;
  const rootRef = useRef<View>(null);
  const [center, setCenter] = useState<{ x: number; y: number; ready: boolean }>({ x: 0, y: 0, ready: false });

  // Calm bob (둥둥). Reduced motion holds it still.
  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bobLoop.start();
    return () => bobLoop.stop();
  }, [bob, reduce]);

  // Blink on a random cadence (canon: ~130ms close, next in 1.6-4.8s). Reduced
  // motion keeps the eyes open.
  useEffect(() => {
    if (reduce) {
      blink.setValue(1);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.08, duration: 65, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 75, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start(() => {
          if (!cancelled) schedule();
        });
      }, 1600 + Math.random() * 3200);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blink, reduce]);

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

  // Head 2.5D look-at toward the touch, scaled by engage (eases in on touch, springs
  // back to a centered, face-forward rest on release). perspective FIRST or the
  // rotateX/rotateY collapse to a flat shear.
  const trackStyle = useMemo(() => {
    if (!enabled || !center.ready || !tracking) return null;
    const { touch, engage } = tracking;
    const reach = 200; // px from head center mapped to full deflection
    const maxShift = size * 0.12;
    const dx = Animated.subtract(touch.x, center.x);
    const dy = Animated.subtract(touch.y, center.y);

    const shift = (d: Animated.AnimatedSubtraction<number>) =>
      Animated.multiply(
        engage,
        d.interpolate({ inputRange: [-reach, reach], outputRange: [-maxShift, maxShift], extrapolate: "clamp" }),
      );

    const turnY = Animated.multiply(
      engage,
      dx.interpolate({ inputRange: [-reach, reach], outputRange: [-20, 20], extrapolate: "clamp" }),
    );
    const rotateY = turnY.interpolate({ inputRange: [-20, 20], outputRange: ["-20deg", "20deg"], extrapolate: "clamp" });

    const turnX = Animated.multiply(
      engage,
      dy.interpolate({ inputRange: [-reach, reach], outputRange: [16, -16], extrapolate: "clamp" }),
    );
    const rotateX = turnX.interpolate({ inputRange: [-16, 16], outputRange: ["-16deg", "16deg"], extrapolate: "clamp" });

    const scale = engage.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
    const perspective = 600 + size * 1.5;
    return {
      transform: [{ perspective }, { translateX: shift(dx) }, { translateY: shift(dy) }, { rotateX }, { rotateY }, { scale }],
    };
  }, [enabled, center.x, center.y, center.ready, size, tracking]);

  // Eyes drift a few px toward the touch (smaller than the head shift). null when
  // tracking is off, so the eye transform stays purely blink.
  const eyeOffset = useMemo(() => {
    if (!enabled || !center.ready || !tracking) return null;
    const { touch, engage } = tracking;
    const reach = 200;
    const exMax = size * 0.035; // canon 5.5px @158
    const eyMax = size * 0.022; // canon 3.5px @158
    const dx = Animated.subtract(touch.x, center.x);
    const dy = Animated.subtract(touch.y, center.y);
    return {
      x: Animated.multiply(engage, dx.interpolate({ inputRange: [-reach, reach], outputRange: [-exMax, exMax], extrapolate: "clamp" })),
      y: Animated.multiply(engage, dy.interpolate({ inputRange: [-reach, reach], outputRange: [-eyMax, eyMax], extrapolate: "clamp" })),
    };
  }, [enabled, center.x, center.y, center.ready, size, tracking]);

  // Face geometry as canon fractions of the head size.
  const faceW = size * 0.47;
  const faceH = size * 0.235;
  const eyeW = Math.max(3, size * 0.063);
  const eyeH = Math.max(4, size * 0.101);
  const eyePupil = eyeW * 0.6;
  const mouthW = Math.max(6, size * 0.089);
  const mouthH = Math.max(2, size * 0.02);

  const eyeTransform = eyeOffset
    ? [{ translateX: eyeOffset.x }, { translateY: eyeOffset.y }, { scaleY: blink }]
    : [{ scaleY: blink }];
  // Mouth carries the only mood tell on the face (cyan, never a colored orb).
  const mouthTransform = [{ translateY: MOUTH_LIFT[mood] }, { scaleX: MOUTH_SCALE_X[mood] }];

  return (
    <View ref={rootRef} onLayout={measure} collapsable={false} style={[styles.root, style]}>
      <Animated.View style={trackStyle}>
        <Animated.View style={[styles.wrap, { width: size, height: size }, bobStyle]}>
          <Image source={HEAD_IMAGE} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={accessibilityLabel} />

          {/* Dark face screen (visor) the eyes + mouth glow on. */}
          <View
            pointerEvents="none"
            style={[
              styles.faceScreen,
              {
                width: faceW,
                height: faceH,
                borderRadius: Math.max(6, size * 0.063),
                left: size * 0.5 - faceW / 2,
                top: size * 0.6 - faceH / 2,
              },
            ]}
          />

          {/* Eyes — glowing cyan, blink + drift toward touch. */}
          {[0.385, 0.615].map((cx, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.eye,
                {
                  width: eyeW,
                  height: eyeH,
                  borderRadius: eyeW / 2,
                  left: size * cx - eyeW / 2,
                  top: size * 0.585 - eyeH / 2,
                  transform: eyeTransform,
                },
              ]}
            >
              <View style={[styles.pupil, { width: eyePupil, height: eyePupil, borderRadius: eyePupil / 2, top: eyeH * 0.18 }]} />
            </Animated.View>
          ))}

          {/* Mouth — cyan bar, mood-shaped + drifts toward touch. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.mouth,
              {
                width: mouthW,
                height: mouthH,
                borderRadius: mouthH,
                left: size * 0.5 - mouthW / 2,
                top: size * 0.655 - mouthH / 2,
                transform: mouthTransform,
              },
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
  // box-shadow halo and on Android elevation casts a rectangular outline around
  // the transparent head PNG. The eyes carry their own (circular) glow.
  wrap: { position: "relative", flexShrink: 0, alignItems: "center", justifyContent: "center" },
  faceScreen: {
    position: "absolute",
    backgroundColor: deepSpace.bgEdge,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.18),
  },
  eye: {
    position: "absolute",
    alignItems: "center",
    backgroundColor: deepSpace.accent,
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  pupil: {
    position: "absolute",
    backgroundColor: deepSpace.accentBright,
  },
  mouth: {
    position: "absolute",
    backgroundColor: deepSpace.text,
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
});
