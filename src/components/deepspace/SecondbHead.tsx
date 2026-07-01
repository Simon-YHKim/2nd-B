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
import Svg, { Path } from "react-native-svg";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3, type M3Persona } from "@/lib/theme/m3";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { subscribeExpression } from "@/lib/companion/expression";
import { useSecondbTracking } from "./SecondbHeadTrack";

export type SecondbMood = "positive" | "neutral" | "negative";

interface SecondbHeadProps {
  mood?: SecondbMood;
  /** 세컨비 persona tint (rev2): secondb / meta / twi. Omit for the canonical cyan. */
  persona?: M3Persona;
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

// Per-mood FACE shapes (cyan-only, never a colored orb). The canon .dc.html only
// changes a background-sphere colour by mood; these eye/mouth shapes extend that
// into a readable expression within the deep-space identity.
//   eyes:  hFactor = height vs neutral (squint), topF = vertical placement,
//          tilt   = outer-corner droop in deg (sad).
const EYE_BY_MOOD: Record<SecondbMood, { hFactor: number; topF: number; tilt: number }> = {
  positive: { hFactor: 0.58, topF: 0.585, tilt: 0 }, // content squint
  neutral: { hFactor: 1, topF: 0.585, tilt: 0 },
  negative: { hFactor: 0.9, topF: 0.602, tilt: 8 }, // lowered, outer corners down
};

// Mouth as an SVG curve: smile ◡ (positive), flat line (neutral), frown ◠ (negative).
function mouthPath(mood: SecondbMood, w: number, h: number): string {
  const midY = h / 2;
  const depth = h * 0.62;
  if (mood === "positive") return `M1 ${midY - depth / 2} Q ${w / 2} ${midY + depth} ${w - 1} ${midY - depth / 2}`;
  if (mood === "negative") return `M1 ${midY + depth / 2} Q ${w / 2} ${midY - depth} ${w - 1} ${midY + depth / 2}`;
  return `M1 ${midY} L ${w - 1} ${midY}`;
}

export function SecondbHead({ mood = "neutral", persona, size = 48, track, accessibilityLabel, style }: SecondbHeadProps) {
  const reduce = useReducedMotionPref();
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current; // 1 = eyes open, ~0.08 = shut

  // Momentary reaction to user actions (save -> smile, error -> concern). Overrides
  // the base mood for a beat, then reverts. `effMood` drives every face shape below.
  const [reactMood, setReactMood] = useState<SecondbMood | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeExpression((m, dur) => {
      setReactMood(m);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReactMood(null), dur);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  const effMood = reactMood ?? mood;
  // Persona tint (rev2): personas share the silhouette; only the accent glow
  // differs. Unset persona keeps the canonical deep-space cyan (no regression).
  const accent = persona ? m3.persona[persona].accent : deepSpace.accent;
  const accentBright = persona ? m3.persona[persona].soft : deepSpace.accentBright;

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
          // JS driver (NOT native): blink's scaleY shares the eye's transform with
          // the JS-driven look-at (eyeOffset, from the setValue-driven engage/touch).
          // A native blink would move that node to the native side, and the
          // SecondbHeadTrack provider's JS setValue/spring on touch/engage would then
          // throw "JS driven animation on a node moved to native" on the next touch.
          Animated.timing(blink, { toValue: 0.08, duration: 65, easing: Easing.in(Easing.quad), useNativeDriver: false }),
          Animated.timing(blink, { toValue: 1, duration: 75, easing: Easing.out(Easing.quad), useNativeDriver: false }),
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

  // Face geometry as canon fractions of the head size, then mood-shaped.
  const faceW = size * 0.47;
  const faceH = size * 0.235;
  const eyeW = Math.max(3, size * 0.063);
  const eyeMood = EYE_BY_MOOD[effMood];
  const eyeH = Math.max(4, size * 0.101) * eyeMood.hFactor;
  const eyePupil = eyeW * 0.6;
  const mouthW = Math.max(8, size * 0.12);
  const mouthBoxH = Math.max(4, size * 0.06);
  const mouthStroke = Math.max(2, size * 0.018);

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
                borderColor: withAlpha(accent, 0.18),
              },
            ]}
          />

          {/* Eyes — glowing cyan; blink + drift toward touch, mood-shaped (squint
              when positive, droop outward when negative). */}
          {[0.385, 0.615].map((cx, i) => {
            // Sad: outer corners drop — left eye tilts one way, right eye mirrors.
            const tilt = eyeMood.tilt === 0 ? "0deg" : `${i === 0 ? -eyeMood.tilt : eyeMood.tilt}deg`;
            const transform = eyeOffset
              ? [{ translateX: eyeOffset.x }, { translateY: eyeOffset.y }, { rotate: tilt }, { scaleY: blink }]
              : [{ rotate: tilt }, { scaleY: blink }];
            return (
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
                    top: size * eyeMood.topF - eyeH / 2,
                    transform,
                    backgroundColor: accent,
                    shadowColor: accent,
                  },
                ]}
              >
                <View style={[styles.pupil, { width: eyePupil, height: eyePupil, borderRadius: eyePupil / 2, top: eyeH * 0.18, backgroundColor: accentBright }]} />
              </Animated.View>
            );
          })}

          {/* Mouth — cyan SVG curve: smile / flat / frown by mood. */}
          <View
            pointerEvents="none"
            style={[
              styles.mouth,
              { width: mouthW, height: mouthBoxH, left: size * 0.5 - mouthW / 2, top: size * 0.655 - mouthBoxH / 2 },
            ]}
          >
            <Svg width={mouthW} height={mouthBoxH}>
              <Path
                d={mouthPath(effMood, mouthW, mouthBoxH)}
                stroke={deepSpace.text}
                strokeWidth={mouthStroke}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </View>
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
    alignItems: "center",
    justifyContent: "center",
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
});
